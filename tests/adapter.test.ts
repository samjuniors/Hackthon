import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FortyGuardAdapter, runWithConcurrency } from '@/lib/fortyguard/adapter';
import type { PolygonAOI } from '@/types/domain';
import {
  OutsideCoverageError,
  AuthenticationError,
  IncompleteTemporalCoverageError,
  FortyGuardTimeoutError,
  FortyGuardProcessingError,
} from '@/types/errors';

describe('FortyGuard Adapter Unit Tests', () => {
  let adapter: FortyGuardAdapter;

  beforeEach(() => {
    process.env.FORTYGUARD_API_KEY = 'test-key-12345';
    adapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
    FortyGuardAdapter.clearCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleAOI: PolygonAOI = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          tile_id: 'tile-alpha',
          average_temperature: 32.4,
          min_temperature: 30.1,
          max_temperature: 35.0,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-74.01, 40.70],
              [-74.00, 40.70],
              [-74.00, 40.71],
              [-74.01, 40.71],
              [-74.01, 40.70],
            ],
          ],
        },
      },
    ],
  };

  describe('Point Observation Normalization & Provenance', () => {
    it('normalizes spatial tile to point observation via exact point-in-polygon mapping', () => {
      const point = { latitude: 40.705, longitude: -74.005 };
      const timestamp = '2026-08-20T14:00:00.000Z';

      const obs = adapter.normalizePointObservation(sampleAOI, point, timestamp);

      expect(obs.timestamp).toBe(timestamp);
      expect(obs.selectedTileId).toBe('tile-alpha');
      expect(obs.dataSource).toBe('FIXTURE');
      expect(obs.metrics.temperatureCelsius).toBe(32.4);
      expect(obs.metrics.tileMinTemperatureCelsius).toBe(30.1);
      expect(obs.metrics.tileMaxTemperatureCelsius).toBe(35.0);
      expect(obs.provenance).toBe('DERIVED');
    });

    it('throws OutsideCoverageError if point lies outside tile boundary', () => {
      const outsidePoint = { latitude: 40.80, longitude: -74.005 };
      const timestamp = '2026-08-20T14:00:00.000Z';

      expect(() =>
        adapter.normalizePointObservation(sampleAOI, outsidePoint, timestamp)
      ).toThrow(OutsideCoverageError);
    });
  });

  describe('FIXTURE Mode Constraints', () => {
    it('fetches discrete hourly snapshots in FIXTURE mode without inventing data', async () => {
      const fixtureAdapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
      // The REAL capture contains exactly ONE hour: 2026-08-14T12:00Z.
      const snapshots = await fixtureAdapter.getHourlyHeatmapSnapshots(
        { latitude: 40.7128, longitude: -74.006 },
        ['2026-08-14T12:00:00.000Z']
      );

      expect(snapshots.size).toBe(1);
      expect(snapshots.has('2026-08-14T12:00:00.000Z')).toBe(true);
      // EXACTLY the 425 captured provider cells — never invented.
      expect((snapshots.get('2026-08-14T12:00:00.000Z') as { features: unknown[] }).features.length).toBe(425);

      // Any hour the capture does NOT contain is honestly rejected — the
      // adapter never fabricates additional hours.
      await expect(
        fixtureAdapter.getHourlyHeatmapSnapshots(
          { latitude: 40.7128, longitude: -74.006 },
          ['2026-08-14T13:00:00.000Z']
        )
      ).rejects.toThrow(IncompleteTemporalCoverageError);
    });

    it('throws IncompleteTemporalCoverageError when requested timestamp is missing from fixture', async () => {
      const fixtureAdapter = new FortyGuardAdapter({ mode: 'FIXTURE' });
      await expect(
        fixtureAdapter.getHourlyHeatmapSnapshots(
          { latitude: 40.7128, longitude: -74.006 },
          ['2029-01-01T00:00:00.000Z']
        )
      ).rejects.toThrow(IncompleteTemporalCoverageError);
    });
  });

  describe('runWithConcurrency helper', () => {
    it('executes tasks with bounded concurrency limit and preserves ordering', async () => {
      let activeWorkers = 0;
      let maxObservedActive = 0;

      const items = [1, 2, 3, 4, 5, 6];
      const results = await runWithConcurrency(items, 2, async (item) => {
        activeWorkers++;
        if (activeWorkers > maxObservedActive) maxObservedActive = activeWorkers;
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeWorkers--;
        return item * 10;
      });

      expect(maxObservedActive).toBeLessThanOrEqual(2);
      expect(results).toEqual([10, 20, 30, 40, 50, 60]);
    });

    it('handles empty input gracefully', async () => {
      const results = await runWithConcurrency([], 2, async (x) => x);
      expect(results).toEqual([]);
    });
  });

  describe('LIVE Mode Concurrency, Caching & Reliability', () => {
    it('throws AuthenticationError in LIVE mode when API key is missing', async () => {
      const liveAdapter = new FortyGuardAdapter({ mode: 'LIVE', apiKey: '' });
      await expect(
        liveAdapter.getHeatmap({
          polygon_aoi: sampleAOI,
          date_time: { start_date: '2026-08-21', start_time: '10:00', filter_type: 1 },
          granularity: 60,
        })
      ).rejects.toThrow(AuthenticationError);
    });

    it('respects concurrencyLimit = 2 when fetching 6 hourly snapshots in LIVE mode', async () => {
      let activeFetches = 0;
      let maxConcurrentFetches = 0;

      const mockFetch = vi.fn(async (url: string) => {
        activeFetches++;
        if (activeFetches > maxConcurrentFetches) {
          maxConcurrentFetches = activeFetches;
        }

        await new Promise((resolve) => setTimeout(resolve, 15));
        activeFetches--;

        if (url.includes('/v1/heatmap')) {
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Processing',
            data: { activity_id: `act-${Math.random().toString(36).slice(2, 8)}` },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }

        if (url.includes('/v1/status/')) {
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Completed',
            data: {
              activity_id: 'act-mock',
              status: 'Completed',
              result: { map_data: sampleAOI },
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }

        return new Response('Not Found', { status: 404 });
      });

      vi.stubGlobal('fetch', mockFetch);

      const liveAdapter = new FortyGuardAdapter({
        mode: 'LIVE',
        apiKey: 'mock-valid-key',
        concurrencyLimit: 2,
        pollingMaxAttempts: 5,
        pollingIntervalMs: 5,
      });

      const sixTimestamps = [
        '2026-08-24T10:00:00.000Z',
        '2026-08-24T11:00:00.000Z',
        '2026-08-24T12:00:00.000Z',
        '2026-08-24T13:00:00.000Z',
        '2026-08-24T14:00:00.000Z',
        '2026-08-24T15:00:00.000Z',
      ];

      const snapshots = await liveAdapter.getHourlyHeatmapSnapshots(
        { latitude: 34.0522, longitude: -118.2437 },
        sixTimestamps
      );

      expect(snapshots.size).toBe(6);
      expect(maxConcurrentFetches).toBeLessThanOrEqual(2);
    });

    it('caches successful Completed requests in session cache (zero additional network calls)', async () => {
      let submitCount = 0;

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('/v1/heatmap')) {
          submitCount++;
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Processing',
            data: { activity_id: 'act-cache-test' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.includes('/v1/status/')) {
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Completed',
            data: {
              activity_id: 'act-cache-test',
              status: 'Completed',
              result: { map_data: sampleAOI },
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
      });

      vi.stubGlobal('fetch', mockFetch);

      const liveAdapter = new FortyGuardAdapter({
        mode: 'LIVE',
        apiKey: 'mock-valid-key',
        pollingMaxAttempts: 3,
        pollingIntervalMs: 5,
      });

      const req = {
        polygon_aoi: sampleAOI,
        date_time: { start_date: '2026-08-24', start_time: '12:00', filter_type: 1 as const },
        granularity: 60 as const,
      };

      // First call: executes fetch & polls
      const res1 = await liveAdapter.getHeatmap(req);
      expect(res1.activityId).toBe('act-cache-test');
      expect(submitCount).toBe(1);

      // Second call: served from in-memory cache, 0 new network calls
      const res2 = await liveAdapter.getHeatmap(req);
      expect(res2.activityId).toBe('act-cache-test');
      expect(submitCount).toBe(1);
    });

    it('does NOT cache failed or timed-out responses', async () => {
      let callCount = 0;

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('/v1/heatmap')) {
          callCount++;
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Processing',
            data: { activity_id: 'act-fail-test' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.includes('/v1/status/')) {
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Failed',
            data: { activity_id: 'act-fail-test', status: 'Failed' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
      });

      vi.stubGlobal('fetch', mockFetch);

      const liveAdapter = new FortyGuardAdapter({
        mode: 'LIVE',
        apiKey: 'mock-valid-key',
        pollingMaxAttempts: 3,
        pollingIntervalMs: 5,
        maxRetries: 0,
      });

      const req = {
        polygon_aoi: sampleAOI,
        date_time: { start_date: '2026-08-24', start_time: '12:00', filter_type: 1 as const },
        granularity: 60 as const,
      };

      await expect(liveAdapter.getHeatmap(req)).rejects.toThrow(FortyGuardProcessingError);
      expect(callCount).toBe(1);

      // Second attempt must try again because failed response was never cached
      await expect(liveAdapter.getHeatmap(req)).rejects.toThrow(FortyGuardProcessingError);
      expect(callCount).toBe(2);
    });

    it('retries once on transient 504 gateway timeout and succeeds if second attempt passes', async () => {
      let attempt = 0;

      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('/v1/heatmap')) {
          attempt++;
          if (attempt === 1) {
            return new Response('Gateway Timeout', { status: 504 });
          }
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Processing',
            data: { activity_id: 'act-retry-success' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.includes('/v1/status/')) {
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Completed',
            data: {
              activity_id: 'act-retry-success',
              status: 'Completed',
              result: { map_data: sampleAOI },
            },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
      });

      vi.stubGlobal('fetch', mockFetch);

      const liveAdapter = new FortyGuardAdapter({
        mode: 'LIVE',
        apiKey: 'mock-valid-key',
        maxRetries: 1,
        retryDelayMs: 5,
        pollingMaxAttempts: 3,
        pollingIntervalMs: 5,
      });

      const result = await liveAdapter.getHeatmap({
        polygon_aoi: sampleAOI,
        date_time: { start_date: '2026-08-24', start_time: '14:00', filter_type: 1 },
        granularity: 60,
      });

      expect(attempt).toBe(2);
      expect(result.activityId).toBe('act-retry-success');
    });

    it('does NOT retry non-transient AuthenticationError (401)', async () => {
      let attempt = 0;

      const mockFetch = vi.fn(async () => {
        attempt++;
        return new Response(JSON.stringify({ error: true, message: 'Invalid API Key' }), { status: 401 });
      });

      vi.stubGlobal('fetch', mockFetch);

      const liveAdapter = new FortyGuardAdapter({
        mode: 'LIVE',
        apiKey: 'bad-key',
        maxRetries: 2,
        retryDelayMs: 5,
      });

      await expect(
        liveAdapter.getHeatmap({
          polygon_aoi: sampleAOI,
          date_time: { start_date: '2026-08-24', start_time: '14:00', filter_type: 1 },
          granularity: 60,
        })
      ).rejects.toThrow(AuthenticationError);

      // Must fail immediately on attempt 1 without retry
      expect(attempt).toBe(1);
    });

    it('throws FortyGuardTimeoutError when polling exhausts maxAttempts and does not fabricate data', async () => {
      const mockFetch = vi.fn(async (url: string) => {
        if (url.includes('/v1/heatmap')) {
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Processing',
            data: { activity_id: 'act-timeout-poll' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        if (url.includes('/v1/status/')) {
          // Keep returning 'Processing' until timeout
          return new Response(JSON.stringify({
            error: false,
            status_code: 200,
            message: 'Processing',
            data: { activity_id: 'act-timeout-poll', status: 'Processing' },
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response('Not Found', { status: 404 });
      });

      vi.stubGlobal('fetch', mockFetch);

      const liveAdapter = new FortyGuardAdapter({
        mode: 'LIVE',
        apiKey: 'mock-valid-key',
        maxRetries: 0,
        pollingMaxAttempts: 2,
        pollingIntervalMs: 5,
      });

      await expect(
        liveAdapter.getHourlyHeatmapSnapshots(
          { latitude: 34.0522, longitude: -118.2437 },
          ['2026-08-24T10:00:00.000Z']
        )
      ).rejects.toThrow(FortyGuardTimeoutError);
    });
  });
});
