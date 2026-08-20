import { NextResponse } from 'next/server';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { evaluateCandidateWindows } from '@/lib/decision-engine/evaluator';
import type { LocationPoint, PolygonAOI, DecisionConstraints } from '@/types/domain';
import { AppError } from '@/types/errors';

/**
 * Default sample GeoJSON AOI around NYC Manhattan for instant workspace demo / fallback.
 */
function createDemoThermalAOI(center: LocationPoint): PolygonAOI {
  const dLat = 0.003;
  const dLon = 0.004;

  const features = [];
  const rows = 3;
  const cols = 3;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const minLat = center.latitude - dLat + (r * (2 * dLat)) / rows;
      const maxLat = center.latitude - dLat + ((r + 1) * (2 * dLat)) / rows;
      const minLon = center.longitude - dLon + (c * (2 * dLon)) / cols;
      const maxLon = center.longitude - dLon + ((c + 1) * (2 * dLon)) / cols;

      const tileId = `tile-${r + 1}${c + 1}`;
      // Create subtle spatial temperature variation (31.2°C to 36.8°C)
      const baseTemp = 32.0 + (r * 1.5) - (c * 0.8);
      const avgTemp = Number(baseTemp.toFixed(1));

      features.push({
        type: 'Feature' as const,
        properties: {
          tile_id: tileId,
          average_temperature: avgTemp,
          min_temperature: Number((avgTemp - 1.8).toFixed(1)),
          max_temperature: Number((avgTemp + 2.1).toFixed(1)),
        },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            [
              [minLon, minLat],
              [maxLon, minLat],
              [maxLon, maxLat],
              [minLon, maxLat],
              [minLon, minLat],
            ],
          ],
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const latitude = Number(body.latitude ?? 40.7128);
    const longitude = Number(body.longitude ?? -74.006);
    const durationHours = Number(body.durationHours ?? 2);

    const now = new Date();
    now.setUTCMinutes(0, 0, 0);

    const defaultStart = now.toISOString();
    const defaultEnd = new Date(now.getTime() + 6 * 3600 * 1000).toISOString();

    const allowedStart = body.allowedStart || defaultStart;
    const allowedEnd = body.allowedEnd || defaultEnd;

    const location: LocationPoint = { latitude, longitude };
    const constraints: DecisionConstraints = {
      allowedStart,
      allowedEnd,
      durationHours,
      dataResolutionHours: 1,
    };

    const adapter = new FortyGuardAdapter();
    let aoi: PolygonAOI;

    try {
      if (process.env.FORTYGUARD_USE_LIVE_API === 'true' && process.env.FORTYGUARD_API_KEY) {
        const heatmapResult = await adapter.getHeatmap({
          polygon_aoi: createDemoThermalAOI(location),
          date_time: {
            start_date: allowedStart.slice(0, 10),
            start_time: allowedStart.slice(11, 16),
            filter_type: 1,
          },
          granularity: 60,
        });
        aoi = heatmapResult.aoi;
      } else {
        aoi = createDemoThermalAOI(location);
      }
    } catch {
      // Fallback to spatial tile generator if API is unavailable or unconfigured
      aoi = createDemoThermalAOI(location);
    }

    // Build hourly observations for allowed window
    const startMs = new Date(allowedStart).getTime();
    const endMs = new Date(allowedEnd).getTime();
    const observations = [];

    for (let tMs = startMs; tMs < endMs; tMs += 3600 * 1000) {
      const timestamp = new Date(tMs).toISOString();
      const obs = adapter.normalizePointObservation(aoi, location, timestamp);
      observations.push(obs);
    }

    const decision = evaluateCandidateWindows(
      location,
      observations,
      constraints,
      allowedStart
    );

    return NextResponse.json({
      success: true,
      decision,
      spatialField: aoi,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An unknown error occurred',
        },
      },
      { status: 500 }
    );
  }
}
