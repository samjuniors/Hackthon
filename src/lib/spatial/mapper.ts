import type { LocationPoint, PolygonAOI, TileFeature } from '@/types/domain';
import { EmptyThermalFieldError, MissingThermalValueError, OutsideCoverageError } from '@/types/errors';

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
 * Check if point is inside a polygon with optional interior holes.
 */
export function isPointInPolygon(point: LocationPoint, rings: number[][][]): boolean {
  if (!rings || rings.length === 0 || !rings[0] || rings[0].length < 3) {
    return false;
  }

  // Must be inside the exterior ring
  const insideOuter = isPointInPolygonRing(point, rings[0]);
  if (!insideOuter) return false;

  // Must NOT be inside any interior holes
  for (let i = 1; i < rings.length; i++) {
    if (rings[i] && rings[i].length >= 3 && isPointInPolygonRing(point, rings[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Locate the exact FortyGuard GeoJSON tile feature containing the given location point.
 * Throws OutsideCoverageError if point is outside all tile polygons (zero silent fallbacks).
 */
export function findTileForPoint(point: LocationPoint, aoi: PolygonAOI): TileFeature {
  for (let idx = 0; idx < aoi.features.length; idx++) {
    const feature = aoi.features[idx];
    const geom = feature.geometry;
    let isInside = false;

    if (geom.type === 'Polygon') {
      isInside = isPointInPolygon(point, geom.coordinates as number[][][]);
    } else if (geom.type === 'MultiPolygon') {
      const multiCoords = geom.coordinates as unknown as number[][][][];
      for (const polyRings of multiCoords) {
        if (isPointInPolygon(point, polyRings)) {
          isInside = true;
          break;
        }
      }
    }

    if (isInside) {
      const props = feature.properties;
      const tileId = props.tile_id ?? idx;

      // A missing temperature is a hard failure, never a default.
      // `?? 0` here would make an absent reading the coldest possible value, and the
      // decision engine minimises temperature — so missing data would win every ranking.
      const rawAverage = props.average_temperature;
      if (rawAverage === undefined || rawAverage === null || !Number.isFinite(Number(rawAverage))) {
        throw new MissingThermalValueError(
          `Tile ${String(tileId)} containing point (${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}) ` +
            `has no finite 'average_temperature' (received: ${JSON.stringify(rawAverage)})`
        );
      }

      const averageTemp = Number(rawAverage);
      // FortyGuard returns min == average == max per tile on every captured response.
      // Where a bound is absent, the average is the only value the API asserts for the
      // tile, so it is reported as the bound rather than inventing a spread.
      const minTemp = Number.isFinite(Number(props.min_temperature)) ? Number(props.min_temperature) : averageTemp;
      const maxTemp = Number.isFinite(Number(props.max_temperature)) ? Number(props.max_temperature) : averageTemp;

      return {
        tileId: String(tileId),
        averageTemperatureCelsius: averageTemp,
        minTemperatureCelsius: minTemp,
        maxTemperatureCelsius: maxTemp,
        geometry: feature.geometry,
      };
    }
  }

  if (aoi.features.length === 0) {
    throw new EmptyThermalFieldError(
      `Cannot map point (${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}): ` +
        `the thermal field contains zero tiles`
    );
  }

  throw new OutsideCoverageError(
    `Point (${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}) lies outside all ${aoi.features.length} FortyGuard spatial tiles`
  );
}
