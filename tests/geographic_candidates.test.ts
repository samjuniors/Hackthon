import { describe, it, expect } from 'vitest';

interface LocationPoint { latitude: number; longitude: number; }
interface CandidateLocation {
  locationId: string;
  name: string;
  location: LocationPoint;
}

const DEFAULT_CANDIDATE_LOCATIONS: CandidateLocation[] = [
  { locationId: 'LOC-A', name: 'Battery Park Greenway', location: { latitude: 40.7120, longitude: -74.0080 } },
  { locationId: 'LOC-B', name: 'City Hall Civic Center', location: { latitude: 40.7120, longitude: -73.9980 } },
  { locationId: 'LOC-C', name: 'Chinatown / Bowery',    location: { latitude: 40.7120, longitude: -73.9880 } },
];

function generateLiveCandidates(center: LocationPoint): CandidateLocation[] {
  const dLat = 400 / 111320;
  return [
    { locationId: 'SITE-N',      name: 'Site North',    location: { latitude: center.latitude + dLat * 0.25, longitude: center.longitude } },
    { locationId: 'SITE-CENTER', name: 'Site Center',   location: { latitude: center.latitude,               longitude: center.longitude } },
    { locationId: 'SITE-S',      name: 'Site South',    location: { latitude: center.latitude - dLat * 0.25, longitude: center.longitude } },
  ];
}

function resolveCandidates(mode: 'LIVE' | 'FIXTURE', center: LocationPoint, explicit?: CandidateLocation[]): CandidateLocation[] {
  if (explicit && explicit.length > 0) return explicit;
  return mode === 'LIVE' ? generateLiveCandidates(center) : DEFAULT_CANDIDATE_LOCATIONS;
}

function isWithinBoundingAOI(point: LocationPoint, center: LocationPoint): boolean {
  const dLat = 400 / 111320;
  const dLon = 400 / (111320 * Math.cos((center.latitude * Math.PI) / 180));
  return Math.abs(point.latitude - center.latitude) <= dLat && Math.abs(point.longitude - center.longitude) <= dLon;
}

const MANHATTAN_LAT = 40.7120;
const LA = { latitude: 34.0522, longitude: -118.2437 };
const SF = { latitude: 37.7749, longitude: -122.4194 };
const SD = { latitude: 32.7157, longitude: -117.1611 };
const EXPLICIT: CandidateLocation[] = [{ locationId: 'CUSTOM-1', name: 'Custom', location: { latitude: 51.5, longitude: -0.1 } }];

describe('Geographic Candidate Resolution', () => {

  describe('FIXTURE mode', () => {
    it('returns Manhattan defaults regardless of input location', () => {
      const c = resolveCandidates('FIXTURE', LA);
      expect(c).toHaveLength(3);
      expect(c.every(x => Math.abs(x.location.latitude - MANHATTAN_LAT) < 0.001)).toBe(true);
    });
    it('locationIds are LOC-A, LOC-B, LOC-C', () => {
      expect(resolveCandidates('FIXTURE', SF).map(x => x.locationId)).toEqual(['LOC-A', 'LOC-B', 'LOC-C']);
    });
    it('does not produce CA-adjacent candidates in FIXTURE mode', () => {
      expect(resolveCandidates('FIXTURE', SD).every(x => Math.abs(x.location.latitude - SD.latitude) > 5)).toBe(true);
    });
  });

  describe('LIVE mode', () => {
    it('generates 3 candidates for Los Angeles', () => {
      expect(resolveCandidates('LIVE', LA)).toHaveLength(3);
    });
    it('candidates are near LA not Manhattan', () => {
      const c = resolveCandidates('LIVE', LA);
      expect(c.every(x => Math.abs(x.location.latitude - LA.latitude) < 0.1)).toBe(true);
      expect(c.every(x => Math.abs(x.location.longitude - LA.longitude) < 0.1)).toBe(true);
    });
    it('no Manhattan coordinates in LA LIVE set', () => {
      expect(resolveCandidates('LIVE', LA).some(x => Math.abs(x.location.latitude - MANHATTAN_LAT) < 0.01)).toBe(false);
    });
    it('LA candidates within FortyGuard AOI polygon', () => {
      for (const c of resolveCandidates('LIVE', LA)) expect(isWithinBoundingAOI(c.location, LA)).toBe(true);
    });
    it('SF candidates within FortyGuard AOI polygon', () => {
      for (const c of resolveCandidates('LIVE', SF)) expect(isWithinBoundingAOI(c.location, SF)).toBe(true);
    });
    it('SD candidates within FortyGuard AOI polygon', () => {
      for (const c of resolveCandidates('LIVE', SD)) expect(isWithinBoundingAOI(c.location, SD)).toBe(true);
    });
    it('locationIds are SITE-N, SITE-CENTER, SITE-S', () => {
      expect(resolveCandidates('LIVE', LA).map(x => x.locationId)).toEqual(['SITE-N', 'SITE-CENTER', 'SITE-S']);
    });
    it('SITE-N is north of center, SITE-S is south', () => {
      const [n, ctr, s] = resolveCandidates('LIVE', LA);
      expect(n.location.latitude).toBeGreaterThan(ctr.location.latitude);
      expect(s.location.latitude).toBeLessThan(ctr.location.latitude);
    });
    it('SITE-CENTER is at exact user location', () => {
      const found = resolveCandidates('LIVE', LA).find(x => x.locationId === 'SITE-CENTER');
      expect(found).toBeTruthy();
      if (!found) return;
      expect(found.location.latitude).toBe(LA.latitude);
      expect(found.location.longitude).toBe(LA.longitude);
    });
    it('all longitudes match center (N-S axis only)', () => {
      expect(resolveCandidates('LIVE', SF).every(x => x.location.longitude === SF.longitude)).toBe(true);
    });
  });

  describe('Explicit candidates override', () => {
    it('LIVE mode respects explicit candidates', () => {
      const c = resolveCandidates('LIVE', LA, EXPLICIT);
      expect(c).toHaveLength(1);
      expect(c[0].locationId).toBe('CUSTOM-1');
    });
    it('FIXTURE mode respects explicit candidates', () => {
      const c = resolveCandidates('FIXTURE', LA, EXPLICIT);
      expect(c).toHaveLength(1);
      expect(c[0].locationId).toBe('CUSTOM-1');
    });
  });

  describe('Offset math', () => {
    it('north offset is ~100m (0.25 x 400m, inside AOI half-side)', () => {
      const [n, ctr] = resolveCandidates('LIVE', LA);
      const m = Math.abs(n.location.latitude - ctr.location.latitude) * 111320;
      expect(m).toBeCloseTo(100, 0);
    });
    it('all 3 candidates have distinct coordinates', () => {
      const coords = new Set(resolveCandidates('LIVE', LA).map(x => `${x.location.latitude},${x.location.longitude}`));
      expect(coords.size).toBe(3);
    });
  });
});
