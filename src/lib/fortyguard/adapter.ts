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
 * Creates standard bounding PolygonAOI FeatureCollection around a point for API query boundary.
 */
export function createBoundingAOI(center: LocationPoint, halfSideMetres = 400): PolygonAOI {
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
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [ring],
        },
      },
    ],
  };
}

/** In-memory cache for FortyGuard requests during the session */
const sessionCache = new Map<string, unknown>();

export interface FortyGuardAdapterOptions {
  mode?: DataSourceMode;
  baseUrl?: string;
  apiKey?: string;
}

export class FortyGuardAdapter {
  readonly mode: DataSourceMode;
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options?: FortyGuardAdapterOptions) {
    this.mode = options?.mode ?? (process.env.FORTYGUARD_DATA_SOURCE === 'LIVE' ? 'LIVE' : 'FIXTURE');
    this.baseUrl = (options?.baseUrl || process.env.FORTYGUARD_API_BASE_URL || 'https://api.fortyguard.com').replace(/\/+$/, '');
    this.apiKey = options?.apiKey ?? process.env.FORTYGUARD_API_KEY ?? '';
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
   * Submit async request to FortyGuard API and poll /v1/status/{activity_id} until terminal state.
   */
  private async submitAndPoll(
    endpoint: string,
    body: Record<string, unknown>,
    maxAttempts = 15,
    intervalMs = 2000
  ): Promise<FortyGuardStatusResponse> {

    const cacheKey = `${endpoint}:${JSON.stringify(body)}`;
    if (sessionCache.has(cacheKey)) {
      return sessionCache.get(cacheKey) as FortyGuardStatusResponse;
    }

    const headers = this.headers;
    const submitUrl = `${this.baseUrl}${endpoint}`;
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

    // Poll status endpoint
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
        sessionCache.set(cacheKey, pollData);
        return pollData;
      }

      if (status === 'Failed') {
        throw new FortyGuardProcessingError(activityId, `FortyGuard activity ${activityId} failed during asynchronous processing`);
      }
    }

    throw new FortyGuardProcessingError(activityId, `FortyGuard activity ${activityId} timed out after ${maxAttempts} polling attempts`);
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
   * Fetch spatial thermal heatmap GeoJSON tile field.
   */
  async getHeatmap(request: FortyGuardHeatmapRequest): Promise<{ aoi: PolygonAOI; activityId: string }> {

    const validReq = FortyGuardHeatmapRequestSchema.parse(request);

    if (this.mode === 'LIVE') {
      const response = await this.submitAndPoll('/v1/heatmap', validReq as Record<string, unknown>);

      const result = response.data?.result as { map_data?: PolygonAOI } | PolygonAOI | undefined;
      let aoi: PolygonAOI;

      if (result && typeof result === 'object' && 'map_data' in result && result.map_data?.type === 'FeatureCollection') {
        aoi = result.map_data;
      } else if (result && typeof result === 'object' && 'type' in result && result.type === 'FeatureCollection') {
        aoi = result as PolygonAOI;
      } else {
        aoi = request.polygon_aoi as PolygonAOI;
      }

      return {
        aoi,
        activityId: response.data?.activity_id || 'live-activity',
      };
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
   */
  async getHourlyHeatmapSnapshots(
    location: LocationPoint,
    timestamps: string[],
    baseAoi?: PolygonAOI
  ): Promise<Map<string, PolygonAOI>> {
    const results = new Map<string, PolygonAOI>();
    const aoiToQuery = baseAoi || createBoundingAOI(location);

    for (const timestamp of timestamps) {
      const d = new Date(timestamp);
      const dateStr = d.toISOString().slice(0, 10);
      const hourStr = `${String(d.getUTCHours()).padStart(2, '0')}:00`;

      if (this.mode === 'LIVE') {
        const heatmapResult = await this.getHeatmap({
          polygon_aoi: aoiToQuery,
          date_time: {
            start_date: dateStr,
            start_time: hourStr,
            filter_type: 1,
          },
          granularity: 60,
        });
        results.set(timestamp, heatmapResult.aoi);
      } else {
        // FIXTURE MODE
        const snapshot = hourlyFixtureData.hourlySnapshots.find((s) => s.timestamp === timestamp)
          || hourlyFixtureData.hourlySnapshots.find((s) => s.timestamp.slice(11, 16) === hourStr);

        if (!snapshot) {
          throw new IncompleteTemporalCoverageError(`No fixture coverage available for timestamp ${timestamp}`);
        }

        results.set(timestamp, snapshot.aoi as PolygonAOI);
      }
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

