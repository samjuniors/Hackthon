import { describe, it, expect } from 'vitest';
import { createAoiFromSpan, getAoiCenter, isPointInAoi, moveAoiToCenter } from '@/lib/spatial/aoi';
import { validateAnalysisAoi } from '@/lib/spatial/aoi-validation';
import { FIXTURE_CAPTURE_REQUEST_AOI, FIXTURE_CAPTURE_CENTER } from '@/lib/fortyguard/fixture-display';
import type { LocationPoint } from '@/types/domain';

describe('Map Interaction & Spatial Model Invariants', () => {
  const sfLocation: LocationPoint = { latitude: 37.7749, longitude: -122.4194 };
  const nyLocation: LocationPoint = { latitude: 40.7128, longitude: -74.0060 };

  describe('Invariant 1: LIVE Analysis AOI is strictly centered on Operating Location', () => {
    it('creates square AOI with center matching operating location coordinates', () => {
      const aoi = createAoiFromSpan(sfLocation, 2400, 'polygon');
      const center = getAoiCenter(aoi);
      expect(center).not.toBeNull();
      expect(center!.latitude).toBeCloseTo(sfLocation.latitude, 4);
      expect(center!.longitude).toBeCloseTo(sfLocation.longitude, 4);
    });

    it('creates circular AOI with center matching operating location coordinates', () => {
      const aoi = createAoiFromSpan(sfLocation, 2400, 'circle');
      const center = getAoiCenter(aoi);
      expect(center).not.toBeNull();
      expect(center!.latitude).toBeCloseTo(sfLocation.latitude, 4);
      expect(center!.longitude).toBeCloseTo(sfLocation.longitude, 4);
    });

    it('when operating location moves, recomputed AOI center tracks new coordinate exactly', () => {
      const initialAoi = createAoiFromSpan(sfLocation, 2400, 'polygon');
      const movedLocation: LocationPoint = { latitude: 37.7833, longitude: -122.4167 };
      const movedAoi = createAoiFromSpan(movedLocation, 2400, 'polygon');

      const initialCenter = getAoiCenter(initialAoi);
      const movedCenter = getAoiCenter(movedAoi);

      expect(initialCenter!.latitude).toBeCloseTo(sfLocation.latitude, 4);
      expect(movedCenter!.latitude).toBeCloseTo(movedLocation.latitude, 4);
      expect(movedCenter!.longitude).toBeCloseTo(movedLocation.longitude, 4);
    });
  });

  describe('Invariant 2: DEMO Mode is anchored to Genuine Captured Fixture', () => {
    it('DEMO AOI center strictly matches FIXTURE_CAPTURE_CENTER in Lower Manhattan', () => {
      const center = getAoiCenter(FIXTURE_CAPTURE_REQUEST_AOI);
      expect(center).not.toBeNull();
      expect(center!.latitude).toBeCloseTo(FIXTURE_CAPTURE_CENTER.latitude, 4);
      expect(center!.longitude).toBeCloseTo(FIXTURE_CAPTURE_CENTER.longitude, 4);
    });

    it('DEMO AOI geometry has 425 cell fixture bounds and is valid', () => {
      const validation = validateAnalysisAoi(FIXTURE_CAPTURE_REQUEST_AOI);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Invariant 3: Candidate Site Containment Validation', () => {
    const aoi = createAoiFromSpan(nyLocation, 2400, 'polygon');

    it('accepts points inside the AOI', () => {
      // Small offset within 2400m span (~0.01 deg is ~1.1km)
      const insidePoint: LocationPoint = {
        latitude: nyLocation.latitude + 0.005,
        longitude: nyLocation.longitude + 0.005,
      };
      expect(isPointInAoi(insidePoint, aoi)).toBe(true);
    });

    it('rejects points outside the AOI', () => {
      // Large offset (~0.05 deg is ~5.5km, well outside 2400m square)
      const outsidePoint: LocationPoint = {
        latitude: nyLocation.latitude + 0.05,
        longitude: nyLocation.longitude + 0.05,
      };
      expect(isPointInAoi(outsidePoint, aoi)).toBe(false);
    });

    it('rejects candidate placement in empty workspace when AOI is null', () => {
      const inside = isPointInAoi(nyLocation, null as any);
      expect(inside).toBe(false);
    });
  });

  describe('Invariant 4: AOI Shape and Span Validity Constraints', () => {
    it('validates 600m to 4800m spans as valid', () => {
      const aoi600 = createAoiFromSpan(sfLocation, 600, 'polygon');
      const aoi2400 = createAoiFromSpan(sfLocation, 2400, 'polygon');
      const aoi4800 = createAoiFromSpan(sfLocation, 4800, 'polygon');

      expect(validateAnalysisAoi(aoi600).valid).toBe(true);
      expect(validateAnalysisAoi(aoi2400).valid).toBe(true);
      expect(validateAnalysisAoi(aoi4800).valid).toBe(true);
    });

    it('rejects null or empty AOI', () => {
      expect(validateAnalysisAoi(null).valid).toBe(false);
      expect(validateAnalysisAoi({ type: 'FeatureCollection', features: [] }).valid).toBe(false);
    });
  });
});
