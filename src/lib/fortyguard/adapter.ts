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
  OutsideCoverageError,
} from '@/types/errors';
import { findTileForPoint } from '../spatial/mapper';
import { isLocationCoveredByFixture } from '../location/search';
import hourlyFixtureData from '../../../tests/fixtures/heatmap_hourly_fixture.json';

// Canonical AOI builder — imported from the client-safe spatial module so
// the SAME geometry is rendered on the map AND sent to FortyGuard. There is no
// "display AOI" vs "API AOI" split; one PolygonAOI per analysis.
import { createBoundingAOI } from '../spatial/aoi';
import type { AnalysisAreaShape } from '../spatial/aoi';

export {
  createBoundingAOI,
  analyzeAoiAreaMi2,
  isAoiWithinLimit,
  FORTYGUARD_AOI_LIMIT_MI2,
} from '../spatial/aoi';
export type { AnalysisAreaShape } from '../spatial/aoi';

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

/**
 * Recursively search an arbitrary JSON value for the first object that looks
 * like a GeoJSON FeatureCollection (`type === 'FeatureCollection'` AND an
 * Array `features`). Used to robustly extract the thermal polygons from a
 * LIVE FortyGuard response whose envelope shape may drift over time.
 *
 * Bounded by a depth ceiling (4) to avoid pathological nested envelopes.
 */
function findFeatureCollection(node: unknown, depth = 0): PolygonAOI | null {
  if (!node || typeof node !== 'object' || depth > 4) return null;

  // Array — recurse into entries up to a sensible breadth ceiling.
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 64)) {
      const found = findFeatureCollection(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const obj = node as Record<string, unknown>;
  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    return obj as unknown as PolygonAOI;
  }

  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v && typeof v === 'object') {
      const found = findFeatureCollection(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** In-memory cache for FortyGuard requests during the session */
const sessionCache = new Map<string, unknown>();

/**
 * Deterministic cache identity for a FortyGuard heatmap request.
 *
 * Encodes EVERY analytic input that changes provider output:
 *   - AOI geometry (exact coordinates)
 *   - date / start time / end time / end date / filter_type
 *   - resolution (granularity)
 *   - analytic parameters (analytic_type)
 *   - the endpoint itself
 *
 * Keys are sorted so logically identical requests always produce the same
 * identity string regardless of property insertion order. A repeated request
 * with the same identity MUST reuse the cached completed result instead of
 * creating another billable FortyGuard activity.
 */
export function buildHeatmapCacheKey(
  endpoint: string,
  body: Record<string, unknown>
): string {
  return `${endpoint}:${canonicalJson(body)}`;
}

function canonicalJson(node: unknown): string {
  if (node === null || typeof node !== 'object') return JSON.stringify(node) ?? 'null';
  if (Array.isArray(node)) return `[${node.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(node as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}

/**
 * Provider runtime stats for Settings diagnostics (zero-secret).
 * Tracks the last SUCCESSFUL heatmap completion and credit-safety counters.
 */
interface ProviderRuntimeStats {
  lastSuccessfulHeatmapAt: string | null;
  lastHeatmapActivityId: string | null;
  heatmapSubmissions: number;
  heatmapCacheHits: number;
}

const providerRuntimeStats: ProviderRuntimeStats = {
  lastSuccessfulHeatmapAt: null,
  lastHeatmapActivityId: null,
  heatmapSubmissions: 0,
  heatmapCacheHits: 0,
};

export function getProviderRuntimeStats(): ProviderRuntimeStats {
  return { ...providerRuntimeStats };
}

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
    const cacheKey = buildHeatmapCacheKey(endpoint, body);
    if (sessionCache.has(cacheKey)) {
      providerRuntimeStats.heatmapCacheHits += 1;
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

    if (endpoint === '/v1/heatmap') {
      providerRuntimeStats.heatmapSubmissions += 1;
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
        if (endpoint === '/v1/heatmap') {
          providerRuntimeStats.lastSuccessfulHeatmapAt = new Date().toISOString();
          providerRuntimeStats.lastHeatmapActivityId = activityId;
        }
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

          // FortyGuard's LIVE heatmap response shape is not guaranteed. The
          // FeatureCollection of thermal polygons may live at:
          //   - result.map_data   (documented shape)
          //   - result itself    (alternate shape)
          //   - some nested key   (provider response envelope drift)
          // Recursively search for the first FeatureCollection with a `features`
          // array so we never silently fall back to the empty-field state when
          // FortyGuard returns a valid but differently-wrapped payload.
          const result = response.data?.result as unknown;
          let aoi: PolygonAOI | null = null;

          if (result && typeof result === 'object') {
            const found = findFeatureCollection(result);
            if (found) {
              aoi = found;
            }
          }

          if (!aoi) {
            // FortyGuard returned data in an unexpected format with NO
            // FeatureCollection anywhere. Return an empty FeatureCollection
            // (not the query bounding polygon — that has no temperatures and
            // would render as invisible fill). The client treats an empty FC
            // as `spatialField: null` so the map shows the clean empty state.
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
    const isCovered = isLocationCoveredByFixture(location);
    if (!isCovered) {
      throw new OutsideCoverageError(
        `Selected location (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}) is outside the captured Manhattan fixture dataset. Switch to LIVE mode in Settings to analyse this location with live FortyGuard data.`
      );
    }

    for (const timestamp of timestamps) {
      const d = new Date(timestamp);
      const hourStr = `${String(d.getUTCHours()).padStart(2, '0')}:00`;

      const snapshot = hourlyFixtureData.hourlySnapshots.find((s) => s.timestamp === timestamp)
        || hourlyFixtureData.hourlySnapshots.find((s) => s.timestamp.slice(11, 16) === hourStr)
        || hourlyFixtureData.hourlySnapshots[0];

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
