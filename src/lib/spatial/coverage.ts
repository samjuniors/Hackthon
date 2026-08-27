/**
 * AOI ↔ thermal-field coverage diagnostics (DEVELOPMENT INSTRUMENTATION ONLY).
 *
 * This module NEVER modifies provider geometry — it only MEASURES the spatial
 * relationship between the canonical analysis AOI and the genuine provider
 * thermal cells so developers can distinguish:
 *
 *   CASE A  cells cover the AOI but rendering looks offset/gapped (map bug)
 *   CASE B  cells genuinely do not cover part of the AOI (honest provider gap)
 *   CASE D  cells extend beyond the requested AOI (keep verbatim, no clipping)
 *
 * All areas are planar approximations (local equirectangular scale factors at
 * the field's centre latitude) — accurate enough for diagnostics, never used
 * for analysis or display.
 */
import type { PolygonAOI } from '@/types/domain';

export interface CoverageBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export interface AoiThermalCoverage {
  /** Bounding box of the analysis AOI ring(s). */
  aoiBounds: CoverageBounds | null;
  /** Bounding box of all provider cells. */
  thermalBounds: CoverageBounds | null;
  /** Planar area of the AOI polygon(s), km². */
  aoiAreaKm2: number;
  /** Planar union area of all provider cells, km². */
  thermalUnionKm2: number;
  /** Sampled intersection area (AOI ∩ cells), km². */
  intersectionKm2: number;
  /** AOI area not covered by any provider cell, km². */
  uncoveredAoiKm2: number;
  /** intersectionKm2 / aoiAreaKm2 (0..1). */
  coverageRatio: number;
  /** Total provider cells in the field. */
  cells: number;
  /** Cells whose bbox intersects the AOI bbox. */
  cellsIntersectingAoi: number;
  /** Cells fully inside the AOI polygon (all corners inside). */
  cellsFullyInsideAoi: number;
  /** Intersecting cells neither fully inside nor fully outside (cross the boundary). */
  cellsCrossingBoundary: number;
  /** Cells entirely outside the AOI (provider overshoot — CASE D). */
  cellsOutsideAoi: number;
}

type Ring = number[][];

/** Extract the outer rings of every feature in a FeatureCollection. */
function outerRings(aoi: PolygonAOI): Ring[] {
  const rings: Ring[] = [];
  for (const f of aoi.features ?? []) {
    const geom = f?.geometry as { type: string; coordinates: number[][][] } | undefined;
    if (geom?.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) {
      rings.push(geom.coordinates[0]);
    }
  }
  return rings;
}

function ringBounds(ring: Ring): CoverageBounds {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
}

function boundsOf(rings: Ring[]): CoverageBounds | null {
  if (rings.length === 0) return null;
  const bs = rings.map(ringBounds);
  return {
    minLng: Math.min(...bs.map((b) => b.minLng)),
    maxLng: Math.max(...bs.map((b) => b.maxLng)),
    minLat: Math.min(...bs.map((b) => b.minLat)),
    maxLat: Math.max(...bs.map((b) => b.maxLat)),
  };
}

function bboxesIntersect(a: CoverageBounds, b: CoverageBounds): boolean {
  return a.maxLng >= b.minLng && a.minLng <= b.maxLng && a.maxLat >= b.minLat && a.minLat <= b.maxLat;
}

/** Ray-casting point-in-polygon (matches src/lib/spatial/aoi.ts semantics). */
function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInAnyRing(lng: number, lat: number, rings: Ring[]): boolean {
  for (const ring of rings) {
    if (pointInRing(lng, lat, ring)) return true;
  }
  return false;
}

/** Shoelace ring area in km² using local metre-per-degree factors. */
function ringAreaKm2(ring: Ring, mPerLat: number, mPerLon: number): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return (Math.abs(a) / 2) * mPerLat * mPerLon / 1e6;
}

/**
 * Measure the spatial relationship between the analysis AOI and the provider
 * thermal field. Pure measurement — provider geometry is never altered.
 */
export function computeAoiThermalCoverage(
  analysisAoi: PolygonAOI | null | undefined,
  spatialField: PolygonAOI | null | undefined,
): AoiThermalCoverage | null {
  if (!analysisAoi || !analysisAoi.features?.length) return null;
  const aoiRings = outerRings(analysisAoi);
  if (aoiRings.length === 0) return null;

  const cellRings = spatialField?.features?.length ? outerRings(spatialField) : [];
  const aoiBounds = boundsOf(aoiRings);
  const thermalBounds = cellRings.length ? boundsOf(cellRings) : null;

  // Local planar scale at the AOI centre latitude.
  const centreLat = (aoiBounds!.minLat + aoiBounds!.maxLat) / 2;
  const mPerLat = 111320;
  const mPerLon = 111320 * Math.cos((centreLat * Math.PI) / 180);

  const aoiAreaKm2 = aoiRings.reduce((sum, r) => sum + ringAreaKm2(r, mPerLat, mPerLon), 0);
  const thermalUnionKm2 = cellRings.reduce((sum, r) => sum + ringAreaKm2(r, mPerLat, mPerLon), 0);

  // Per-cell classification.
  let cellsIntersectingAoi = 0;
  let cellsFullyInsideAoi = 0;
  let cellsOutsideAoi = 0;
  const cellBboxes: CoverageBounds[] = [];
  for (const ring of cellRings) {
    const b = ringBounds(ring);
    cellBboxes.push(b);
    const intersects = bboxesIntersect(b, aoiBounds!);
    if (!intersects) {
      cellsOutsideAoi++;
      continue;
    }
    cellsIntersectingAoi++;
    const allCornersInside = ring.every(([lng, lat]) => pointInAnyRing(lng, lat, aoiRings));
    if (allCornersInside) cellsFullyInsideAoi++;
  }
  const cells = cellRings.length;
  const cellsCrossingBoundary = cellsIntersectingAoi - cellsFullyInsideAoi;

  // Sampled intersection area (AOI ∩ any cell) over the AOI bounding box.
  let intersectionKm2 = 0;
  if (cells > 0 && aoiAreaKm2 > 0) {
    const N = 160; // 160×160 = 25.6k samples — dev-only cost
    const dLng = (aoiBounds!.maxLng - aoiBounds!.minLng) / N;
    const dLat = (aoiBounds!.maxLat - aoiBounds!.minLat) / N;
    const cellAreaKm2 = (dLng * mPerLon) * (dLat * mPerLat) / 1e6;
    let hits = 0;
    for (let iy = 0; iy < N; iy++) {
      const lat = aoiBounds!.minLat + (iy + 0.5) * dLat;
      for (let ix = 0; ix < N; ix++) {
        const lng = aoiBounds!.minLng + (ix + 0.5) * dLng;
        if (!pointInAnyRing(lng, lat, aoiRings)) continue;
        let covered = false;
        for (let c = 0; c < cellBboxes.length; c++) {
          const b = cellBboxes[c];
          if (lng < b.minLng || lng > b.maxLng || lat < b.minLat || lat > b.maxLat) continue;
          if (pointInRing(lng, lat, cellRings[c])) {
            covered = true;
            break;
          }
        }
        if (covered) hits++;
      }
    }
    intersectionKm2 = hits * cellAreaKm2;
  }

  const uncoveredAoiKm2 = Math.max(0, aoiAreaKm2 - intersectionKm2);
  const coverageRatio = aoiAreaKm2 > 0 ? intersectionKm2 / aoiAreaKm2 : 0;

  return {
    aoiBounds,
    thermalBounds,
    aoiAreaKm2,
    thermalUnionKm2,
    intersectionKm2,
    uncoveredAoiKm2,
    coverageRatio,
    cells,
    cellsIntersectingAoi,
    cellsFullyInsideAoi,
    cellsCrossingBoundary,
    cellsOutsideAoi,
  };
}

/** One-line dev log format: "[thermal-coverage] AOI 1.00km² · union 1.01km² · …" */
export function formatCoverageLine(c: AoiThermalCoverage): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    `AOI ${c.aoiAreaKm2.toFixed(2)}km² · thermal union ${c.thermalUnionKm2.toFixed(2)}km² · ` +
    `intersection ${c.intersectionKm2.toFixed(2)}km² · coverage ${pct(c.coverageRatio)} · ` +
    `uncovered ${c.uncoveredAoiKm2.toFixed(2)}km² · cells ${c.cells} ` +
    `(inside ${c.cellsFullyInsideAoi} / crossing ${c.cellsCrossingBoundary} / outside ${c.cellsOutsideAoi})`
  );
}
