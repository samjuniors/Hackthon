/**
 * THERMAL PIPELINE DIAGNOSTICS — DEVELOPMENT INSTRUMENTATION ONLY.
 *
 * Proves (never modifies) the pipeline invariant:
 *
 *   provider/fixture features  ==  normalized spatialField features
 *                               ==  MapLibre source features  ==  pixels
 *
 * Each stage of a completed analysis logs one `[THERMAL DEBUG]` line so a
 * developer can trace one analysis end-to-end:
 *
 *   [THERMAL DEBUG] stage=provider_response   (server  — adapter/decision route)
 *   [THERMAL DEBUG] stage=client_spatial_field(client — page.tsx state)
 *   [THERMAL DEBUG] stage=map_source          (client — MapLibre GeoJSON source)
 *
 * All logging is gated on NODE_ENV === 'development'; the module is inert in
 * production builds. It NEVER alters provider geometry, filters features, or
 * affects analysis results — measurement only.
 */
import type { PolygonAOI } from '@/types/domain';

export type ThermalDebugStage =
  | 'provider_response'
  | 'client_spatial_field'
  | 'map_source';

export interface ThermalFieldStats {
  /** Total features in the FeatureCollection. */
  cells: number;
  /** Distinct tile_id values (null when tile ids are not unique). */
  uniqueTileIds: number;
  /** Minimum average_temperature across features (null when none numeric). */
  temperatureMin: number | null;
  /** Maximum average_temperature across features (null when none numeric). */
  temperatureMax: number | null;
  /** "[minLng,minLat → maxLng,maxLat]" bounds of all feature outer rings. */
  bounds: string | null;
  /** "(lat,lng)" planar centroid of the bounds. */
  centroid: string | null;
}

/** Read the renderable temperature of a feature's properties (display order). */
function featureTemperature(props: Record<string, unknown> | undefined | null): number | null {
  if (!props) return null;
  const raw =
    props.average_temperature ?? props.temperature ?? props.temp ?? props.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pure measurement of a thermal FeatureCollection: counts, tile-id uniqueness,
 * temperature range, bounds and centroid. Never mutates the input.
 */
export function computeThermalFieldStats(
  field: PolygonAOI | null | undefined,
): ThermalFieldStats | null {
  const features = field?.features;
  if (!features || features.length === 0) return null;

  const tileIds = new Set<string>();
  let temperatureMin: number | null = null;
  let temperatureMax: number | null = null;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

  for (const f of features) {
    const props = f?.properties;
    if (props) tileIds.add(String(props.tile_id ?? '∅'));
    const t = featureTemperature(props);
    if (t !== null) {
      if (temperatureMin === null || t < temperatureMin) temperatureMin = t;
      if (temperatureMax === null || t > temperatureMax) temperatureMax = t;
    }
    const geom = f?.geometry as { coordinates?: unknown } | undefined;
    // Walk polygon rings: Polygon = number[][][], MultiPolygon = number[][][][]
    const rings: unknown = geom?.coordinates;
    const visitRing = (ring: unknown): void => {
      if (!Array.isArray(ring)) return;
      if (ring.length > 0 && Array.isArray(ring[0]) && typeof ring[0][0] === 'number') {
        for (const pt of ring as number[][]) {
          const [lng, lat] = pt;
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
        }
        return;
      }
      for (const child of ring) visitRing(child);
    };
    visitRing(rings);
  }

  const hasBounds = Number.isFinite(minLng) && Number.isFinite(maxLng);
  const centroidLat = hasBounds ? (minLat + maxLat) / 2 : null;
  const centroidLng = hasBounds ? (minLng + maxLng) / 2 : null;

  return {
    cells: features.length,
    uniqueTileIds: tileIds.size,
    temperatureMin,
    temperatureMax,
    bounds: hasBounds
      ? `[${minLng.toFixed(5)},${minLat.toFixed(5)} → ${maxLng.toFixed(5)},${maxLat.toFixed(5)}]`
      : null,
    centroid:
      centroidLat !== null && centroidLng !== null
        ? `(${centroidLat.toFixed(5)},${centroidLng.toFixed(5)})`
        : null,
  };
}

/** Format a temperature range "29.74–32.36" (or "n/a"). */
function formatTempRange(stats: ThermalFieldStats): string {
  if (stats.temperatureMin === null || stats.temperatureMax === null) return 'n/a';
  return `${stats.temperatureMin.toFixed(2)}–${stats.temperatureMax.toFixed(2)}`;
}

/**
 * Dev-only structured log. Emits one compact `key=value` line plus the raw
 * payload object, tagged `[THERMAL DEBUG]` so it is trivially greppable in a
 * server log or browser console. No-op outside development.
 */
export function logThermalDebug(
  stage: ThermalDebugStage,
  payload: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  const entries = Object.entries(payload)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
  console.info(`[THERMAL DEBUG] stage=${stage} ${entries.join(' ')}`, payload);
}

/**
 * Log the standard per-stage summary for a thermal FeatureCollection.
 * Shared by the server (provider_response), the client state
 * (client_spatial_field) and the map layer (map_source).
 */
export function logThermalFieldStage(
  stage: ThermalDebugStage,
  source: 'FIXTURE' | 'LIVE',
  field: PolygonAOI | null | undefined,
  extra: Record<string, unknown> = {},
): void {
  if (process.env.NODE_ENV !== 'development') return;
  const stats = computeThermalFieldStats(field);
  if (!stats) {
    logThermalDebug(stage, { source, cells: 0, note: 'no renderable thermal field', ...extra });
    return;
  }
  logThermalDebug(stage, {
    source,
    cells: stats.cells,
    uniqueTileIds: stats.uniqueTileIds,
    temperatureRange: formatTempRange(stats),
    thermalBounds: stats.bounds,
    thermalCentroid: stats.centroid,
    ...extra,
  });
}
