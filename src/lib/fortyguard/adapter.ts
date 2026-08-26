import { z } from 'zod';
import type {
  LocationPoint,
  NormalizedThermalObservation,
  PolygonAOI,
  TileFeature,
} from '@/types/domain';
import type { DataProvenance, DataSourceMode } from '@/types/provenance';
import type {
  FortyGuardHeatmapRequest,
  FortyGuardStatusResponse,
} from '@/types/fortyguard';
import {
  AuthenticationError,
  FortyGuardApiError,
  FortyGuardProcessingError,
  FortyGuardTimeoutError,
  IncompleteTemporalCoverageError,
} from '@/types/errors';
import { findTileForPoint } from '../spatial/mapper';
import hourlyFixtureData from '../../../tests/fixtures/heatmap_hourly_fixture.json';

// Zod Schemas for runtime validation
export const FortyGuardHeatmapRequestSchema = z.object({
  polygon_aoi: z.object({
    type: z.literal('FeatureCollection'),
    features: z.array(z.any()),
  }),
  date_time: z.object({
    start_date: z.string(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    end_date: z.string().optional(),
    filter_type: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  granularity: z.union([z.literal(60), z.literal(80), z.literal(100)]),
  analytic_type: z
    .enum(['tcm', 'time_of_measure', 'exceedance', 'persistence'])
    .optional(),
});

export const FortyGuardEnvParamsRequestSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  temperature: z.number(),
  date_time: z.object({
    start_date: z.string(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    end_date: z.string().optional(),
    filter_type: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }),
  analysis: z.array(z.string()).optional(),
});

/**
 * Analysis-area shape preference (persisted client-side, sent to /api/decision).
 * 'polygon' = square bounding box (default); 'circle' = regular 32-gon approximation.
 */
export type AnalysisAreaShape = 'polygon' | 'circle';

/**
 * Creates a bounding PolygonAOI FeatureCollection around a point for the API query boundary.
 * When shape === 'circle', the boundary is a regular 32-gon approximating a circle of the
 * given radius — useful for radial operational footprints. FortyGuard still receives a
 * Polygon geometry; the shape only affects the footprint vertices.
 */
export function createBoundingAOI(
  center: LocationPoint,
  halfSideMetres = 400,
  shape: AnalysisAreaShape = 'polygon',
): PolygonAOI {
  if (shape === 'circle') {
    const radius = halfSideMetres;
    const segments = 32;
    const ring: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      const dLat = (radius * Math.cos(angle)) / 111320;
      const dLon = (radius * Math.sin(angle)) / (111320 * Math.cos((center.latitude * Math.PI) / 180));
      ring.push([center.longitude + dLon, center.latitude + dLat]);
    }
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { shape: 'circle', radiusMetres: radius }, geometry: { type: 'Polygon', coordinates: [ring] } }],
    };
  }

  const dLat = halfSideMetres / 111320;
  const dLon = halfSideMetres / (111320 * Math.cos((center.latitude * Math.PI) / 180));
  const ring = [
    [center.longitude - dLon, center.latitude - dLat],
    [center.longitude + dLon, center.latitude - dLat],
    [center.longitude + dLon, center.latitude + dLat],
    [center.longitude - dLon, center.latitude + dLat],
    [center.longitude - dLon, center.latitude - dLat],
  ];

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { shape: 'polygon' },
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      },
    ],
  };
}

/**
 * Helper to run async tasks across items with bounded concurrency.
 * Guarantees that at most `concurrencyLimit` tasks run simultaneously.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const effectiveLimit = Math.max(1, Math.min(limit, items.length));
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: effectiveLimit }, async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await fn(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Structured logger for FortyGuard provider operations.
 * CRITICAL: Never logs API keys, tokens, or credentials.
 */
function logProviderEvent(
  level: 'warn' | 'error',
  event: string,
  details: Record<string, unknown>
) {
  const sanitized = {
    timestamp: new Date().toISOString(),
    event,
    ...details,
  };
  if (level === 'error') {
    console.error(`[FortyGuard] ${event}:`, JSON.stringify(sanitized));
  } else {
    console.warn(`[FortyGuard] ${event}:`, JSON.stringify(sanitized));
  }
}

/** In-memory cache for FortyGuard requests during the session */
const sessionCache = new Map<string, unknown>();

export interface FortyGuardAdapterOptions {
  mode?: DataSourceMode;
  baseUrl?: string;
  apiKey?: string;
  concurrencyLimit?: number;  // Default: 2 (avoids provider burst)
  maxRetries?: number;        // Default: 1 (for transient network/timeout)
  retryDelayMs?: number;      // Default: 1000ms
  pollingMaxAttempts?: number;// Default: 15 (15 × 2s = 30s ceiling)
  pollingIntervalMs?: number; // Default: 2000ms
}

export class FortyGuardAdapter {
  readonly mode: DataSourceMode;
  readonly concurrencyLimit: number;
  readonly maxRetries: number;
  readonly retryDelayMs: number;
  readonly pollingMaxAttempts: number;
  readonly pollingIntervalMs: number;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options?: FortyGuardAdapterOptions) {
    this.mode = options?.mode ?? (process.env.FORTYGUARD_DATA_SOURCE === 'LIVE' ? 'LIVE' : 'FIXTURE');
    this.baseUrl = (options?.baseUrl || process.env.FORTYGUARD_API_BASE_URL || 'https://api.fortyguard.com').replace(/\/+$/, '');
    this.apiKey = options?.apiKey ?? process.env.FORTYGUARD_API_KEY ?? '';
    this.concurrencyLimit = options?.concurrencyLimit ?? 2;
    this.maxRetries = options?.maxRetries ?? 1;
    this.retryDelayMs = options?.retryDelayMs ?? 1000;
    this.pollingMaxAttempts = options?.pollingMaxAttempts ?? 15;
    this.pollingIntervalMs = options?.pollingIntervalMs ?? 2000;
  }

  /** Static utility to clear session cache (useful for testing) */
  static clearCache(): void {
    sessionCache.clear();
  }

  private get headers(): Record<string, string> {
    if (!this.apiKey) {
      throw new AuthenticationError('FORTYGUARD_API_KEY environment variable is missing');
    }
    return {
      'api-key': this.apiKey,
      accept: 'application/json',
      'content-type': 'application/json',
    };
  }

  /**
   * Check if an error is transient and eligible for controlled retry.
   * Non-retryable: Auth (401/403), Validation (400), Coverage (404/422), Provider 'Failed'
   */
  private isTransientError(error: unknown): boolean {
    if (error instanceof AuthenticationError) return false;
    if (error instanceof IncompleteTemporalCoverageError) return false;
    if (error instanceof FortyGuardTimeoutError) return true;
    if (error instanceof FortyGuardProcessingError) {
      // Provider explicitly processed and marked status 'Failed' — not retryable
      return false;
    }
    if (error instanceof FortyGuardApiError) {
      // HTTP 502, 503, 504, or network fetch failure (no status) are transient
      if (!error.originalStatusCode || error.originalStatusCode >= 500) {
        return true;
      }
      return false;
    }
    return false;
  }

  /**
   * Submit async request to FortyGuard API and poll /v1/status/{activity_id} until terminal state.
   */
  private async submitAndPoll(
    endpoint: string,
    body: Record<string, unknown>,
    maxAttempts = this.pollingMaxAttempts,
    intervalMs = this.pollingIntervalMs
  ): Promise<FortyGuardStatusResponse> {
    const cacheKey = `${endpoint}:${JSON.stringify(body)}`;
    if (sessionCache.has(cacheKey)) {
      return sessionCache.get(cacheKey) as FortyGuardStatusResponse;
    }

    const headers = this.headers;
    const submitUrl = `${this.baseUrl}${endpoint}`;
    const startTimeMs = Date.now();
    let submitRes: Response;

    try {
      submitRes = await fetch(submitUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      if (err instanceof AuthenticationError) throw err;
      throw new FortyGuardApiError(`Failed to reach FortyGuard API at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (submitRes.status === 401 || submitRes.status === 403) {
      throw new AuthenticationError();
    }

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      throw new FortyGuardApiError(`FortyGuard endpoint ${endpoint} returned HTTP ${submitRes.status}: ${errText.slice(0, 300)}`, submitRes.status);
    }

    const submitData = (await submitRes.json()) as FortyGuardStatusResponse;
    const activityId = submitData.data?.activity_id;

    if (!activityId) {
      throw new FortyGuardApiError(`FortyGuard endpoint ${endpoint} returned success without activity_id`);
    }

    const reqDateTime = body.date_time as Record<string, unknown> | undefined;
    logProviderEvent('warn', 'HEATMAP_SUBMITTED', {
      endpoint,
      activityId,
      filterType: reqDateTime?.filter_type,
      startDate: reqDateTime?.start_date,
      startTime: reqDateTime?.start_time,
      granularity: body.granularity,
    });

    // Poll status endpoint with strict wall-clock polling ceiling
    const pollingCeilingMs = maxAttempts * intervalMs;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (Date.now() - startTimeMs >= pollingCeilingMs) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));

      let pollRes: Response;
      try {
        pollRes = await fetch(`${this.baseUrl}/v1/status/${activityId}`, {
          headers: {
            'api-key': this.apiKey,
            accept: 'application/json',
          },
        });
      } catch (err) {
        throw new FortyGuardApiError(`Network error polling FortyGuard activity ${activityId}: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!pollRes.ok) {
        throw new FortyGuardApiError(`Status check for activity ${activityId} failed with HTTP ${pollRes.status}`, pollRes.status);
      }

      const pollData = (await pollRes.json()) as FortyGuardStatusResponse;
      const status = pollData.data?.status;

      if (status === 'Completed') {
        const totalDurationMs = Date.now() - startTimeMs;
        logProviderEvent('warn', 'HEATMAP_COMPLETED', {
          activityId,
          attempts: attempt,
          totalDurationMs,
        });
        // Cache ONLY successfully completed responses
        sessionCache.set(cacheKey, pollData);
        return pollData;
      }

      if (status === 'Failed') {
        logProviderEvent('error', 'HEATMAP_FAILED', {
          activityId,
          attempts: attempt,
          durationMs: Date.now() - startTimeMs,
        });
        throw new FortyGuardProcessingError(activityId, `FortyGuard activity ${activityId} failed during asynchronous processing`);
      }
    }

    const totalDurationMs = Date.now() - startTimeMs;
    logProviderEvent('error', 'HEATMAP_TIMEOUT', {
      activityId,
      attempts: maxAttempts,
      totalDurationMs,
      pollingCeilingMs: maxAttempts * intervalMs,
    });

    throw new FortyGuardTimeoutError(activityId, `FortyGuard activity ${activityId} timed out after ${maxAttempts} polling attempts (${Math.round(totalDurationMs / 1000)}s)`);
  }

  /**
   * Return default operating window bounds.
   * Fixture mode provides bounds from its own captured timestamps; live mode provides current UTC bounds.
   */
  getDefaultOperatingWindow(spanHours = 6): { allowedStart: string; allowedEnd: string } {
    if (this.mode === 'FIXTURE') {
      const firstSnapshot = hourlyFixtureData.hourlySnapshots[0];
      const startMs = new Date(firstSnapshot.timestamp).getTime();
      return {
        allowedStart: new Date(startMs).toISOString(),
        allowedEnd: new Date(startMs + spanHours * 3600 * 1000).toISOString(),
      };
    }

    const now = new Date();
    now.setUTCMinutes(0, 0, 0);
    return {
      allowedStart: now.toISOString(),
      allowedEnd: new Date(now.getTime() + spanHours * 3600 * 1000).toISOString(),
    };
  }

  /**
   * Fetch spatial thermal heatmap GeoJSON tile field with controlled transient retry.
   */
  async getHeatmap(request: FortyGuardHeatmapRequest): Promise<{ aoi: PolygonAOI; activityId: string }> {
    const validReq = FortyGuardHeatmapRequestSchema.parse(request);

    if (this.mode === 'LIVE') {
      let lastError: unknown;
      const totalAttempts = 1 + this.maxRetries;

      for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        try {
          const response = await this.submitAndPoll('/v1/heatmap', validReq as Record<string, unknown>);

          const result = response.data?.result as { map_data?: PolygonAOI } | PolygonAOI | undefined;
          let aoi: PolygonAOI;

          if (result && typeof result === 'object' && 'map_data' in result && result.map_data?.type === 'FeatureCollection') {
            aoi = result.map_data;
          } else if (result && typeof result === 'object' && 'type' in result && result.type === 'FeatureCollection') {
            aoi = result as PolygonAOI;
          } else {
            // FortyGuard returned data in an unexpected format — no valid FeatureCollection.
            // Return an empty FeatureCollection rather than the query bounding polygon,
            // which has no 'average_temperature' and would render as invisible fill.
            logProviderEvent('warn', 'HEATMAP_UNEXPECTED_RESULT_FORMAT', {
              activityId: response.data?.activity_id,
              hasResult: result !== undefined,
              resultKeys: result && typeof result === 'object' ? Object.keys(result as object) : [],
            });
            aoi = { type: 'FeatureCollection', features: [] };
          }

          return {
            aoi,
            activityId: response.data?.activity_id || 'live-activity',
          };
        } catch (error) {
          lastError = error;
          if (attempt < totalAttempts && this.isTransientError(error)) {
            logProviderEvent('warn', 'HEATMAP_RETRY', {
              attempt,
              maxRetries: this.maxRetries,
              backoffMs: this.retryDelayMs,
              startDate: validReq.date_time.start_date,
              startTime: validReq.date_time.start_time,
              reason: error instanceof Error ? error.message : String(error),
            });
            await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
            continue;
          }
          throw error;
        }
      }

      throw lastError;
    }

    // FIXTURE mode: resolve from captured fixture
    const reqHourIso = `${validReq.date_time.start_date}T${validReq.date_time.start_time || '00:00'}:00.000Z`;
    const snapshot = hourlyFixtureData.hourlySnapshots.find((s) => s.timestamp === reqHourIso)
      || hourlyFixtureData.hourlySnapshots.find((s) => s.timestamp.slice(11, 16) === (validReq.date_time.start_time || '00:00'));

    if (!snapshot) {
      throw new IncompleteTemporalCoverageError(
        `Fixture data missing for requested timestamp ${validReq.date_time.start_date} ${validReq.date_time.start_time}`
      );
    }

    return {
      aoi: snapshot.aoi as PolygonAOI,
      activityId: 'fixture-captured-activity',
    };
  }

  /**
   * Fetch discrete hourly snapshots for candidate decision window.
   * In LIVE mode, bounded concurrency (default = 2) is enforced to avoid provider bursts.
   */
  async getHourlyHeatmapSnapshots(
    location: LocationPoint,
    timestamps: string[],
    baseAoi?: PolygonAOI,
    options?: { granularity?: 60 | 80 | 100; analysisAreaShape?: AnalysisAreaShape },
  ): Promise<Map<string, PolygonAOI>> {
    const results = new Map<string, PolygonAOI>();
    const aoiToQuery = baseAoi || createBoundingAOI(location, 400, options?.analysisAreaShape ?? 'polygon');
    const granularity = options?.granularity ?? 60;

    if (this.mode === 'LIVE') {
      // Execute with bounded concurrency (default concurrency = 2)
      const entries = await runWithConcurrency(
        timestamps,
        this.concurrencyLimit,
        async (timestamp) => {
          const d = new Date(timestamp);
          const dateStr = d.toISOString().slice(0, 10);
          const hourStr = `${String(d.getUTCHours()).padStart(2, '0')}:00`;

          const heatmapResult = await this.getHeatmap({
            polygon_aoi: aoiToQuery,
            date_time: {
              start_date: dateStr,
              start_time: hourStr,
              filter_type: 1,
            },
            granularity,
          });
          return [timestamp, heatmapResult.aoi] as [string, PolygonAOI];
        }
      );

      for (const [ts, aoi] of entries) {
        results.set(ts, aoi);
      }

      return results;
    }

    // FIXTURE MODE — sequential lookup from verified in-memory fixture
    for (const timestamp of timestamps) {
      const d = new Date(timestamp);
      const hourStr = `${String(d.getUTCHours()).padStart(2, '0')}:00`;

      const snapshot = hourlyFixtureData.hourlySnapshots.find((s) => s.timestamp === timestamp)
        || hourlyFixtureData.hourlySnapshots.find((s) => s.timestamp.slice(11, 16) === hourStr);

      if (!snapshot) {
        throw new IncompleteTemporalCoverageError(`No fixture coverage available for timestamp ${timestamp}`);
      }

      results.set(timestamp, snapshot.aoi as PolygonAOI);
    }

    return results;
  }

  /**
   * Normalize heatmap response to point observation via point-in-polygon mapping.
   */
  normalizePointObservation(
    aoi: PolygonAOI,
    location: LocationPoint,
    timestamp: string,
    sourceEndpoint = '/v1/heatmap',
    provenance: DataProvenance = 'DERIVED'
  ): NormalizedThermalObservation {
    const tile: TileFeature = findTileForPoint(location, aoi);

    return {
      timestamp,
      location,
      selectedTileId: tile.tileId,
      sourceEndpoint,
      dataSource: this.mode,
      metrics: {
        temperatureCelsius: tile.averageTemperatureCelsius,
        tileMinTemperatureCelsius: tile.minTemperatureCelsius,
        tileMaxTemperatureCelsius: tile.maxTemperatureCelsius,
      },
      provenance,
    };
  }
}
