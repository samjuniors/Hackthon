/**
 * Fixture capture metadata — honest provenance for DEMO mode.
 *
 * The captured Manhattan fixture (`tests/fixtures/heatmap_hourly_fixture.json`)
 * records the granularity it was ACTUALLY captured at. The UI displays THIS
 * value in DEMO mode; a user-selected 80m/100m resolution is never claimed for
 * data that was not captured at that resolution.
 */
import hourlyFixtureData from '../../../tests/fixtures/heatmap_hourly_fixture.json';
import type { PolygonAOI } from '@/types/domain';

/** Granularity (thermal cell size in metres) of the captured fixture. */
export const hourlyFixtureGranularity: number =
  Number((hourlyFixtureData as { granularity?: number }).granularity) || 60;

/** Number of hourly snapshots in the captured fixture. */
export const hourlyFixtureSnapshotCount: number =
  Array.isArray((hourlyFixtureData as { hourlySnapshots?: unknown[] }).hourlySnapshots)
    ? (hourlyFixtureData as { hourlySnapshots: unknown[] }).hourlySnapshots.length
    : 0;

/**
 * The geographic extent the fixture ACTUALLY captured: the union bounding box
 * of the captured thermal cells across all snapshots. This is the honest
 * analysis extent for DEMO mode — the captured Manhattan sites are validated
 * against THIS extent (not the user's visual AOI, which is a nominal request
 * parameter the fixture cannot honor).
 */
export function getFixtureExtentAoi(): PolygonAOI | null {
  const snapshots = (hourlyFixtureData as {
    hourlySnapshots?: Array<{ aoi?: PolygonAOI }>;
  }).hourlySnapshots;
  if (!snapshots || snapshots.length === 0) return null;

  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  let found = false;
  for (const snap of snapshots) {
    for (const f of snap.aoi?.features ?? []) {
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
  }
  if (!found) return null;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { shape: 'polygon', source: 'fixture-captured-extent' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [minLng, minLat],
            [maxLng, minLat],
            [maxLng, maxLat],
            [minLng, maxLat],
            [minLng, minLat],
          ]],
        },
      },
    ],
  };
}
