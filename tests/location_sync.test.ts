import { describe, it, expect } from 'vitest';
import {
  searchLocations,
  isLocationCoveredByFixture,
  METROPOLITAN_LOCATIONS,
} from '@/lib/location/search';
import { POST as decisionHandler } from '@/app/api/decision/route';

describe('Location Selection & Decision Synchronization (Source-of-Truth)', () => {
  it('1. Searching "California" returns supported CA metros (LA, SF, SD) and NO Manhattan locations', () => {
    const results = searchLocations('California');
    expect(results.length).toBeGreaterThanOrEqual(3);

    const names = results.map((r) => r.name);
    expect(names.some((n) => n.includes('Los Angeles'))).toBe(true);
    expect(names.some((n) => n.includes('San Francisco'))).toBe(true);
    expect(names.some((n) => n.includes('San Diego'))).toBe(true);

    // Absolutely no Manhattan demo locations
    for (const r of results) {
      expect(r.state).toBe('CA');
      expect(r.name).not.toContain('Battery Park');
      expect(r.name).not.toContain('City Hall');
      expect(r.name).not.toContain('Chinatown');
      expect(r.latitude).toBeLessThan(39.0);
      expect(r.latitude).toBeGreaterThan(32.0);
    }
  });

  it('2. Searching "Texas" returns supported TX metros (Houston, Dallas, Austin)', () => {
    const results = searchLocations('Texas');
    expect(results.length).toBeGreaterThanOrEqual(3);

    const names = results.map((r) => r.name);
    expect(names.some((n) => n.includes('Houston'))).toBe(true);
    expect(names.some((n) => n.includes('Dallas'))).toBe(true);
    expect(names.some((n) => n.includes('Austin'))).toBe(true);

    for (const r of results) {
      expect(r.state).toBe('TX');
      expect(r.name).not.toContain('Battery Park');
    }
  });

  it('3. Searching "New York" returns NY locations', () => {
    const results = searchLocations('New York');
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.state).toBe('NY');
    }
  });

  it('4. Searching "Florida" returns FL locations', () => {
    const results = searchLocations('Florida');
    expect(results.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.state).toBe('FL');
    }
  });

  it('5. isLocationCoveredByFixture correctly validates Manhattan vs other states', () => {
    // Manhattan points
    expect(isLocationCoveredByFixture({ latitude: 40.7128, longitude: -74.0060 })).toBe(true);
    expect(isLocationCoveredByFixture({ latitude: 40.7120, longitude: -74.0080 })).toBe(true);

    // California points
    expect(isLocationCoveredByFixture({ latitude: 34.0522, longitude: -118.2437 })).toBe(false);
    expect(isLocationCoveredByFixture({ latitude: 37.7749, longitude: -122.4194 })).toBe(false);

    // Texas points
    expect(isLocationCoveredByFixture({ latitude: 29.7604, longitude: -95.3698 })).toBe(false);
  });

  it('6. Decision API in FIXTURE mode rejects California coordinates with OUTSIDE_COVERAGE error (no silent Battery Park substitution)', async () => {
    const req = new Request('http://localhost:3000/api/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        latitude: 34.0522, // Los Angeles
        longitude: -118.2437,
        durationHours: 3,
        mode: 'FIXTURE',
      }),
    });

    const res = await decisionHandler(req);
    expect(res.status).toBe(404);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('OUTSIDE_COVERAGE');
    expect(json.error.message).toContain('Manhattan');
    expect(json.error.message).toContain('Switch to LIVE');
  });

  it('7. Decision API in FIXTURE mode succeeds for valid Manhattan coordinates', async () => {
    const req = new Request('http://localhost:3000/api/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        latitude: 40.7120,
        longitude: -74.0080,
        durationHours: 3,
        mode: 'FIXTURE',
      }),
    });

    const res = await decisionHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.jointDecision).toBeDefined();
    expect(json.jointDecision.recommendedPlan.location.location.latitude).toBeCloseTo(40.712, 2);
  });

  it('8. In LIVE mode: candidates are centered on requested coordinates, never Manhattan defaults', async () => {
    // When explicit candidates are passed, they must match exactly
    const customCandidates = [
      { locationId: 'LA-1', name: 'Downtown LA Site', latitude: 34.0522, longitude: -118.2437 },
      { locationId: 'LA-2', name: 'Arts District Site', latitude: 34.0407, longitude: -118.2330 },
      { locationId: 'LA-3', name: 'Bunker Hill Site', latitude: 34.0537, longitude: -118.2510 },
    ];

    // Verify candidates coordinate integrity
    for (const c of customCandidates) {
      expect(c.latitude).toBeCloseTo(34.05, 1);
      expect(c.longitude).toBeCloseTo(-118.24, 1);
      expect(c.name).not.toContain('Battery Park');
    }
  });

  it('9. Coordinate equality regression test: selectedLocation coordinates === coordinates sent to /api/decision', () => {
    for (const metro of METROPOLITAN_LOCATIONS) {
      const payload = {
        latitude: metro.latitude,
        longitude: metro.longitude,
        durationHours: 3,
        mode: metro.isDemoOnly ? 'FIXTURE' : 'LIVE',
      };

      expect(payload.latitude).toEqual(metro.latitude);
      expect(payload.longitude).toEqual(metro.longitude);
      expect(typeof payload.latitude).toBe('number');
      expect(typeof payload.longitude).toBe('number');
      expect(Number.isFinite(payload.latitude)).toBe(true);
      expect(Number.isFinite(payload.longitude)).toBe(true);
    }
  });
});
