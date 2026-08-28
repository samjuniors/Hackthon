import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

import { createAoiFromSpan } from '@/lib/spatial/aoi';
import {
  resolveCandidateAdd,
  candidateInputFromLocation,
  type CandidateSite,
} from '@/hooks/use-candidate-sites';
import {
  resolveSearchKeyAction,
  isDuplicateCandidateResult,
} from '@/lib/workspace/candidate-search-model';
import type { NamedLocation } from '@/types/provider';
import type { LocationPoint, PolygonAOI } from '@/types/domain';

/**
 * CANDIDATE-SITE SEARCH TESTS — the interaction + separation contract.
 *
 * The candidate-site search is EXPLICIT and SEPARATE from the analysis-location
 * search: selecting a result creates ONLY candidate state (never moves the AOI,
 * never changes the analysis location/WHEN/resolution/mode, never calls
 * FortyGuard). Pure interaction logic (keyboard model, add/duplicate/outside
 * decisions) is tested directly; page/map/rail wiring is asserted as a source
 * contract (the established pattern in tests/workspace-interaction.test.ts).
 */

const pageSrc = readFileSync(resolvePath(process.cwd(), 'src/app/page.tsx'), 'utf8');
const mapSrc = readFileSync(resolvePath(process.cwd(), 'src/components/ThermalMap.tsx'), 'utf8');
const railSrc = readFileSync(resolvePath(process.cwd(), 'src/components/dashboard/ControlRail.tsx'), 'utf8');
const searchSrc = readFileSync(
  resolvePath(process.cwd(), 'src/components/dashboard/CandidateSiteSearch.tsx'),
  'utf8',
);
const routeSrc = readFileSync(
  resolvePath(process.cwd(), 'src/app/api/location/search/route.ts'),
  'utf8',
);

// ── helpers ────────────────────────────────────────────────────────────────

const MANHATTAN: LocationPoint = { latitude: 40.712, longitude: -73.998 };
const NEW_JERSEY: LocationPoint = { latitude: 40.73, longitude: -74.15 };

const AOI: PolygonAOI = createAoiFromSpan(MANHATTAN, 400, 'polygon');

function geoResult(
  id: string,
  name: string,
  lat: number,
  lng: number,
  city?: string,
  state?: string,
): NamedLocation {
  return {
    id,
    name,
    displayName: `${name}, ${city ?? ''} ${state ?? ''}`.trim(),
    category: 'Custom Location',
    latitude: lat,
    longitude: lng,
    city,
    state,
    resultType: 'poi',
  };
}

/** Three genuine-looking geocoder results inside the AOI + one far outside. */
const RESULTS: NamedLocation[] = [
  geoResult('r1', 'City Hall Park', 40.7125, -73.9975, 'New York', 'NY'),
  geoResult('r2', 'Brooklyn Bridge–City Hall', 40.7115, -73.9965, 'New York', 'NY'),
  geoResult('r3', 'Woolworth Building', 40.7127, -73.9979, 'New York', 'NY'),
];
const OUTSIDE_RESULT = geoResult('r-far', ' Newark Penn Station', 40.735, -74.1627, 'Newark', 'NJ');

/** Extract a named useCallback handler body from page source. */
function handlerBody(src: string, name: string): string {
  const start = src.indexOf(`const ${name} = useCallback(`);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf('}, [', start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/** Strip /* block *​/ and // line comments — code-only text for call assertions. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Interaction simulator mirroring the CandidateSiteSearch component state
 * machine: keyboard actions drive highlight/select/close, and a selection runs
 * the REAL production logic (candidateInputFromLocation + resolveCandidateAdd).
 */
interface SessionState {
  sites: CandidateSite[];
  open: boolean;
  highlight: number;
  nextId: number;
}

function startSession(existing: CandidateSite[] = []): SessionState {
  // Post-typing state: results displayed, nothing highlighted.
  return { sites: existing, open: true, highlight: -1, nextId: existing.length + 1 };
}

function applyKey(
  state: SessionState,
  key: string,
  results: NamedLocation[],
  aoi: PolygonAOI,
): SessionState {
  const action = resolveSearchKeyAction(key, state.highlight, results.length);
  if (action.type === 'noop') return state;
  if (action.type === 'highlight') return { ...state, open: true, highlight: action.index };
  if (action.type === 'close') return { ...state, open: false, highlight: -1 };
  // 'select': Enter with the results CLOSED re-opens them (component rule).
  if (!state.open) return { ...state, open: true, highlight: action.index };
  const loc = results[action.index];
  const outcome = resolveCandidateAdd(
    state.sites,
    `SITE-${String(state.nextId).padStart(2, '0')}`,
    candidateInputFromLocation(loc),
    aoi,
  );
  if (outcome.status === 'added') {
    return { sites: [...state.sites, outcome.site], open: false, highlight: -1, nextId: state.nextId + 1 };
  }
  // duplicate → nothing created, list closed; outside-aoi → results stay open.
  return { ...state, open: outcome.status === 'outside-aoi', highlight: -1 };
}

// ── keyboard interaction model ─────────────────────────────────────────────

describe('candidate search: keyboard model (resolveSearchKeyAction)', () => {
  it('ArrowDown starts at the first row and wraps', () => {
    expect(resolveSearchKeyAction('ArrowDown', -1, 3)).toEqual({ type: 'highlight', index: 0 });
    expect(resolveSearchKeyAction('ArrowDown', 0, 3)).toEqual({ type: 'highlight', index: 1 });
    expect(resolveSearchKeyAction('ArrowDown', 2, 3)).toEqual({ type: 'highlight', index: 0 });
  });

  it('ArrowUp moves up and wraps to the last row', () => {
    expect(resolveSearchKeyAction('ArrowUp', 1, 3)).toEqual({ type: 'highlight', index: 0 });
    expect(resolveSearchKeyAction('ArrowUp', 0, 3)).toEqual({ type: 'highlight', index: 2 });
  });

  it('Enter selects the highlighted row, or the FIRST row when nothing is highlighted', () => {
    expect(resolveSearchKeyAction('Enter', -1, 3)).toEqual({ type: 'select', index: 0 });
    expect(resolveSearchKeyAction('Enter', 2, 3)).toEqual({ type: 'select', index: 2 });
  });

  it('Escape closes without selecting; other keys do nothing', () => {
    expect(resolveSearchKeyAction('Escape', 1, 3)).toEqual({ type: 'close' });
    expect(resolveSearchKeyAction('a', -1, 3)).toEqual({ type: 'noop' });
    expect(resolveSearchKeyAction('Tab', 0, 3)).toEqual({ type: 'noop' });
  });

  it('with zero results nothing is selectable', () => {
    expect(resolveSearchKeyAction('Enter', -1, 0)).toEqual({ type: 'noop' });
    expect(resolveSearchKeyAction('ArrowDown', -1, 0)).toEqual({ type: 'noop' });
    expect(resolveSearchKeyAction('Escape', -1, 0)).toEqual({ type: 'close' });
  });
});

// ── A–F: the add interaction outcomes ──────────────────────────────────────

describe('candidate search: add outcomes (A–F)', () => {
  it('A. click/Enter on a search result adds THAT exact result as a candidate', () => {
    // A click runs the same selectResult path as Enter — the exact result
    // object under the cursor/highlight is what gets added.
    const outcome = resolveCandidateAdd([], 'SITE-01', candidateInputFromLocation(RESULTS[0]), AOI);
    expect(outcome.status).toBe('added');
    if (outcome.status !== 'added') return;
    expect(outcome.site.name).toBe('City Hall Park');
    expect(outcome.site.locationId).toBe('SITE-01');
    expect(outcome.site.origin).toBe('search');
    expect(outcome.site.address).toBe('New York, NY');
    expect(outcome.site.state).toBe('NY');
  });

  it('B. Enter with nothing highlighted adds the FIRST result', () => {
    const end = applyKey(startSession(), 'Enter', RESULTS, AOI);
    expect(end.sites).toHaveLength(1);
    expect(end.sites[0].name).toBe(RESULTS[0].name);
    expect(end.sites[0].location.latitude).toBe(RESULTS[0].latitude);
    expect(end.sites[0].location.longitude).toBe(RESULTS[0].longitude);
  });

  it('C. ArrowDown + Enter adds the correctly highlighted (second) result', () => {
    let s = startSession();
    s = applyKey(s, 'ArrowDown', RESULTS, AOI); // → index 0
    s = applyKey(s, 'ArrowDown', RESULTS, AOI); // → index 1
    expect(s.highlight).toBe(1);
    s = applyKey(s, 'Enter', RESULTS, AOI);
    expect(s.sites).toHaveLength(1);
    expect(s.sites[0].name).toBe(RESULTS[1].name); // Brooklyn Bridge–City Hall
    expect(s.sites[0].location.latitude).toBe(RESULTS[1].latitude);
    expect(s.sites[0].location.longitude).toBe(RESULTS[1].longitude);
  });

  it('D. Escape closes the results and adds NOTHING', () => {
    let s = startSession();
    s = applyKey(s, 'Escape', RESULTS, AOI);
    expect(s.sites).toHaveLength(0);
    expect(s.open).toBe(false);
    // Escape after highlighting still adds nothing.
    let t = startSession();
    t = applyKey(t, 'ArrowDown', RESULTS, AOI);
    t = applyKey(t, 'Escape', RESULTS, AOI);
    expect(t.sites).toHaveLength(0);
    expect(t.open).toBe(false);
  });

  it('E. an outside-AOI result is REJECTED — never added, never clamped', () => {
    const outcome = resolveCandidateAdd(
      [],
      'SITE-01',
      candidateInputFromLocation(OUTSIDE_RESULT),
      AOI,
    );
    expect(outcome.status).toBe('outside-aoi');
    // The rejected coordinate never enters the site list in ANY form.
    const end = applyKey(startSession(), 'Enter', [OUTSIDE_RESULT], AOI);
    expect(end.sites).toHaveLength(0);
    expect(end.sites.map((s) => [s.location.latitude, s.location.longitude])).not.toContainEqual([
      OUTSIDE_RESULT.latitude,
      OUTSIDE_RESULT.longitude,
    ]);
  });

  it('F. re-selecting an exact coordinate creates NO duplicate — the existing site is returned', () => {
    const first = resolveCandidateAdd([], 'SITE-01', candidateInputFromLocation(RESULTS[0]), AOI);
    expect(first.status).toBe('added');
    const sites = first.status === 'added' ? [first.site] : [];
    const second = resolveCandidateAdd(sites, 'SITE-02', candidateInputFromLocation(RESULTS[0]), AOI);
    expect(second.status).toBe('duplicate');
    if (second.status !== 'duplicate') return;
    expect(second.existing.locationId).toBe('SITE-01');
    // End-to-end through the interaction model: two Enters → ONE candidate.
    let s = startSession();
    s = applyKey(s, 'Enter', RESULTS, AOI);
    s = applyKey(s, 'Enter', RESULTS, AOI);
    expect(s.sites).toHaveLength(1);
    // A DIFFERENT result still adds normally alongside the first.
    s = applyKey(s, 'Enter', RESULTS, AOI);
    // (dropdown was closed by the duplicate — reopen first, mirroring the UI)
    s = { ...s, open: true };
    s = applyKey(s, 'Enter', [RESULTS[1]], AOI);
    expect(s.sites).toHaveLength(2);
    expect(s.sites.map((x) => x.name)).toEqual([RESULTS[0].name, RESULTS[1].name]);
  });
});

// ── J (state): exact coordinate preservation ───────────────────────────────

describe('candidate search: coordinate exactness (J, state leg)', () => {
  it('preserves the EXACT returned latitude/longitude (no rounding)', () => {
    const exactLat = 40.712817293847562;
    const exactLng = -73.99812348761234;
    const loc = geoResult('r-exact', 'Exact Point', exactLat, exactLng, 'New York', 'NY');
    const outcome = resolveCandidateAdd([], 'SITE-01', candidateInputFromLocation(loc), AOI);
    expect(outcome.status).toBe('added');
    if (outcome.status !== 'added') return;
    expect(outcome.site.location.latitude).toBe(exactLat);
    expect(outcome.site.location.longitude).toBe(exactLng);
  });

  it('isDuplicateCandidateResult matches ONLY exact coordinates', () => {
    const site = {
      locationId: 'SITE-01',
      name: 'X',
      location: { latitude: 40.7125, longitude: -73.9975 },
      origin: 'search' as const,
    };
    expect(isDuplicateCandidateResult([site], { latitude: 40.7125, longitude: -73.9975 })).toBe(true);
    expect(isDuplicateCandidateResult([site], { latitude: 40.7125001, longitude: -73.9975 })).toBe(false);
    expect(isDuplicateCandidateResult([], { latitude: 40.7125, longitude: -73.9975 })).toBe(false);
  });

  it('candidateInputFromLocation maps name + locality line', () => {
    const input = candidateInputFromLocation(geoResult('r1', 'City Hall Park, Manhattan (North)', 40.71, -73.99, 'New York', 'NY'));
    expect(input.name).toBe('City Hall Park');
    expect(input.address).toBe('New York, NY');
    expect(input.state).toBe('NY');
    expect(input.latitude).toBe(40.71);
    expect(input.longitude).toBe(-73.99);
  });
});

// ── G/H/I: separation — search side-effect contracts (source) ──────────────

describe('candidate search: separation contracts (G, H, I)', () => {
  const addHandler = handlerBody(pageSrc, 'handleAddSiteFromSearch');
  const addHandlerCode = stripComments(addHandler);
  const searchCode = stripComments(searchSrc);

  it('G. candidate search performs ZERO FortyGuard / decision-pipeline calls', () => {
    // The handler must not trigger the pipeline or any provider fetch.
    expect(addHandlerCode).not.toContain('runDecisionPipeline');
    expect(addHandlerCode).not.toContain('/api/decision');
    expect(addHandlerCode).not.toContain('fetch(');
    expect(addHandlerCode).not.toMatch(/fortyguard/i);
    // The search component's ONLY network call is the credit-free geocoder.
    expect(searchCode).toContain('/api/location/search?q=');
    const fetchCount = (searchCode.match(/fetch\(/g) ?? []).length;
    expect(fetchCount).toBe(1);
    expect(searchCode).not.toContain('/api/decision');
    expect(searchCode).not.toMatch(/fortyguard/i);
    expect(searchCode).not.toContain("@/lib/fortyguard");
    // The geocoding endpoint itself is credit-free by contract.
    expect(routeSrc).toContain('This endpoint NEVER calls FortyGuard');
  });

  it('H. candidate search leaves the AOI unchanged', () => {
    expect(addHandler).not.toContain('setAoiCenter');
    expect(addHandler).not.toContain('aoiCenterRef.current =');
    // Camera-only reveal is allowed; the canonical AOI center is untouched.
  });

  it('I. candidate search leaves the selected analysis location unchanged', () => {
    expect(addHandler).not.toContain('setSelectedLocation');
    expect(addHandler).not.toContain('selectedLocationRef.current =');
  });

  it('the candidate search is a SEPARATE component from the analysis-location search', () => {
    expect(railSrc).toContain('<CandidateSiteSearch');
    expect(railSrc).toContain('<LocationSearch');
    // The Location (AOI) search and the candidate search are distinct usages.
    expect(searchSrc).toContain('Search a place or address');
  });
});

// ── J (pin + list legs) / K / L: identity + rendering contracts (source) ───

describe('candidate search: pin/list/Generate contracts (J, K, L)', () => {
  it('J. the map pin is anchored to the EXACT candidate state coordinate', () => {
    // MapLibre Marker with anchor:'bottom' set from the candidate state value.
    expect(mapSrc).toContain('setLngLat([item.location.longitude, item.location.latitude])');
    expect(mapSrc).toContain("anchor: 'bottom'");
    expect(mapSrc).not.toContain('new maplibregl.CircleMarker');
    expect(mapSrc).not.toMatch(/CircleMarker/);
  });

  it('K. added candidates appear in the candidate list, keyed by the stable id', () => {
    expect(railSrc).toContain('data-testid="candidate-sites-list"');
    expect(railSrc).toContain('data-location-id={site.locationId}');
    expect(railSrc).toContain('`candidate-row-${site.locationId}`');
    // The list renders the SAME state coordinates shown by the pin.
    expect(railSrc).toContain('site.location.latitude.toFixed(6)');
    expect(railSrc).toContain('site.location.longitude.toFixed(6)');
    // Search-added sites show their address/locality line.
    expect(railSrc).toContain('{site.address}');
    // Remove affordance is present per row.
    expect(railSrc).toMatch(/Remove/);
  });

  it('L. Generate submits the candidate coordinates EXACTLY as stored', () => {
    const genHandler = handlerBody(pageSrc, 'handleGenerate');
    expect(genHandler).toContain('candidateSitesRef.current.map');
    expect(genHandler).toContain('location: s.location');
  });

  it('outside-AOI presentation: required message + move-AOI / choose-another options', () => {
    expect(searchSrc).toContain('Site is outside the analysis area.');
    expect(searchSrc).toContain('Move analysis area here');
    expect(searchSrc).toContain('Choose another result');
  });
});
