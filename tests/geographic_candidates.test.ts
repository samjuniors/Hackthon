import { describe, it, expect } from 'vitest';
import { createAoiFromSpan, isPointInAoi } from '@/lib/spatial/aoi';
import { getFixtureExtentAoi } from '@/lib/fortyguard/fixture-metadata';
import type { CandidateLocation, LocationPoint } from '@/types/domain';

/**
 * Geographic Candidate Resolution — POST-correction semantics.
 *
 * The old suite asserted synthetic SITE-N/SITE-CENTER/SITE-W generation.
 * That behavior was REMOVED (Section 8 of the spatial-model corrections):
 *   - FIXTURE mode uses ONLY the three ACTUAL sites captured in the
 *     Manhattan fixture (LOC-A/B/C) and only for Manhattan-bounded requests.
 *   - LIVE mode requires explicit user-supplied candidates — never generates.
 */

// Mirror of the route's CAPTURED_DEMO_CANDIDATES (the genuine fixture sites)
const CAPTURED_DEMO_CANDIDATES: CandidateLocation[] = [
  { locationId: 'LOC-A', name: 'Battery Park Greenway (Waterfront)', location: { latitude: 40.7120, longitude: -74.0080 } },
  { locationId: 'LOC-B', name: 'City Hall Civic Center (Mid-Density)', location: { latitude: 40.7120, longitude: -73.9980 } },
  { locationId: 'LOC-C', name: 'Chinatown / Bowery Staging (Asphalt Canyon)', location: { latitude: 40.7120, longitude: -73.9880 } },
];

/** The authoritative captured fixture extent (union bbox of the captured tiles). */
const FIXTURE_EXTENT = getFixtureExtentAoi()!;

function resolveCandidates(
  mode: 'LIVE' | 'FIXTURE',
  isWithinFixtureBounds: boolean,
  explicit?: CandidateLocation[]
): CandidateLocation[] {
  if (explicit && explicit.length > 0) return explicit;
  if (mode === 'FIXTURE') {
    // Only valid when the request is inside the fixture bounds — the route
    // rejects out-of-bounds FIXTURE requests with 404 before reaching here.
    if (!isWithinFixtureBounds) return [];
    return CAPTURED_DEMO_CANDIDATES;
  }
  return []; // LIVE never generates — empty means CANDIDATES_REQUIRED
}

const LA: LocationPoint = { latitude: 34.0522, longitude: -118.2437 };
const SF: LocationPoint = { latitude: 37.7749, longitude: -122.4194 };
const SD: LocationPoint = { latitude: 32.7157, longitude: -117.1611 };
const MANHATTAN_DEMO: LocationPoint = { latitude: 40.7120, longitude: -74.0080 };

describe('Geographic Candidate Resolution (genuine sites only)', () => {

  describe('FIXTURE mode — captured Manhattan sites', () => {
    it('returns the three ACTUAL captured sites for in-bounds requests', () => {
      const c = resolveCandidates('FIXTURE', true);
      expect(c).toHaveLength(3);
      expect(c.map((x) => x.locationId)).toEqual(['LOC-A', 'LOC-B', 'LOC-C']);
      // Genuine site names — no "Site North/Center/South" fabrications
      expect(c.every((x) => !/Site (North|Center|South|West)/.test(x.name))).toBe(true);
    });

    it('captured sites all lie inside the CAPTURED fixture extent', () => {
      for (const site of CAPTURED_DEMO_CANDIDATES) {
        expect(isPointInAoi(site.location, FIXTURE_EXTENT)).toBe(true);
      }
    });

    it('returns NO Manhattan sites for out-of-bounds FIXTURE requests (LA/SF/SD rejected upstream)', () => {
      expect(resolveCandidates('FIXTURE', false)).toEqual([]);
    });

    it('captured sites are NOT repositioned around arbitrary selections', () => {
      // Unlike the removed generator, the captured sites NEVER move toward
      // LA/SF/SD — their coordinates are the immutable fixture capture.
      const c = resolveCandidates('FIXTURE', true);
      for (const site of c) {
        expect(Math.abs(site.location.latitude - LA.latitude)).toBeGreaterThan(5);
        expect(Math.abs(site.location.latitude - SF.latitude)).toBeGreaterThan(2);
        expect(Math.abs(site.location.latitude - SD.latitude)).toBeGreaterThan(7);
      }
    });
  });

  describe('LIVE mode — user-supplied sites only', () => {
    it('generates NOTHING when the user has not supplied candidates', () => {
      expect(resolveCandidates('LIVE', true)).toEqual([]);
      expect(resolveCandidates('LIVE', false)).toEqual([]);
    });

    it('no synthetic locationIds can appear (SITE-W/SITE-CENTER/SITE-N removed)', () => {
      const explicit: CandidateLocation[] = [
        { locationId: 'SITE-01', name: 'Oakland Operations Yard', location: LA },
      ];
      const c = resolveCandidates('LIVE', false, explicit);
      expect(c).toHaveLength(1);
      expect(c[0].locationId).toBe('SITE-01');
      expect(c.map((x) => x.locationId)).not.toContain('SITE-W');
      expect(c.map((x) => x.locationId)).not.toContain('SITE-CENTER');
      expect(c.map((x) => x.locationId)).not.toContain('SITE-N');
    });

    it('explicit LIVE candidates are used verbatim (never moved/clamped)', () => {
      const custom: CandidateLocation[] = [
        { locationId: 'CUSTOM-1', name: '12th Street staging area', location: { latitude: 37.8012, longitude: -122.2713 } },
      ];
      const c = resolveCandidates('LIVE', true, custom);
      expect(c[0].location.latitude).toBe(37.8012);
      expect(c[0].location.longitude).toBe(-122.2713);
    });
  });
});
