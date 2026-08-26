import { describe, it, expect } from 'vitest';
import {
  createBoundingAOI,
  analyzeAoiAreaMi2,
  isAoiWithinLimit,
  FORTYGUARD_AOI_LIMIT_MI2,
} from '@/lib/spatial/aoi';
import { findTileForPoint } from '@/lib/spatial/mapper';
import fixture from '../../tests/fixtures/heatmap_hourly_fixture.json';

describe('canonical analysis AOI', () => {
  it('uses the documented FortyGuard AOI limit constant', () => {
    expect(FORTYGUARD_AOI_LIMIT_MI2).toBe(150);
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

  it('keeps every preset AOI far below the documented limit (never silently shrunk)', () => {
    for (const halfSide of [200, 300, 400, 600, 800, 1000]) {
      const aoi = createBoundingAOI({ latitude: 40.712, longitude: -74.008 }, halfSide, 'polygon');
      expect(isAoiWithinLimit(aoi)).toBe(true);
      expect(analyzeAoiAreaMi2(aoi).areaMi2).toBeLessThan(5);
    }
    // An oversized AOI must be REJECTED, not shrunk
    const huge = createBoundingAOI({ latitude: 36.0, longitude: -118.0 }, 120000, 'polygon');
    expect(isAoiWithinLimit(huge)).toBe(false);
  });
});

describe('DEMO fixture containment', () => {
  it('maps fixture candidates into the captured thermal cells', () => {
    const snapshot = fixture.hourlySnapshots[0];
    const aoi = snapshot.aoi as Parameters<typeof findTileForPoint>[1];
    const inside = findTileForPoint({ latitude: 40.712, longitude: -74.008 }, aoi);
    expect(inside.tileId).toBeTruthy();
    expect(Number.isFinite(inside.averageTemperatureCelsius)).toBe(true);
  });

  it('has finite temperatures on every captured cell of every snapshot', () => {
    for (const snap of fixture.hourlySnapshots) {
      for (const feature of snap.aoi.features) {
        expect(Number.isFinite(feature.properties.average_temperature)).toBe(true);
      }
    }
  });
});
