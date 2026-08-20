import { z } from 'zod';
import type {
  LocationPoint,
  NormalizedThermalObservation,
  PolygonAOI,
  TileFeature,
} from '@/types/domain';
import type {
  FortyGuardHeatmapRequest,
  FortyGuardStatusResponse,
} from '@/types/fortyguard';
import {
  AuthenticationError,
  FortyGuardApiError,
  FortyGuardProcessingError,
} from '@/types/errors';
import { findTileForPoint } from '../spatial/mapper';

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

/** In-memory cache for FortyGuard requests during the session */
const sessionCache = new Map<string, unknown>();

export class FortyGuardAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = (process.env.FORTYGUARD_API_BASE_URL || 'https://api.fortyguard.com').replace(/\/+$/, '');
    this.apiKey = process.env.FORTYGUARD_API_KEY || '';

    if (!this.apiKey) {
      // In build/test environment without key, log warning
      if (process.env.NODE_ENV !== 'test') {
        console.warn('FORTYGUARD_API_KEY environment variable is not configured');
      }
    }
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
    maxAttempts = 60,
    intervalMs = 2000
  ): Promise<FortyGuardStatusResponse> {
    const cacheKey = `${endpoint}:${JSON.stringify(body)}`;
    if (sessionCache.has(cacheKey)) {
      return sessionCache.get(cacheKey) as FortyGuardStatusResponse;
    }

    const submitUrl = `${this.baseUrl}${endpoint}`;
    let submitRes: Response;
    try {
      submitRes = await fetch(submitUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
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
   * Fetch spatial thermal heatmap GeoJSON tile field.
   */
  async getHeatmap(request: FortyGuardHeatmapRequest): Promise<{ aoi: PolygonAOI; activityId: string }> {
    const validReq = FortyGuardHeatmapRequestSchema.parse(request);
    const response = await this.submitAndPoll('/v1/heatmap', validReq as Record<string, unknown>);

    const resultData = response.data.result as PolygonAOI | undefined;
    const aoi: PolygonAOI = resultData && resultData.type === 'FeatureCollection'
      ? resultData
      : (request.polygon_aoi as PolygonAOI);

    return {
      aoi,
      activityId: response.data.activity_id,
    };
  }

  /**
   * Normalize heatmap response to point observation via point-in-polygon mapping.
   */
  normalizePointObservation(
    aoi: PolygonAOI,
    location: LocationPoint,
    timestamp: string,
    sourceEndpoint = '/v1/heatmap'
  ): NormalizedThermalObservation {
    const tile: TileFeature = findTileForPoint(location, aoi);

    return {
      timestamp,
      location,
      selectedTileId: tile.tileId,
      sourceEndpoint,
      metrics: {
        temperatureCelsius: tile.averageTemperatureCelsius,
        tileMinTemperatureCelsius: tile.minTemperatureCelsius,
        tileMaxTemperatureCelsius: tile.maxTemperatureCelsius,
      },
      provenance: 'OBSERVED',
    };
  }
}
