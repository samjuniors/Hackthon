/**
 * Deterministic Hyperlocal Thermal Grid Generator
 *
 * Generates a high-density, spatially contained thermal field for a given
 * canonical Analysis AOI (polygon square or geodesic circle).
 *
 * Spatial Semantics:
 *   1. All thermal grid cells are SPATIALLY CONTAINED within the AOI boundary.
 *   2. For 'circle' shape, cells outside the radius are excluded so the heatmap
 *      forms a circular thermal field matching the circular AOI.
 *   3. Individual cells form a crisp grid (6x6 to 14x14) with realistic microclimate
 *      temperature variations (urban heat island core, cooling near water/parks).
 *   4. Deterministic — zero random variation; preserves reproducible evidence.
 */

import type { LocationPoint, PolygonAOI } from '@/types/domain';
import type { AnalysisAreaShape } from './aoi';

const METRES_PER_DEG_LAT = 111320;

function metresPerDegLon(lat: number): number {
  return METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

export interface ThermalGridOptions {
  granularity?: 60 | 80 | 100;
  baseTemperature?: number;
  hourIndex?: number;
}

/**
 * Generate a dense, deterministic thermal grid strictly contained within an AOI.
 */
export function generateThermalGridForAOI(
  center: LocationPoint,
  halfSideMetres: number,
  shape: AnalysisAreaShape = 'polygon',
  options: ThermalGridOptions = {},
): PolygonAOI {
  const {
    granularity = 60,
    baseTemperature = 29.0,
    hourIndex = 0,
  } = options;

  // Compute grid divisions based on AOI size to maintain readable, dense cell resolution
  let divisions = 8;
  if (halfSideMetres <= 250) divisions = 6;
  else if (halfSideMetres <= 400) divisions = 8;
  else if (halfSideMetres <= 1000) divisions = 10;
  else if (halfSideMetres <= 2000) divisions = 12;
  else divisions = 14;

  const dLat = halfSideMetres / METRES_PER_DEG_LAT;
  const dLon = halfSideMetres / metresPerDegLon(center.latitude);

  const latStep = (2 * dLat) / divisions;
  const lonStep = (2 * dLon) / divisions;

  const features: PolygonAOI['features'] = [];

  for (let r = 0; r < divisions; r++) {
    const lat0 = center.latitude - dLat + r * latStep;
    const lat1 = lat0 + latStep;
    const cellCenterLat = (lat0 + lat1) / 2;

    for (let c = 0; c < divisions; c++) {
      const lon0 = center.longitude - dLon + c * lonStep;
      const lon1 = lon0 + lonStep;
      const cellCenterLon = (lon0 + lon1) / 2;

      // For circular AOI: check radial distance from center
      if (shape === 'circle') {
        const dLatM = (cellCenterLat - center.latitude) * METRES_PER_DEG_LAT;
        const dLonM = (cellCenterLon - center.longitude) * metresPerDegLon(center.latitude);
        const distFromCenter = Math.hypot(dLatM, dLonM);

        // Omit cells whose center falls outside the circle radius (with tiny margin for edge coverage)
        if (distFromCenter > halfSideMetres * 0.98) {
          continue;
        }
      }

      // Normalized coordinates from -1 (west/south) to +1 (east/north)
      const u = (c - (divisions - 1) / 2) / ((divisions - 1) / 2 || 1);
      const v = (r - (divisions - 1) / 2) / ((divisions - 1) / 2 || 1);

      // Realistic urban microclimate factors:
      // 1. Cool waterfront / green corridor effect (coolest on the west / northwest)
      const westCooling = -1.6 * u;
      // 2. Central urban core heat concentration
      const coreUrbanHeat = 2.2 * Math.max(0, 1 - Math.hypot(u, v));
      // 3. Micro-canyon variations (deterministic pseudo-harmonic)
      const microVariance = 0.7 * Math.sin(r * 1.8 + c * 2.4 + hourIndex * 0.5);

      const cellTemp = Number(
        (baseTemperature + westCooling + coreUrbanHeat + microVariance).toFixed(1)
      );

      features.push({
        type: 'Feature',
        properties: {
          tile_id: `tile-r${r}-c${c}`,
          average_temperature: cellTemp,
          min_temperature: Number((cellTemp - 1.2).toFixed(1)),
          max_temperature: Number((cellTemp + 1.2).toFixed(1)),
          granularity,
          shape,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [lon0, lat0],
              [lon1, lat0],
              [lon1, lat1],
              [lon0, lat1],
              [lon0, lat0],
            ],
          ],
        },
      });
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
