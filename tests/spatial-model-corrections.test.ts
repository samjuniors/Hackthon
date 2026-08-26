import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import {
  createAoiFromSpan,
  moveAoiToCenter,
  getAoiCenter,
  isPointInAoi,
  aoiSpanLabel,
} from '@/lib/spatial/aoi';
import type { LocationPoint, PolygonAOI } from '@/types/domain';

const METRES_PER_DEG_LAT = 111320;
function metresPerDegLon(lat: number): number {
  return METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function ringWidthMetres(aoi: PolygonAOI, lat: number): number {
  const ring = (aoi.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
  let minLng = Infinity, maxLng = -Infinity;
  for (const [lng] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return (maxLng - minLng) * metresPerDegLon(lat);
}

function ringHeightMetres(aoi: PolygonAOI): number {
  const ring = (aoi.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
  let minLat = Infinity, maxLat = -Infinity;
  for (const [, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return (maxLat - minLat) * METRES_PER_DEG_LAT;
}

const OAKLAND: LocationPoint = { latitude: 37.8044, longitude: -122.2712 };

describe('§16.1-2 — AOI span presets produce VISIBLY different geometry', () => {
  it('250m polygon is visibly smaller than 1km polygon (side semantics)', () => {
    const a250 = createAoiFromSpan(OAKLAND, 250, 'polygon');
    const a1000 = createAoiFromSpan(OAKLAND, 1000, 'polygon');

    const w250 = ringWidthMetres(a250, OAKLAND.latitude);
    const w1000 = ringWidthMetres(a1000, OAKLAND.latitude);

    expect(w250).toBeGreaterThan(240);
    expect(w250).toBeLessThan(260); // ≈ 250m span (side), NOT 125m or 500m
    expect(w1000).toBeGreaterThan(990);
    expect(w1000).toBeLessThan(1010);
    expect(w250).toBeLessThan(w1000 / 3); // VISIBLY smaller, not a label change
    expect(ringHeightMetres(a250)).toBeGreaterThan(240);
    expect(ringHeightMetres(a250)).toBeLessThan(260);
  });

  it('250m circle is visibly smaller than 1km circle (diameter semantics)', () => {
    const c250 = createAoiFromSpan(OAKLAND, 250, 'circle');
    const c1000 = createAoiFromSpan(OAKLAND, 1000, 'circle');

    const d250 = ringWidthMetres(c250, OAKLAND.latitude);
    const d1000 = ringWidthMetres(c1000, OAKLAND.latitude);

    expect(d250).toBeGreaterThan(240);
    expect(d250).toBeLessThan(260); // diameter ≈ 250m
    expect(d1000).toBeGreaterThan(990);
    expect(d1000).toBeLessThan(1010);
    expect(d250).toBeLessThan(d1000 / 3);
  });

  it('span labels expose user semantics (side × side / diameter), never "halfSideMetres"', () => {
    expect(aoiSpanLabel(400, 'polygon')).toBe('400m × 400m');
    expect(aoiSpanLabel(1000, 'polygon')).toBe('1km × 1km');
    expect(aoiSpanLabel(250, 'circle')).toBe('250m diameter');
    expect(aoiSpanLabel(2000, 'circle')).toBe('2km diameter');
    expect(aoiSpanLabel(400, 'polygon')).not.toContain('half');
  });
});

describe('§16.3-4 — AOI movement preserves shape (pure translation)', () => {
  it('polygon remains SQUARE after movement', () => {
    const aoi = createAoiFromSpan(OAKLAND, 400, 'polygon');
    const moved = moveAoiToCenter(aoi, { latitude: 37.7952, longitude: -122.2841 });

    const ring = (moved.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    const sides: number[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      const dx = (x2 - x1) * metresPerDegLon(OAKLAND.latitude);
      const dy = (y2 - y1) * METRES_PER_DEG_LAT;
      sides.push(Math.hypot(dx, dy));
    }
    const nonDegenerate = sides.filter((s) => s > 1);
    const min = Math.min(...nonDegenerate);
    const max = Math.max(...nonDegenerate);
    expect(max / min).toBeLessThan(1.001); // all sides equal → square
    expect(min).toBeGreaterThan(395);      // size preserved (400m sides)
    expect(min).toBeLessThan(405);
  });

  it('circle remains CIRCULAR after movement', () => {
    const aoi = createAoiFromSpan(OAKLAND, 1000, 'circle');
    const newCenter = { latitude: 37.7901, longitude: -122.2905 };
    const moved = moveAoiToCenter(aoi, newCenter);

    const ring = (moved.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    const radii = ring.map(([lng, lat]) => {
      const dx = (lng - newCenter.longitude) * metresPerDegLon(newCenter.latitude);
      const dy = (lat - newCenter.latitude) * METRES_PER_DEG_LAT;
      return Math.hypot(dx, dy);
    });
    const min = Math.min(...radii);
    const max = Math.max(...radii);
    expect(max / min).toBeLessThan(1.002); // equidistant → circle (500m radius)
    expect(min).toBeGreaterThan(495);
    expect(min).toBeLessThan(505);
  });
});

describe('§16.5 + §16.17 — moved AOI geometry IS the API geometry', () => {
  it('translated AOI equals freshly-built AOI at the new center (canonical contract)', () => {
    const aoi = createAoiFromSpan(OAKLAND, 400, 'circle');
    const newCenter = { latitude: 37.8000, longitude: -122.2900 };

    const viaDrag = moveAoiToCenter(aoi, newCenter);
    const viaApi = createAoiFromSpan(newCenter, 400, 'circle');

    const dragRing = (viaDrag.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    const apiRing = (viaApi.features[0].geometry as { coordinates: number[][][] }).coordinates[0];

    expect(dragRing.length).toBe(apiRing.length);
    for (let i = 0; i < apiRing.length; i++) {
      // 1e-6 degrees ≈ 11 cm — geometrically identical at street scale
      expect(Math.abs(dragRing[i][0] - apiRing[i][0])).toBeLessThan(1e-6);
      expect(Math.abs(dragRing[i][1] - apiRing[i][1])).toBeLessThan(1e-6);
    }
  });

  it('city selection creates an AOI centered exactly at the city coordinates', () => {
    const city = { latitude: 37.8044, longitude: -122.2712 }; // Oakland
    const aoi = createAoiFromSpan(city, 400, 'polygon');
    const center = getAoiCenter(aoi);
    expect(center).not.toBeNull();
    expect(Math.abs(center!.latitude - city.latitude)).toBeLessThan(1e-9);
    expect(Math.abs(center!.longitude - city.longitude)).toBeLessThan(1e-9);
  });
});

describe('§16.10 — candidate containment (never silently moved/clamped)', () => {
  const aoi = createAoiFromSpan(OAKLAND, 400, 'polygon');

  it('accepts a candidate inside the AOI', () => {
    expect(isPointInAoi({ latitude: 37.8044, longitude: -122.2712 }, aoi)).toBe(true);
    expect(isPointInAoi({ latitude: 37.8050, longitude: -122.2700 }, aoi)).toBe(true);
  });

  it('rejects a candidate outside the AOI (including just past the edge)', () => {
    // ~1.1 km north — far outside a 400m square
    expect(isPointInAoi({ latitude: 37.8143, longitude: -122.2712 }, aoi)).toBe(false);
    // ~1 km east
    expect(isPointInAoi({ latitude: 37.8044, longitude: -122.2600 }, aoi)).toBe(false);
  });

  it('circle AOI containment follows the circular boundary', () => {
    const circle = createAoiFromSpan(OAKLAND, 400, 'circle');
    // Inside (100m from center) — in
    expect(isPointInAoi({ latitude: 37.8053, longitude: -122.2712 }, circle)).toBe(true);
    // 300m from center — outside a 200m-radius circle
    expect(isPointInAoi({ latitude: 37.8071, longitude: -122.2712 }, circle)).toBe(false);
  });
});

describe('§16.15-16 — geographic region ≠ subscription coverage; state ≠ analysis point', () => {
  const pageSrc = readFileSync(resolvePath(process.cwd(), 'src/app/page.tsx'), 'utf8');
  const mapSrc = readFileSync(resolvePath(process.cwd(), 'src/components/ThermalMap.tsx'), 'utf8');
  const boundariesSrc = readFileSync(resolvePath(process.cwd(), 'src/lib/spatial/region-boundaries.ts'), 'utf8');

  it('UI labels the state layer as GEOGRAPHIC REGION (never provider-plan coverage)', () => {
    expect(mapSrc).toContain('Geographic Region');
    // No user-facing coverage-claim phrases anywhere in the region layer stack
    for (const src of [mapSrc, boundariesSrc, pageSrc]) {
      const lower = src.toLowerCase();
      expect(lower).not.toContain('subscription boundary');
      expect(lower).not.toContain('subscription region');
      expect(lower).not.toContain('api subscription');
      expect(lower).not.toContain('available api area');
      expect(lower).not.toContain('coverage boundary');
    }
  });

  it('state selection is context-only: camera fits region, analysis point does NOT move', async () => {
    const { isStateLevelSelection, cameraForResultType } = await import('@/lib/location/selection-behavior');
    const california = {
      id: 'x', name: 'California', displayName: 'California', category: 'Custom Location' as const,
      latitude: 37.2, longitude: -119.5, resultType: 'state' as const,
    };
    expect(isStateLevelSelection(california)).toBe(true);
    expect(cameraForResultType('state')).toBe('fit-region');

    // The page must NOT route state selections through the AOI-recenter path:
    // state-level selections return before any setAoiCenter call (source contract).
    const stateBranch = pageSrc.includes("loc.resultType === 'state' || loc.resultType === 'region'");
    expect(stateBranch).toBe(true);
  });

  it('city/street selections DO recenter the AOI at the selection coordinates', () => {
    const pagePath = resolvePath(process.cwd(), 'src/app/page.tsx');
    const src = readFileSync(pagePath, 'utf8');
    expect(src).toContain('setAoiCenter(nextCenter)');
  });
});

describe('§16.20 — stale thermal data is cleared after location/AOI change', () => {
  it('page clears results on location select, AOI move, and AOI size/shape/resolution change', () => {
    const src = readFileSync(resolvePath(process.cwd(), 'src/app/page.tsx'), 'utf8');
    // Location selection clears stale state
    expect(src.match(/handleSelectLocation = useCallback[\s\S]{0,2500}clearResults\(\)/)).toBeTruthy();
    // AOI drag clears stale state
    expect(src.match(/handleMoveAoi = useCallback[\s\S]{0,1500}clearResults\(\)/)).toBeTruthy();
    // AOI shape/span/resolution change effect: body clears stale state BEFORE the deps array
    expect(
      src.match(/useEffect\(\(\) => \{[\s\S]{0,300}clearResults\(\);[\s\S]{0,1200}?\}, \[prefs\.analysisAreaShape, prefs\.analysisAoiSpanMetres, prefs\.analysisResolution\]/)
    ).toBeTruthy();
  });
});

describe('§16.9 (source) — no synthetic SITE-N / SITE-CENTER / SITE-W generation exists', () => {
  it('decision route contains no synthetic offset-candidate generator', () => {
    const src = readFileSync(resolvePath(process.cwd(), 'src/app/api/decision/route.ts'), 'utf8');
    expect(src).not.toContain('SITE-W');
    expect(src).not.toContain('SITE-CENTER');
    expect(src).not.toContain('SITE-N');
    expect(src).not.toContain('generateCandidatesForAOI');
  });

  it('synthetic thermal generator module is deleted from the codebase', () => {
    const adapterSrc = readFileSync(resolvePath(process.cwd(), 'src/lib/fortyguard/adapter.ts'), 'utf8');
    expect(adapterSrc).not.toContain('generateThermalGridForAOI');
    expect(adapterSrc).not.toContain('westCooling');
    let exists = true;
    try {
      readFileSync(resolvePath(process.cwd(), 'src/lib/spatial/thermal-grid.ts'));
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Route-level tests (direct POST handler invocation — no server needed)
// ─────────────────────────────────────────────────────────────────────────────

import { POST as decisionPOST } from '@/app/api/decision/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const MANHATTAN_AOI = createAoiFromSpan({ latitude: 40.7120, longitude: -74.0080 }, 2000, 'polygon');

describe('§16.9 — LIVE never fabricates candidates', () => {
  it('LIVE with no candidates → 400 CANDIDATES_REQUIRED (actionable, not silent)', async () => {
    const res = await decisionPOST(makeRequest({
      latitude: 37.8044,
      longitude: -122.2712,
      mode: 'LIVE',
      analysisAoi: MANHATTAN_AOI,
      temporalInput: { date: '2026-08-26', startTime: '10:00', endTime: '13:00', timeMode: 'range-of-hours' },
      timezone: 'America/Los_Angeles',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('CANDIDATES_REQUIRED');
    expect(JSON.stringify(data)).not.toContain('SITE-W');
  });
});

describe('§16.10 — candidate outside AOI is rejected by the API', () => {
  it('LIVE with an out-of-AOI candidate → 400 CANDIDATE_OUTSIDE_AOI', async () => {
    const oaklandAoi = createAoiFromSpan({ latitude: 37.8044, longitude: -122.2712 }, 400, 'polygon');
    const res = await decisionPOST(makeRequest({
      latitude: 37.8044,
      longitude: -122.2712,
      mode: 'LIVE',
      analysisAoi: oaklandAoi,
      candidates: [
        { locationId: 'SITE-01', name: 'Oakland Operations Yard', latitude: 37.8044, longitude: -122.2712 },
        { locationId: 'SITE-02', name: 'Distant Depot', latitude: 37.8143, longitude: -122.2712 }, // ~1.1km north — outside
      ],
      temporalInput: { date: '2026-08-26', startTime: '10:00', endTime: '13:00', timeMode: 'range-of-hours' },
      timezone: 'America/Los_Angeles',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('CANDIDATE_OUTSIDE_AOI');
    expect(data.error.message).toContain('Distant Depot');
  });
});

describe('§16.11 — demo Manhattan candidates appear only for the Manhattan fixture', () => {
  it('FIXTURE request outside Manhattan bounds → 404 OUTSIDE_COVERAGE (no Manhattan sites for Oakland/LA)', async () => {
    const res = await decisionPOST(makeRequest({
      latitude: 34.0522, // Los Angeles
      longitude: -118.2437,
      mode: 'FIXTURE',
    }));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error.code).toBe('OUTSIDE_COVERAGE');
  });

  it('FIXTURE at Manhattan uses the three ACTUAL captured sites (LOC-A/B/C)', async () => {
    const res = await decisionPOST(makeRequest({
      latitude: 40.7120,
      longitude: -74.0080,
      mode: 'FIXTURE',
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    const ids = data.spatialDecision.rankedLocations.map((r: { locationId: string }) => r.locationId);
    expect(ids).toEqual(['LOC-A', 'LOC-B', 'LOC-C']);
  });
});

describe('§16.18 — LIVE missing date/time is rejected', () => {
  it('LIVE without temporalInput → 400 with explicit temporal requirement', async () => {
    const res = await decisionPOST(makeRequest({
      latitude: 37.8044,
      longitude: -122.2712,
      mode: 'LIVE',
      analysisAoi: MANHATTAN_AOI,
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.message).toContain('temporalInput');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Search tests (§16.6-8) — mocked geocoder transport; FortyGuard never called
// ─────────────────────────────────────────────────────────────────────────────

describe('§16.6-8 — real geocoding search', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('"Oakland" resolves to Oakland coordinates via the geocoder', async () => {
    const fetchedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url.includes('photon.komoot.io')) {
        return new Response(JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              properties: {
                osm_key: 'place', osm_value: 'city', name: 'Oakland',
                state: 'California', country: 'United States', countrycode: 'US',
              },
              geometry: { coordinates: [-122.271356, 37.8044557] },
            },
          ],
        }), { status: 200 });
      }
      throw new Error('unexpected fetch');
    }) as typeof fetch;

    const { geocodeSearch } = await import('@/lib/location/geocode');
    const { results, source } = await geocodeSearch('Oakland, CA');

    expect(source).toBe('photon');
    expect(results.length).toBeGreaterThan(0);
    const oakland = results[0];
    expect(Math.abs(oakland.latitude - 37.8044)).toBeLessThan(0.01);
    expect(Math.abs(oakland.longitude - (-122.2713))).toBeLessThan(0.01);
    expect(oakland.state).toBe('California');
    expect(oakland.resultType).toBe('city');
    expect(oakland.timezone).toBe('America/Los_Angeles');

    // Search NEVER calls FortyGuard
    expect(fetchedUrls.some((u) => u.includes('fortyguard'))).toBe(false);
  });

  it('street/address results are classified with point-precision camera behavior', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('photon.komoot.io')) {
        return new Response(JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              properties: {
                osm_key: 'highway', osm_value: 'residential', name: 'Broadway',
                city: 'Oakland', state: 'California', country: 'United States',
              },
              geometry: { coordinates: [-122.2711, 37.8044] },
            },
            {
              properties: {
                osm_key: 'place', osm_value: 'house', name: '1 Market St',
                housenumber: '1', street: 'Market Street', city: 'San Francisco',
                state: 'California', country: 'United States', postcode: '94105',
              },
              geometry: { coordinates: [-122.3948, 37.7938] },
            },
          ],
        }), { status: 200 });
      }
      throw new Error('unexpected fetch');
    }) as typeof fetch;

    const { geocodeSearch } = await import('@/lib/location/geocode');
    const { results } = await geocodeSearch('Broadway, Oakland');

    expect(results.length).toBe(2);
    expect(results[0].resultType).toBe('street');   // highway → street
    expect(results[1].resultType).toBe('address');  // place/house → address

    const { cameraForResultType } = await import('@/lib/location/selection-behavior');
    expect(cameraForResultType(results[0].resultType)).toBe('fit-point');
    expect(cameraForResultType(results[1].resultType)).toBe('fit-point');
  });

  it('falls back to Nominatim when Photon returns nothing', async () => {
    const fetchedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url.includes('photon.komoot.io')) {
        return new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 });
      }
      if (url.includes('nominatim.openstreetmap.org')) {
        return new Response(JSON.stringify([
          {
            lat: '37.79382', lon: '-122.39481', name: 'Southern Pacific Building',
            display_name: 'Southern Pacific Building, 1, Market Street, Financial District, San Francisco, California, 94105, United States',
            class: 'building', type: 'office',
            address: { house_number: '1', road: 'Market Street', city: 'San Francisco', state: 'California', country: 'United States', postcode: '94105' },
          },
        ]), { status: 200 });
      }
      throw new Error('unexpected fetch');
    }) as typeof fetch;

    const { geocodeSearch } = await import('@/lib/location/geocode');
    const { results, source } = await geocodeSearch('1 Market St, San Francisco, CA');

    expect(source).toBe('nominatim');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Southern Pacific Building');
    expect(results[0].city).toBe('San Francisco');
    expect(results[0].resultType).toBe('poi'); // building/office → poi → fit-point
    expect(fetchedUrls.some((u) => u.includes('fortyguard'))).toBe(false);
  });

  it('geocoder outage degrades to the verified catalog (never invented coordinates)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;

    const { geocodeSearch } = await import('@/lib/location/geocode');
    const { results, source } = await geocodeSearch('San Diego');

    expect(source).toBe('catalog-fallback');
    expect(results.length).toBeGreaterThan(0);
    const sd = results.find((r) => r.name.includes('San Diego'));
    expect(sd).toBeTruthy();
    expect(Math.abs(sd!.latitude - 32.7157)).toBeLessThan(0.01);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Thermal-data honesty (§16.12-13, 19) + granularity (§16.14)
// ─────────────────────────────────────────────────────────────────────────────

import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';

const FIXTURE_FIRST_HOUR_TEMPS = [28.5, 29.1, 30.6];

describe('§16.12 — DEMO never generates synthetic thermal temperatures', () => {
  it('FIXTURE returns EXACTLY the captured cells for each hour — regardless of AOI shape/size', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const timestamps = [
      '2026-08-21T08:00:00.000Z',
      '2026-08-21T09:00:00.000Z',
    ];
    const snapshots = await adapter.getHourlyHeatmapSnapshots(
      { latitude: 40.712, longitude: -74.006 },
      timestamps,
      createAoiFromSpan({ latitude: 40.712, longitude: -74.006 }, 5000, 'circle'), // big circle AOI
      { granularity: 100, analysisAreaShape: 'circle' },
    );

    for (const ts of timestamps) {
      const fc = snapshots.get(ts)!;
      // EXACTLY the 3 captured cells — never a subdivided/dense synthetic grid
      expect(fc.features.length).toBe(3);
      const temps = fc.features.map((f) => Number(f.properties?.average_temperature));
      if (ts === timestamps[0]) {
        expect(temps).toEqual(FIXTURE_FIRST_HOUR_TEMPS); // captured values, unmodified
      }
      // Captured tile geometry is verbatim (first cell starts at the captured corner)
      const firstRing = (fc.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
      expect(firstRing[0][0]).toBeCloseTo(-74.010, 6);
      expect(firstRing[0][1]).toBeCloseTo(40.709, 6);
    }
  });
});

function liveResponseWithFc(featureCount: number): unknown {
  const features = Array.from({ length: featureCount }, (_, i) => ({
    type: 'Feature',
    properties: {
      tile_id: `provider-tile-${i}`,
      average_temperature: 26 + i * 0.5,
      min_temperature: 25 + i * 0.5,
      max_temperature: 27 + i * 0.5,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [-122.28 + i * 0.001, 37.80],
        [-122.279 + i * 0.001, 37.80],
        [-122.279 + i * 0.001, 37.805],
        [-122.28 + i * 0.001, 37.805],
        [-122.28 + i * 0.001, 37.80],
      ]],
    },
  }));
  return {
    data: {
      activity_id: 'act-live-test',
      status: 'Completed',
      result: { map_data: { type: 'FeatureCollection', features } },
    },
  };
}

describe('§16.13-14 — LIVE renders provider-returned cells with provider granularity', () => {
  const originalFetch = globalThis.fetch;
  let submittedBodies: Array<{ url: string; body: Record<string, unknown> }>;

  beforeEach(() => {
    submittedBodies = [];
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    FortyGuardAdapter.clearCache();
    vi.restoreAllMocks();
  });

  it('LIVE thermal field is EXACTLY the provider-returned FeatureCollection', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/v1/heatmap')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        submittedBodies.push({ url, body });
        return new Response(JSON.stringify({
          data: { activity_id: 'act-live-test', status: 'Processing' },
        }), { status: 200 });
      }
      if (url.includes('/v1/status/')) {
        return new Response(JSON.stringify(liveResponseWithFc(9)), { status: 200 });
      }
      throw new Error('unexpected fetch ' + url);
    }) as typeof fetch;

    const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'test-key', pollingIntervalMs: 1 });
    const { aoi } = await adapter.getHeatmap({
      polygon_aoi: createAoiFromSpan({ latitude: 37.8044, longitude: -122.2712 }, 400, 'polygon'),
      date_time: { start_date: '2026-08-26', start_time: '10:00', filter_type: 1 },
      granularity: 80,
    });

    // Provider cells rendered VERBATIM — same count, temps, tile ids, geometry
    expect(aoi.features.length).toBe(9);
    expect(aoi.features[0].properties?.tile_id).toBe('provider-tile-0');
    expect(aoi.features[0].properties?.average_temperature).toBe(26);
    expect(aoi.features[8].properties?.tile_id).toBe('provider-tile-8');
  });

  it('the selected 60/80/100 value is sent to FortyGuard as `granularity` (not zoom)', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/v1/heatmap')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        submittedBodies.push({ url, body });
        return new Response(JSON.stringify({
          data: { activity_id: 'act-g80', status: 'Processing' },
        }), { status: 200 });
      }
      if (url.includes('/v1/status/')) {
        return new Response(JSON.stringify(liveResponseWithFc(4)), { status: 200 });
      }
      throw new Error('unexpected fetch');
    }) as typeof fetch;

    const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'test-key', pollingIntervalMs: 1 });
    await adapter.getHeatmap({
      polygon_aoi: createAoiFromSpan({ latitude: 37.8044, longitude: -122.2712 }, 400, 'polygon'),
      date_time: { start_date: '2026-08-26', start_time: '10:00', filter_type: 1 },
      granularity: 80,
    });

    expect(submittedBodies.length).toBe(1);
    expect(submittedBodies[0].body.granularity).toBe(80); // provider granularity — verified
  });
});

describe('§16.19 — LIVE failure NEVER swaps to fixture data', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    FortyGuardAdapter.clearCache();
  });

  it('HTTP 402 (credits exhausted) throws — no silent fallback to captured cells', async () => {
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Payment Required — credit limit exceeded' }), { status: 402 });
    }) as typeof fetch;

    const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'exhausted-key', pollingIntervalMs: 1 });
    await expect(adapter.getHeatmap({
      polygon_aoi: createAoiFromSpan({ latitude: 40.712, longitude: -74.006 }, 400, 'polygon'),
      date_time: { start_date: '2026-08-26', start_time: '10:00', filter_type: 1 },
      granularity: 60,
    })).rejects.toThrow(/402/);

    // And the LIVE error path never returns Manhattan fixture temperatures
    try {
      await adapter.getHeatmap({
        polygon_aoi: createAoiFromSpan({ latitude: 40.712, longitude: -74.006 }, 400, 'polygon'),
        date_time: { start_date: '2026-08-26', start_time: '11:00', filter_type: 1 },
        granularity: 60,
      });
    } catch (err) {
      expect((err as Error).message).not.toContain('28.5');
    }
  });
});
