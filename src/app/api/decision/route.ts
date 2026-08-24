import { NextResponse } from 'next/server';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import {
  evaluateCandidateWindows,
  evaluateCandidateLocations,
  evaluateJointDecision,
  evaluateWhatIfScenarios,
} from '@/lib/decision-engine/evaluator';


import type {
  LocationPoint,
  DecisionConstraints,
  NormalizedThermalObservation,
  CandidateLocation,
  CandidateWindow,
} from '@/types/domain';
import type { DataSourceMode } from '@/types/provenance';
import {
  AppError,
  IncompleteTemporalCoverageError,
  OutsideCoverageError,
  ValidationError,
  mapErrorToProductionDetails,
} from '@/types/errors';
import { isLocationCoveredByFixture } from '@/lib/location/search';
import { z } from 'zod';

const CandidateSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const DecisionRequestSchema = z.object({
  latitude: z.number().min(-90).max(90).default(40.7128),
  longitude: z.number().min(-180).max(180).default(-74.006),
  candidates: z.array(CandidateSchema).optional(),
  durationHours: z.number().int().min(1).max(12).default(3),
  allowedStart: z.string().optional(),
  allowedEnd: z.string().optional(),
  mode: z.enum(['LIVE', 'FIXTURE']).optional(),
});

const DEFAULT_CANDIDATE_LOCATIONS: CandidateLocation[] = [
  {
    locationId: 'LOC-A',
    name: 'Battery Park Greenway (Waterfront)',
    location: { latitude: 40.7120, longitude: -74.0080 },
  },
  {
    locationId: 'LOC-B',
    name: 'City Hall Civic Center (Mid-Density)',
    location: { latitude: 40.7120, longitude: -73.9980 },
  },
  {
    locationId: 'LOC-C',
    name: 'Chinatown / Bowery Staging (Asphalt Canyon)',
    location: { latitude: 40.7120, longitude: -73.9880 },
  },
];

/**
 * Generate 3 geo-adjacent candidates around a user-selected location for LIVE analysis.
 *
 * Candidates are spaced 400m apart on the north/south axis so all 3 fall inside the
 * createBoundingAOI() polygon (halfSideMetres=400) already submitted to FortyGuard.
 * This ensures the decision engine evaluates real FortyGuard tiles at the user's location.
 *
 * Naming convention: SITE-N (north offset), SITE-CENTER (exact point), SITE-S (south offset).
 */
function generateLiveCandidates(center: LocationPoint): CandidateLocation[] {
  const dLat = 400 / 111320; // ~0.0036° per 400m (0.25 multiplier = ~100m adjacent tile offset)
  return [
    {
      locationId: 'SITE-N',
      name: 'Site North (Upper Zone)',
      location: { latitude: center.latitude + dLat * 0.25, longitude: center.longitude },
    },
    {
      locationId: 'SITE-CENTER',
      name: 'Site Center (Selected Location)',
      location: { latitude: center.latitude, longitude: center.longitude },
    },
    {
      locationId: 'SITE-S',
      name: 'Site South (Lower Zone)',
      location: { latitude: center.latitude - dLat * 0.25, longitude: center.longitude },
    },
  ];
}


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

    const {
      latitude,
      longitude,
      candidates: reqCandidates,
      durationHours,
      allowedStart: reqStart,
      allowedEnd: reqEnd,
      mode: reqMode,
    } = parseResult.data;

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

    // Verify fixture coverage boundary: fixture dataset ONLY covers Manhattan
    if (mode === 'FIXTURE' && !isLocationCoveredByFixture(location)) {
      throw new OutsideCoverageError(
        'The DEMO fixture dataset is captured exclusively for Manhattan (lat ~40.712, lon ~-74.008). Switch to LIVE mode to analyze this location.'
      );
    }

    // Build candidates to evaluate.
    // - Explicit caller-provided candidates always take precedence.
    // - LIVE mode: derive geo-adjacent candidates from user's actual location so the
    //   decision engine evaluates real FortyGuard tiles at the requested geographic area.
    // - FIXTURE mode: use Manhattan default capture locations.
    const candidatesToEvaluate: CandidateLocation[] = reqCandidates && reqCandidates.length > 0
      ? reqCandidates.map((c) => ({
          locationId: c.locationId,
          name: c.name,
          location: { latitude: c.latitude, longitude: c.longitude },
        }))
      : mode === 'LIVE'
        ? generateLiveCandidates({ latitude, longitude })
        : DEFAULT_CANDIDATE_LOCATIONS;


    // Reject duplicate candidate IDs or duplicate coordinates
    const seenLocIds = new Set<string>();
    const seenCoords = new Set<string>();
    for (const cand of candidatesToEvaluate) {
      if (seenLocIds.has(cand.locationId)) {
        throw new ValidationError(`Duplicate candidate locationId: ${cand.locationId}`);
      }
      seenLocIds.add(cand.locationId);

      const coordKey = `${cand.location.latitude.toFixed(6)},${cand.location.longitude.toFixed(6)}`;
      if (seenCoords.has(coordKey)) {
        throw new ValidationError(`Duplicate candidate coordinates for location ${cand.locationId}`);
      }
      seenCoords.add(coordKey);
    }

    // Fetch discrete hourly snapshots from selected source (LIVE API or FIXTURE)
    const snapshotsMap = await adapter.getHourlyHeatmapSnapshots(location, hourlyTimestamps);

    // Normalize observations per candidate location across all timestamps (zero cross-location leakage)
    const observationsByCandidate = new Map<string, NormalizedThermalObservation[]>();

    for (const cand of candidatesToEvaluate) {
      const obsList: NormalizedThermalObservation[] = [];
      for (const timestamp of hourlyTimestamps) {
        const snapshotAoi = snapshotsMap.get(timestamp);
        if (!snapshotAoi) {
          throw new IncompleteTemporalCoverageError(`Missing thermal observation at timestamp ${timestamp}`);
        }

        // Heatmap tile values represent spatial polygon model aggregations (provenance: DERIVED)
        const obs = adapter.normalizePointObservation(
          snapshotAoi,
          cand.location,
          timestamp,
          '/v1/heatmap',
          'DERIVED'
        );
        obsList.push(obs);
      }
      observationsByCandidate.set(cand.locationId, obsList);
    }

    // Evaluate temporal candidate windows for the primary candidate (WHEN decision)
    const primaryCandidateObs = observationsByCandidate.get(candidatesToEvaluate[0].locationId) || [];
    const decision = evaluateCandidateWindows(
      location,
      primaryCandidateObs,
      constraints,
      allowedStart
    );

    // Evaluate spatial multi-location ranking for the recommended operating window (WHERE decision)
    const activeWindow: CandidateWindow = {
      windowId: decision.recommendedWindow.windowId,
      startTime: decision.recommendedWindow.startTime,
      endTime: decision.recommendedWindow.endTime,
      durationHours: decision.recommendedWindow.durationHours,
    };

    const spatialDecision = evaluateCandidateLocations(
      candidatesToEvaluate,
      observationsByCandidate,
      activeWindow,
      {
        dataSource: mode,
        baseTimestamp: hourlyTimestamps[0],
        totalEvaluatedHours: hourlyTimestamps.length,
      }
    );

    // Evaluate joint discrete spatial-temporal optimization over CandidateLocation × CandidateWindow (WHERE + WHEN)
    const jointDecision = evaluateJointDecision(
      candidatesToEvaluate,
      observationsByCandidate,
      constraints,
      {
        dataSource: mode,
        baseTimestamp: hourlyTimestamps[0],
      }
    );

    // Evaluate Milestone 7 What-If constraint sensitivity analysis
    const scenarioAnalysis = evaluateWhatIfScenarios(
      candidatesToEvaluate,
      observationsByCandidate,
      constraints,
      {
        dataSource: mode,
        baseTimestamp: hourlyTimestamps[0],
      }
    );

    const baseTimestamp = hourlyTimestamps[0];
    const baseSpatialField = snapshotsMap.get(baseTimestamp);

    return NextResponse.json({
      success: true,
      decision,
      spatialDecision,
      jointDecision,
      scenarioAnalysis,
      spatialField: baseSpatialField,
      spatialFieldMetadata: {
        baseTimestamp,
        coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
        description: 'Spatial thermal surface represents the initial observation snapshot (t₀)',
        totalEvaluatedHours: hourlyTimestamps.length,
      },
    });




  } catch (error) {
    const errorDetails = mapErrorToProductionDetails(error);

    if (error instanceof AppError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: errorDetails,
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
          details: errorDetails,
        },
      },
      { status: 500 }
    );
  }
}

