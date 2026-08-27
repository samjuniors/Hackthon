import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { POST as decisionPOST } from '@/app/api/decision/route';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import {
  FIXTURE_CAPTURE_REQUEST_AOI,
  FIXTURE_CAPTURE_SPAN_METRES,
  FIXTURE_CAPTURE_CENTER,
  fixtureCaptureSpanLabel,
  DEMO_CANDIDATE_SITES,
  FIXTURE_EXTENT_AOI,
  doesAoiIntersectFixtureExtent,
} from '@/lib/fortyguard/fixture-display';
import { getFixtureCaptureRequestAoi } from '@/lib/fortyguard/fixture-metadata';
import { isLocationCoveredByFixture } from '@/lib/location/search';
import { getAoiCenter, isPointInAoi } from '@/lib/spatial/aoi';
import type { PolygonAOI } from '@/types/domain';
import capturedDemoFixture from './fixtures/heatmap_captured_demo.json';

/**
 * DEMO/LIVE SEPARATION — FINAL SPATIAL WORKFLOW CORRECTION lock.
 *
 * Hierarchy enforced (LOCATION → ANALYSIS AOI → THERMAL OBSERVATIONS →
 * CANDIDATES → RECOMMENDATION):
 *   - DEMO is a DATA SOURCE, never the implicit opening state (EMPTY initial
 *     workspace; a location is selected explicitly).
 *   - The DEMO analysis AOI IS the genuine capture request area (fixture
 *     metadata) — the rendered field corresponds to the area evaluated.
 *   - Locations without a capture get an honest NO_DEMO_CAPTURE state — never
 *     Manhattan cells, translated cells, or synthetic candidates.
 *   - LIVE keeps the user's AOI/resolution controls; LIVE never reuses DEMO
 *     thermal data.
 */

const CAPTURED_HOUR = '2026-08-14T12:00:00.000Z';

type CapturedFixture = {
  captureMetadata?: {
    requestBody?: { polygon_aoi?: { features?: Array<{ geometry?: { coordinates?: number[][][] } }> } };
  };
  hourlySnapshots?: Array<{ timestamp: string; aoi?: { features?: unknown[] } }>;
};
const fixture = capturedDemoFixture as unknown as CapturedFixture;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const FIXTURE_TEMPORAL = { date: '2026-08-14', startTime: '12:00', endTime: '13:00', timeMode: 'single-hour' } as const;

function ringOf(aoi: PolygonAOI | null): number[][] {
  if (!aoi) throw new Error('capture request AOI missing from fixture metadata');
  return (aoi.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
}

describe('DEMO/LIVE separation — the captured analysis area (fixture metadata)', () => {
  it('the client mirror equals the genuine capture request AOI verbatim (server metadata)', () => {
    const serverAoi = getFixtureCaptureRequestAoi();
    expect(serverAoi).not.toBeNull();
    const mirrorRing = (FIXTURE_CAPTURE_REQUEST_AOI.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    expect(mirrorRing).toEqual(ringOf(serverAoi));
    // …and equals the raw capture request body recorded in the fixture JSON.
    const rawRing = fixture.captureMetadata?.requestBody?.polygon_aoi?.features?.[0]?.geometry?.coordinates?.[0];
    expect(rawRing).toBeDefined();
    expect(mirrorRing).toEqual(rawRing);
  });

  it('the captured analysis area is ~2.4km × 2.4km (the real capture request span)', () => {
    expect(FIXTURE_CAPTURE_SPAN_METRES.width).toBeGreaterThan(2350);
    expect(FIXTURE_CAPTURE_SPAN_METRES.width).toBeLessThan(2450);
    expect(FIXTURE_CAPTURE_SPAN_METRES.height).toBeGreaterThan(2350);
    expect(FIXTURE_CAPTURE_SPAN_METRES.height).toBeLessThan(2450);
    expect(fixtureCaptureSpanLabel()).toBe('≈2.4km × 2.4km');
  });

  it('FIXTURE_CAPTURE_CENTER is the geometric center of the captured analysis area', () => {
    const center = getAoiCenter(FIXTURE_CAPTURE_REQUEST_AOI)!;
    expect(FIXTURE_CAPTURE_CENTER.latitude).toBeCloseTo(center.latitude, 9);
    expect(FIXTURE_CAPTURE_CENTER.longitude).toBeCloseTo(center.longitude, 9);
  });

  it('the captured analysis area contains the captured thermal field and the DEMO candidates', () => {
    // The captured field corresponds to the captured analysis area: the
    // provider tiles the REQUEST AOI at 100m granularity, so every captured
    // cell lies within the request AOI ± one edge tile (tiles that straddle
    // the boundary are included — the capture extent reflects exactly that).
    const cells = fixture.hourlySnapshots![0].aoi!.features as Array<{
      geometry: { coordinates: number[][][] };
    }>;
    expect(cells.length).toBe(425);
    const ring = ringOf(getFixtureCaptureRequestAoi());
    const reqMinLng = Math.min(...ring.map(([lng]) => lng));
    const reqMaxLng = Math.max(...ring.map(([lng]) => lng));
    const reqMinLat = Math.min(...ring.map(([, lat]) => lat));
    const reqMaxLat = Math.max(...ring.map(([, lat]) => lat));
    const TILE_TOLERANCE = 0.0012; // one 100m tile in degrees (lng at 40.7° / lat)
    for (const cell of cells) {
      for (const [lng, lat] of cell.geometry.coordinates[0]) {
        expect(lng).toBeGreaterThanOrEqual(reqMinLng - TILE_TOLERANCE);
        expect(lng).toBeLessThanOrEqual(reqMaxLng + TILE_TOLERANCE);
        expect(lat).toBeGreaterThanOrEqual(reqMinLat - TILE_TOLERANCE);
        expect(lat).toBeLessThanOrEqual(reqMaxLat + TILE_TOLERANCE);
      }
    }
    // All three application-defined DEMO candidates are inside the captured
    // analysis area (they participate in the analysis of that area).
    for (const cand of DEMO_CANDIDATE_SITES) {
      expect(isPointInAoi(cand.location, FIXTURE_CAPTURE_REQUEST_AOI)).toBe(true);
    }
    // The captured analysis area intersects the captured extent (coverage gate).
    expect(doesAoiIntersectFixtureExtent(FIXTURE_CAPTURE_REQUEST_AOI)).toBe(true);
    expect(doesAoiIntersectFixtureExtent(FIXTURE_EXTENT_AOI)).toBe(true);
  });
});

describe('DEMO/LIVE separation — DEMO coverage semantics', () => {
  it('only locations inside the captured field have a DEMO capture', () => {
    // Genuine capture.
    expect(isLocationCoveredByFixture({ latitude: 40.7120, longitude: -74.0080 })).toBe(true); // Battery Park (LOC-A)
    expect(isLocationCoveredByFixture({ latitude: 40.712, longitude: -73.998 })).toBe(true); // capture center
    // No capture — must be honest NO_DEMO_CAPTURE, never Manhattan data.
    expect(isLocationCoveredByFixture({ latitude: 37.8044, longitude: -122.2712 })).toBe(false); // Oakland
    expect(isLocationCoveredByFixture({ latitude: 30.2672, longitude: -97.7431 })).toBe(false); // Austin
    expect(isLocationCoveredByFixture({ latitude: 41.8781, longitude: -87.6298 })).toBe(false); // Chicago
    expect(isLocationCoveredByFixture({ latitude: 34.0522, longitude: -118.2437 })).toBe(false); // LA
    expect(isLocationCoveredByFixture({ latitude: 40.758, longitude: -73.9855 })).toBe(false); // Midtown — outside the capture
  });
});

describe('DEMO/LIVE separation — decision route (DEMO evaluates the captured request area)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    FortyGuardAdapter.clearCache();
    // DEMO must make ZERO provider requests — any fetch call fails the test.
    globalThis.fetch = vi.fn(() => {
      throw new Error('DEMO must not call the provider (FIXTURE replay only)');
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    FortyGuardAdapter.clearCache();
  });

  it('DEMO at a captured location with the captured analysis area → 200, 425 verbatim cells, zero provider calls', async () => {
    const res = await decisionPOST(makeRequest({
      latitude: 40.7120,
      longitude: -74.0080,
      mode: 'FIXTURE',
      analysisAoi: FIXTURE_CAPTURE_REQUEST_AOI,
      temporalInput: FIXTURE_TEMPORAL,
      timezone: 'UTC',
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.spatialField.features.length).toBe(425);
    const ids: string[] = data.spatialDecision.rankedLocations.map((r: { locationId: string }) => r.locationId);
    expect(ids.sort()).toEqual(['LOC-A', 'LOC-B', 'LOC-C']);
    expect(data.spatialDecision.recommendedLocation.locationId).toBe('LOC-A');
    expect(data.temporalProvenance.providerRequests.strategy).toBe('FIXTURE_REPLAY_NO_LIVE_REQUEST');
    expect(data.temporalProvenance.providerRequests.hourlyRequestCount).toBe(0);
  });

  it('DEMO never clips/regrids: a small client AOI still evaluates the CAPTURED analysis area verbatim', async () => {
    // A client that submits a 400m AOI (legacy/foreign) must NOT get a
    // clipped, interpolated, or regridded field — the capture is replayed
    // exactly as captured, for the captured analysis area.
    const smallAoi = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        properties: { shape: 'polygon' },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[
            [-74.01, 40.710], [-74.006, 40.710], [-74.006, 40.714], [-74.01, 40.714], [-74.01, 40.710],
          ]],
        },
      }],
    };
    const res = await decisionPOST(makeRequest({
      latitude: 40.7120,
      longitude: -74.0080,
      mode: 'FIXTURE',
      analysisAoi: smallAoi,
      temporalInput: FIXTURE_TEMPORAL,
      timezone: 'UTC',
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    // EXACTLY the 425 captured cells — never a subset for the small AOI.
    expect(data.spatialField.features.length).toBe(425);
    const snapshot = fixture.hourlySnapshots![0].aoi!.features as unknown[];
    expect(data.spatialField.features.length).toBe(snapshot.length);
  });

  it('DEMO at a location WITHOUT a capture → 404 OUTSIDE_COVERAGE (even with the captured AOI submitted)', async () => {
    const res = await decisionPOST(makeRequest({
      latitude: 37.8044, // Oakland — no DEMO capture exists
      longitude: -122.2712,
      mode: 'FIXTURE',
      analysisAoi: FIXTURE_CAPTURE_REQUEST_AOI,
      temporalInput: FIXTURE_TEMPORAL,
      timezone: 'UTC',
    }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe('OUTSIDE_COVERAGE');
    expect(data.error.message).toContain('outside the captured DEMO thermal field');
  });
});

describe('DEMO/LIVE separation — workspace state machine (source contract)', () => {
  const pageSrc = readFileSync(resolvePath(process.cwd(), 'src/app/page.tsx'), 'utf8');
  const railSrc = readFileSync(resolvePath(process.cwd(), 'src/components/dashboard/ControlRail.tsx'), 'utf8');
  const mapSrc = readFileSync(resolvePath(process.cwd(), 'src/components/ThermalMap.tsx'), 'utf8');
  const canvasSrc = readFileSync(resolvePath(process.cwd(), 'src/components/dashboard/ThermalMapCanvas.tsx'), 'utf8');
  const bannerSrc = readFileSync(resolvePath(process.cwd(), 'src/components/dashboard/ErrorBanner.tsx'), 'utf8');

  it('opens in the EMPTY state — no location pre-selected, no implicit DEMO analysis', () => {
    expect(pageSrc).toContain('useState<NamedLocation | null>(null)');
    // The initial-mount effect must NOT run the decision pipeline.
    const mountMatch = pageSrc.match(/Initial mount:[\s\S]*?(?=\/\/ React to data-source mode changes)/);
    expect(mountMatch).toBeTruthy();
    expect(mountMatch!.join('')).not.toContain('runDecisionPipeline');
    // The workflow stage is explicit on the app root.
    expect(pageSrc).toContain('data-workflow-stage={workflowStage}');
    expect(canvasSrc).toContain("'EMPTY'");
    expect(canvasSrc).toContain('Select a location to begin');
  });

  it('DEMO selection loads the captured dataset; no-capture locations get the honest gate', () => {
    // Capture load path: the captured request AOI is the canonical DEMO AOI.
    expect(pageSrc).toContain('FIXTURE_CAPTURE_REQUEST_AOI');
    expect(pageSrc).toContain('FIXTURE_CAPTURE_CENTER');
    // Honest gate: exact message + zero-request semantics.
    expect(pageSrc).toContain("'NO_DEMO_CAPTURE'");
    expect(pageSrc).toContain('NO DEMO CAPTURE AVAILABLE FOR THIS LOCATION');
    // No implicit Manhattan swap when switching data sources.
    const modeEffect = pageSrc.match(/React to data-source mode changes[\s\S]*?\}, \[mode\]\);/);
    expect(modeEffect).toBeTruthy();
    expect(modeEffect![0]).not.toContain('METROPOLITAN_LOCATIONS[0]');
  });

  it('candidates are application-defined and exist ONLY when a capture is loaded', () => {
    expect(pageSrc).toMatch(/demoCaptureAvailable \? DEMO_CANDIDATE_SITES : \[\]/);
    expect(railSrc).toContain('Application-defined DEMO candidates');
    expect(railSrc).toContain('DEMO CANDIDATES'); // chip label retained
    expect(railSrc).not.toContain('captured demo sites');
  });

  it('the DEMO analysis area is the captured area — LIVE keeps the AOI/resolution controls', () => {
    // DEMO: fixed captured analysis area + captured resolution readouts.
    expect(railSrc).toContain('captured-analysis-area');
    expect(railSrc).toContain('Captured resolution:');
    expect(railSrc).toContain('captured-resolution');
    // LIVE: span presets + shape + resolution grids still exist.
    expect(railSrc).toContain('aoi-size-presets');
    expect(railSrc).toContain('resolution-options');
    // Page renders the captured request AOI as the DEMO canonical geometry.
    expect(pageSrc).toMatch(/demoCaptureAvailable \? FIXTURE_CAPTURE_REQUEST_AOI : null/);
  });

  it('AOI dragging is a LIVE control — the captured analysis area is not draggable in DEMO', () => {
    expect(pageSrc).toContain("aoiDraggable={mode === 'LIVE'}");
    expect(mapSrc).toContain('aoiDraggable');
    expect(mapSrc).toContain('if (!aoiDraggable) {');
    // The map accepts a NULL location (EMPTY state renders no marker).
    expect(mapSrc).toContain('location: LocationPoint | null');
  });

  it('the no-capture state offers Switch to LIVE (requirement 3)', () => {
    expect(bannerSrc).toContain('onSwitchToLive');
    expect(bannerSrc).toContain('Switch to LIVE');
  });
});
