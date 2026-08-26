/**
 * Client-safe constants mirroring server-side fixture metadata.
 *
 * The heavy fixture JSON lives server-side only (adapter + route); the client
 * needs just the display-facing facts. These values are MIRRORED from
 * `tests/fixtures/heatmap_captured_demo.json` (the REAL captured FortyGuard
 * response). A test (tests/fortyguard-contract.test.ts) asserts this mirror
 * stays identical to the server-side fixture metadata — if the capture
 * changes, update fixture-metadata.ts (server) AND this mirror (client).
 */
import type { CandidateLocation, PolygonAOI } from '@/types/domain';

/**
 * Granularity the captured fixture was ACTUALLY recorded at (100m). In DEMO
 * mode the UI displays THIS value — never a user-selected resolution the
 * fixture does not contain.
 */
export const FIXTURE_DISPLAY_GRANULARITY = 100 as const;

/** Number of hourly snapshots the DEMO capture actually contains. */
export const FIXTURE_DISPLAY_SNAPSHOT_COUNT = 1 as const;

/** The captured hour (UTC) — the only hour DEMO can evaluate. */
export const FIXTURE_CAPTURED_HOUR_ISO = '2026-08-14T12:00:00.000Z' as const;

/** Wall-clock time the capture was fetched from FortyGuard. */
export const FIXTURE_CAPTURED_AT_ISO = '2026-08-21T06:17:55.911Z' as const;

/** Provider activity id of the DEMO capture. */
export const FIXTURE_ACTIVITY_ID = '800a20e2-b5a9-4a29-b00e-b42fcbb0e41a' as const;

/** Provider cell count in the DEMO capture. */
export const FIXTURE_CELL_COUNT = 425 as const;

/**
 * Numeric bounds of the captured thermal field (mirrored from the real
 * capture's cell geometry). Used client-side for the DEMO coverage gate:
 * a FIXTURE analysis whose AOI does not intersect these bounds is outside
 * the captured DEMO dataset.
 */
export const FIXTURE_EXTENT_BOUNDS = {
  minLng: -74.01039553344097,
  maxLng: -73.98386966890105,
  minLat: 40.70093245304909,
  maxLat: 40.722643933843884,
} as const;

/** The captured-field extent as a renderable AOI polygon (DEMO map layer). */
export const FIXTURE_EXTENT_AOI: PolygonAOI = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { shape: 'polygon', source: 'fixture-captured-extent' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [FIXTURE_EXTENT_BOUNDS.minLng, FIXTURE_EXTENT_BOUNDS.minLat],
          [FIXTURE_EXTENT_BOUNDS.maxLng, FIXTURE_EXTENT_BOUNDS.minLat],
          [FIXTURE_EXTENT_BOUNDS.maxLng, FIXTURE_EXTENT_BOUNDS.maxLat],
          [FIXTURE_EXTENT_BOUNDS.minLng, FIXTURE_EXTENT_BOUNDS.maxLat],
          [FIXTURE_EXTENT_BOUNDS.minLng, FIXTURE_EXTENT_BOUNDS.minLat],
        ]],
      },
    },
  ],
};

/**
 * The three DEMO CANDIDATE sites (Lower Manhattan).
 *
 * PROVENANCE — these are APPLICATION-DEFINED candidate points, not provider
 * observations. They are evaluated against the genuine captured FortyGuard
 * field; the fixture does NOT prove that FortyGuard "captured these sites".
 * All three coordinates lie inside the captured thermal cells (verified by
 * tests/fortyguard-contract.test.ts — never moved, never fabricated).
 */
export const DEMO_CANDIDATE_SITES: CandidateLocation[] = [
  {
    locationId: 'LOC-A',
    name: 'Battery Park Greenway (Waterfront)',
    location: { latitude: 40.7120, longitude: -74.0080 },
  },
  {
    locationId: 'LOC-B',
    name: 'City Hall Civic Center (Mid-Density)',
    location: { latitude: 40.7120, longitude: -73.9980 },
  },
  {
    locationId: 'LOC-C',
    name: 'Chinatown / Bowery Staging (Asphalt Canyon)',
    location: { latitude: 40.7120, longitude: -73.9880 },
  },
];

/**
 * Backwards-compatible alias. Semantics: DEMO candidates (application-defined
 * points evaluated against the captured field) — NOT "captured sites".
 * @deprecated use DEMO_CANDIDATE_SITES
 */
export const CAPTURED_DEMO_SITES = DEMO_CANDIDATE_SITES;

/** True when the point lies inside the captured thermal-field bounds. */
export function isPointInFixtureExtent(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= FIXTURE_EXTENT_BOUNDS.minLat &&
    lat <= FIXTURE_EXTENT_BOUNDS.maxLat &&
    lng >= FIXTURE_EXTENT_BOUNDS.minLng &&
    lng <= FIXTURE_EXTENT_BOUNDS.maxLng
  );
}

/** True when the AOI's bounding box intersects the captured-field bounds. */
export function doesAoiIntersectFixtureExtent(aoi: PolygonAOI): boolean {
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
  if (!found) return false;
  return (
    maxLng >= FIXTURE_EXTENT_BOUNDS.minLng &&
    minLng <= FIXTURE_EXTENT_BOUNDS.maxLng &&
    maxLat >= FIXTURE_EXTENT_BOUNDS.minLat &&
    minLat <= FIXTURE_EXTENT_BOUNDS.maxLat
  );
}
