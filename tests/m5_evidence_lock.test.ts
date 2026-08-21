import { describe, it, expect } from 'vitest';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { BaselineSpatialThermalEvaluator } from '@/lib/decision-engine/evaluator';
import { findTileForPoint } from '@/lib/spatial/mapper';
import type { LocationPoint, NormalizedThermalObservation, CandidateWindow, PolygonAOI } from '@/types/domain';
import hourlyFixtureData from './fixtures/heatmap_hourly_fixture.json';

describe('Milestone 5 — Empirical Evidence Lock Test Suite', () => {
  const candidateLocations: Array<{
    locationId: string;
    name: string;
    coords: LocationPoint;
    expectedTileId: string;
  }> = [
    {
      locationId: 'LOC-A',
      name: 'Battery Park Greenway',
      coords: { latitude: 40.7120, longitude: -74.0080 },
      expectedTileId: 'tile-11',
    },
    {
      locationId: 'LOC-B',
      name: 'City Hall Civic Center',
      coords: { latitude: 40.7120, longitude: -73.9980 },
      expectedTileId: 'tile-12',
    },
    {
      locationId: 'LOC-C',
      name: 'Chinatown / Bowery Staging',
      coords: { latitude: 40.7120, longitude: -73.9880 },
      expectedTileId: 'tile-13',
    },
  ];

  it('1. Verifies exact coordinate containment to 3 distinct tile IDs (no boundary ambiguity)', () => {
    const firstAoi = hourlyFixtureData.hourlySnapshots[0].aoi as unknown as PolygonAOI;

    const resolvedTiles = candidateLocations.map((loc) => {
      const tile = findTileForPoint(loc.coords, firstAoi);
      return {
        locationId: loc.locationId,
        tileId: tile.tileId,
        coords: loc.coords,
      };
    });

    // Verify 3 distinct tile IDs
    const tileIds = new Set(resolvedTiles.map((t) => t.tileId));
    expect(tileIds.size).toBe(3);

    expect(resolvedTiles[0].tileId).toBe('tile-11');
    expect(resolvedTiles[1].tileId).toBe('tile-12');
    expect(resolvedTiles[2].tileId).toBe('tile-13');
  });

  it('2. Exactly reproduces reported 08:00–10:00 UTC Modeled Thermal Exposure scores and deltas', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const snapshots = await adapter.getHourlyHeatmapSnapshots(
      candidateLocations[0].coords,
      ['2026-08-21T08:00:00.000Z', '2026-08-21T09:00:00.000Z']
    );

    const evaluator = new BaselineSpatialThermalEvaluator();
    const window: CandidateWindow = {
      windowId: 'w-test',
      startTime: '2026-08-21T08:00:00.000Z',
      endTime: '2026-08-21T10:00:00.000Z',
      durationHours: 2,
    };

    const locationScores = candidateLocations.map((loc) => {
      const obsList: NormalizedThermalObservation[] = ['2026-08-21T08:00:00.000Z', '2026-08-21T09:00:00.000Z'].map((ts) => {
        const aoi = snapshots.get(ts);
        if (!aoi) throw new Error(`Missing snapshot at ${ts}`);
        return adapter.normalizePointObservation(aoi, loc.coords, ts, '/v1/heatmap', 'DERIVED');
      });

      const result = evaluator.evaluate(obsList, window);
      return {
        locationId: loc.locationId,
        name: loc.name,
        tileId: obsList[0].selectedTileId,
        exposureScore: result.score,
      };
    });

    // Exact verification of reported scores
    expect(locationScores[0].locationId).toBe('LOC-A');
    expect(locationScores[0].exposureScore).toBe(29.15); // (28.5 + 29.8) / 2

    expect(locationScores[1].locationId).toBe('LOC-B');
    expect(locationScores[1].exposureScore).toBe(29.75); // (29.1 + 30.4) / 2

    expect(locationScores[2].locationId).toBe('LOC-C');
    expect(locationScores[2].exposureScore).toBe(31.35); // (30.6 + 32.1) / 2

    // Verify deltas
    const bestScore = locationScores[0].exposureScore;
    const deltaB = Number((locationScores[1].exposureScore - bestScore).toFixed(2));
    const deltaC = Number((locationScores[2].exposureScore - bestScore).toFixed(2));

    expect(deltaB).toBe(0.60);
    expect(deltaC).toBe(2.20);
  });

  it('3. Verifies full hourly temperature sequence across 08:00–14:00 UTC without data gaps', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    const timestamps = [
      '2026-08-21T08:00:00.000Z',
      '2026-08-21T09:00:00.000Z',
      '2026-08-21T10:00:00.000Z',
      '2026-08-21T11:00:00.000Z',
      '2026-08-21T12:00:00.000Z',
      '2026-08-21T13:00:00.000Z',
    ];

    const snapshots = await adapter.getHourlyHeatmapSnapshots(candidateLocations[0].coords, timestamps);
    expect(snapshots.size).toBe(6);

    for (const ts of timestamps) {
      const aoi = snapshots.get(ts);
      if (!aoi) throw new Error(`Missing snapshot at ${ts}`);
      const obsA = adapter.normalizePointObservation(aoi, candidateLocations[0].coords, ts);
      const obsB = adapter.normalizePointObservation(aoi, candidateLocations[1].coords, ts);
      const obsC = adapter.normalizePointObservation(aoi, candidateLocations[2].coords, ts);

      // Verify spatial ordering: LOC-A < LOC-B < LOC-C throughout
      expect(obsA.metrics.temperatureCelsius).toBeLessThan(obsB.metrics.temperatureCelsius);
      expect(obsB.metrics.temperatureCelsius).toBeLessThan(obsC.metrics.temperatureCelsius);
    }
  });
});

