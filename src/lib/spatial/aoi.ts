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
 * AOI SIZE SEMANTICS (user-facing):
 *   The user picks a SPAN — the visible size of the analysis area.
 *     - polygon: the square's SIDE length (400 → 400m × 400m)
 *     - circle: the DIAMETER (400 → 400m diameter circle)
 *   Internally this converts to half-side / radius. Implementation terms
 *   (halfSideMetres) are NEVER surfaced in the UI.
 */
export type AoiSizeMetres = 250 | 400 | 1000 | 2000 | 5000;

/** User-selectable AOI span presets (side length / diameter in metres). */
export const AOI_SPAN_PRESETS = [250, 400, 1000, 2000, 5000] as const;

/** Convert a user-facing span to the polygon half-side (square: side / 2). */
export function spanToHalfSide(spanMetres: number): number {
  return spanMetres / 2;
}

/** Convert a user-facing span to the circle radius (diameter / 2). */
export function spanToRadius(spanMetres: number): number {
  return spanMetres / 2;
}

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
 * Build the canonical Analysis AOI from a USER-FACING SPAN (Section 3).
 *
 * `spanMetres` is:
 *   - For 'polygon' shape: the square's SIDE length (400 → 400m × 400m area).
 *   - For 'circle' shape: the circle's DIAMETER (400 → 400m diameter circle).
 *
 * Converts internally to half-side / radius — implementation terminology is
 * never exposed to the user.
 */
export function createAoiFromSpan(
  center: LocationPoint,
  spanMetres: number,
  shape: AnalysisAreaShape = 'polygon',
): PolygonAOI {
  return createBoundingAOI(center, shape === 'circle' ? spanToRadius(spanMetres) : spanToHalfSide(spanMetres), shape);
}

/**
 * Compute the geometric center of a canonical AOI (bbox center of its ring —
 * exact for squares and 32-gon circle approximations).
 */
export function getAoiCenter(aoi: PolygonAOI): LocationPoint | null {
  const feat = aoi.features[0];
  const geom = feat?.geometry as { type: string; coordinates: number[][][] } | undefined;
  if (!geom || !Array.isArray(geom.coordinates?.[0])) return null;
  const ring = geom.coordinates[0];
  if (ring.length < 3) return null;

  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2 };
}

/**
 * Move (translate) a canonical AOI to a new center WITHOUT distorting the
 * shape (Section 4): every ring coordinate is shifted by the same
 * (dLng, dLat) delta — a pure translation. Square stays square; circle stays
 * circular; size is preserved to the coordinate digit.
 *
 * The returned geometry IS the canonical geometry — what you see on the map is
 * exactly what gets sent to FortyGuard.
 */
export function moveAoiToCenter(
  aoi: PolygonAOI,
  newCenter: LocationPoint,
): PolygonAOI {
  const current = getAoiCenter(aoi);
  if (!current) return aoi;

  const dLng = newCenter.longitude - current.longitude;
  const dLat = newCenter.latitude - current.latitude;

  return {
    type: 'FeatureCollection',
    features: aoi.features.map((f) => {
      const geom = f.geometry as { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] };
      return {
        ...f,
        properties: { ...f.properties, center: { latitude: newCenter.latitude, longitude: newCenter.longitude } },
        geometry: {
          ...geom,
          coordinates: geom.coordinates.map((ring) =>
            ring.map(([lng, lat]) => [lng + dLng, lat + dLat])
          ),
        },
      };
    }),
  };
}

/**
 * Point-in-AOI containment test (ray casting). Used to validate that a
 * candidate site lies inside the analysis area BEFORE evaluation (Section 9).
 * Never silently moves or clamps — callers surface the violation.
 */
export function isPointInAoi(
  point: LocationPoint,
  aoi: PolygonAOI | null | undefined,
): boolean {
  if (!aoi || !aoi.features || aoi.features.length === 0) return false;
  const feat = aoi.features[0];
  const geom = feat?.geometry as { type: string; coordinates: number[][][] } | undefined;
  if (!geom || !Array.isArray(geom.coordinates?.[0])) return false;
  const ring = geom.coordinates[0];

  const x = point.longitude;
  const y = point.latitude;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
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
 * User-facing span label for the AOI (Section 3).
 *   polygon 400 → "400m × 400m" / 1000 → "1km × 1km"
 *   circle  400 → "400m diameter" / 1000 → "1km diameter"
 */
export function aoiSpanLabel(spanMetres: number, shape: AnalysisAreaShape): string {
  const size = spanMetres >= 1000 ? `${spanMetres / 1000}km` : `${spanMetres}m`;
  return shape === 'circle' ? `${size} diameter` : `${size} × ${size}`;
}

/**
 * Return true if the AOI's planar area is within the FortyGuard 150 mi² limit.
 */
export function isAoiWithinLimit(aoi: PolygonAOI, limitMi2 = FORTYGUARD_AOI_LIMIT_MI2): boolean {
  return analyzeAoiAreaMi2(aoi).areaMi2 <= limitMi2;
}

/**
 * Return true if the geographic BOUNDING BOXES of two AOIs intersect.
 *
 * Used for coverage-style checks where the reference AOI (e.g. the captured
 * DEMO field extent) is itself a bounding box, so bbox-vs-bbox is exact with
 * respect to the displayed boundary.
 */
export function aoiBboxesIntersect(a: PolygonAOI, b: PolygonAOI): boolean {
  const boxOf = (aoi: PolygonAOI) => {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    let found = false;
    for (const f of aoi.features) {
      const geom = f.geometry as { type: string; coordinates: number[][][] } | undefined;
      if (!geom?.coordinates) continue;
      for (const ring of geom.coordinates) {
        for (const [lng, lat] of ring) {
          found = true;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
    }
    return found ? { minLng, maxLng, minLat, maxLat } : null;
  };
  const boxA = boxOf(a);
  const boxB = boxOf(b);
  if (!boxA || !boxB) return false;
  return (
    boxA.maxLng >= boxB.minLng &&
    boxA.minLng <= boxB.maxLng &&
    boxA.maxLat >= boxB.minLat &&
    boxA.minLat <= boxB.maxLat
  );
}
