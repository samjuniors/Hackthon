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
import { isPointInAoi, aoiBboxesIntersect } from '@/lib/spatial/aoi';
import {
  getFixtureExtentAoi,
  getFixtureCaptureMetadata,
  getFixtureCaptureRequestAoi,
} from '@/lib/fortyguard/fixture-metadata';
import { z } from 'zod';
import {
  buildEngineConstraints,
  buildHourlyRequestDateTime,
  getFixtureTemporalMetadata,
} from '@/lib/temporal/server-conversion';
import { getProviderRuntimeStats } from '@/lib/fortyguard/adapter';
import { logThermalFieldStage } from '@/lib/dev/thermal-debug';
import type { AnalysisTemporalInput } from '@/lib/temporal/analysis-window';
import { buildFixtureTemporalInput, FIXTURE_TIMEZONE } from '@/lib/temporal/analysis-window';

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
  timeMode: z.enum(['single-hour', 'range-of-hours']),
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

/**
 * The three DEMO CANDIDATE sites (Lower Manhattan).
 *
 * PROVENANCE — these are APPLICATION-DEFINED candidate points, not provider
 * observations. They are evaluated against the genuine captured FortyGuard
 * field; the capture does NOT prove FortyGuard "captured these sites".
 * All three coordinates lie inside the captured thermal cells (enforced by
 * tests). No synthetic offset-site generation exists (removed); LIVE mode
 * REQUIRES user-supplied candidate sites.
 */
const DEMO_CANDIDATES: CandidateLocation[] = [
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

    const timezone = reqTimezone || (mode === 'FIXTURE' ? FIXTURE_TIMEZONE : 'UTC');
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

    // ── Credit-safety guard (LIVE mode) ──────────────────────────────────────
    // When the temporal input declares single-hour mode, cap to exactly ONE
    // FortyGuard /v1/heatmap request. Belt-and-suspenders: the client already
    // derives a 1h window, but this guard prevents a misconfigured or spoofed
    // request from silently spending N credits.
    if (mode === 'LIVE' && temporalInput.timeMode === 'single-hour' && hourlyTimestamps.length > 1) {
      hourlyTimestamps.splice(1); // keep only the first hour
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
            message: `Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) is outside the captured DEMO thermal field (Lower Manhattan). Switch to LIVE mode to analyse any location in real time.`,
            recoverySuggestion: 'Switch to LIVE mode or select a DEMO candidate site inside the captured field.',
            category: 'COVERAGE',
          } as const,
        },
        { status: 404 }
      );
    }

    const canonicalAoi = reqAnalysisAoi as
      | import('@/types/domain').PolygonAOI
      | undefined;

    // ── DEMO capture-extent gate ──
    // The captured field is FIXED. If the client-supplied AOI does not even
    // intersect the captured extent, the DEMO dataset cannot cover it — we do
    // NOT invent thermal data and do NOT call FortyGuard. (The honest client
    // always submits the captured analysis area — see the override below.)
    if (mode === 'FIXTURE') {
      const captureExtent = getFixtureExtentAoi();
      if (captureExtent && canonicalAoi && !aoiBboxesIntersect(canonicalAoi, captureExtent)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'AOI_OUTSIDE_DEMO_CAPTURE',
              message: 'The selected analysis area is outside the captured DEMO dataset. DEMO uses one fixed captured FortyGuard field — moving the AOI does not produce new provider data.',
              recoverySuggestion: 'Select a Manhattan DEMO location to load the captured analysis area, or switch to LIVE mode to request fresh FortyGuard data for any area.',
              category: 'COVERAGE',
            } as const,
          },
          { status: 422 }
        );
      }
    }

    // ── DEMO canonical AOI: the CAPTURED REQUEST AREA ──
    // In DEMO the analysis area is the polygon_aoi the capture was genuinely
    // requested with (fixture metadata) — never a client-invented geometry.
    // The capture is replayed verbatim inside it: no clipping, no
    // interpolation, no regridding, no pretend provider response for any
    // other AOI. (LIVE keeps the client's canonical AOI exactly as submitted.)
    const effectiveAoi: import('@/types/domain').PolygonAOI | undefined =
      mode === 'FIXTURE' ? (getFixtureCaptureRequestAoi() ?? canonicalAoi) : canonicalAoi;

    // ── Candidate resolution (Section 8 — NO synthetic generation) ──
    // FIXTURE: the three DEMO CANDIDATES (application-defined points inside
    //   the captured field — the route already restricted FIXTURE to the
    //   captured extent, so these always lie inside real captured cells).
    // LIVE: user-supplied sites are REQUIRED. Empty set → actionable error.
    const candidatesToEvaluate: CandidateLocation[] = reqCandidates && reqCandidates.length > 0
      ? reqCandidates.map((c) => ({
          locationId: c.locationId,
          name: c.name,
          location: { latitude: c.latitude, longitude: c.longitude },
        }))
      : mode === 'FIXTURE'
        ? DEMO_CANDIDATES
        : [];

    if (candidatesToEvaluate.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CANDIDATES_REQUIRED',
            message: 'No candidate sites provided. LIVE mode never fabricates candidate sites — add at least one candidate site inside the analysis area.',
            recoverySuggestion: 'Use "+ Add site" to place candidate sites inside the analysis area (search an address or click the map), then Generate again.',
            category: 'VALIDATION',
          } as const,
        },
        { status: 400 }
      );
    }

    // Validate every candidate lies INSIDE the authoritative analysis extent
    // (Section 9). Never silently move, clamp, or replace an out-of-area
    // candidate.
    //   - LIVE: the authoritative extent is the user's canonical AOI (what
    //     FortyGuard is asked for).
    //   - FIXTURE: the authoritative extent is the CAPTURED analysis area
    //     (the capture request AOI from the fixture metadata).
    const validationExtent = mode === 'FIXTURE' ? (getFixtureCaptureRequestAoi() ?? getFixtureExtentAoi() ?? effectiveAoi) : effectiveAoi;
    if (validationExtent) {
      for (const cand of candidatesToEvaluate) {
        if (!isPointInAoi(cand.location, validationExtent)) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'CANDIDATE_OUTSIDE_AOI',
                message: `Candidate site "${cand.name}" is outside the analysis area.`,
                recoverySuggestion: 'Move the candidate inside the analysis area (or move/drag the AOI to cover it), then Generate again.',
                category: 'VALIDATION',
              } as const,
            },
            { status: 400 }
          );
        }
      }
    }

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

    const snapshotsMap = await adapter.getHourlyHeatmapSnapshots(location, hourlyTimestamps, effectiveAoi, {
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

    // ── DEV-ONLY pipeline diagnostics (PHASE 1 proof) ──
    // Logs the PROVIDER-RESPONSE stage of the thermal pipeline invariant:
    // provider/fixture features → (must equal) → client spatialField →
    // MapLibre source → pixels. Measurement only; no geometry is altered.
    const providerActivityId =
      mode === 'FIXTURE'
        ? (getFixtureCaptureMetadata()?.activityId ?? null)
        : (getProviderRuntimeStats().lastHeatmapActivityId ?? null);
    logThermalFieldStage('provider_response', mode, baseSpatialField, {
      activityId: providerActivityId,
      hours: hourlyTimestamps.length,
    });

    // Only send spatialField to the client if it has features with renderable
    // temperature data. An empty FeatureCollection (LIVE fallback when FortyGuard
    // returns an unexpected format) should become null on the client so the map
    // shows the clean empty state rather than invisible/transparent polygons.
    const renderableSpatialField =
      baseSpatialField &&
      baseSpatialField.features.some((f) => {
        const p = f.properties;
        const v = p?.average_temperature ?? p?.temperature ?? p?.temp ?? p?.value;
        return Number.isFinite(Number(v));
      })
        ? baseSpatialField
        : undefined;

    return NextResponse.json({
      success: true,
      decision,
      spatialDecision,
      jointDecision,
      scenarioAnalysis,
      spatialField: renderableSpatialField,
      // FortyGuard activity ID of the completed analysis (LIVE: the last
      // completed /v1/heatmap activity; FIXTURE: the original capture's
      // activity). Used by History provenance — never a secret.
      providerActivityId,
      spatialFieldMetadata: renderableSpatialField
        ? {
            baseTimestamp,
            coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
            description: 'Spatial thermal surface represents the initial observation snapshot (t₀)',
            totalEvaluatedHours: hourlyTimestamps.length,
          }
        : undefined,
      // Echo the temporal provenance so the client can display the exact
      // requests that were (or were not) sent to the provider.
      // HONESTY RULE: this records the ACTUAL wire behavior — every evaluated
      // hour is its own filter_type:1 hourly request (LIVE), or NO live
      // request at all (FIXTURE replay). It NEVER claims filter_type 2/3.
      temporalProvenance: {
        input: temporalInput,
        allowedStartUtc: allowedStart,
        allowedEndUtc: allowedEnd,
        durationHours,
        timezone,
        isFixtureCapture: mode === 'FIXTURE',
        fixtureMetadata: mode === 'FIXTURE'
          ? { ...getFixtureTemporalMetadata(), capture: getFixtureCaptureMetadata() }
          : undefined,
        providerRequests: mode === 'LIVE'
          ? {
              strategy: 'EVALUATED_AS_HOURLY_REQUESTS' as const,
              filterType: 1 as const,
              hourlyRequestCount: hourlyTimestamps.length,
              description: `Evaluated as ${hourlyTimestamps.length} hourly FortyGuard /v1/heatmap requests (filter_type: 1 each).`,
              requests: hourlyTimestamps.map((ts) => buildHourlyRequestDateTime(ts)),
            }
          : {
              strategy: 'FIXTURE_REPLAY_NO_LIVE_REQUEST' as const,
              filterType: null,
              hourlyRequestCount: 0,
              description: 'DEMO replays the captured FortyGuard response — no live provider request was made.',
              requests: [],
            },
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
