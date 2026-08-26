import { describe, it, expect } from 'vitest';
import {
  searchLocations,
  getPresetLocations,
  resolveLocationPoint,
  METROPOLITAN_LOCATIONS,
} from '@/lib/location/search';

describe('Location Search & Coordinate Resolution', () => {
  it('1. Returns preset locations for FIXTURE mode (Manhattan only)', () => {
    const fixturePresets = getPresetLocations(true);
    expect(fixturePresets.length).toBeGreaterThanOrEqual(3);
    for (const p of fixturePresets) {
      expect(p.isDemoOnly).toBe(true);
      expect(p.latitude).toBeCloseTo(40.7120, 2);
      expect(p.longitude).toBeCloseTo(-74.0, 1);
    }
  });

  it('2. Returns non-demo metropolitan hubs for LIVE mode', () => {
    const livePresets = getPresetLocations(false);
    expect(livePresets.length).toBeGreaterThanOrEqual(3);
    for (const p of livePresets) {
      expect(p.isDemoOnly).toBe(false);
    }
  });

  it('3. Searches locations by city name (e.g. "Los Angeles")', () => {
    const results = searchLocations('Los Angeles');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toContain('Los Angeles');
    expect(results[0].latitude).toBeCloseTo(34.0522, 2);
    expect(results[0].longitude).toBeCloseTo(-118.2437, 2);
  });

  it('4. Searches locations by ZIP code (e.g. "90012", "10007")', () => {
    const resultsLA = searchLocations('90012');
    expect(resultsLA.length).toBeGreaterThanOrEqual(1);
    expect(resultsLA[0].name).toContain('Los Angeles');

    const resultsNYC = searchLocations('10007');
    expect(resultsNYC.length).toBeGreaterThanOrEqual(1);
    expect(resultsNYC[0].name).toContain('City Hall');
  });

  it('5. Searches locations case-insensitively with partial strings (e.g. "austin", "phx", "phoenix")', () => {
    const austin = searchLocations('austin');
    expect(austin.length).toBeGreaterThanOrEqual(1);
    expect(austin[0].city).toBe('Austin');

    const phx = searchLocations('phoenix');
    expect(phx.length).toBeGreaterThanOrEqual(1);
    expect(phx[0].city).toBe('Phoenix');
  });

  it('6. Resolves custom point to deterministic NamedLocation', () => {
    const custom = resolveLocationPoint(37.7749, -122.4194, 'San Francisco Bay');
    expect(custom.latitude).toBeCloseTo(37.7749, 4);
    expect(custom.longitude).toBeCloseTo(-122.4194, 4);
  });

  it('7. Coordinates are deterministic numbers, never NaN or strings', () => {
    for (const loc of METROPOLITAN_LOCATIONS) {
      expect(typeof loc.latitude).toBe('number');
      expect(typeof loc.longitude).toBe('number');
      expect(Number.isFinite(loc.latitude)).toBe(true);
      expect(Number.isFinite(loc.longitude)).toBe(true);
      expect(loc.latitude).toBeGreaterThanOrEqual(-90);
      expect(loc.latitude).toBeLessThanOrEqual(90);
      expect(loc.longitude).toBeGreaterThanOrEqual(-180);
      expect(loc.longitude).toBeLessThanOrEqual(180);
    }
  });

  it('8. Searching an unlisted/unsupported town returns empty array (triggers empty-state UX)', () => {
    const unknownCity = searchLocations('SmallTown Nowhere USA');
    expect(unknownCity).toEqual([]);

    const gibberish = searchLocations('xyz123abc999');
    expect(gibberish).toEqual([]);
  });

  it('9. GPS coordinate fallback resolves arbitrary coordinates into a valid NamedLocation', () => {
    const gpsResolved = resolveLocationPoint(34.0522, -118.2437, 'My Current GPS Location');
    expect(gpsResolved.id).toBe('US-LAX'); // matches existing metro
    expect(gpsResolved.city).toBe('Los Angeles');

    const arbitraryPoint = resolveLocationPoint(38.5816, -121.4944, 'Sacramento Custom Point');
    expect(arbitraryPoint.id).toBe('CUSTOM-38.5816--121.4944');
    expect(arbitraryPoint.name).toBe('Sacramento Custom Point');
    expect(arbitraryPoint.category).toBe('Custom Location');
  });

  it('10. Searches locations by full state name (e.g. "California", "Texas")', () => {
    const californiaResults = searchLocations('California');
    expect(californiaResults.length).toBeGreaterThanOrEqual(3);
    const names = californiaResults.map((r) => r.name);
    expect(names.some((n) => n.includes('Los Angeles'))).toBe(true);
    expect(names.some((n) => n.includes('San Francisco'))).toBe(true);
    expect(names.some((n) => n.includes('San Diego'))).toBe(true);

    const texasResults = searchLocations('Texas');
    expect(texasResults.length).toBeGreaterThanOrEqual(2);
  });
});
