import type { LocationPoint, PolygonAOI, TileFeature } from '@/types/domain';
import { OutsideCoverageError } from '@/types/errors';

/**
 * Ray-casting algorithm for point-in-polygon containment.
 * GeoJSON polygon coordinates are in [longitude, latitude] order.
 */
export function isPointInPolygonRing(point: LocationPoint, ring: number[][]): boolean {
  const x = point.longitude;
  const y = point.latitude;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Locate the exact FortyGuard GeoJSON tile feature containing the given location point.
 * Throws OutsideCoverageError if point is outside all tile polygons (zero silent fallbacks).
 */
export function findTileForPoint(point: LocationPoint, aoi: PolygonAOI): TileFeature {
  for (let idx = 0; idx < aoi.features.length; idx++) {
    const feature = aoi.features[idx];
    const outerRing = feature.geometry.coordinates[0];
    if (outerRing && isPointInPolygonRing(point, outerRing)) {
      const props = feature.properties;
      const tileId = props.tile_id ?? idx;
      const averageTemp = props.average_temperature ?? props.mean_temperature ?? 0;
      const minTemp = props.min_temperature ?? averageTemp;
      const maxTemp = props.max_temperature ?? averageTemp;

      return {
        tileId: String(tileId),
        averageTemperatureCelsius: Number(averageTemp),
        minTemperatureCelsius: Number(minTemp),
        maxTemperatureCelsius: Number(maxTemp),
        geometry: feature.geometry,
      };
    }
  }

  throw new OutsideCoverageError(
    `Point (${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}) lies outside all ${aoi.features.length} FortyGuard spatial tiles`
  );
}
