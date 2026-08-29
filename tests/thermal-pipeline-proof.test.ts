import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { POST as decisionPOST } from '@/app/api/decision/route';
import {
  FIXTURE_CAPTURE_REQUEST_AOI,
  FIXTURE_CELL_COUNT,
  FIXTURE_ACTIVITY_ID,
  FIXTURE_DISPLAY_GRANULARITY,
} from '@/lib/fortyguard/fixture-display';
import { buildFixtureTemporalInput } from '@/lib/temporal/analysis-window';
import { computeThermalFieldStats, logThermalFieldStage } from '@/lib/dev/thermal-debug';
import capturedDemoFixture from './fixtures/heatmap_captured_demo.json';
import type { PolygonAOI } from '@/types/domain';

/**
 * THERMAL PIPELINE PROOF (Phase 1) — trace one complete DEMO analysis through
 * the application and assert the critical invariant at every stage:
 *
 *   provider/fixture features
 *     == adapter getHourlyHeatmapSnapshots features
 *     == decision API response spatialField features
 *     == (client spatialField → MapLibre thermal-tiles source — asserted
 *        statically + proven in the browser; see the browser QA log)
 *
 * No silent filtering. No fabricated cells. Real captured data only.
 */

const CAPTURED_HOUR = '2026-08-14T12:00:00.000Z';
const fixtureSnapshot = (
  capturedDemoFixture as {
    hourlySnapshots: Array<{ timestamp: string; aoi: PolygonAOI }>;
  }
).hourlySnapshots[0];
const fixtureField = fixtureSnapshot.aoi;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('THERMAL PIPELINE PROOF — DEMO fixture → adapter → decision API', () => {
  it('A. the fixture contains the genuine captured FortyGuard field: 425 cells, 425 unique tile IDs, real temperature range', () => {
    const stats = computeThermalFieldStats(fixtureField)!;
    expect(stats).not.toBeNull();
    expect(stats.cells).toBe(FIXTURE_CELL_COUNT);
    expect(stats.cells).toBe(425);
    expect(stats.uniqueTileIds).toBe(425);
    // Genuine captured temperatures (Lower Manhattan, 100 m cells).
    expect(stats.temperatureMin).toBeCloseTo(29.74, 2);
    expect(stats.temperatureMax).toBeCloseTo(32.3632, 3);
    expect(stats.bounds).not.toBeNull();
    expect(stats.centroid).not.toBeNull();
  });

  it('B. adapter.getHourlyHeatmapSnapshots returns the fixture features EXACTLY (deep-equal — no normalization drift)', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const snapshots = await adapter.getHourlyHeatmapSnapshots(
      { latitude: 40.712, longitude: -74.006 },
      [CAPTURED_HOUR],
    );
    const field = snapshots.get(CAPTURED_HOUR)!;
    expect(field).not.toBeUndefined();
    expect(field.features.length).toBe(fixtureField.features.length);
    expect(field).toEqual(fixtureField); // verbatim — geometry AND properties
  });

  it('C. the decision API response spatialField equals the fixture features verbatim (425 cells, no silent filtering)', async () => {
    const res = await decisionPOST(makeRequest({
      latitude: 40.712,
      longitude: -74.006,
      mode: 'FIXTURE',
      granularity: FIXTURE_DISPLAY_GRANULARITY,
      analysisAoi: FIXTURE_CAPTURE_REQUEST_AOI,
      temporalInput: buildFixtureTemporalInput(),
      timezone: 'UTC',
    }));
    const data = (await res.json()) as {
      success: boolean;
      spatialField?: PolygonAOI;
      providerActivityId?: string | null;
      spatialFieldMetadata?: { baseTimestamp: string; totalEvaluatedHours: number };
      temporalProvenance?: { isFixtureCapture: boolean; providerRequests: { hourlyRequestCount: number } };
    };

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    // The critical invariant: response spatialField == fixture features.
    expect(data.spatialField).toBeDefined();
    expect(data.spatialField!.features.length).toBe(425);
    expect(data.spatialField!.features.length).toBe(fixtureField.features.length);
    expect(data.spatialField).toEqual(fixtureField);

    // Stage stats agree end-to-end.
    const stats = computeThermalFieldStats(data.spatialField)!;
    expect(stats.cells).toBe(425);
    expect(stats.uniqueTileIds).toBe(425);
    expect(stats.temperatureMin).toBeCloseTo(29.74, 2);
    expect(stats.temperatureMax).toBeCloseTo(32.3632, 3);

    // Provenance: the capture's real FortyGuard activity id + zero live requests.
    expect(data.providerActivityId).toBe(FIXTURE_ACTIVITY_ID);
    expect(data.temporalProvenance?.isFixtureCapture).toBe(true);
    expect(data.temporalProvenance?.providerRequests.hourlyRequestCount).toBe(0);

    // The rendered snapshot is the captured hour.
    expect(data.spatialFieldMetadata?.baseTimestamp).toBe(CAPTURED_HOUR);
  });
});

describe('THERMAL PIPELINE PROOF — MapLibre rendering wiring (static contract)', () => {
  const thermalMapSource = readFileSync(
    resolvePath(process.cwd(), 'src/components/ThermalMap.tsx'),
    'utf-8',
  );
  const pageSource = readFileSync(
    resolvePath(process.cwd(), 'src/app/page.tsx'),
    'utf-8',
  );

  it('D. the thermal-tiles GeoJSON source exists and is fed the spatialField verbatim', () => {
    expect(thermalMapSource).toContain("addSource('thermal-tiles'");
    // The data-sync effect pushes spatialField into the source unchanged —
    // the verbatim guard (hasRenderableTemperatureData) never alters features.
    expect(thermalMapSource).toContain('thermalSource.setData(thermalData)');
  });

  it('E. the fill layer references the correct source and is driven by average_temperature with fill-opacity > 0', () => {
    expect(thermalMapSource).toContain("id: 'thermal-tiles-fill'");
    expect(thermalMapSource).toMatch(/source:\s*'thermal-tiles',\s*\n\s*paint:\s*\{\s*\n\s*'fill-color':\s*THERMAL_COLOR_EXPRESSION/);
    // fill-opacity is 0.92 (dark) / 0.88 (light) — strictly positive (field stays dominant over the AOI hatch).
    expect(thermalMapSource).toMatch(/'fill-opacity':\s*isDark \? 0.92 : 0.88/);
    // The thermal ramp expression is driven by the provider temperature field.
    expect(thermalMapSource).toMatch(/'get',\s*'average_temperature'/);
  });

  it('F. the layer sits above the region context and below the AOI outline (never hidden by the mask)', () => {
    // Layer order in the init: region-mask-fill → region-boundary-* →
    // thermal-tiles-fill → thermal-tiles-seam → aoi-fill/outline. MapLibre
    // paints in addLayer order, so the thermal fill renders ABOVE the mask.
    const maskIdx = thermalMapSource.indexOf("id: 'region-mask-fill'");
    const fillIdx = thermalMapSource.indexOf("id: 'thermal-tiles-fill'");
    const aoiIdx = thermalMapSource.indexOf("id: 'aoi-fill'");
    expect(maskIdx).toBeGreaterThan(-1);
    expect(fillIdx).toBeGreaterThan(maskIdx);
    expect(aoiIdx).toBeGreaterThan(fillIdx);
  });

  it('G. the page hands spatialField straight to ThermalMap (no intermediate filtering)', () => {
    expect(pageSource).toContain('spatialField={spatialField}');
  });

  it('H. dev-only inspection hooks exist: window.__thermalMap + [THERMAL DEBUG] stage logs', () => {
    expect(thermalMapSource).toContain('__thermalMap');
    expect(thermalMapSource).toContain('map_source');
    expect(pageSource).toContain('client_spatial_field');
  });
});

describe('THERMAL PIPELINE PROOF — diagnostics module behaviour', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('I. computeThermalFieldStats measures without mutating the field', () => {
    const before = JSON.stringify(fixtureField);
    const stats = computeThermalFieldStats(fixtureField);
    expect(JSON.stringify(fixtureField)).toBe(before);
    expect(stats!.cells).toBe(425);
  });

  it('J. logThermalFieldStage is a no-op outside development (production never logs)', () => {
    const infoSpy = vi.spyOn(console, 'info');
    vi.stubEnv('NODE_ENV', 'production');
    // The guard reads NODE_ENV at CALL time — no re-import needed.
    logThermalFieldStage('provider_response', 'FIXTURE', fixtureField);
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
