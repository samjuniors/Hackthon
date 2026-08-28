import { describe, it, expect, afterEach } from 'vitest';
import { POST as decisionPOST } from '@/app/api/decision/route';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import {
  createAoiFromSpan,
  analyzeAoiArea,
  aoiSpanLabel,
  aoiAreaLabel,
} from '@/lib/spatial/aoi';
import { validateAnalysisAoi } from '@/lib/spatial/aoi-validation';
import type { AnalysisAreaShape } from '@/lib/spatial/aoi';
import type { PolygonAOI } from '@/types/domain';

/**
 * ADVERSARIAL AOI GEOMETRY CHAIN PROOF (audit §3).
 *
 * For every user-selectable shape/span combination the test proves:
 *
 *   UI geometry == canonical AOI geometry == server geometry == FortyGuard
 *   request geometry
 *
 * ...by building the AOI EXACTLY the way src/app/page.tsx does
 * (createAoiFromSpan — the same exported function the page calls), submitting
 * it through the REAL decision route handler (LIVE mode), intercepting the
 * provider fetch, and deep-comparing the transmitted `polygon_aoi` against the
 * UI geometry.
 *
 * Areas are then verified INDEPENDENTLY with analytic formulas
 * (square: side² · circle-32-gon: ½·n·r²·sin(2π/n)) — never by re-using the
 * module's own maths — and the span (linear size) is asserted distinct from
 * the area so a "400m" can never masquerade as "400m²".
 */

const MANHATTAN = { latitude: 40.712, longitude: -74.008 };

/** The six audited shape/span combinations. */
const COMBOS: ReadonlyArray<{ shape: AnalysisAreaShape; span: number; label: string }> = [
  { shape: 'polygon', span: 400, label: 'square 400m' },
  { shape: 'polygon', span: 1000, label: 'square 1km' },
  { shape: 'polygon', span: 2000, label: 'square 2km' },
  { shape: 'circle', span: 400, label: 'circle 400m' },
  { shape: 'circle', span: 1000, label: 'circle 1km' },
  { shape: 'circle', span: 2000, label: 'circle 2km' },
];

/** A single provider cell that CONTAINS the whole audited AOI (so the LIVE
 *  pipeline completes and the decision engine has a tile for the candidate). */
function coveringCell(): PolygonAOI {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          tile_id: 'tile-geometry-proof',
          average_temperature: 31.5,
          min_temperature: 30.0,
          max_temperature: 33.0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74.06, 40.68],
              [-73.95, 40.68],
              [-73.95, 40.75],
              [-74.06, 40.75],
              [-74.06, 40.68],
            ],
          ],
        },
      },
    ],
  };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('AOI geometry chain — UI == canonical == server == FortyGuard request (audit §3)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    FortyGuardAdapter.clearCache();
  });

  for (const combo of COMBOS) {
    it(`${combo.label}: the polygon_aoi transmitted to FortyGuard is EXACTLY the rendered UI geometry`, async () => {
      // 1. UI geometry — the exact call src/app/page.tsx makes (same exported
      //    function, same arguments, same center/span/shape).
      const uiAoi = createAoiFromSpan(MANHATTAN, combo.span, combo.shape);

      // 2. Server-side validation accepts THIS geometry (the route validates
      //    the client AOI — `canonicalAoi` — before any provider call).
      const validation = validateAnalysisAoi(uiAoi);
      expect(validation.valid).toBe(true);

      // 3. Intercept the provider wire; capture every /v1/heatmap body.
      const heatmapBodies: Array<{ polygon_aoi: PolygonAOI; date_time: unknown; granularity: number }> = [];
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/v1/heatmap')) {
          heatmapBodies.push(JSON.parse(String(init?.body)));
          return new Response(
            JSON.stringify({ error: false, status_code: 200, message: 'Processing', data: { activity_id: 'act-geo-proof' } }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        if (url.includes('/v1/status/')) {
          return new Response(
            JSON.stringify({
              error: false,
              status_code: 200,
              message: 'Completed',
              data: { activity_id: 'act-geo-proof', status: 'Completed', result: { map_data: coveringCell() } },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          );
        }
        throw new Error(`Unexpected provider fetch: ${url}`);
      }) as typeof fetch;

      // 4. Submit through the REAL route handler — the same body shape
      //    src/app/page.tsx posts (analysisAoi = the rendered geometry).
      const res = await decisionPOST(
        makeRequest({
          latitude: MANHATTAN.latitude,
          longitude: MANHATTAN.longitude,
          mode: 'LIVE',
          granularity: 100,
          analysisAreaShape: combo.shape,
          analysisAoi: uiAoi,
          temporalInput: { date: '2026-08-20', startTime: '10:00', endTime: '11:00', timeMode: 'single-hour' },
          timezone: 'UTC',
          candidates: [
            { locationId: 'LOC-PROOF', name: 'Geometry proof candidate', latitude: MANHATTAN.latitude, longitude: MANHATTAN.longitude },
          ],
        })
      );
      const data = await res.json();
      expect(data.success).toBe(true);

      // 5. THE proof: exactly one heatmap submission, and its polygon_aoi is
      //    deep-equal to the UI geometry (rendered == submitted == server ==
      //    wire). JSON round-trip strips undefined — compare serializations.
      expect(heatmapBodies).toHaveLength(1);
      expect(heatmapBodies[0].polygon_aoi).toEqual(uiAoi);
      expect(JSON.stringify(heatmapBodies[0].polygon_aoi)).toBe(JSON.stringify(uiAoi));
    });
  }
});

describe('AOI area — independent analytic verification (audit §3)', () => {
  const MI2_PER_M2 = 1 / (1609.344 * 1609.344);

  it.each(COMBOS.map((c) => [c.label, c] as const))('%s: area computed from geometry matches the analytic formula', (_label, combo) => {
    const aoi = createAoiFromSpan(MANHATTAN, combo.span, combo.shape);
    const area = analyzeAoiArea(aoi);

    // INDEPENDENT expectation — plain geometry, no shared code:
    //   square    : side²                       (span is the SIDE)
    //   circle 32 : ½ · n · r² · sin(2π/n)      (span is the DIAMETER)
    const expectedM2 =
      combo.shape === 'polygon'
        ? combo.span * combo.span
        : 0.5 * 32 * (combo.span / 2) ** 2 * Math.sin((2 * Math.PI) / 32);

    expect(area.areaM2).toBeGreaterThan(expectedM2 * 0.985);
    expect(area.areaM2).toBeLessThan(expectedM2 * 1.015);
    expect(area.areaKm2).toBeCloseTo(expectedM2 / 1e6, 2);
    expect(area.areaMi2).toBeCloseTo(expectedM2 * MI2_PER_M2, 2);

    if (combo.shape === 'circle') {
      // The 32-gon is within 1% of the TRUE circle area π·r² — proving the
      // shape really is a circle of the claimed DIAMETER.
      const trueCircle = Math.PI * (combo.span / 2) ** 2;
      expect(Math.abs(area.areaM2 - trueCircle) / trueCircle).toBeLessThan(0.01);
    }
  });

  it('span (linear) is never presented as area — labels are distinct and both shown', () => {
    const square400 = createAoiFromSpan(MANHATTAN, 400, 'polygon');
    // "400m × 400m" is a LINEAR span label; the AREA label is km²/mi².
    expect(aoiSpanLabel(400, 'polygon')).toBe('400m × 400m');
    expect(aoiSpanLabel(2000, 'circle')).toBe('2km diameter');
    const area = analyzeAoiArea(square400);
    // 400m span ⇒ 0.16 km² area — numerically different from the span.
    expect(area.areaKm2).not.toBe(400);
    expect(area.areaKm2).toBeCloseTo(0.16, 2);
    expect(aoiAreaLabel(square400)).toMatch(/km² · .* mi²$/);
  });

  it('every combo stays within the enforced conservative documented limit (10 mi²)', () => {
    for (const combo of COMBOS) {
      const aoi = createAoiFromSpan(MANHATTAN, combo.span, combo.shape);
      expect(analyzeAoiArea(aoi).areaMi2).toBeLessThan(10);
    }
  });
});
