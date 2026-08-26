/**
 * Canonical Analysis AOI — client-safe geometry builder.
 *
 * This module is the SINGLE SOURCE OF TRUTH for the analysis-area geometry.
 * It is imported by BOTH:
 *   - The client (src/app/page.tsx + src/components/ThermalMap.tsx) to RENDER the
 *     visible AOI polygon on the map.
 *   - The server (src/lib/fortyguard/adapter.ts) to BUILD the FortyGuard API
 *     request polygon_aoi.
 *
 * The visible AOI and the requested AOI MUST be the same geometry. There is no
 * "display AOI" vs "API AOI" split — one canonical PolygonAOI per analysis.
 *
 * Pure geometry only — no zod, no fetch, no process.env. Safe for client import.
 */
import type { LocationPoint, PolygonAOI } from '@/types/domain';

/** Analysis-area shape preference. 'polygon' = square bounding box; 'circle' = regular 32-gon approximation. */
export type AnalysisAreaShape = 'polygon' | 'circle';

/**
 * FortyGuard documented AOI limit (square miles).
 * Source: FortyGuard API documentation — single heatmap request must not exceed 150 mi².
 * Enforced client-side; never silently shrunk.
 */
export const FORTYGUARD_AOI_LIMIT_MI2 = 150;

/**
 * Earth-radius-derived metres-per-degree constants for planar approximation
 * at mid-latitudes. Accurate enough for AOI area estimation (we never use this
 * for surveying — only for provider-limit validation).
 */
const METRES_PER_DEG_LAT = 111320;

function metresPerDegLon(lat: number): number {
  return METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * Build the canonical Analysis AOI FeatureCollection around a center point.
 *
 * `halfSideMetres` is:
 *   - For 'polygon' shape: half the side length of the square AOI (so the
 *     full AOI is 2 × halfSideMetres on each side).
 *   - For 'circle' shape: the radius of the circle (a regular 32-gon
 *     approximating a true circle of that radius).
 *
 * The returned FeatureCollection has ONE feature whose geometry is a Polygon
 * (32 vertices for 'circle', 5 for 'polygon'). Properties record the shape and
 * size so downstream renderers (MapLibre) can label the AOI appropriately.
 */
export function createBoundingAOI(
  center: LocationPoint,
  halfSideMetres = 400,
  shape: AnalysisAreaShape = 'polygon',
): PolygonAOI {
  if (shape === 'circle') {
    const radius = halfSideMetres;
    const segments = 32;
    const ring: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * 2 * Math.PI;
      const dLat = (radius * Math.cos(angle)) / METRES_PER_DEG_LAT;
      const dLon = (radius * Math.sin(angle)) / metresPerDegLon(center.latitude);
      ring.push([center.longitude + dLon, center.latitude + dLat]);
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { shape: 'circle', radiusMetres: radius },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
      ],
    };
  }

  const dLat = halfSideMetres / METRES_PER_DEG_LAT;
  const dLon = halfSideMetres / metresPerDegLon(center.latitude);
  const ring = [
    [center.longitude - dLon, center.latitude - dLat],
    [center.longitude + dLon, center.latitude - dLat],
    [center.longitude + dLon, center.latitude + dLat],
    [center.longitude - dLon, center.latitude + dLat],
    [center.longitude - dLon, center.latitude - dLat],
  ];

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { shape: 'polygon', halfSideMetres },
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ],
  };
}

/**
 * Estimate the planar area of an AOI in square miles.
 * For 'polygon' shape: (2 × halfSide)². For 'circle' shape: π × radius².
 * Used for the FortyGuard 150 mi² AOI limit validation only.
 */
export function analyzeAoiAreaMi2(
  aoi: PolygonAOI,
): { areaMi2: number; shape: 'polygon' | 'circle'; sizeMetres: number } {
  const feat = aoi.features[0];
  const props = (feat?.properties ?? {}) as { shape?: string; halfSideMetres?: number; radiusMetres?: number };
  const shape = (props.shape === 'circle' ? 'circle' : 'polygon') as 'polygon' | 'circle';
  const sizeMetres = shape === 'circle'
    ? Number(props.radiusMetres ?? 400)
    : Number(props.halfSideMetres ?? 400);

  // 1 mi = 1609.344 m → 1 mi² = 2,589,988.11 m²
  const MI2_PER_M2 = 1 / (1609.344 * 1609.344);
  const areaM2 = shape === 'circle'
    ? Math.PI * sizeMetres * sizeMetres
    : (2 * sizeMetres) * (2 * sizeMetres);

  return { areaMi2: areaM2 * MI2_PER_M2, shape, sizeMetres };
}

/**
 * Return true if the AOI's planar area is within the FortyGuard 150 mi² limit.
 */
export function isAoiWithinLimit(aoi: PolygonAOI, limitMi2 = FORTYGUARD_AOI_LIMIT_MI2): boolean {
  return analyzeAoiAreaMi2(aoi).areaMi2 <= limitMi2;
}
