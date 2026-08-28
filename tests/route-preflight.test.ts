import { describe, it, expect, afterEach } from 'vitest';
import { POST as decisionPOST } from '@/app/api/decision/route';
import { createAoiFromSpan } from '@/lib/spatial/aoi';

/**
 * SERVER PRE-FLIGHT TESTS — documented provider limits are enforced in the
 * decision route BEFORE any FortyGuard submission. Every blocked request must
 * reach ZERO provider fetches (constraint violations are uncharged 400s at the
 * provider — the pre-flight makes them costless round-trips too).
 */

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const MANHATTAN = { latitude: 40.712, longitude: -74.008 };

/** Counting fetch stub — any provider call makes the test fail loudly. */
function countingFetch(calls: string[]) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    calls.push(String(input));
    throw new Error(`UNEXPECTED PROVIDER FETCH: ${String(input)} — pre-flight must block before submission`);
  };
}

function baseLiveBody(overrides: Record<string, unknown> = {}) {
  return {
    latitude: MANHATTAN.latitude,
    longitude: MANHATTAN.longitude,
    mode: 'LIVE',
    granularity: 100,
    analysisAreaShape: 'polygon',
    analysisAoi: createAoiFromSpan(MANHATTAN, 1000, 'polygon'),
    temporalInput: { date: '2026-08-20', startTime: '10:00', endTime: '11:00', timeMode: 'single-hour' },
    timezone: 'UTC',
    candidates: [
      { locationId: 'LOC-A', name: 'Test Site', latitude: 40.712, longitude: -74.008 },
    ],
    ...overrides,
  };
}

describe('decision route server pre-flight — documented limits, zero provider calls', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('rejects an oversized AOI (13.9 mi² > documented Basic 10 mi²) with ZERO provider fetches', async () => {
    const calls: string[] = [];
    globalThis.fetch = countingFetch(calls) as typeof fetch;

    const res = await decisionPOST(makeRequest(baseLiveBody({
      // 6 km square ≈ 13.9 mi² — exceeds the documented Basic limit.
      analysisAoi: createAoiFromSpan(MANHATTAN, 6000, 'polygon'),
    })));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('AOI_EXCEEDS_PROVIDER_LIMIT');
    expect(data.error.message).toContain('mi²');
    expect(data.error.message).toContain('10 mi²');
    expect(data.error.message).toContain('blocked before submission');
    expect(data.error.message).toContain('no FortyGuard credits consumed');
    expect(calls).toEqual([]);
  });

  it('rejects a date before the documented 2019-01-01 range start with ZERO provider fetches', async () => {
    const calls: string[] = [];
    globalThis.fetch = countingFetch(calls) as typeof fetch;

    const res = await decisionPOST(makeRequest(baseLiveBody({
      temporalInput: { date: '2018-06-01', startTime: '10:00', endTime: '11:00', timeMode: 'single-hour' },
    })));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('TEMPORAL_BEFORE_PROVIDER_RANGE');
    expect(data.error.message).toContain('2019-01-01');
    expect(calls).toEqual([]);
  });

  it('rejects a window beyond the documented +12h forecast horizon with ZERO provider fetches', async () => {
    const calls: string[] = [];
    globalThis.fetch = countingFetch(calls) as typeof fetch;

    // Far-future date: years ahead — definitely > +12h.
    const res = await decisionPOST(makeRequest(baseLiveBody({
      temporalInput: { date: '2027-01-01', startTime: '10:00', endTime: '11:00', timeMode: 'single-hour' },
    })));
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('TEMPORAL_BEYOND_FORECAST_HORIZON');
    expect(data.error.message).toContain('+12h');
    expect(calls).toEqual([]);
  });

  it('rejects a location outside the documented US coverage with ZERO provider fetches', async () => {
    const calls: string[] = [];
    globalThis.fetch = countingFetch(calls) as typeof fetch;

    // London — outside documented US-only coverage.
    const london = { latitude: 51.5074, longitude: -0.1278 };
    const res = await decisionPOST(makeRequest(baseLiveBody({
      latitude: london.latitude,
      longitude: london.longitude,
      analysisAoi: createAoiFromSpan(london, 1000, 'polygon'),
      candidates: [{ locationId: 'LOC-A', name: 'London Site', latitude: london.latitude, longitude: london.longitude }],
      timezone: 'Europe/London',
    })));
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe('OUTSIDE_DOCUMENTED_COVERAGE');
    expect(data.error.message).toContain('United States');
    expect(calls).toEqual([]);
  });

  it('DOES NOT pre-flight-block FIXTURE mode (DEMO replay never reaches the provider anyway)', async () => {
    // A DEMO request with a pre-2019 date is anchored to the FIXTURE capture
    // (the route substitutes buildFixtureTemporalInput when temporalInput is
    // absent); the pre-flight is LIVE-only. We assert the LIVE-only gate by
    // checking a FIXTURE request without temporalInput passes validation and
    // returns the fixture analysis (no LIVE gates fired).
    const calls: string[] = [];
    globalThis.fetch = countingFetch(calls) as typeof fetch;

    const res = await decisionPOST(makeRequest({
      latitude: MANHATTAN.latitude,
      longitude: MANHATTAN.longitude,
      mode: 'FIXTURE',
      analysisAoi: createAoiFromSpan(MANHATTAN, 1000, 'polygon'),
    }));
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.temporalProvenance.providerRequests.filterType).toBeNull();
    expect(data.temporalProvenance.providerRequests.hourlyRequestCount).toBe(0);
    expect(calls).toEqual([]); // DEMO replay: zero provider fetches
  });
});
