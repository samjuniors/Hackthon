import { describe, it, expect } from 'vitest';
import { findTileForPoint, isPointInPolygonRing } from '@/lib/spatial/mapper';
import type { PolygonAOI } from '@/types/domain';
import { OutsideCoverageError } from '@/types/errors';

describe('Spatial Point-to-Polygon Mapper', () => {
  const squareRing = [
    [-74.01, 40.70],
    [-74.00, 40.70],
    [-74.00, 40.71],
    [-74.01, 40.71],
    [-74.01, 40.70],
  ];

  const sampleAOI: PolygonAOI = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          tile_id: 'tile-001',
          average_temperature: 31.5,
          min_temperature: 29.0,
          max_temperature: 34.0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [squareRing],
        },
      },
    ],
  };

  it('correctly detects point containment in polygon ring', () => {
    const insidePoint = { latitude: 40.705, longitude: -74.005 };
    const outsidePoint = { latitude: 40.75, longitude: -74.005 };

    expect(isPointInPolygonRing(insidePoint, squareRing)).toBe(true);
    expect(isPointInPolygonRing(outsidePoint, squareRing)).toBe(false);
  });

  it('maps point to exact containing tile feature', () => {
    const point = { latitude: 40.705, longitude: -74.005 };
    const tile = findTileForPoint(point, sampleAOI);

    expect(tile.tileId).toBe('tile-001');
    expect(tile.averageTemperatureCelsius).toBe(31.5);
    expect(tile.minTemperatureCelsius).toBe(29.0);
    expect(tile.maxTemperatureCelsius).toBe(34.0);
  });

  it('throws OutsideCoverageError if point is outside tile coverage (no silent fallback)', () => {
    const outsidePoint = { latitude: 40.75, longitude: -74.005 };
    expect(() => findTileForPoint(outsidePoint, sampleAOI)).toThrow(OutsideCoverageError);
  });
});
