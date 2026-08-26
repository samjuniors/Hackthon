import { describe, it, expect } from 'vitest';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { BaselineSpatialThermalEvaluator } from '@/lib/decision-engine/evaluator';
import { findTileForPoint } from '@/lib/spatial/mapper';
import type { LocationPoint, NormalizedThermalObservation, CandidateWindow, PolygonAOI } from '@/types/domain';
import capturedDemoData from './fixtures/heatmap_captured_demo.json';

/**
 * Milestone 5 — Empirical Evidence Lock Test Suite (REAL capture edition).
 *
 * The DEMO fixture is a VERBATIM extraction of a genuine FortyGuard
 * /v1/heatmap response (tests/fixtures/heatmap_probe_candidate_aoi.json —
 * 425 provider cells, 100m granularity, hour 2026-08-14T12:00Z). These tests
 * lock the fact that the DEMO pipeline resolves the three DEMO CANDIDATES
 * into REAL provider cells with REAL provider temperatures — never fabricated
 * values, never additional hours.
 */

const CAPTURED_HOUR = '2026-08-14T12:00:00.000Z';

const demoCandidates: Array<{
  locationId: string;
  name: string;
  coords: LocationPoint;
  expectedTileId: string;
}> = [
  {
    locationId: 'LOC-A',
    name: 'Battery Park Greenway',
    coords: { latitude: 40.7120, longitude: -74.0080 },
    expectedTileId: '162',
  },
  {
    locationId: 'LOC-B',
    name: 'City Hall Civic Center',
    coords: { latitude: 40.7120, longitude: -73.9980 },
    expectedTileId: '171',
  },
  {
    locationId: 'LOC-C',
    name: 'Chinatown / Bowery Staging',
    coords: { latitude: 40.7120, longitude: -73.9880 },
    expectedTileId: '179',
  },
];

const capturedAoi = capturedDemoData.hourlySnapshots[0].aoi as unknown as PolygonAOI;

describe('Milestone 5 — Empirical Evidence Lock Test Suite (real captured provider data)', () => {
  it('1. Verifies exact coordinate containment to 3 distinct REAL provider tile IDs (no boundary ambiguity)', () => {
    const resolvedTiles = demoCandidates.map((loc) => {
      const tile = findTileForPoint(loc.coords, capturedAoi);
      return {
        locationId: loc.locationId,
        tileId: tile.tileId,
        coords: loc.coords,
      };
    });

    // Verify 3 distinct REAL provider tile ids (integers from the capture)
    const tileIds = new Set(resolvedTiles.map((t) => t.tileId));
    expect(tileIds.size).toBe(3);

    expect(resolvedTiles[0].tileId).toBe('162');
    expect(resolvedTiles[1].tileId).toBe('171');
    expect(resolvedTiles[2].tileId).toBe('179');
  });

  it('2. Exactly reproduces the captured provider temperatures at the captured hour', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const snapshots = await adapter.getHourlyHeatmapSnapshots(
      demoCandidates[0].coords,
      [CAPTURED_HOUR]
    );
    const aoi = snapshots.get(CAPTURED_HOUR)!;

    const evaluator = new BaselineSpatialThermalEvaluator();
    const window: CandidateWindow = {
      windowId: 'w-test',
      startTime: CAPTURED_HOUR,
      endTime: '2026-08-14T13:00:00.000Z',
      durationHours: 1,
    };

    const locationScores = demoCandidates.map((loc) => {
      const obs: NormalizedThermalObservation = adapter.normalizePointObservation(
        aoi,
        loc.coords,
        CAPTURED_HOUR,
        '/v1/heatmap',
        'DERIVED'
      );
      const result = evaluator.evaluate([obs], window);
      return {
        locationId: loc.locationId,
        tileId: obs.selectedTileId,
        temperature: obs.metrics.temperatureCelsius,
        exposureScore: result.score,
      };
    });

    // The single-hour exposure score IS the captured provider temperature
    // (mean over one observation of genuine provider values, rounded to 2dp
    // by the deterministic engine).
    for (const s of locationScores) {
      expect(s.exposureScore).toBeCloseTo(s.temperature, 1);
    }

    // Real captured provider temperatures (verbatim from the capture):
    // tile 162 → 31.6584, tile 171 → 32.1247, tile 179 → 32.1156
    expect(locationScores[0].temperature).toBeCloseTo(31.6584, 4);
    expect(locationScores[1].temperature).toBeCloseTo(32.1247, 4);
    expect(locationScores[2].temperature).toBeCloseTo(32.1156, 4);
  });

  it('3. Verifies the fixture contains ONLY the single captured hour — no fabricated hourly series', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });

    // The captured hour resolves.
    const snapshots = await adapter.getHourlyHeatmapSnapshots(
      demoCandidates[0].coords,
      [CAPTURED_HOUR]
    );
    expect(snapshots.size).toBe(1);
    expect((snapshots.get(CAPTURED_HOUR) as PolygonAOI).features.length).toBe(425);

    // Any OTHER hour is honestly rejected — the capture has no data for it
    // and the adapter never fabricates one.
    await expect(
      adapter.getHourlyHeatmapSnapshots(demoCandidates[0].coords, ['2026-08-14T13:00:00.000Z'])
    ).rejects.toThrow(/no capture exists|never fabricates/i);
    await expect(
      adapter.getHourlyHeatmapSnapshots(demoCandidates[0].coords, ['2026-08-21T08:00:00.000Z'])
    ).rejects.toThrow(/no capture exists|never fabricates/i);
  });

  it('4. Verifies every observation derives from a REAL captured cell (tile id + geometry exist in the capture)', () => {
    const capturedIds = new Set(
      capturedAoi.features.map((f) => String(f.properties?.tile_id))
    );

    for (const cand of demoCandidates) {
      const tile = findTileForPoint(cand.coords, capturedAoi);
      expect(capturedIds.has(tile.tileId as string)).toBe(true);
      // The resolved tile geometry IS a verbatim provider polygon.
      const providerFeature = capturedAoi.features.find(
        (f) => String(f.properties?.tile_id) === tile.tileId
      );
      expect(providerFeature?.geometry).toEqual(tile.geometry);
    }
  });
});
