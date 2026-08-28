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
 * Enforced FortyGuard AOI area limit (mi²).
 *
 * DOCUMENTED PROVIDER LIMIT (official docs, verified 2026-08-28): heatmap
 * max area is 10 mi² on Basic/Startup plans and 50 mi² on Premium.
 * EMPIRICAL ACCOUNT FACT: the Hackathon plan's key-usage endpoint exposes no
 * area limit — the plan's own limit is UNKNOWN, so the CONSERVATIVE documented
 * ceiling (10 mi², the smallest documented plan limit) is enforced and labelled
 * "conservative" (never a "Basic" account claim). The former 150 mi² value was
 * a stale assumption and is permanently retired (tests/plan-limits guard it).
 *
 * See src/lib/fortyguard/plan-limits.ts for the full documented contract and
 * resolveApplicableAoiLimit() for plan-aware resolution.
 */
export const FORTYGUARD_AOI_LIMIT_MI2 = 10;

export {
  FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2,
  resolveApplicableAoiLimit,
  formatAoiLimitLabel,
  FORTYGUARD_DOCUMENTED_DATE_RANGE_START,
  FORTYGUARD_FORECAST_HORIZON_HOURS,
  FORTYGUARD_FILTER2_MAX_RANGE_HOURS,
  FORTYGUARD_DOCUMENTED_COVERAGE,
  isWithinDocumentedCoverage,
} from '@/lib/fortyguard/plan-limits';

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
 * THE authoritative AOI area calculation — computed from the ACTUAL canonical
 * geometry (ring coordinates), never from hardcoded text or preset math.
 *
 * Planar shoelace area with local metre-per-degree scaling at the ring's
 * centre latitude, plus antimeridian (dateline) normalization so a ring that
 * crosses ±180° measures its true area instead of wrapping around the planet.
 *
 * Returns the area in m², km² and mi² (1 mi = 1609.344 m) plus the canonical
 * shape/size properties when present. This function is used for provider
 * limit pre-flight, UI display, and history records — ONE source of truth.
 */
export function analyzeAoiArea(aoi: PolygonAOI): {
  areaM2: number;
  areaKm2: number;
  areaMi2: number;
  shape: 'polygon' | 'circle' | 'unknown';
  sizeMetres: number | null;
} {
  const MI2_PER_M2 = 1 / (1609.344 * 1609.344);

  // Collect every outer ring of every feature (canonical AOIs have one
  // feature; the union is summed so multi-feature AOIs stay honest).
  const rings: number[][][] = [];
  for (const f of aoi?.features ?? []) {
    const geom = f?.geometry as { type: string; coordinates: number[][][] } | undefined;
    if (geom?.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
      rings.push(geom.coordinates[0]);
    }
  }

  if (rings.length === 0) {
    return { areaM2: 0, areaKm2: 0, areaMi2: 0, shape: 'unknown', sizeMetres: null };
  }

  // Dateline normalization: when a ring spans more than 180° of raw
  // longitude it must cross the antimeridian — shift negative lngs by +360
  // so the shoelace sum measures the real (small) area.
  const normalized = rings.map((ring) => {
    let minLng = Infinity, maxLng = -Infinity;
    for (const [lng] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    const crossesDateline = maxLng - minLng > 180;
    return crossesDateline
      ? (ring.map(([lng, lat]) => [lng < 0 ? lng + 360 : lng, lat] as [number, number]) as number[][])
      : ring;
  });

  // Centre latitude of the whole AOI (for local metre-per-degree scaling).
  let minLat = Infinity, maxLat = -Infinity, latSum = 0, latCount = 0;
  for (const ring of normalized) {
    for (const [, lat] of ring) {
      latSum += lat;
      latCount++;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  const centreLat = latCount > 0 ? latSum / latCount : (minLat + maxLat) / 2;
  const metresPerLon = METRES_PER_DEG_LAT * Math.cos((centreLat * Math.PI) / 180);

  // Shoelace in local metres (x scaled by metresPerLon, y by METRES_PER_DEG_LAT).
  let areaM2 = 0;
  for (const ring of normalized) {
    if (ring.length < 3) continue;
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[i + 1];
      sum += (x1 * metresPerLon) * y2 - (x2 * metresPerLon) * y1;
    }
    // Close the ring if the input is not explicitly closed.
    const [xLast, yLast] = ring[ring.length - 1];
    const [xFirst, yFirst] = ring[0];
    if (xLast !== xFirst || yLast !== yFirst) {
      sum += (xLast * metresPerLon) * yFirst - (xFirst * metresPerLon) * yLast;
    }
    areaM2 += (Math.abs(sum) / 2) * METRES_PER_DEG_LAT;
  }

  // Canonical shape/size from properties (display metadata only — the AREA
  // above always comes from the geometry itself).
  const props = (aoi?.features?.[0]?.properties ?? {}) as {
    shape?: string;
    halfSideMetres?: number;
    radiusMetres?: number;
  };
  const shape = props.shape === 'circle' ? 'circle' : props.shape === 'polygon' ? 'polygon' : 'unknown';
  const sizeMetres = shape === 'circle'
    ? (props.radiusMetres != null ? Number(props.radiusMetres) : null)
    : (props.halfSideMetres != null ? Number(props.halfSideMetres) : null);

  return {
    areaM2,
    areaKm2: areaM2 / 1e6,
    areaMi2: areaM2 * MI2_PER_M2,
    shape,
    sizeMetres,
  };
}

/**
 * Backwards-compatible area accessor (geometry-based since the plan-limit
 * hardening pass — see analyzeAoiArea). `sizeMetres` is the canonical span
 * metadata when present (half-side for squares, radius for circles) and null
 * for geometries without size properties (e.g. the DEMO capture request AOI).
 */
export function analyzeAoiAreaMi2(
  aoi: PolygonAOI,
): { areaMi2: number; areaKm2: number; areaM2: number; shape: 'polygon' | 'circle' | 'unknown'; sizeMetres: number | null } {
  return analyzeAoiArea(aoi);
}

/**
 * User-facing span label for the AOI.
 *   polygon 400 → "400m × 400m" / 1000 → "1km × 1km"
 *   circle  400 → "400m diameter" / 1000 → "1km diameter"
 */
export function aoiSpanLabel(spanMetres: number, shape: AnalysisAreaShape): string {
  const size = spanMetres >= 1000 ? `${spanMetres / 1000}km` : `${spanMetres}m`;
  return shape === 'circle' ? `${size} diameter` : `${size} × ${size}`;
}

/**
 * User-facing AREA label computed from the canonical GEOMETRY — e.g.
 * "4.00 km² · 1.54 mi²". One decimal-space format for both units; always
 * derived via analyzeAoiArea (never from preset text).
 */
export function aoiAreaLabel(aoi: PolygonAOI): string {
  const { areaKm2, areaMi2 } = analyzeAoiArea(aoi);
  return `${areaKm2.toFixed(2)} km² · ${areaMi2.toFixed(2)} mi²`;
}

/**
 * Return true if the AOI's geometry-derived area is within the enforced
 * FortyGuard limit (documented Basic 10 mi² by default — never 150; see
 * plan-limits.ts for plan-aware resolution).
 */
export function isAoiWithinLimit(aoi: PolygonAOI, limitMi2 = FORTYGUARD_AOI_LIMIT_MI2): boolean {
  return analyzeAoiArea(aoi).areaMi2 <= limitMi2;
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
