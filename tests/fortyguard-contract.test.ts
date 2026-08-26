import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { FortyGuardAdapter } from '@/lib/fortyguard/adapter';
import { POST as decisionPOST } from '@/app/api/decision/route';
import { createAoiFromSpan, moveAoiToCenter, aoiBboxesIntersect } from '@/lib/spatial/aoi';
import {
  TIME_MODE_OPTIONS,
  buildFixtureTemporalInput,
  FIXTURE_TEMPORAL_METADATA,
} from '@/lib/temporal/analysis-window';
import {
  hourlyFixtureGranularity,
  hourlyFixtureSnapshotCount,
  getFixtureExtentAoi,
  getFixtureExtentBounds,
  getFixtureCaptureMetadata,
  getFixtureCapturedHourIso,
} from '@/lib/fortyguard/fixture-metadata';
import {
  FIXTURE_DISPLAY_GRANULARITY,
  FIXTURE_DISPLAY_SNAPSHOT_COUNT,
  FIXTURE_CELL_COUNT,
  FIXTURE_CAPTURED_HOUR_ISO,
  FIXTURE_CAPTURED_AT_ISO,
  FIXTURE_ACTIVITY_ID,
  FIXTURE_EXTENT_BOUNDS,
  DEMO_CANDIDATE_SITES,
  isPointInFixtureExtent,
  doesAoiIntersectFixtureExtent,
} from '@/lib/fortyguard/fixture-display';
import { isLocationCoveredByFixture } from '@/lib/location/search';
import capturedDemoFixture from './fixtures/heatmap_captured_demo.json';
import rawCapture from './fixtures/heatmap_probe_candidate_aoi.json';
import rawCaptureRequest from './fixtures/heatmap_probe_candidate_aoi.request.json';
import type { PolygonAOI } from '@/types/domain';

/**
 * FORTYGUARD CONTRACT TESTS — P0/P1/P2 correction lock.
 *
 * Every test here enforces one clause of the provider-truth contract:
 *   - DEMO is a VERBATIM replay of a real captured provider response.
 *   - Temporal provenance records ONLY requests that were actually sent
 *     (hourly filter_type:1 requests — never filter_type 2/3 claims).
 *   - The AOI contract holds on the wire: canonical == rendered == submitted.
 *   - LIVE failures never fall back to DEMO; DEMO never calls the provider.
 */

const CAPTURED_HOUR = '2026-08-14T12:00:00.000Z';
const rawFeatures = (rawCapture as { data: { result: { map_data: { features: unknown[] } } } })
  .data.result.map_data.features;

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function liveFetchMock(handlers: {
  onSubmit?: (body: Record<string, unknown>) => void;
  statusPayload?: unknown;
  submitStatus?: number;
  /** Bounding box [minLng, minLat, maxLng, maxLat] for the mock provider cell. */
  cellBounds?: [number, number, number, number];
}) {
  const submitted: Array<{ url: string; body: Record<string, unknown> }> = [];
  const [minLng, minLat, maxLng, maxLat] = handlers.cellBounds ?? [-180, -85, 180, 85];
  const statusPayload = handlers.statusPayload ?? {
    data: {
      activity_id: 'act-live',
      status: 'Completed',
      result: {
        map_data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { tile_id: 'mock-cell-0', average_temperature: 26, min_temperature: 26, max_temperature: 26 },
              geometry: { type: 'Polygon', coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]] },
            },
          ],
        },
      },
    },
  };
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/v1/heatmap')) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      submitted.push({ url, body });
      handlers.onSubmit?.(body);
      return new Response(
        JSON.stringify(handlers.submitStatus === 402
          ? { message: 'Payment Required — credit limit exceeded' }
          : { data: { activity_id: `act-${submitted.length}`, status: 'Processing' } }),
        { status: handlers.submitStatus ?? 200 }
      );
    }
    if (url.includes('/v1/status/')) {
      return new Response(JSON.stringify(statusPayload), { status: 200 });
    }
    throw new Error('unexpected fetch ' + url);
  };
  return { fetchImpl, submitted };
}

describe('FortyGuard contract — DEMO is a verbatim replay of the REAL capture', () => {
  it('1. DEMO uses real captured provider geometry — every fixture cell equals the raw provider response verbatim', () => {
    const snapshot = capturedDemoFixture.hourlySnapshots[0];
    const features = snapshot.aoi.features;
    expect(features.length).toBe(rawFeatures.length);
    for (let i = 0; i < features.length; i++) {
      expect(features[i].properties).toEqual((rawFeatures[i] as { properties: unknown }).properties);
      expect(features[i].geometry).toEqual((rawFeatures[i] as { geometry: unknown }).geometry);
    }
    // Adapter FIXTURE lookup returns those exact cells.
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    return adapter.getHourlyHeatmapSnapshots(
      { latitude: 40.712, longitude: -74.006 },
      [CAPTURED_HOUR]
    ).then((snapshots) => {
      const fc = snapshots.get(CAPTURED_HOUR)!;
      expect(fc.features.length).toBe(rawFeatures.length);
      expect(fc.features[0].geometry).toEqual((rawFeatures[0] as { geometry: unknown }).geometry);
      expect(fc.features[424].properties).toEqual((rawFeatures[424] as { properties: unknown }).properties);
    });
  });

  it('2. DEMO metadata reports the ACTUAL 100m capture granularity — server, client mirror, and capture request agree', () => {
    expect(hourlyFixtureGranularity).toBe(100);
    expect(FIXTURE_DISPLAY_GRANULARITY).toBe(100);
    expect(capturedDemoFixture.granularity).toBe(100);
    expect(rawCaptureRequest.requestBody.granularity).toBe(100);
    // The capture metadata is preserved for honest provenance.
    const meta = getFixtureCaptureMetadata()!;
    expect(meta.activityId).toBe(rawCaptureRequest.activityId);
    expect(meta.capturedAt).toBe(rawCaptureRequest.capturedAt);
    expect(meta.requestBody).toEqual(rawCaptureRequest.requestBody);
  });

  it('3. DEMO does not fabricate additional cells — exactly the 425 provider cells regardless of requested granularity/shape', async () => {
    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    for (const granularity of [60, 80, 100] as const) {
      const snapshots = await adapter.getHourlyHeatmapSnapshots(
        { latitude: 40.712, longitude: -74.006 },
        [CAPTURED_HOUR],
        createAoiFromSpan({ latitude: 40.712, longitude: -74.006 }, 2000, 'circle'),
        { granularity, analysisAreaShape: 'circle' },
      );
      expect(snapshots.get(CAPTURED_HOUR)!.features.length).toBe(425);
    }
  });

  it('4. DEMO does not fabricate additional hours — one snapshot only; any other hour is rejected', async () => {
    expect(hourlyFixtureSnapshotCount).toBe(1);
    expect(FIXTURE_DISPLAY_SNAPSHOT_COUNT).toBe(1);
    expect(FIXTURE_TEMPORAL_METADATA.snapshotCount).toBe(1);
    expect(getFixtureCapturedHourIso()).toBe(CAPTURED_HOUR);

    const adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    await expect(
      adapter.getHourlyHeatmapSnapshots({ latitude: 40.712, longitude: -74.006 }, ['2026-08-14T13:00:00.000Z'])
    ).rejects.toThrow(/never fabricates/i);

    // The DEMO temporal input is the single captured hour (UTC-anchored).
    const fixtureInput = buildFixtureTemporalInput();
    expect(fixtureInput.timeMode).toBe('single-hour');
    expect(`${fixtureInput.date}T${fixtureInput.startTime}:00.000Z`).toBe(CAPTURED_HOUR);
  });

  it('5. temporal provenance reports filter_type:1 for the ACTUAL hourly requests (LIVE) and NO request (DEMO)', async () => {
    const originalFetch = globalThis.fetch;
    const { fetchImpl, submitted } = liveFetchMock({ cellBounds: [-122.5, 37.6, -122.0, 38.0] });
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      FortyGuardAdapter.clearCache();
      // LIVE: 3-hour range → 3 actual hourly requests, all filter_type 1.
      const res = await decisionPOST(makeRequest({
        latitude: 37.8044,
        longitude: -122.2712,
        mode: 'LIVE',
        analysisAoi: createAoiFromSpan({ latitude: 37.8044, longitude: -122.2712 }, 400, 'polygon'),
        candidates: [{ locationId: 'S-1', name: 'Yard', latitude: 37.8044, longitude: -122.2712 }],
        temporalInput: { date: '2026-08-20', startTime: '10:00', endTime: '13:00', timeMode: 'range-of-hours' },
        timezone: 'America/Los_Angeles',
      }));
      expect(res.status).toBe(200);
      const data = await res.json();

      // 3 actual /v1/heatmap submissions on the wire…
      expect(submitted.length).toBe(3);
      for (const s of submitted) {
        expect((s.body.date_time as { filter_type: number }).filter_type).toBe(1);
      }
      // …and the provenance records EXACTLY those requests.
      const prov = data.temporalProvenance.providerRequests;
      expect(prov.strategy).toBe('EVALUATED_AS_HOURLY_REQUESTS');
      expect(prov.filterType).toBe(1);
      expect(prov.hourlyRequestCount).toBe(3);
      expect(prov.requests).toHaveLength(3);
      for (const r of prov.requests) {
        expect(r.filter_type).toBe(1);
      }
      // Provenance blocks == actual wire bodies (single source of truth).
      for (let i = 0; i < 3; i++) {
        expect(prov.requests[i]).toEqual(submitted[i].body.date_time);
      }
    } finally {
      globalThis.fetch = originalFetch;
      FortyGuardAdapter.clearCache();
    }
  });

  it('6. UI does not claim filter_type 2/3 were sent — no UI-mode→filter_type mapping exists', () => {
    const pageSrc = readFileSync(resolvePath(process.cwd(), 'src/app/page.tsx'), 'utf8');
    const railSrc = readFileSync(resolvePath(process.cwd(), 'src/components/dashboard/ControlRail.tsx'), 'utf8');
    const analysisWindowSrc = readFileSync(resolvePath(process.cwd(), 'src/lib/temporal/analysis-window.ts'), 'utf8');
    const routeSrc = readFileSync(resolvePath(process.cwd(), 'src/app/api/decision/route.ts'), 'utf8');

    // The removed UI-mode → provider filter_type mapping must not come back.
    expect(analysisWindowSrc).not.toContain('TIME_MODE_FILTER_TYPE');
    // The UI labels the concept EVALUATION WINDOW (not provider Time Mode).
    expect(railSrc).toContain('Evaluation Window');
    // The range mode discloses the hourly-request semantics.
    expect(railSrc).toContain('sequence of hourly FortyGuard requests');
    // No UI surface claims filter_type 2/3.
    for (const src of [pageSrc, railSrc]) {
      expect(src).not.toContain('filter_type: 2');
      expect(src).not.toContain('filter_type: 3');
      expect(src).not.toContain('filter_type 2');
      expect(src).not.toContain('filter_type 3');
    }
    // The route never emits a filter_type 2/3 provenance claim.
    expect(routeSrc).not.toContain('fortyGuardDateTime');
    expect(routeSrc).not.toContain('buildFortyGuardDateTime');
  });

  it('7. Single Day is NOT available — not in options, rejected by the API schema', async () => {
    expect(TIME_MODE_OPTIONS.map((o) => o.value)).toEqual(['single-hour', 'range-of-hours']);
    const railSrc = readFileSync(resolvePath(process.cwd(), 'src/components/dashboard/ControlRail.tsx'), 'utf8');
    expect(railSrc).not.toContain('Single Day');
    expect(railSrc).not.toContain('single-day');

    // The decision API rejects a single-day temporalInput with a validation error.
    const res = await decisionPOST(makeRequest({
      latitude: 40.712,
      longitude: -74.006,
      mode: 'FIXTURE',
      analysisAoi: createAoiFromSpan({ latitude: 40.712, longitude: -74.006 }, 400, 'polygon'),
      temporalInput: { date: '2026-08-14', startTime: '06:00', endTime: '20:00', timeMode: 'single-day' },
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('VALIDATION_ERROR');
    expect(data.error.message).toContain('timeMode');
  });

  it('8. LIVE range produces N ACTUAL hourly requests (4-hour range → 4 /v1/heatmap submissions)', async () => {
    const originalFetch = globalThis.fetch;
    const { fetchImpl, submitted } = liveFetchMock({});
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      FortyGuardAdapter.clearCache();
      const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'test-key', pollingIntervalMs: 1 });
      const aoi = createAoiFromSpan({ latitude: 37.8044, longitude: -122.2712 }, 400, 'polygon');
      const timestamps = [
        '2026-08-20T17:00:00.000Z',
        '2026-08-20T18:00:00.000Z',
        '2026-08-20T19:00:00.000Z',
        '2026-08-20T20:00:00.000Z',
      ];
      await adapter.getHourlyHeatmapSnapshots({ latitude: 37.8044, longitude: -122.2712 }, timestamps, aoi, {
        granularity: 100,
      });

      expect(submitted.length).toBe(4);
      const dateTimeBlocks = submitted.map((s) => s.body.date_time);
      // Each hour is its OWN request with filter_type 1 + distinct UTC hours.
      for (const dt of dateTimeBlocks) {
        expect((dt as { filter_type: number }).filter_type).toBe(1);
      }
      expect(dateTimeBlocks.map((dt) => (dt as { start_time: string }).start_time)).toEqual([
        '17:00', '18:00', '19:00', '20:00',
      ]);
      expect(new Set(dateTimeBlocks.map((dt) => JSON.stringify(dt))).size).toBe(4);
    } finally {
      globalThis.fetch = originalFetch;
      FortyGuardAdapter.clearCache();
    }
  });

  it('9. AOI contract: canonical == rendered == submitted polygon_aoi, including AFTER DRAG', async () => {
    const originalFetch = globalThis.fetch;
    const { fetchImpl, submitted } = liveFetchMock({});
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      FortyGuardAdapter.clearCache();
      // Build the canonical AOI, DRAG it (pure translation), then run the
      // pipeline — the moved geometry is what the provider receives.
      const initial = createAoiFromSpan({ latitude: 40.7120, longitude: -74.0080 }, 400, 'polygon');
      const dragged = moveAoiToCenter(initial, { latitude: 40.7150, longitude: -74.0020 });

      const adapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: 'test-key', pollingIntervalMs: 1 });
      await adapter.getHourlyHeatmapSnapshots(
        { latitude: 40.715, longitude: -74.002 },
        ['2026-08-20T18:00:00.000Z'],
        dragged,
        { granularity: 100 },
      );

      expect(submitted.length).toBe(1);
      // The submitted polygon_aoi IS the dragged canonical geometry (deep equality).
      expect(submitted[0].body.polygon_aoi).toEqual(dragged);

      // Also verify the shape is preserved (square side length unchanged).
      const ring = (dragged.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
      const [x0, y0] = ring[0];
      const [x1, y1] = ring[1];
      const widthM = Math.hypot((x1 - x0) * 111320 * Math.cos((40.7 * Math.PI) / 180), (y1 - y0) * 110574);
      expect(widthM).toBeGreaterThan(390);
      expect(widthM).toBeLessThan(410);
    } finally {
      globalThis.fetch = originalFetch;
      FortyGuardAdapter.clearCache();
    }
  });

  it('9b. AOI contract at the ROUTE level: the client-sent analysisAoi is submitted verbatim as polygon_aoi', async () => {
    const originalFetch = globalThis.fetch;
    const { fetchImpl, submitted } = liveFetchMock({ cellBounds: [-74.05, 40.65, -73.9, 40.78] });
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      FortyGuardAdapter.clearCache();
      const canonical = createAoiFromSpan({ latitude: 40.7120, longitude: -74.0080 }, 1000, 'circle');
      const res = await decisionPOST(makeRequest({
        latitude: 40.7120,
        longitude: -74.0080,
        mode: 'LIVE',
        analysisAoi: canonical,
        candidates: [{ locationId: 'S-1', name: 'Yard', latitude: 40.7120, longitude: -74.0080 }],
        temporalInput: { date: '2026-08-20', startTime: '10:00', endTime: '11:00', timeMode: 'single-hour' },
        timezone: 'America/New_York',
      }));
      expect(res.status).toBe(200);
      expect(submitted.length).toBe(1);
      // Route passes the canonical AOI to the adapter VERBATIM.
      expect(submitted[0].body.polygon_aoi).toEqual(canonical);
    } finally {
      globalThis.fetch = originalFetch;
      FortyGuardAdapter.clearCache();
    }
  });

  it('10. candidate outside the DEMO captured field is NOT silently moved or fabricated', async () => {
    // A candidate far outside the captured extent — coordinates must never be
    // repositioned; the route rejects with CANDIDATE_OUTSIDE_AOI.
    const outsideCandidate = { locationId: 'FAR-1', name: 'Faraway Site', latitude: 40.7120, longitude: -73.9500 };
    const aoi = createAoiFromSpan({ latitude: 40.712, longitude: -74.006 }, 2000, 'polygon');
    const res = await decisionPOST(makeRequest({
      latitude: 40.712,
      longitude: -74.006,
      mode: 'FIXTURE',
      analysisAoi: aoi,
      candidates: [outsideCandidate],
      temporalInput: { date: '2026-08-14', startTime: '12:00', endTime: '13:00', timeMode: 'single-hour' },
      timezone: 'UTC',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('CANDIDATE_OUTSIDE_AOI');
    expect(data.error.message).toContain('Faraway Site');
    // The DEMO candidates themselves are never moved: exact fixed coordinates.
    for (const site of DEMO_CANDIDATE_SITES) {
      expect(isPointInFixtureExtent(site.location.latitude, site.location.longitude)).toBe(true);
    }
    // …and every DEMO candidate lies inside a REAL captured cell's extent.
    const extent = getFixtureExtentAoi()!;
    for (const site of DEMO_CANDIDATE_SITES) {
      expect(aoiBboxesIntersect(extent, {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [[[site.location.longitude, site.location.latitude], [site.location.longitude + 1e-6, site.location.latitude], [site.location.longitude + 1e-6, site.location.latitude + 1e-6], [site.location.longitude, site.location.latitude + 1e-6], [site.location.longitude, site.location.latitude]]] },
        }],
      })).toBe(true);
    }
  });

  it('11. LIVE 402 (insufficient credits) NEVER switches to DEMO — the error surfaces verbatim', async () => {
    const originalFetch = globalThis.fetch;
    const { fetchImpl } = liveFetchMock({ submitStatus: 402 });
    globalThis.fetch = fetchImpl as typeof fetch;
    try {
      FortyGuardAdapter.clearCache();
      const res = await decisionPOST(makeRequest({
        latitude: 37.8044,
        longitude: -122.2712,
        mode: 'LIVE',
        analysisAoi: createAoiFromSpan({ latitude: 37.8044, longitude: -122.2712 }, 400, 'polygon'),
        candidates: [{ locationId: 'S-1', name: 'Yard', latitude: 37.8044, longitude: -122.2712 }],
        temporalInput: { date: '2026-08-20', startTime: '10:00', endTime: '11:00', timeMode: 'single-hour' },
        timezone: 'America/Los_Angeles',
      }));
      expect(res.status).toBeGreaterThanOrEqual(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toMatch(/402/);
      // No DEMO/fixture data in the failure payload.
      expect(data.spatialField).toBeUndefined();
      expect(data.jointDecision).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('fixture-captured-activity');
    } finally {
      globalThis.fetch = originalFetch;
      FortyGuardAdapter.clearCache();
    }
  });

  it('12. DEMO never calls FortyGuard — the FIXTURE route path makes zero network requests', async () => {
    const originalFetch = globalThis.fetch;
    let called = 0;
    globalThis.fetch = (async () => {
      called++;
      throw new Error('DEMO must never call the provider');
    }) as typeof fetch;
    try {
      const res = await decisionPOST(makeRequest({
        latitude: 40.712,
        longitude: -74.006,
        mode: 'FIXTURE',
        analysisAoi: createAoiFromSpan({ latitude: 40.712, longitude: -74.006 }, 400, 'polygon'),
        temporalInput: { date: '2026-08-14', startTime: '12:00', endTime: '13:00', timeMode: 'single-hour' },
        timezone: 'UTC',
      }));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.spatialField.features.length).toBe(425);
      expect(called).toBe(0);
      // Provenance records that NO live request was made.
      expect(data.temporalProvenance.providerRequests.strategy).toBe('FIXTURE_REPLAY_NO_LIVE_REQUEST');
      expect(data.temporalProvenance.providerRequests.hourlyRequestCount).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('FortyGuard contract — client/server fixture mirror consistency', () => {
  it('the client mirror matches the server-side fixture metadata exactly', () => {
    expect(FIXTURE_DISPLAY_GRANULARITY).toBe(hourlyFixtureGranularity);
    expect(FIXTURE_DISPLAY_SNAPSHOT_COUNT).toBe(hourlyFixtureSnapshotCount);
    expect(FIXTURE_CAPTURED_HOUR_ISO).toBe(getFixtureCapturedHourIso());
    expect(FIXTURE_CAPTURED_AT_ISO).toBe(getFixtureCaptureMetadata()?.capturedAt);
    expect(FIXTURE_ACTIVITY_ID).toBe(getFixtureCaptureMetadata()?.activityId);
    expect(FIXTURE_CELL_COUNT).toBe(getFixtureCaptureMetadata()?.featureCount);

    // The mirrored extent bounds equal the server-computed capture extent.
    const bounds = getFixtureExtentBounds()!;
    expect(FIXTURE_EXTENT_BOUNDS.minLng).toBeCloseTo(bounds.minLng, 12);
    expect(FIXTURE_EXTENT_BOUNDS.maxLng).toBeCloseTo(bounds.maxLng, 12);
    expect(FIXTURE_EXTENT_BOUNDS.minLat).toBeCloseTo(bounds.minLat, 12);
    expect(FIXTURE_EXTENT_BOUNDS.maxLat).toBeCloseTo(bounds.maxLat, 12);
  });

  it('the DEMO coverage gate matches the server extent gate', () => {
    const extent = getFixtureExtentAoi()!;
    // AOI intersecting the captured extent passes both gates.
    const insideAoi = createAoiFromSpan({ latitude: 40.712, longitude: -74.006 }, 400, 'polygon');
    expect(doesAoiIntersectFixtureExtent(insideAoi)).toBe(true);
    expect(aoiBboxesIntersect(insideAoi, extent)).toBe(true);
    // AOI far outside fails both gates.
    const outsideAoi = createAoiFromSpan({ latitude: 37.8044, longitude: -122.2712 }, 400, 'polygon');
    expect(doesAoiIntersectFixtureExtent(outsideAoi)).toBe(false);
    expect(aoiBboxesIntersect(outsideAoi, extent)).toBe(false);
    // isLocationCoveredByFixture (search gate) uses the same captured extent.
    expect(isLocationCoveredByFixture({ latitude: 40.712, longitude: -74.006 })).toBe(true);
    expect(isLocationCoveredByFixture({ latitude: 34.0522, longitude: -118.2437 })).toBe(false);
    expect(isLocationCoveredByFixture({ latitude: 40.758, longitude: -73.9855 })).toBe(false); // Midtown — outside the capture
  });
});

describe('FortyGuard contract — DEMO AOI outside the captured field', () => {
  it('route returns AOI_OUTSIDE_DEMO_CAPTURE (422) when the AOI does not intersect the captured extent', async () => {
    const res = await decisionPOST(makeRequest({
      latitude: 40.712,
      longitude: -74.006,
      mode: 'FIXTURE',
      analysisAoi: createAoiFromSpan({ latitude: 37.8044, longitude: -122.2712 }, 400, 'polygon'), // Oakland — far outside
      temporalInput: { date: '2026-08-14', startTime: '12:00', endTime: '13:00', timeMode: 'single-hour' },
      timezone: 'UTC',
    }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error.code).toBe('AOI_OUTSIDE_DEMO_CAPTURE');
    expect(data.error.message).toContain('outside the captured DEMO dataset');
  });

  it('the client UI contains the DEMO capture-extent gate + honest notices (source contract)', () => {
    const pageSrc = readFileSync(resolvePath(process.cwd(), 'src/app/page.tsx'), 'utf8');
    const railSrc = readFileSync(resolvePath(process.cwd(), 'src/components/dashboard/ControlRail.tsx'), 'utf8');
    const mapSrc = readFileSync(resolvePath(process.cwd(), 'src/components/ThermalMap.tsx'), 'utf8');

    // Client-side gate exists before any API call in DEMO.
    expect(pageSrc).toContain('doesAoiIntersectFixtureExtent');
    expect(pageSrc).toContain('AOI_OUTSIDE_DEMO_CAPTURE');
    // The captured-field extent is rendered as a map layer in DEMO.
    expect(mapSrc).toContain('capture-extent-outline');
    expect(pageSrc).toContain('FIXTURE_EXTENT_AOI');
    // DEMO candidates are labelled DEMO CANDIDATES (not "captured sites").
    expect(railSrc).toContain('DEMO CANDIDATES');
    expect(railSrc).not.toContain('captured demo sites');
    // DEMO notice states the real capture facts (granularity is rendered from
    // the mirrored capture constant, not hardcoded).
    expect(railSrc).toContain('DEMO · Captured FortyGuard');
    expect(railSrc).toContain('m cell resolution');
    expect(railSrc).toContain('FIXTURE_DISPLAY_GRANULARITY');
    // LIVE billing disclosure exists.
    expect(railSrc).toContain('FortyGuard hourly request');
    // LIVE date hint exists (honest empty-field expectation).
    expect(railSrc).toContain('live-date-hint');
  });
});
