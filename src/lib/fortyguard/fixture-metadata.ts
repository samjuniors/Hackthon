/**
 * Fixture capture metadata — honest provenance for DEMO mode.
 *
 * The DEMO fixture (`tests/fixtures/heatmap_captured_demo.json`) is a VERBATIM
 * extraction of a real captured FortyGuard /v1/heatmap response (built by
 * `scripts/build-demo-fixture.mjs` from `tests/fixtures/heatmap_probe_candidate_aoi.json`).
 * It records the granularity, hours, and geometry the provider ACTUALLY
 * returned — the UI displays THESE values in DEMO mode; a user-selected
 * 60m/80m resolution is never claimed for data that was not captured at that
 * resolution.
 */
import capturedDemoData from '../../../tests/fixtures/heatmap_captured_demo.json';
import type { PolygonAOI } from '@/types/domain';

interface FixtureCaptureMetadata {
  activityId: string;
  capturedAt: string;
  probeFile: string;
  requestFile: string;
  requestBody: {
    polygon_aoi: PolygonAOI;
    date_time: { start_date: string; start_time?: string; filter_type: number };
    granularity: number;
  };
  featureCount: number;
  responseStatsKeys: string[];
}

interface CapturedDemoFixture {
  granularity?: number;
  captureMetadata?: FixtureCaptureMetadata;
  hourlySnapshots?: Array<{ timestamp: string; aoi?: PolygonAOI }>;
}

const fixture = capturedDemoData as unknown as CapturedDemoFixture;

/** Granularity (thermal cell size in metres) of the REAL captured fixture. */
export const hourlyFixtureGranularity: number = Number(fixture.granularity) || 100;

/** Number of hourly snapshots in the REAL captured fixture (one hour only). */
export const hourlyFixtureSnapshotCount: number =
  Array.isArray(fixture.hourlySnapshots) ? fixture.hourlySnapshots.length : 0;

/** Capture provenance of the DEMO fixture (activity id, request body, wall-time). */
export function getFixtureCaptureMetadata(): FixtureCaptureMetadata | null {
  return fixture.captureMetadata ?? null;
}

/**
 * The polygon_aoi that was ACTUALLY sent to FortyGuard when the DEMO snapshot
 * was captured (from captureMetadata.requestBody). In DEMO mode this geometry
 * IS the analysis area — the captured request AOI == the rendered AOI == the
 * area the captured cells were produced for. DEMO never evaluates any other
 * geometry against the capture (no clipping / interpolation / regridding).
 * The client mirrors this exact geometry (fixture-display.ts
 * FIXTURE_CAPTURE_REQUEST_AOI); a test asserts the two stay identical.
 */
export function getFixtureCaptureRequestAoi(): PolygonAOI | null {
  const aoi = fixture.captureMetadata?.requestBody?.polygon_aoi;
  return aoi ? (JSON.parse(JSON.stringify(aoi)) as PolygonAOI) : null;
}

/** The single captured hour (ISO UTC) — the only hour DEMO can evaluate. */
export function getFixtureCapturedHourIso(): string | null {
  const first = fixture.hourlySnapshots?.[0];
  return first?.timestamp ?? null;
}

/**
 * The geographic extent the fixture ACTUALLY captured: the union bounding box
 * of the captured thermal cells. This is the honest analysis extent for DEMO
 * mode — the DEMO candidates are validated against THIS extent (not the user's
 * visual AOI, which is a nominal request parameter the fixture cannot honor).
 */
export function getFixtureExtentAoi(): PolygonAOI | null {
  const snapshots = fixture.hourlySnapshots;
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

/**
 * Numeric bounds of the captured extent (client-mirrorable constants live in
 * fixture-display.ts; a test asserts the two stay identical).
 */
export function getFixtureExtentBounds(): {
  minLng: number; maxLng: number; minLat: number; maxLat: number;
} | null {
  const extent = getFixtureExtentAoi();
  if (!extent) return null;
  const ring = (extent.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
  const lngs = ring.map((c) => c[0]);
  const lats = ring.map((c) => c[1]);
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}
