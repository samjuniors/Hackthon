import { NextResponse } from 'next/server';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { evaluateCandidateWindows } from '@/lib/decision-engine/evaluator';
import type { LocationPoint, DecisionConstraints, NormalizedThermalObservation } from '@/types/domain';
import type { DataSourceMode } from '@/types/provenance';
import { AppError, IncompleteTemporalCoverageError } from '@/types/errors';
import { z } from 'zod';

const DecisionRequestSchema = z.object({
  latitude: z.number().min(-90).max(90).default(40.7128),
  longitude: z.number().min(-180).max(180).default(-74.006),
  durationHours: z.number().int().min(1).max(12).default(2),
  allowedStart: z.string().optional(),
  allowedEnd: z.string().optional(),
  mode: z.enum(['LIVE', 'FIXTURE']).optional(),
});

export async function POST(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      rawBody = {};
    }

    const parseResult = DecisionRequestSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', '),
          },
        },
        { status: 400 }
      );
    }

    const { latitude, longitude, durationHours, allowedStart: reqStart, allowedEnd: reqEnd, mode: reqMode } = parseResult.data;

    // Explicit DataSourceMode: request override or server default
    const mode: DataSourceMode = reqMode ?? (process.env.FORTYGUARD_DATA_SOURCE === 'LIVE' ? 'LIVE' : 'FIXTURE');

    const adapter = new FortyGuardAdapter({ mode });
    const defaultWindow = adapter.getDefaultOperatingWindow(6);

    const allowedStart = reqStart || defaultWindow.allowedStart;
    const allowedEnd = reqEnd || defaultWindow.allowedEnd;

    const location: LocationPoint = { latitude, longitude };
    const constraints: DecisionConstraints = {
      allowedStart,
      allowedEnd,
      durationHours,
      dataResolutionHours: 1,
    };

    const startMs = new Date(allowedStart).getTime();
    const endMs = new Date(allowedEnd).getTime();

    if (isNaN(startMs) || isNaN(endMs)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid start or end timestamp' } },
        { status: 400 }
      );
    }

    // Build discrete hourly timestamps for the candidate span
    const hourlyTimestamps: string[] = [];
    for (let tMs = startMs; tMs < endMs; tMs += 3600 * 1000) {
      hourlyTimestamps.push(new Date(tMs).toISOString());
    }

    if (hourlyTimestamps.length === 0) {
      throw new IncompleteTemporalCoverageError('Empty hourly sequence for requested time span');
    }

    // Fetch discrete hourly snapshots from selected source (LIVE API or FIXTURE)
    const snapshotsMap = await adapter.getHourlyHeatmapSnapshots(location, hourlyTimestamps);

    const observations: NormalizedThermalObservation[] = [];

    for (const timestamp of hourlyTimestamps) {
      const snapshotAoi = snapshotsMap.get(timestamp);
      if (!snapshotAoi) {
        throw new IncompleteTemporalCoverageError(`Missing thermal observation at timestamp ${timestamp}`);
      }

      // Heatmap tile values represent spatial polygon model aggregations (provenance: DERIVED)
      const obs = adapter.normalizePointObservation(
        snapshotAoi,
        location,
        timestamp,
        '/v1/heatmap',
        'DERIVED'
      );
      observations.push(obs);
    }

    const decision = evaluateCandidateWindows(
      location,
      observations,
      constraints,
      allowedStart
    );

    const baseTimestamp = hourlyTimestamps[0];
    const baseSpatialField = snapshotsMap.get(baseTimestamp);

    return NextResponse.json({
      success: true,
      decision,
      spatialField: baseSpatialField,
      spatialFieldMetadata: {
        baseTimestamp,
        coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
        description: 'Spatial thermal surface represents the initial observation snapshot (t₀)',
        totalEvaluatedHours: hourlyTimestamps.length,
      },
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

