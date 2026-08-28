import { describe, it, expect } from 'vitest';
import {
  createBoundingAOI,
  createAoiFromSpan,
  moveAoiToCenter,
  analyzeAoiArea,
  analyzeAoiAreaMi2,
  aoiAreaLabel,
  aoiSpanLabel,
  isAoiWithinLimit,
  FORTYGUARD_AOI_LIMIT_MI2,
} from '@/lib/spatial/aoi';
import {
  FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2,
  resolveApplicableAoiLimit,
} from '@/lib/fortyguard/plan-limits';
import { FIXTURE_CAPTURE_REQUEST_AOI } from '@/lib/fortyguard/fixture-display';
import { findTileForPoint } from '@/lib/spatial/mapper';
import fixture from '../../tests/fixtures/heatmap_captured_demo.json';

describe('canonical analysis AOI', () => {
  it('uses the documented FortyGuard Basic AOI limit constant (10 mi² — never 150)', () => {
    expect(FORTYGUARD_AOI_LIMIT_MI2).toBe(10);
    expect(FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2).toEqual({ basic: 10, premium: 50, startup: 10 });
    // The stale 150 mi² assumption must never resurface as an active limit.
    expect(FORTYGUARD_AOI_LIMIT_MI2).not.toBe(150);
    expect(resolveApplicableAoiLimit('Hackathon').limitMi2).toBe(10);
    expect(resolveApplicableAoiLimit('Hackathon').limitMi2).not.toBe(150);
  });

  it('builds a closed square polygon for polygon shape', () => {
    const aoi = createBoundingAOI({ latitude: 34.0522, longitude: -118.2437 }, 400, 'polygon');
    expect(aoi.type).toBe('FeatureCollection');
    expect(aoi.features).toHaveLength(1);
    const ring = (aoi.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('builds a closed 32-gon for circle shape — the SAME geometry is sent to the API and rendered', () => {
    const aoi = createBoundingAOI({ latitude: 34.0522, longitude: -118.2437 }, 400, 'circle');
    const ring = (aoi.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(aoi.features[0].properties).toMatchObject({ shape: 'circle', radiusMetres: 400 });
  });

  it('keeps every preset AOI within the documented Basic limit (never silently shrunk)', () => {
    for (const span of [250, 400, 1000, 2000, 5000]) {
      const aoi = createAoiFromSpan({ latitude: 40.712, longitude: -74.008 }, span, 'polygon');
      expect(isAoiWithinLimit(aoi)).toBe(true);
      expect(analyzeAoiAreaMi2(aoi).areaMi2).toBeLessThan(10);
      const circle = createAoiFromSpan({ latitude: 40.712, longitude: -74.008 }, span, 'circle');
      expect(isAoiWithinLimit(circle)).toBe(true);
    }
    // An oversized AOI must be REJECTED, not shrunk (documented Basic limit 10 mi²).
    const huge = createBoundingAOI({ latitude: 36.0, longitude: -118.0 }, 12000, 'polygon'); // 24km square ≈ 222 mi²
    expect(isAoiWithinLimit(huge)).toBe(false);
    expect(analyzeAoiArea(huge).areaMi2).toBeGreaterThan(10);
  });
});

describe('authoritative geometry-based area calculation', () => {
  const MANHATTAN = { latitude: 40.712, longitude: -74.008 };
  const MI2 = 1 / (1609.344 * 1609.344);

  it('square area: 2 km span → ≈4.00 km² ≈ 1.54 mi² (computed from geometry)', () => {
    const aoi = createAoiFromSpan(MANHATTAN, 2000, 'polygon');
    const area = analyzeAoiArea(aoi);
    expect(area.areaKm2).toBeGreaterThan(3.96);
    expect(area.areaKm2).toBeLessThan(4.04);
    expect(area.areaMi2).toBeCloseTo(4 * 1e6 * MI2, 1);
    expect(aoiAreaLabel(aoi)).toMatch(/^4\.0\d km² · 1\.5\d mi²$/);
  });

  it('square area: 400 m span → 0.16 km² (span ≠ area)', () => {
    const aoi = createAoiFromSpan(MANHATTAN, 400, 'polygon');
    const area = analyzeAoiArea(aoi);
    expect(area.areaKm2).toBeGreaterThan(0.157);
    expect(area.areaKm2).toBeLessThan(0.163);
    expect(aoiSpanLabel(400, 'polygon')).toBe('400m × 400m');
  });

  it('circle area: 2 km diameter → ≈π·(1km)² ≈ 3.14 km² (32-gon within 2%)', () => {
    const aoi = createAoiFromSpan(MANHATTAN, 2000, 'circle');
    const area = analyzeAoiArea(aoi);
    expect(area.areaKm2).toBeGreaterThan(3.14 * 0.98);
    expect(area.areaKm2).toBeLessThan(3.15);
    expect(aoiAreaLabel(aoi)).toMatch(/^3\.1\d km² · 1\.2\d mi²$/);
    expect(aoiSpanLabel(2000, 'circle')).toBe('2km diameter');
  });

  it('circle area: 400 m diameter → ≈0.126 km² (diameter ≠ area)', () => {
    const aoi = createAoiFromSpan(MANHATTAN, 400, 'circle');
    const area = analyzeAoiArea(aoi);
    expect(area.areaKm2).toBeGreaterThan(0.12);
    expect(area.areaKm2).toBeLessThan(0.13);
  });

  it('geographic movement: the canonical AOI re-derived at a new location preserves its metric area', () => {
    // The product derives the AOI from (center, span, shape) — moving the
    // operating location RE-DERIVES it, so the true metric area is preserved
    // across latitudes (the builder compensates degrees by cos(lat)).
    const ny = createAoiFromSpan(MANHATTAN, 2000, 'polygon');
    const sf = createAoiFromSpan({ latitude: 37.7749, longitude: -122.4194 }, 2000, 'polygon');
    const london = createAoiFromSpan({ latitude: 51.5074, longitude: -0.1278 }, 2000, 'polygon');
    const a = analyzeAoiArea(ny).areaKm2;
    expect(Math.abs(analyzeAoiArea(sf).areaKm2 - a) / a).toBeLessThan(0.001);
    expect(Math.abs(analyzeAoiArea(london).areaKm2 - a) / a).toBeLessThan(0.001);
  });

  it('moveAoiToCenter is a pure DEGREE translation (ring shape preserved exactly)', () => {
    const aoi = createAoiFromSpan(MANHATTAN, 2000, 'polygon');
    const moved = moveAoiToCenter(aoi, { latitude: 41.0, longitude: -73.0 });
    const ringBefore = (aoi.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    const ringAfter = (moved.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    expect(ringAfter).toHaveLength(ringBefore.length);
    for (let i = 0; i < ringBefore.length; i++) {
      const dLng = ringAfter[i][0] - ringBefore[i][0];
      const dLat = ringAfter[i][1] - ringBefore[i][1];
      // Every vertex shifts by the SAME (dLng, dLat) — a pure translation.
      expect(dLng).toBeCloseTo(ringAfter[0][0] - ringBefore[0][0], 12);
      expect(dLat).toBeCloseTo(ringAfter[0][1] - ringBefore[0][1], 12);
    }
  });

  it('high latitude behavior: a 2 km square at 65°N still measures ≈4 km²', () => {
    const aoi = createAoiFromSpan({ latitude: 65.0, longitude: -18.0 }, 2000, 'polygon');
    const area = analyzeAoiArea(aoi);
    // The builder compensates longitude degrees by cos(lat) so the true
    // metric area is preserved at high latitude (within the planar approx).
    expect(area.areaKm2).toBeGreaterThan(3.9);
    expect(area.areaKm2).toBeLessThan(4.1);
  });

  it('dateline-safe: a wrapped ring straddling ±180° measures ≈4 km² (no planetary wrap)', () => {
    // A 2 km square centered at lng 179.9998 expressed WITH WRAPPED east-side
    // coordinates (lng 180.0088 wrapped to -179.9912). The raw ring spans
    // ~360° of longitude — without antimeridian normalization the shoelace
    // area would explode; it must measure the true ~4 km².
    const dLat = 1000 / 111320;
    const dLng = 1000 / (111320 * Math.cos((0.5 * Math.PI) / 180));
    const west = 179.9998 - dLng;         // ≈179.9908
    const eastWrapped = 179.9998 + dLng - 360; // ≈-179.9912
    const wrapped: typeof FIXTURE_CAPTURE_REQUEST_AOI = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { shape: 'polygon' },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [west, 0.5 - dLat],
              [eastWrapped, 0.5 - dLat],
              [eastWrapped, 0.5 + dLat],
              [west, 0.5 + dLat],
              [west, 0.5 - dLat],
            ]],
          },
        },
      ],
    };
    const area = analyzeAoiArea(wrapped);
    expect(area.areaKm2).toBeGreaterThan(3.9);
    expect(area.areaKm2).toBeLessThan(4.1);
  });

  it('renders == submits: the area of the fixture capture request AOI computes from geometry alone (no size properties)', () => {
    // The DEMO capture request AOI has NO halfSideMetres/radiusMetres — its
    // area must still compute from the ring (≈2.4km × 2.4km ≈ 5.7 km²).
    const area = analyzeAoiArea(FIXTURE_CAPTURE_REQUEST_AOI);
    expect(area.sizeMetres).toBeNull();
    expect(area.areaKm2).toBeGreaterThan(5.0);
    expect(area.areaKm2).toBeLessThan(6.5);
    expect(area.areaMi2).toBeLessThan(10); // within the documented Basic limit
  });
});

describe('DEMO fixture containment (REAL captured provider response)', () => {
  it('maps the DEMO candidates into REAL captured thermal cells', () => {
    const snapshot = fixture.hourlySnapshots[0];
    const aoi = snapshot.aoi as Parameters<typeof findTileForPoint>[1];
    // All three DEMO candidates land inside genuine provider cells.
    for (const [lat, lng] of [[40.712, -74.008], [40.712, -73.998], [40.712, -73.988]]) {
      const inside = findTileForPoint({ latitude: lat, longitude: lng }, aoi);
      expect(inside.tileId).toBeTruthy();
      expect(Number.isFinite(inside.averageTemperatureCelsius)).toBe(true);
    }
  });

  it('has finite temperatures on every captured cell of every snapshot', () => {
    for (const snap of fixture.hourlySnapshots) {
      for (const feature of snap.aoi.features) {
        expect(Number.isFinite(feature.properties.average_temperature)).toBe(true);
      }
    }
  });

  it('contains exactly the 425 provider cells of the real capture — one hour only', () => {
    expect(fixture.hourlySnapshots).toHaveLength(1);
    expect(fixture.hourlySnapshots[0].timestamp).toBe('2026-08-14T12:00:00.000Z');
    expect(fixture.hourlySnapshots[0].aoi.features).toHaveLength(425);
  });
});
