import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { validateAnalysisAoi } from '@/lib/spatial/aoi-validation';
import {
  deriveWorkflowStage,
  deriveGenerateReadiness,
  type WorkspaceStageInput,
  type GenerateReadinessInput,
} from '@/lib/workspace/stage';
import { createAoiFromSpan, createBoundingAOI, moveAoiToCenter, getAoiCenter } from '@/lib/spatial/aoi';
import { getRegionBoundaryPolygon, resolveRegionDisplayName } from '@/lib/spatial/region-boundaries';
import { applyCandidateMove } from '@/hooks/use-candidate-sites';
import {
  FIXTURE_CAPTURE_REQUEST_AOI,
  DEMO_CANDIDATE_SITES,
  FIXTURE_EXTENT_BOUNDS,
} from '@/lib/fortyguard/fixture-display';
import { getFixtureCaptureRequestAoi } from '@/lib/fortyguard/fixture-metadata';
import type { PolygonAOI, LocationPoint } from '@/types/domain';

/**
 * WORKSPACE INTERACTION TESTS — the UX + spatial-interaction model lock
 * (Reset, location lifecycle, marker/AOI/candidate dragging, AOI validation,
 * DEMO/LIVE separation, single canonical analysis extent).
 *
 * Pure logic (stage machine, validation, candidate moves) is tested directly;
 * page/map wiring is asserted as a source contract (the established pattern
 * in tests/demo-live-separation.test.ts + fortyguard-contract.test.ts).
 */

const pageSrc = readFileSync(resolvePath(process.cwd(), 'src/app/page.tsx'), 'utf8');
const mapSrc = readFileSync(resolvePath(process.cwd(), 'src/components/ThermalMap.tsx'), 'utf8');
const railSrc = readFileSync(resolvePath(process.cwd(), 'src/components/dashboard/ControlRail.tsx'), 'utf8');
const hookSrc = readFileSync(resolvePath(process.cwd(), 'src/hooks/use-candidate-sites.ts'), 'utf8');

// ── helpers ────────────────────────────────────────────────────────────────

const MANHATTAN: LocationPoint = { latitude: 40.712, longitude: -73.998 };
const NEW_JERSEY: LocationPoint = { latitude: 40.73, longitude: -74.15 };

const VALID_AOI = createAoiFromSpan(MANHATTAN, 400, 'polygon');
const VALID_AOI_VALIDATION = { valid: true, message: '', recovery: '' };

function stage(overrides: Partial<WorkspaceStageInput> = {}): WorkspaceStageInput {
  return {
    hasLocation: true,
    hasAoi: true,
    aoiValid: true,
    ready: true,
    loading: false,
    hasResult: false,
    errorCode: null,
    ...overrides,
  };
}

function readiness(overrides: Partial<GenerateReadinessInput> = {}): GenerateReadinessInput {
  return {
    mode: 'LIVE',
    hasLocation: true,
    aoiValidation: VALID_AOI_VALIDATION,
    temporalValid: true,
    candidateCount: 1,
    outsideCandidateCount: 0,
    demoCaptureAvailable: false,
    ...overrides,
  };
}

/** Extract a named useCallback handler body from page source. */
function handlerBody(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = useCallback(`);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('}, [', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

// ── 1–4. State machine + Reset ─────────────────────────────────────────────

describe('workspace interaction — state machine + Reset', () => {
  it('1. initial state is EMPTY (no location → nothing else may exist)', () => {
    expect(deriveWorkflowStage(stage({ hasLocation: false, hasAoi: false, ready: false }))).toBe('EMPTY');
    // Even with stray state present, no location forces EMPTY.
    expect(deriveWorkflowStage(stage({ hasLocation: false, hasAoi: true, hasResult: true }))).toBe('EMPTY');
    // Page opens with NO pre-selected location (no implicit DEMO analysis).
    expect(pageSrc).toContain('useState<NamedLocation | null>(null)');
  });

  it('2. Reset returns the workspace to EMPTY (one compact control, no reload)', () => {
    // The reset handler exists and nulls the location + AOI + region context.
    const reset = handlerBody(pageSrc, 'handleResetAnalysis');
    expect(reset).toContain('setSelectedLocation(null)');
    expect(reset).toContain('setRegionName(undefined)');
    expect(reset).toContain('requestCamera(\'fit-aoi\')');
    // ONE compact reset control in the Analysis header (aria + tooltip).
    expect(railSrc).toContain('reset-analysis-btn');
    expect(railSrc).toContain('aria-label="Reset analysis"');
    expect(railSrc).toMatch(/Reset<\/span>/); // compact — not a second big button
    // No page reload / navigation in the reset path.
    expect(reset).not.toContain('location.reload');
    expect(reset).not.toContain('router.');
  });

  it('3. Reset clears thermal/decision/explanation/candidates/scenario state', () => {
    const reset = handlerBody(pageSrc, 'handleResetAnalysis');
    expect(reset).toContain('clearResults()');       // decision/spatial/joint/scenario/explanation/spatialField/meta/errors
    expect(reset).toContain('candidateSites.clearSites()');
    expect(reset).toContain('setAddSiteMode(false)');
    // clearResults nulls the thermal field + every derived result.
    const clear = handlerBody(pageSrc, 'clearResults');
    expect(clear).toContain('setDecision(null)');
    expect(clear).toContain('setSpatialField(null)');
    expect(clear).toContain('setSpatialFieldMeta(null)');
    expect(clear).toContain('setExplanation(null)');
    expect(clear).toContain('setScenarioAnalysis(null)');
    expect(clear).toContain('setErrorDetails(null)');
  });

  it('4. Reset invalidates in-flight responses (request-epoch bump + stale discard)', () => {
    const reset = handlerBody(pageSrc, 'handleResetAnalysis');
    expect(reset).toContain('activeRequestIdRef.current++');
    expect(reset).toContain('setLoading(false)');
    // The pipeline discards stale responses by the same epoch.
    const pipeline = pageSrc.slice(
      pageSrc.indexOf('const runDecisionPipeline = useCallback('),
      pageSrc.indexOf('const handleSelectLocation = useCallback('),
    );
    expect(pipeline).toContain('requestId !== activeRequestIdRef.current');
    // The explanation fetch is epoch-guarded too.
    const explain = handlerBody(pageSrc, 'fetchExplanation');
    expect(explain).toContain('requestId !== activeRequestIdRef.current');
  });
});

// ── 5–8. Location lifecycle ────────────────────────────────────────────────

describe('workspace interaction — location lifecycle', () => {
  it('5. selecting a new location clears old thermal data (never a stale render)', () => {
    const select = handlerBody(pageSrc, 'handleSelectLocation');
    expect(select).toContain('setSelectedLocation(loc)');
    expect(select).toContain('clearResults()');
    // Stage can never show RESULT after the location changed with no result.
    expect(deriveWorkflowStage(stage({ hasResult: false }))).not.toBe('RESULT');
  });

  it('6. clearing the location removes the marker and returns to EMPTY', () => {
    expect(deriveWorkflowStage(stage({ hasLocation: false }))).toBe('EMPTY');
    // The Clear affordance exists in the location card + is wired to reset.
    expect(railSrc).toContain('onClearLocation={onClearLocation}');
    expect(pageSrc).toContain('onClearLocation={handleClearLocation}');
    const clear = handlerBody(pageSrc, 'handleClearLocation');
    expect(clear).toContain('handleResetAnalysis()');
    // Map renders NO operating marker without a location.
    expect(pageSrc).toContain('showLocationMarker={!!selectedLocation}');
  });

  it('7. the operating-location marker is draggable in LIVE (MapLibre marker drag)', () => {
    expect(pageSrc).toContain('locationDraggable={mode === \'LIVE\'}');
    expect(mapSrc).toContain('draggable: !!locationDraggable');
    expect(mapSrc).toContain('onMoveOperatingLocationRef.current?.({ latitude: ll.lat, longitude: ll.lng })');
  });

  it('8. dragging the operating marker invalidates the old result WITHOUT a provider call', () => {
    const move = handlerBody(pageSrc, 'handleMoveOperatingLocation');
    expect(move).toContain('clearResults()');
    expect(move).not.toContain('runDecisionPipeline');
    // Dragging the marker recomputes the AOI around the new coordinates.
    expect(move).toContain('setAoiCenter(nextCenter)');
    // The moved location becomes canonical.
    expect(move).toContain('setSelectedLocation(nextLoc)');
  });
});

// ── 9–12. AOI interaction + validation ─────────────────────────────────────

describe('workspace interaction — AOI derivation & validation', () => {
  it('9. Operating Location movement recomputes the canonical AOI (pure translation, same span)', () => {
    const moved = moveAoiToCenter(VALID_AOI, NEW_JERSEY);
    const center = getAoiCenter(moved);
    expect(center?.latitude).toBeCloseTo(NEW_JERSEY.latitude, 6);
    expect(center?.longitude).toBeCloseTo(NEW_JERSEY.longitude, 6);
    // Page: moving the operating location updates canonical state
    const moveLoc = handlerBody(pageSrc, 'handleMoveOperatingLocation');
    expect(moveLoc).toContain('setAoiCenter(nextCenter)');
    expect(moveLoc).toContain('setSelectedLocation(nextLoc)');
    // In LIVE mode, analysisAoi strictly derives from selectedLocation
    expect(pageSrc).toContain('createAoiFromSpan(');
  });

  it('10. LIVE location movement does NOT automatically call the provider (explicit Generate only)', () => {
    const moveLoc = handlerBody(pageSrc, 'handleMoveOperatingLocation');
    expect(moveLoc).not.toContain('runDecisionPipeline');
  });

  it('11. invalid AOI disables Generate (and states exactly why)', () => {
    const invalidValidation = validateAnalysisAoi(
      moveAoiToCenter(VALID_AOI, { latitude: 40.712, longitude: 187 }), // beyond the antimeridian
    );
    expect(invalidValidation.valid).toBe(false);
    const gated = deriveGenerateReadiness(readiness({ aoiValidation: invalidValidation }));
    expect(gated.enabled).toBe(false);
    expect(gated.reason).toBe(invalidValidation.message);
    // Missing candidates / invalid temporal / no location also disable.
    expect(deriveGenerateReadiness(readiness({ hasLocation: false })).enabled).toBe(false);
    expect(deriveGenerateReadiness(readiness({ temporalValid: false })).enabled).toBe(false);
    expect(deriveGenerateReadiness(readiness({ candidateCount: 0 })).enabled).toBe(false);
    expect(deriveGenerateReadiness(readiness({ outsideCandidateCount: 1 })).enabled).toBe(false);
    // The disabled reason is surfaced inline in the rail.
    expect(railSrc).toContain('generate-blocked-reason');
    expect(pageSrc).toContain('generateDisabled={!generateReadiness.enabled}');
  });

  it('12. invalid AOI displays immediate recovery feedback (banner + retained geometry)', () => {
    // Map: invalid banner + red retained geometry (never moved/clipped).
    expect(mapSrc).toContain('aoi-invalid-banner');
    expect(mapSrc).toContain('applyAoiValidityPaint');
    // Page: validation runs on every geometry change and is passed to the map.
    expect(pageSrc).toContain('validateAnalysisAoi(analysisAoi');
    expect(pageSrc).toContain('aoiInvalid={aoiInvalid}');
    // Stage machine surfaces AOI_INVALID.
    expect(deriveWorkflowStage(stage({ aoiValid: false }))).toBe('AOI_INVALID');
  });
});

// ── Validation module — honest constraint families ─────────────────────────

describe('workspace interaction — validateAnalysisAoi (honest constraints)', () => {
  it('accepts a normal LIVE AOI anywhere on Earth (no invented regional restriction)', () => {
    expect(validateAnalysisAoi(VALID_AOI).valid).toBe(true);
    // A legitimate AOI in a DIFFERENT region (New Jersey) is still valid — the
    // product deliberately does NOT enforce coarse state-polygon containment
    // (the simplified boundaries cut through metro areas and would invent a
    // provider restriction that does not exist).
    expect(validateAnalysisAoi(moveAoiToCenter(VALID_AOI, NEW_JERSEY)).valid).toBe(true);
    // Even with an active region boundary in context, containment is NOT enforced.
    expect(
      validateAnalysisAoi(moveAoiToCenter(VALID_AOI, NEW_JERSEY), {
        regionBoundary: getRegionBoundaryPolygon('NY'),
        regionDisplayName: 'New York',
      }).valid,
    ).toBe(true);
  });

  it('rejects coordinates beyond valid geographic bounds', () => {
    const outOfWorld = createAoiFromSpan({ latitude: 0, longitude: 179.99 }, 250, 'polygon');
    // widen past the antimeridian by moving far east
    const result = validateAnalysisAoi(moveAoiToCenter(outOfWorld, { latitude: 0, longitude: 200 }));
    expect(result.valid).toBe(false);
    expect(result.code).toBe('AOI_OUTSIDE_GEOGRAPHIC_BOUNDS');
  });

  it('rejects an AOI exceeding the documented Basic 10 mi² provider limit (never silently shrunk)', () => {
    const huge = createBoundingAOI(MANHATTAN, 40000, 'polygon'); // 80km × 80km ≈ 2471 mi²
    const result = validateAnalysisAoi(huge);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('AOI_EXCEEDS_PROVIDER_LIMIT');
    // The message names the AREA, the DOCUMENTED plan limit (10 mi² — Basic),
    // and the zero-credit pre-flight block. The stale 150 must NEVER appear.
    expect(result.message).toContain('mi²');
    expect(result.message).toContain('10 mi²');
    expect(result.message).toContain('blocked before submission');
    expect(result.message).not.toContain('150');
    // Area + limit facts ride along for the pre-flight UI display.
    expect(result.area?.areaMi2).toBeGreaterThan(2000);
    expect(result.limit?.limitMi2).toBe(10);
    expect(result.limit?.label).toBe('FortyGuard Basic limit: 10 mi²');
  });

  it('rejects degenerate/empty geometry', () => {
    expect(validateAnalysisAoi(null).valid).toBe(false);
    expect(validateAnalysisAoi({ type: 'FeatureCollection', features: [] }).valid).toBe(false);
  });

  it('resolves the geographic region for dragged points honestly (context follows the point)', () => {
    expect(resolveRegionDisplayName(40.712, -73.998)).toBe('New York');
    expect(resolveRegionDisplayName(37.7749, -122.4194)).toBe('California');
    // Outside every known region → undefined (NO invented boundary).
    expect(resolveRegionDisplayName(0, -140)).toBeUndefined();
  });
});

// ── 13–16. Candidate site lifecycle ────────────────────────────────────────

describe('workspace interaction — candidate lifecycle (ADD → MOVE → REMOVE)', () => {
  const aoi = createAoiFromSpan(MANHATTAN, 1000, 'polygon');
  const sites = [
    { locationId: 'SITE-01', name: 'A', location: { latitude: 40.712, longitude: -73.998 }, origin: 'map-click' as const },
  ];

  it('13. candidates can be added (real user-placed sites only)', () => {
    expect(hookSrc).toContain('addSiteAt');
    expect(pageSrc).toContain('candidateSites.addSiteAt');
  });

  it('14. a candidate can be MOVED inside the AOI (coordinates update exactly)', () => {
    const target = { latitude: 40.7135, longitude: -73.997 };
    const result = applyCandidateMove(sites, 'SITE-01', target, aoi);
    expect(result.accepted).toBe(true);
    expect(result.sites[0].location.latitude).toBeCloseTo(target.latitude, 6);
    expect(result.sites[0].location.longitude).toBeCloseTo(target.longitude, 6);
    // Moving a candidate invalidates the previous result WITHOUT a provider call.
    const move = handlerBody(pageSrc, 'handleMoveCandidate');
    expect(move).toContain('clearResults()');
    expect(move).not.toContain('runDecisionPipeline');
    // Map markers are draggable in LIVE and commit via onMoveCandidate.
    expect(pageSrc).toContain('candidatesDraggable={mode === \'LIVE\'}');
    expect(mapSrc).toContain('draggable: !!candidatesDraggable');
  });

  it('15. a candidate can be REMOVED (list + map marker)', () => {
    expect(hookSrc).toContain('removeSite');
    expect(railSrc).toMatch(/onRemoveSite\(site\.locationId\)/);
  });

  it('16. a candidate moved OUTSIDE the AOI is REJECTED (kept at its last valid position)', () => {
    const farOutside = { latitude: 40.9, longitude: -73.7 };
    const result = applyCandidateMove(sites, 'SITE-01', farOutside, aoi);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('OUTSIDE_AOI');
    // Sites list is UNCHANGED — never silently moved/clamped.
    expect(result.sites).toEqual(sites);
    // The map snaps the marker back + shows immediate feedback.
    expect(mapSrc).toContain('marker.setLngLat(entry.lastValid)');
    expect(mapSrc).toContain('candidate-toast-feedback');
  });
});

// ── 17–20. DEMO/LIVE separation + stale-data invariants ────────────────────

describe('workspace interaction — DEMO/LIVE separation + stale invariants', () => {
  it('17. an unsupported DEMO location never shows Manhattan thermal data (honest gate)', () => {
    // Stage machine: NO_DEMO_CAPTURE is the honest dead-end state.
    expect(deriveWorkflowStage(stage({ errorCode: 'NO_DEMO_CAPTURE' }))).toBe('NO_DEMO_CAPTURE');
    // Generate is disabled with an actionable reason.
    const gated = deriveGenerateReadiness(readiness({ mode: 'FIXTURE', demoCaptureAvailable: false }));
    expect(gated.enabled).toBe(false);
    expect(gated.reason).toContain('No DEMO capture');
    // Exact honest message + Switch to LIVE recovery exist in the page.
    expect(pageSrc).toContain('NO DEMO CAPTURE AVAILABLE FOR THIS LOCATION');
    expect(pageSrc).toContain("'NO_DEMO_CAPTURE'");
  });

  it('18. the DEMO AOI is FIXED to the genuine captured request AOI (no drag/resize)', () => {
    expect(pageSrc).toContain('locationDraggable={mode === \'LIVE\'}');
    expect(mapSrc).toContain('locationDraggable');
    // The captured request AOI is a valid geometry (it is the only DEMO AOI).
    expect(validateAnalysisAoi(FIXTURE_CAPTURE_REQUEST_AOI).valid).toBe(true);
    // The client mirror equals the server-side capture metadata GEOMETRY
    // exactly (ring-verbatim — the established mirror contract).
    const mirrorRing = (FIXTURE_CAPTURE_REQUEST_AOI.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    const serverRing = (getFixtureCaptureRequestAoi()!.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    expect(mirrorRing).toEqual(serverRing);
  });

  it('19. the DEMO thermal field has ONE coherent spatial extent (no second square)', () => {
    // The capture request AOI (the rendered AOI) encloses the captured cells.
    // Genuine provider grid cells that STRADDLE the request boundary are
    // returned whole (never clipped) — allow one captured-cell (~100m ≈ 0.001°)
    // of boundary-straddle tolerance, exactly as the provider returned them.
    const ring = (FIXTURE_CAPTURE_REQUEST_AOI.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    const lngs = ring.map(([lng]) => lng);
    const lats = ring.map(([, lat]) => lat);
    const TOL = 0.001;
    expect(Math.min(...lngs) - TOL).toBeLessThanOrEqual(FIXTURE_EXTENT_BOUNDS.minLng);
    expect(Math.max(...lngs) + TOL).toBeGreaterThanOrEqual(FIXTURE_EXTENT_BOUNDS.maxLng);
    expect(Math.min(...lats) - TOL).toBeLessThanOrEqual(FIXTURE_EXTENT_BOUNDS.minLat);
    expect(Math.max(...lats) + TOL).toBeGreaterThanOrEqual(FIXTURE_EXTENT_BOUNDS.maxLat);
    // The old second rectangle (capture-extent layer) is GONE; the single
    // canonical boundary is labeled explicitly.
    expect(mapSrc).not.toContain('capture-extent-outline');
    expect(mapSrc).not.toContain('aoi-glow');
    expect(mapSrc).toContain('captured-aoi-label');
    expect(pageSrc).toContain('captureAoiLabel');
  });

  it('20. no stale thermal cells survive location replacement', () => {
    // Selection clears results in the SAME batched update (single render).
    const select = handlerBody(pageSrc, 'handleSelectLocation');
    expect(select).toContain('clearResults()');
    // With a new location and no result yet, the stage is pre-result.
    expect(deriveWorkflowStage(stage({ hasResult: false, ready: false }))).not.toBe('RESULT');
    expect(deriveWorkflowStage(stage({ hasResult: false, ready: false }))).not.toBe('GENERATING');
  });

  it('21. LIVE candidate points are evaluated against the actual containing cells (mapped, not invented)', () => {
    // All application-defined DEMO candidates sit inside the captured extent
    // (their containing cells exist — the mapper resolves them; the
    // full point→tile contract is locked in tests/spatial*.test.ts).
    for (const c of DEMO_CANDIDATE_SITES) {
      expect(
        c.location.latitude >= FIXTURE_EXTENT_BOUNDS.minLat &&
        c.location.latitude <= FIXTURE_EXTENT_BOUNDS.maxLat &&
        c.location.longitude >= FIXTURE_EXTENT_BOUNDS.minLng &&
        c.location.longitude <= FIXTURE_EXTENT_BOUNDS.maxLng,
      ).toBe(true);
    }
    // LIVE candidates must be inside the AOI before Generate is allowed.
    const aoi: PolygonAOI = createAoiFromSpan(MANHATTAN, 400, 'polygon');
    const inside = { locationId: 'SITE-01', name: 'A', location: { latitude: 40.7125, longitude: -73.9975 }, origin: 'map-click' as const };
    expect(applyCandidateMove([inside], 'SITE-01', { latitude: 40.7125, longitude: -73.9975 }, aoi).accepted).toBe(true);
    expect(applyCandidateMove([inside], 'SITE-01', { latitude: 40.75, longitude: -73.9 }, aoi).accepted).toBe(false);
  });
});

// ── Stage machine — full trajectory ────────────────────────────────────────

describe('workspace interaction — full stage trajectory', () => {
  it('walks EMPTY → LOCATION_SELECTED → AOI_VALID → READY → GENERATING → RESULT', () => {
    expect(deriveWorkflowStage(stage({ hasLocation: false, hasAoi: false, ready: false }))).toBe('EMPTY');
    expect(deriveWorkflowStage(stage({ hasAoi: false, ready: false }))).toBe('LOCATION_SELECTED');
    expect(deriveWorkflowStage(stage({ ready: false }))).toBe('AOI_VALID');
    expect(deriveWorkflowStage(stage({}))).toBe('READY');
    expect(deriveWorkflowStage(stage({ loading: true }))).toBe('GENERATING');
    expect(deriveWorkflowStage(stage({ hasResult: true }))).toBe('RESULT');
  });

  it('ERROR outranks RESULT; NO_DEMO_CAPTURE outranks AOI/ERROR; GENERATING only while loading', () => {
    expect(deriveWorkflowStage(stage({ hasResult: true, errorCode: 'PROVIDER_ERROR' }))).toBe('ERROR');
    expect(deriveWorkflowStage(stage({ errorCode: 'NO_DEMO_CAPTURE' }))).toBe('NO_DEMO_CAPTURE');
    expect(deriveWorkflowStage(stage({ loading: true, errorCode: 'PROVIDER_ERROR' }))).toBe('GENERATING');
    // AOI_INVALID retains precedence over generic errors.
    expect(deriveWorkflowStage(stage({ aoiValid: false, errorCode: 'PROVIDER_ERROR' }))).toBe('AOI_INVALID');
  });

  it('DEMO auto-load trajectory: GENERATING → RESULT for a captured location', () => {
    expect(deriveWorkflowStage(stage({ loading: true }))).toBe('GENERATING');
    expect(deriveWorkflowStage(stage({ hasResult: true }))).toBe('RESULT');
  });
});
