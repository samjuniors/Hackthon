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

  it('correctly handles polygon with interior holes', () => {
    const outer = [
      [-74.02, 40.70],
      [-74.00, 40.70],
      [-74.00, 40.72],
      [-74.02, 40.72],
      [-74.02, 40.70],
    ];
    const hole = [
      [-74.015, 40.705],
      [-74.005, 40.705],
      [-74.005, 40.715],
      [-74.015, 40.715],
      [-74.015, 40.705],
    ];

    const aoiWithHole: PolygonAOI = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { tile_id: 'tile-hole', average_temperature: 30.0 },
          geometry: {
            type: 'Polygon',
            coordinates: [outer, hole],
          },
        },
      ],
    };

    // Point in solid part
    expect(findTileForPoint({ latitude: 40.702, longitude: -74.01 }, aoiWithHole).tileId).toBe('tile-hole');
    // Point inside the hole should throw OutsideCoverageError
    expect(() => findTileForPoint({ latitude: 40.710, longitude: -74.010 }, aoiWithHole)).toThrow(OutsideCoverageError);
  });

  it('correctly maps points inside MultiPolygon features', () => {
    const multiAOI: PolygonAOI = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { tile_id: 'tile-multi', average_temperature: 33.0 },
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [[[-74.10, 40.70], [-74.08, 40.70], [-74.08, 40.72], [-74.10, 40.72], [-74.10, 40.70]]],
              [[[-74.05, 40.70], [-74.03, 40.70], [-74.03, 40.72], [-74.05, 40.72], [-74.05, 40.70]]],
            ] as unknown as number[][][],
          },
        },
      ],
    };

    const pointInIsland2 = { latitude: 40.71, longitude: -74.04 };
    expect(findTileForPoint(pointInIsland2, multiAOI).tileId).toBe('tile-multi');
  });
});
