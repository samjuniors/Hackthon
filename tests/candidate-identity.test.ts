import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POST as decisionPOST } from '@/app/api/decision/route';
import {
  resolveCandidateAdd,
  candidateInputFromLocation,
  applySiteIdentity,
  createPendingIdentityTracker,
  MAP_POINT_FALLBACK_RE,
  type CandidateSite,
} from '@/hooks/use-candidate-sites';
import { createAoiFromSpan } from '@/lib/spatial/aoi';
import { buildHistoryRecord, isValidHistoryRecord } from '@/lib/history/record';
import { evaluateJointDecision, evaluateWhatIfScenarios } from '@/lib/decision-engine/evaluator';
import type { CandidateLocation, NormalizedThermalObservation, PolygonAOI } from '@/types/domain';

/**
 * CANDIDATE IDENTITY PERSISTENCE — regression tests (recording blocker).
 *
 * The user-visible bug: a candidate added with a real place name was displayed
 * as generic "Map Point 1/2" after Generate. These tests pin the identity
 * contract across BOTH creation paths (search + map-click) and every
 * transformation:
 *
 *   creation → candidate state → Generate request → decision response →
 *   ranking → winner → evidence → History save → History restore
 *
 * Invariants under test:
 *   - name/address/state are DISPLAY METADATA carried through every hop
 *   - the exact coordinate is the SPATIAL AUTHORITY and never changes
 *   - candidate IDs are stable SITE-nn (never array-index identity)
 *   - a named candidate is NEVER relabelled "Map point N"
 *   - "Map point N" is the honest fallback ONLY when no real name exists
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Coordinates PROVEN inside the captured Manhattan AOI (the DEMO candidates). */
const MANHATTAN_POINTS = {
  batteryPark: { latitude: 40.712, longitude: -74.008 },
  cityHall: { latitude: 40.712, longitude: -73.998 },
  chinatown: { latitude: 40.712, longitude: -73.988 },
};

function makeMapClickSite(n: number, lat: number, lng: number): CandidateSite {
  return {
    locationId: `SITE-${String(n).padStart(2, '0')}`,
    name: `Map point ${n}`,
    location: { latitude: lat, longitude: lng },
    origin: 'map-click',
  };
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Offline FIXTURE decision request with USER-NAMED candidates inside the capture AOI. */
function fixtureRequestWithNamedCandidates() {
  return makeRequest({
    latitude: MANHATTAN_POINTS.batteryPark.latitude,
    longitude: MANHATTAN_POINTS.batteryPark.longitude,
    mode: 'FIXTURE',
    // Named candidates at PROVEN-inside coordinates — same points as the DEMO
    // candidates but with REAL place names + locality metadata.
    candidates: [
      {
        locationId: 'SITE-01',
        name: 'City Hall Park',
        latitude: MANHATTAN_POINTS.cityHall.latitude,
        longitude: MANHATTAN_POINTS.cityHall.longitude,
        address: 'New York, NY',
        state: 'NY',
      },
      {
        locationId: 'SITE-02',
        name: 'Battery Park Greenway',
        latitude: MANHATTAN_POINTS.batteryPark.latitude,
        longitude: MANHATTAN_POINTS.batteryPark.longitude,
        address: 'New York, NY',
        state: 'NY',
      },
      {
        locationId: 'SITE-03',
        name: 'Columbus Park',
        latitude: MANHATTAN_POINTS.chinatown.latitude,
        longitude: MANHATTAN_POINTS.chinatown.longitude,
        address: 'New York, NY',
        state: 'NY',
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PATH A — SEARCH: identity survives creation
// ─────────────────────────────────────────────────────────────────────────────

describe('candidate identity — PATH A (search)', () => {
  it('A. a search result\'s real place name survives addCandidate', () => {
    const outcome = resolveCandidateAdd([], 'SITE-01', candidateInputFromLocation({
      name: 'Bill Graham Civic Auditorium',
      latitude: 37.778050,
      longitude: -122.417308,
      city: 'San Francisco',
      state: 'CA',
    }), null);

    expect(outcome.status).toBe('added');
    if (outcome.status !== 'added') return;
    expect(outcome.site.name).toBe('Bill Graham Civic Auditorium');
    expect(outcome.site.address).toBe('San Francisco, CA');
    expect(outcome.site.state).toBe('CA');
    expect(outcome.site.origin).toBe('search');
    // Exact coordinates pass through VERBATIM (spatial authority).
    expect(outcome.site.location).toEqual({ latitude: 37.778050, longitude: -122.417308 });
  });

  it('H. candidate IDs are stable SITE-nn — never array-index identity', () => {
    const a = resolveCandidateAdd([], 'SITE-01', candidateInputFromLocation({
      name: 'City Hall Park', latitude: 40.712, longitude: -73.998,
    }), null);
    const b = resolveCandidateAdd(
      a.status === 'added' ? [a.site] : [],
      'SITE-02',
      candidateInputFromLocation({ name: 'Collect Pond Park', latitude: 40.7135, longitude: -74.0002 }),
      null,
    );
    expect(a.status).toBe('added');
    expect(b.status).toBe('added');
    if (a.status !== 'added' || b.status !== 'added') return;
    expect(a.site.locationId).toBe('SITE-01');
    expect(b.site.locationId).toBe('SITE-02');
  });

  it('J. a named search candidate is NEVER relabelled "Map point N" — identity application protects known names', () => {
    const sites: CandidateSite[] = [
      {
        locationId: 'SITE-01',
        name: 'Bill Graham Civic Auditorium',
        location: { latitude: 37.778050, longitude: -122.417308 },
        origin: 'search',
        address: 'San Francisco, CA',
      },
    ];
    const result = applySiteIdentity(sites, 'SITE-01', { name: 'Some Other Place' });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('NAME_PROTECTED');
    expect(result.sites[0].name).toBe('Bill Graham Civic Auditorium');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATH B — MAP CLICK: reverse-geocode display identity, exact coordinates kept
// ─────────────────────────────────────────────────────────────────────────────

describe('candidate identity — PATH B (map click)', () => {
  it('2. a map-click candidate adopts the reverse-geocoded place name', () => {
    const sites = [makeMapClickSite(1, 37.7841, -122.4011)];
    const result = applySiteIdentity(sites, 'SITE-01', {
      name: 'Bill Graham Civic Auditorium',
      address: 'San Francisco, CA',
      state: 'CA',
    });
    expect(result.applied).toBe(true);
    expect(result.sites[0].name).toBe('Bill Graham Civic Auditorium');
    expect(result.sites[0].address).toBe('San Francisco, CA');
    expect(result.sites[0].state).toBe('CA');
  });

  it('3. reverse geocoding NEVER moves the candidate — exact clicked coordinates are preserved bit-identically', () => {
    const clicked = { latitude: 37.7841, longitude: -122.4011 };
    const sites = [makeMapClickSite(1, clicked.latitude, clicked.longitude)];
    const result = applySiteIdentity(sites, 'SITE-01', {
      name: 'Bill Graham Civic Auditorium',
      // A geocoder result that "suggests" different coords must be IGNORED —
      // the identity function takes display fields only, so this is
      // structurally impossible; assert the coordinates are bit-identical.
    });
    expect(result.applied).toBe(true);
    expect(result.sites[0].location).toEqual(clicked);
    expect(result.sites[0].location.latitude).toBe(clicked.latitude);
    expect(result.sites[0].location.longitude).toBe(clicked.longitude);
  });

  it('4. reverse-geocoder failure produces the honest "Map point N" fallback', () => {
    const sites = [makeMapClickSite(1, 37.7841, -122.4011)];

    // No name resolved (empty / whitespace) → NOT applied.
    const empty = applySiteIdentity(sites, 'SITE-01', { name: '   ' });
    expect(empty.applied).toBe(false);
    expect(empty.reason).toBe('NO_NAME');
    expect(empty.sites[0].name).toBe('Map point 1');

    // Geocoder 404 (site not found) → NOT applied.
    const missing = applySiteIdentity(sites, 'SITE-99', { name: 'Anywhere' });
    expect(missing.applied).toBe(false);
    expect(missing.reason).toBe('NOT_FOUND');

    // The fallback pattern matches exactly the auto-generated names.
    expect(MAP_POINT_FALLBACK_RE.test('Map point 1')).toBe(true);
    expect(MAP_POINT_FALLBACK_RE.test('Map point 12')).toBe(true);
    expect(MAP_POINT_FALLBACK_RE.test('City Hall Park')).toBe(false);
  });

  it('10. a renamed map-click candidate keeps the USER-provided name (late geocode result never overwrites it)', () => {
    const sites: CandidateSite[] = [{
      ...makeMapClickSite(1, 37.7841, -122.4011),
      name: 'My Staging Spot', // user renamed before the geocode resolved
    }];
    const result = applySiteIdentity(sites, 'SITE-01', { name: 'Bill Graham Civic Auditorium' });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('NAME_PROTECTED');
    expect(result.sites[0].name).toBe('My Staging Spot');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE ROUND TRIP — name survives request → response → ranking → winner
// (offline: FIXTURE mode replays the captured field with user-named candidates)
// ─────────────────────────────────────────────────────────────────────────────

describe('candidate identity — Generate round trip', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function runFixtureDecision() {
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      calls.push(String(input));
      throw new Error(`UNEXPECTED PROVIDER FETCH: ${String(input)} — FIXTURE replays offline`);
    }) as typeof fetch;

    const res = await decisionPOST(fixtureRequestWithNamedCandidates());
    const data = await res.json();
    return { res, data, calls };
  }

  it('B. the candidate name + address/state survive the decision request/response transformation', async () => {
    const { res, data } = await runFixtureDecision();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);

    const locations: CandidateLocation[] = data.jointDecision.rankedPlans.map((p: { location: CandidateLocation }) => p.location);
    const names = locations.map((l) => l.name);
    expect(names).toContain('City Hall Park');
    expect(names).toContain('Battery Park Greenway');
    expect(names).toContain('Columbus Park');
    // Display metadata rides along (address/state carried through the route).
    for (const loc of locations) {
      expect(loc.address).toBe('New York, NY');
      expect(loc.state).toBe('NY');
    }
    // No generic fallback anywhere for named candidates (J, server leg).
    for (const name of names) {
      expect(MAP_POINT_FALLBACK_RE.test(name)).toBe(false);
    }
  });

  it('C+D. Top-Candidates + Recommended-Operation data carry the real names (ranking + winner)', async () => {
    const { data } = await runFixtureDecision();
    const ranked = data.jointDecision.rankedPlans;
    expect(ranked.length).toBeGreaterThan(0);

    // The winner (recommendedPlan) must display its REAL name.
    const winner = data.jointDecision.recommendedPlan;
    expect(['City Hall Park', 'Battery Park Greenway', 'Columbus Park']).toContain(winner.location.name);
    expect(MAP_POINT_FALLBACK_RE.test(winner.location.name)).toBe(false);

    // Every ranked plan keeps its submitted name + stable id.
    const byId = new Map<string, CandidateLocation>(
      ranked.map((p: { location: CandidateLocation }) => [p.location.locationId, p.location] as [string, CandidateLocation]),
    );
    expect(byId.get('SITE-01')).toMatchObject({ name: 'City Hall Park' });
    expect(byId.get('SITE-02')).toMatchObject({ name: 'Battery Park Greenway' });
    expect(byId.get('SITE-03')).toMatchObject({ name: 'Columbus Park' });
  });

  it('E+8. the evidence chain references the real winner identity (id + name + coordinate + tile + score)', async () => {
    const { data } = await runFixtureDecision();
    const winner = data.jointDecision.recommendedPlan;
    // Evidence-grade facts: stable id, real name, exact submitted coordinate,
    // a provider tile id, and a finite exposure score.
    expect(winner.location.locationId).toMatch(/^SITE-\d{2}$/);
    expect(winner.location.name).toBe(
      winner.location.locationId === 'SITE-01' ? 'City Hall Park'
        : winner.location.locationId === 'SITE-02' ? 'Battery Park Greenway'
          : 'Columbus Park',
    );
    expect(Number.isFinite(winner.location.location.latitude)).toBe(true);
    expect(Number.isFinite(winner.location.location.longitude)).toBe(true);
    expect(String(winner.tileId)).not.toBe('');
    expect(Number.isFinite(winner.exposureScore)).toBe(true);
    expect(winner.thermalValues.length).toBeGreaterThan(0);
  });

  it('I. exact submitted coordinates remain unchanged through the entire pipeline', async () => {
    const { data } = await runFixtureDecision();
    const byId = new Map<string, CandidateLocation>(
      data.jointDecision.rankedPlans.map(
        (p: { location: CandidateLocation }) => [p.location.locationId, p.location] as [string, CandidateLocation],
      ),
    );
    expect(byId.get('SITE-01')?.location).toEqual(MANHATTAN_POINTS.cityHall);
    expect(byId.get('SITE-02')?.location).toEqual(MANHATTAN_POINTS.batteryPark);
    expect(byId.get('SITE-03')?.location).toEqual(MANHATTAN_POINTS.chinatown);
  });

  it('what-if "Site Lock" shows the ACTUAL locked site name — never a fabricated demo name for user candidates', async () => {
    const { data } = await runFixtureDecision();
    const lock = data.scenarioAnalysis.scenarios.find(
      (s: { scenarioId: string }) => s.scenarioId === 'scenario-location-lock',
    );
    expect(lock).toBeDefined();
    // With user candidates (no LOC-C), the lock falls to the LAST candidate —
    // the label must be that site's real name, not "Chinatown Asphalt Canyon".
    expect(lock.scenarioName).toBe('Site Lock (Columbus Park)');
    expect(lock.scenarioName).not.toContain('Chinatown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DETERMINISTIC ENGINE — name preservation without the route
// ─────────────────────────────────────────────────────────────────────────────

function syntheticObservation(lat: number, lng: number, tempC: number): NormalizedThermalObservation {
  return {
    timestamp: '2026-08-14T12:00:00.000Z',
    location: { latitude: lat, longitude: lng },
    selectedTileId: 'tile-1',
    sourceEndpoint: '/v1/heatmap',
    dataSource: 'FIXTURE',
    metrics: { temperatureCelsius: tempC },
    provenance: 'DERIVED',
  };
}

describe('candidate identity — deterministic evaluator', () => {
  const namedCandidates: CandidateLocation[] = [
    { locationId: 'SITE-01', name: 'City Hall Park', location: MANHATTAN_POINTS.cityHall, address: 'New York, NY', state: 'NY' },
    { locationId: 'SITE-02', name: 'Columbus Park', location: MANHATTAN_POINTS.chinatown },
  ];
  const observations = new Map<string, NormalizedThermalObservation[]>([
    ['SITE-01', [syntheticObservation(40.712, -73.998, 30.1)]],
    ['SITE-02', [syntheticObservation(40.712, -73.988, 31.4)]],
  ]);
  const constraints = {
    allowedStart: '2026-08-14T12:00:00.000Z',
    allowedEnd: '2026-08-14T13:00:00.000Z',
    durationHours: 1,
    dataResolutionHours: 1,
  };

  it('6. candidate names survive ranking — and the ranking itself is unchanged (cooler site still wins)', () => {
    const result = evaluateJointDecision(namedCandidates, observations, constraints, { dataSource: 'FIXTURE' });
    const names = result.rankedPlans.map((p) => p.location.name);
    expect(names).toContain('City Hall Park');
    expect(names).toContain('Columbus Park');
    // Deterministic ranking preserved: SITE-01 (30.1°C) beats SITE-02 (31.4°C).
    expect(result.recommendedPlan.location.name).toBe('City Hall Park');
    expect(result.recommendedPlan.location.locationId).toBe('SITE-01');
    // Display metadata rides along the whole CandidateLocation.
    const winner = result.recommendedPlan.location;
    expect(winner.address).toBe('New York, NY');
    expect(winner.state).toBe('NY');
  });

  it('the what-if Site Lock label uses the actual candidate name (evaluator level)', () => {
    const result = evaluateWhatIfScenarios(namedCandidates, observations, constraints, { dataSource: 'FIXTURE' });
    const lock = result.scenarios.find((s) => s.scenarioId === 'scenario-location-lock');
    expect(lock?.scenarioName).toBe('Site Lock (Columbus Park)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY — identity survives save → storage → restore
// ─────────────────────────────────────────────────────────────────────────────

describe('candidate identity — History save/restore', () => {
  const namedCandidates: CandidateLocation[] = [
    { locationId: 'SITE-01', name: 'Bill Graham Civic Auditorium', location: { latitude: 37.778050, longitude: -122.417308 }, address: 'San Francisco, CA', state: 'CA' },
    { locationId: 'SITE-02', name: 'Map point 2', location: { latitude: 37.774900, longitude: -122.419400 } },
  ];

  function makeCompletedAnalysis() {
    const ring: number[][] = [
      [-122.425, 37.77],
      [-122.415, 37.77],
      [-122.415, 37.78],
      [-122.425, 37.78],
      [-122.425, 37.77],
    ];
    const aoiGeometry = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Polygon' as const, coordinates: [ring] },
        },
      ],
    };
    return {
      location: {
        name: 'San Francisco, CA', latitude: 37.7749, longitude: -122.4194,
        timezone: 'America/Los_Angeles', city: 'San Francisco', state: 'CA', country: 'US',
      },
      aoiGeometry,
      aoiShape: 'polygon' as const,
      aoiSpanMetres: 1000,
      aoiSizeLabel: '1km × 1km',
      temporalInput: { date: '2026-08-28', startTime: '10:00', endTime: '11:00', timeMode: 'single-hour' as const },
      timezone: 'America/Los_Angeles',
      dataSourceMode: 'LIVE' as const,
      providerActivityId: 'act-test-1',
      granularity: 100,
      thermalField: null,
      spatialFieldMetadata: null,
      candidates: namedCandidates,
      decision: null,
      spatialDecision: null,
      jointDecision: null,
      scenarioAnalysis: null,
      explanation: null,
      temporalProvenance: null,
    };
  }

  it('F. History save preserves the real candidate name + address/state', () => {
    const record = buildHistoryRecord(makeCompletedAnalysis(), 'hx-test-1', '2026-08-28T18:00:00.000Z');
    expect(record.candidates).toHaveLength(2);
    expect(record.candidates[0].name).toBe('Bill Graham Civic Auditorium');
    expect(record.candidates[0].address).toBe('San Francisco, CA');
    expect(record.candidates[0].state).toBe('CA');
    // An unnamed map-click candidate keeps its honest fallback (never erased).
    expect(record.candidates[1].name).toBe('Map point 2');
  });

  it('G. History restore preserves the name through a full persistence round trip (save → JSON → read → validate)', () => {
    const record = buildHistoryRecord(makeCompletedAnalysis(), 'hx-test-2', '2026-08-28T18:05:00.000Z');
    // IndexedDB stores structured clones; JSON is the harshest round trip.
    const restored = JSON.parse(JSON.stringify(record)) as typeof record;

    expect(restored.candidates[0].name).toBe('Bill Graham Civic Auditorium');
    expect(restored.candidates[0].address).toBe('San Francisco, CA');
    expect(restored.candidates[0].state).toBe('CA');
    expect(restored.candidates[0].locationId).toBe('SITE-01');
    expect(restored.candidates[0].location).toEqual({ latitude: 37.778050, longitude: -122.417308 });
    // The record still validates after the round trip.
    expect(isValidHistoryRecord(restored)).toBe(true);
  });

  it('H. restored candidate IDs stay stable (SITE-nn survives the round trip)', () => {
    const record = buildHistoryRecord(makeCompletedAnalysis(), 'hx-test-3', '2026-08-28T18:10:00.000Z');
    const restored = JSON.parse(JSON.stringify(record)) as typeof record;
    expect(restored.candidates.map((c) => c.locationId)).toEqual(['SITE-01', 'SITE-02']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SEPARATION — reverse geocoding NEVER triggers FortyGuard
// ─────────────────────────────────────────────────────────────────────────────

describe('candidate identity — separation contracts', () => {
  it('12. the reverse-geocode path never touches FortyGuard (source-level guard)', () => {
    const projectRoot = process.cwd();
    const geocodeSrc = readFileSync(join(projectRoot, 'src/lib/location/geocode.ts'), 'utf8');
    const searchRouteSrc = readFileSync(join(projectRoot, 'src/app/api/location/search/route.ts'), 'utf8');

    // The geocoding module only talks to Photon/Nominatim — never the
    // FortyGuard API or adapter (the word may appear in explanatory comments;
    // the guard checks real code references: URLs + imports).
    expect(geocodeSrc).not.toMatch(/api\.fortyguard\.com/);
    expect(geocodeSrc).not.toMatch(/@\/lib\/fortyguard/);
    expect(geocodeSrc).toMatch(/photon\.komoot\.io/);

    // The location-search route has no FortyGuard import.
    expect(searchRouteSrc).not.toMatch(/@\/lib\/fortyguard/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RACE GUARD — Generate must await pending reverse-geocode identity resolutions
// ─────────────────────────────────────────────────────────────────────────────

describe('candidate identity — Generate race guard', () => {
  it('a Generate that AWAITS settleIdentities never carries an unresolved "Map point N" (the reported LIVE bug)', async () => {
    const clicked = { latitude: 37.7841, longitude: -122.4011 };

    // 1. Map-click creation — immediate, fallback name (exact clicked coords).
    let sites: CandidateSite[] = [makeMapClickSite(1, clicked.latitude, clicked.longitude)];
    const tracker = createPendingIdentityTracker();

    // 2. The reverse-geocode resolves asynchronously (as the network does).
    let resolveGeocode!: () => void;
    const geocode = new Promise<void>((resolve) => { resolveGeocode = resolve; });
    tracker.track('SITE-01', geocode.then(() => {
      const result = applySiteIdentity(sites, 'SITE-01', {
        name: 'Bill Graham Civic Auditorium',
        address: 'San Francisco, CA',
        state: 'CA',
      });
      sites = result.sites;
    }));
    expect(tracker.pendingCount()).toBe(1);

    // 3. Generate WITHOUT waiting (the OLD buggy ordering) sees the fallback…
    const snapshotBefore = sites.map((s) => s.name);
    expect(snapshotBefore).toEqual(['Map point 1']);

    // 4. The guarded Generate path: await settleAll FIRST, THEN snapshot.
    resolveGeocode();
    await tracker.settleAll();
    const payloadNames = sites.map((s) => s.name);
    expect(payloadNames).toEqual(['Bill Graham Civic Auditorium']);
    expect(MAP_POINT_FALLBACK_RE.test(payloadNames[0])).toBe(false);
    // Exact clicked coordinate still untouched after identity resolution.
    expect(sites[0].location).toEqual(clicked);
  });

  it('settleAll never rejects when the geocoder FAILS — the honest fallback survives', async () => {
    const tracker = createPendingIdentityTracker();
    tracker.track('SITE-01', Promise.reject(new Error('geocoder unreachable')));
    tracker.track('SITE-02', Promise.reject(new Error('network down')));
    await expect(tracker.settleAll(50)).resolves.toBeUndefined();
    expect(tracker.pendingCount()).toBe(0);
  });

  it('settleAll is bounded by a timeout — a dead geocoder never blocks Generate', async () => {
    const tracker = createPendingIdentityTracker();
    tracker.track('SITE-01', new Promise(() => undefined)); // never settles
    const started = Date.now();
    await tracker.settleAll(60);
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('multiple pending identities all settle before the snapshot', async () => {
    let sites: CandidateSite[] = [
      makeMapClickSite(1, 37.78, -122.40),
      makeMapClickSite(2, 37.79, -122.41),
    ];
    const tracker = createPendingIdentityTracker();
    const resolutions: Array<() => void> = [];
    for (const site of sites) {
      let r!: () => void;
      const p = new Promise<void>((resolve) => { r = resolve; });
      resolutions.push(r);
      tracker.track(site.locationId, p.then(() => {
        sites = applySiteIdentity(sites, site.locationId, { name: `Resolved ${site.locationId}` }).sites;
      }));
    }
    for (const r of resolutions) r();
    await tracker.settleAll();
    expect(sites.map((s) => s.name)).toEqual(['Resolved SITE-01', 'Resolved SITE-02']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GEOMETRY INTEGRITY — the identity/visual work must NOT touch geometry
// ─────────────────────────────────────────────────────────────────────────────

describe('geometry integrity — AOI + provider thermal geometry unchanged', () => {
  it('13. createAoiFromSpan output is byte-stable (golden values — AOI geometry untouched)', () => {
    const aoi = createAoiFromSpan({ latitude: 40.7128, longitude: -74.006 }, 1000, 'polygon');
    expect(aoi.type).toBe('FeatureCollection');
    expect(aoi.features).toHaveLength(1);
    const ring = (aoi.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    // Golden ring for a 1km square at (40.7128, -74.006) — locked values.
    expect(ring.map(([lng, lat]) => [Number(lng.toFixed(9)), Number(lat.toFixed(9))])).toEqual([
      [-74.011925624, 40.708308444],
      [-74.000074376, 40.708308444],
      [-74.000074376, 40.717291556],
      [-74.011925624, 40.717291556],
      [-74.011925624, 40.708308444],
    ]);
    // Circle shape produces the 32-gon approximation — ring of 33 points.
    const circleAoi = createAoiFromSpan({ latitude: 40.7128, longitude: -74.006 }, 1000, 'circle');
    const circleRing = (circleAoi.features[0].geometry as { coordinates: number[][][] }).coordinates[0];
    expect(circleRing).toHaveLength(33);
    expect(circleRing[0]).toEqual(circleRing[32]); // closed ring
  });

  it('14. the FIXTURE decision response replays provider thermal geometry VERBATIM (no stretch/clip/interpolation)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error('UNEXPECTED FETCH — FIXTURE is offline'); }) as typeof fetch;
    try {
      const res = await decisionPOST(fixtureRequestWithNamedCandidates());
      const data = await res.json();
      expect(res.status).toBe(200);

      // The response spatialField must be the capture's FeatureCollection,
      // feature-for-feature, geometry-for-geometry.
      const fixture = JSON.parse(
        readFileSync(join(process.cwd(), 'tests/fixtures/heatmap_captured_demo.json'), 'utf8'),
      ) as { hourlySnapshots: Array<{ aoi: PolygonAOI }> };
      const captured = fixture.hourlySnapshots[0].aoi;

      expect(data.spatialField.features).toHaveLength(captured.features.length); // 425
      for (let i = 0; i < captured.features.length; i++) {
        expect(data.spatialField.features[i].geometry).toEqual(captured.features[i].geometry);
        expect(data.spatialField.features[i].properties.average_temperature)
          .toBe(captured.features[i].properties.average_temperature);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
