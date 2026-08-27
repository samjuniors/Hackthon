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
import type { CandidateLocation, LocationPoint, PolygonAOI } from '@/types/domain';

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

// ─────────────────────────────────────────────────────────────────────────────
// The CAPTURED ANALYSIS AREA (DEMO's canonical AOI)
//
// The DEMO capture was requested from FortyGuard with ONE specific polygon_aoi
// (recorded verbatim in the fixture's captureMetadata.requestBody.polygon_aoi).
// In DEMO mode THIS geometry — and nothing else — is the analysis area:
// the captured request AOI == the rendered AOI == the area the captured cells
// were produced for. DEMO never pretends FortyGuard returned data for any
// other geometry (no clipping, no interpolation, no regridding of the capture).
// A test asserts this mirror equals the server-side metadata exactly.
// ─────────────────────────────────────────────────────────────────────────────

/** The genuine capture REQUEST AOI — mirrored verbatim from the fixture metadata. */
export const FIXTURE_CAPTURE_REQUEST_AOI: PolygonAOI = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { shape: 'polygon', source: 'fixture-capture-request' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-74.01222132741097, 40.70122026590011],
          [-73.98377867258904, 40.70122026590011],
          [-73.98377867258904, 40.722779734099895],
          [-74.01222132741097, 40.722779734099895],
          [-74.01222132741097, 40.70122026590011],
        ]],
      },
    },
  ],
};

/** Center of the captured analysis area (the capture request AOI's midpoint). */
export const FIXTURE_CAPTURE_CENTER: LocationPoint = { latitude: 40.712, longitude: -73.998 };

/** Planar metres-per-degree factors — identical to src/lib/spatial/aoi.ts. */
const FIXTURE_METRES_PER_DEG_LAT = 111320;
function fixtureMetresPerDegLon(lat: number): number {
  return FIXTURE_METRES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Physical span of the captured analysis area (width × height, metres). */
export const FIXTURE_CAPTURE_SPAN_METRES: { width: number; height: number } = (() => {
  const ring = (
    FIXTURE_CAPTURE_REQUEST_AOI.features[0].geometry as { coordinates: number[][][] }
  ).coordinates[0];
  const lngs = ring.map(([lng]) => lng);
  const lats = ring.map(([, lat]) => lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  return {
    width: (maxLng - minLng) * fixtureMetresPerDegLon((minLat + maxLat) / 2),
    height: (maxLat - minLat) * FIXTURE_METRES_PER_DEG_LAT,
  };
})();

/** Compact human label for the captured analysis area (e.g. "≈2.4km × 2.4km"). */
export function fixtureCaptureSpanLabel(): string {
  const fmt = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`);
  return `≈${fmt(FIXTURE_CAPTURE_SPAN_METRES.width)} × ${fmt(FIXTURE_CAPTURE_SPAN_METRES.height)}`;
}

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
