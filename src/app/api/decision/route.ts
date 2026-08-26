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
import {
  buildEngineConstraints,
  buildHourlyTimestamps,
  buildFortyGuardDateTime,
  getFixtureTemporalMetadata,
} from '@/lib/temporal/server-conversion';
import type { AnalysisTemporalInput } from '@/lib/temporal/analysis-window';
import { FIXTURE_TEMPORAL_METADATA, buildFixtureTemporalInput } from '@/lib/temporal/analysis-window';

const CandidateSchema = z.object({
  locationId: z.string().min(1),
  name: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/**
 * PolygonAOI FeatureCollection validator. The client builds ONE canonical AOI
 * (src/lib/spatial/aoi.ts createBoundingAOI) and sends it as `analysisAoi`.
 * The adapter uses THIS geometry for the FortyGuard request — so the visible
 * AOI on the map and the requested AOI at FortyGuard are exactly the same.
 *
 * Validation is intentionally permissive at the API boundary: we only check
 * that the payload is a FeatureCollection with a non-empty features array.
 * Real geometry validation happens inside the adapter's `findTileForPoint`
 * (ray-casting) which throws OutsideCoverageError / EmptyThermalFieldError /
 * MissingThermalValueError for malformed data — those surface as proper
 * production errors via mapErrorToProductionDetails().
 */
const AnalysisAoiSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(z.any()).min(1, 'AOI must contain at least one feature'),
});

const TemporalInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:MM'),
  timeMode: z.enum(['single-hour', 'range-of-hours', 'single-day']),
  dayWindowHours: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
});

const DecisionRequestSchema = z.object({
  latitude: z.number().min(-90).max(90).default(40.7128),
  longitude: z.number().min(-180).max(180).default(-74.006),
  candidates: z.array(CandidateSchema).optional(),
  durationHours: z.number().int().min(1).max(12).optional(),
  allowedStart: z.string().optional(),
  allowedEnd: z.string().optional(),
  mode: z.enum(['LIVE', 'FIXTURE']).optional(),
  // Operational analysis preferences (persisted client-side; affect LIVE FortyGuard queries).
  granularity: z.union([z.literal(60), z.literal(80), z.literal(100)]).optional(),
  analysisAreaShape: z.enum(['polygon', 'circle']).optional(),
  /**
   * Canonical analysis AOI built client-side (src/lib/spatial/aoi.ts).
   * The SAME geometry is rendered on the map AND sent to FortyGuard.
   * If absent, the adapter falls back to its own createBoundingAOI() with
   * a 400m half-side — but the recommended flow is for the client to send
   * the canonical AOI explicitly so the visible == requested contract holds.
   */
  analysisAoi: AnalysisAoiSchema.optional(),
  /**
   * Explicit temporal input (Section 4) — replaces duration-only. The server
   * converts local wall-clock → UTC at the adapter boundary (Section 6).
   * The AI never performs date/time conversion.
   */
  temporalInput: TemporalInputSchema.optional(),
  /** IANA timezone of the selected location (e.g. 'America/Los_Angeles'). */
  timezone: z.string().optional(),
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
 * Generate geo-adjacent candidates around a user-selected location scaled to the analysis AOI.
 * Candidates stay well inside the requested AOI radius/half-side (at ~40% radius offset);
 * returned FortyGuard polygons remain authoritative and normalizePointObservation() validates containment.
 */
function generateCandidatesForAOI(
  center: LocationPoint,
  halfSideMetres = 400,
  isManhattan = false
): CandidateLocation[] {
  const METRES_PER_DEG_LAT = 111320;
  const metresPerDegLon = METRES_PER_DEG_LAT * Math.cos((center.latitude * Math.PI) / 180);
  const offset = Math.max(60, halfSideMetres * 0.40);

  const dLat = offset / METRES_PER_DEG_LAT;
  const dLon = offset / metresPerDegLon;

  if (isManhattan) {
    return [
      {
        locationId: 'LOC-A',
        name: 'Battery Park Greenway (Waterfront)',
        location: { latitude: center.latitude, longitude: Number((center.longitude - dLon).toFixed(6)) },
      },
      {
        locationId: 'LOC-B',
        name: 'City Hall Civic Center (Mid-Density)',
        location: { latitude: center.latitude, longitude: Number(center.longitude.toFixed(6)) },
      },
      {
        locationId: 'LOC-C',
        name: 'Chinatown / Bowery Staging (Asphalt Canyon)',
        location: { latitude: Number((center.latitude + dLat * 0.7).toFixed(6)), longitude: Number((center.longitude + dLon * 0.7).toFixed(6)) },
      },
    ];
  }

  return [
    {
      locationId: 'SITE-W',
      name: 'Site West (Waterfront / Green Corridor)',
      location: { latitude: center.latitude, longitude: Number((center.longitude - dLon).toFixed(6)) },
    },
    {
      locationId: 'SITE-CENTER',
      name: 'Site Center (Operating Base)',
      location: { latitude: center.latitude, longitude: Number(center.longitude.toFixed(6)) },
    },
    {
      locationId: 'SITE-N',
      name: 'Site North (Urban Core)',
      location: { latitude: Number((center.latitude + dLat).toFixed(6)), longitude: center.longitude },
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
      durationHours: reqDurationHours,
      allowedStart: reqStart,
      allowedEnd: reqEnd,
      mode: reqMode,
      granularity: reqGranularity,
      analysisAreaShape: reqShape,
      analysisAoi: reqAnalysisAoi,
      temporalInput: reqTemporalInput,
      timezone: reqTimezone,
    } = parseResult.data;

    const mode: DataSourceMode = reqMode ?? (process.env.FORTYGUARD_DATA_SOURCE === 'LIVE' ? 'LIVE' : 'FIXTURE');

    const adapter = new FortyGuardAdapter({ mode });

    // Build the engine's UTC constraints from the explicit temporal input
    // (Section 4 + 6). For DEMO mode without a temporal input, anchor to the
    // fixture's captured window so the displayed WHEN matches the fixture data.
    let temporalInput: AnalysisTemporalInput;
    if (reqTemporalInput) {
      temporalInput = reqTemporalInput as AnalysisTemporalInput;
    } else if (mode === 'FIXTURE') {
      temporalInput = buildFixtureTemporalInput();
    } else {
      // LIVE without explicit temporal input — reject. The UI must always
      // send an explicit date/time (Section 7: "Do not silently use an
      // undocumented date").
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'LIVE mode requires an explicit temporalInput (date, startTime, endTime, timeMode).',
            recoverySuggestion: 'Set the WHEN date/time inputs before generating.',
            category: 'VALIDATION',
          } as const,
        },
        { status: 400 }
      );
    }

    const timezone = reqTimezone || (mode === 'FIXTURE' ? 'America/New_York' : 'UTC');
    const { allowedStart: tAllowedStart, allowedEnd: tAllowedEnd, durationHours: tDurationHours } =
      buildEngineConstraints(temporalInput, timezone);

    const allowedStart = reqStart || tAllowedStart;
    const allowedEnd = reqEnd || tAllowedEnd;
    const durationHours = reqDurationHours ?? tDurationHours;

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

    const hourlyTimestamps: string[] = [];
    for (let tMs = startMs; tMs < endMs; tMs += 3600 * 1000) {
      hourlyTimestamps.push(new Date(tMs).toISOString());
    }

    if (hourlyTimestamps.length === 0) {
      throw new IncompleteTemporalCoverageError('Empty hourly sequence for requested time span');
    }

    const isManhattan = isLocationCoveredByFixture(location);
    if (mode === 'FIXTURE' && !isManhattan) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'OUTSIDE_COVERAGE',
            message: `Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) is outside the verified Manhattan fixture bounds. Switch to LIVE mode to evaluate any location globally.`,
            recoverySuggestion: 'Switch to LIVE mode or select a captured Manhattan demo site.',
            category: 'COVERAGE',
          } as const,
        },
        { status: 404 }
      );
    }

    const canonicalAoi = reqAnalysisAoi as
      | import('@/types/domain').PolygonAOI
      | undefined;

    const aoiProps = (canonicalAoi?.features[0]?.properties ?? {}) as {
      radiusMetres?: number;
      halfSideMetres?: number;
    };
    const aoiHalfSide = Number(aoiProps.radiusMetres ?? aoiProps.halfSideMetres ?? 400);

    const candidatesToEvaluate: CandidateLocation[] = reqCandidates && reqCandidates.length > 0
      ? reqCandidates.map((c) => ({
          locationId: c.locationId,
          name: c.name,
          location: { latitude: c.latitude, longitude: c.longitude },
        }))
      : generateCandidatesForAOI({ latitude, longitude }, aoiHalfSide, isManhattan && mode === 'FIXTURE');

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

    const snapshotsMap = await adapter.getHourlyHeatmapSnapshots(location, hourlyTimestamps, canonicalAoi, {
      granularity: reqGranularity,
      analysisAreaShape: reqShape,
    });
    const observationsByCandidate = new Map<string, NormalizedThermalObservation[]>();

    for (const cand of candidatesToEvaluate) {
      const obsList: NormalizedThermalObservation[] = [];
      for (const timestamp of hourlyTimestamps) {
        const snapshotAoi = snapshotsMap.get(timestamp);
        if (!snapshotAoi) {
          throw new IncompleteTemporalCoverageError(`Missing thermal observation at timestamp ${timestamp}`);
        }

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

    const primaryCandidateObs = observationsByCandidate.get(candidatesToEvaluate[0].locationId) || [];
    const decision = evaluateCandidateWindows(
      location,
      primaryCandidateObs,
      constraints,
      allowedStart
    );

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

    const jointDecision = evaluateJointDecision(
      candidatesToEvaluate,
      observationsByCandidate,
      constraints,
      {
        dataSource: mode,
        baseTimestamp: hourlyTimestamps[0],
      }
    );

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

    // Only send spatialField to the client if it has features with renderable
    // temperature data. An empty FeatureCollection (LIVE fallback when FortyGuard
    // returns an unexpected format) should become null on the client so the map
    // shows the clean empty state rather than invisible/transparent polygons.
    const renderableSpatialField =
      baseSpatialField &&
      baseSpatialField.features.some((f) =>
        Number.isFinite(Number(f.properties?.average_temperature))
      )
        ? baseSpatialField
        : undefined;

    return NextResponse.json({
      success: true,
      decision,
      spatialDecision,
      jointDecision,
      scenarioAnalysis,
      spatialField: renderableSpatialField,
      spatialFieldMetadata: renderableSpatialField
        ? {
            baseTimestamp,
            coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
            description: 'Spatial thermal surface represents the initial observation snapshot (t₀)',
            totalEvaluatedHours: hourlyTimestamps.length,
          }
        : undefined,
      // Echo the temporal provenance so the client can display the exact
      // date/time the heatmap represents (Section 8 + 9).
      temporalProvenance: {
        input: temporalInput,
        allowedStartUtc: allowedStart,
        allowedEndUtc: allowedEnd,
        durationHours,
        timezone,
        fortyGuardDateTime: buildFortyGuardDateTime(temporalInput),
        isFixtureCapture: mode === 'FIXTURE',
        fixtureMetadata: mode === 'FIXTURE' ? getFixtureTemporalMetadata() : undefined,
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
