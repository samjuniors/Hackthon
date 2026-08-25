import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  celsiusToFahrenheit,
  celsiusDeltaToFahrenheitDelta,
  fmtTemp,
  fmtTempDelta,
  fmtTempValue,
  tempUnitSuffix,
  getThermalLegendTicks,
  loadTempUnit,
  saveTempUnit,
  DEFAULT_TEMP_UNIT,
  TEMP_UNIT_KEY,
  translateExplanationToUnit,
} from '@/lib/temperature';

describe('Temperature Unit Conversion & Formatting Utility', () => {
  describe('celsiusToFahrenheit (Absolute Temperatures)', () => {
    it('converts freezing point 0°C -> 32°F', () => {
      expect(celsiusToFahrenheit(0)).toBe(32);
    });

    it('converts boiling point 100°C -> 212°F', () => {
      expect(celsiusToFahrenheit(100)).toBe(212);
    });

    it('converts cross-over point -40°C -> -40°F', () => {
      expect(celsiusToFahrenheit(-40)).toBe(-40);
    });

    it('converts negative temperatures correctly', () => {
      expect(celsiusToFahrenheit(-10)).toBe(14);
      expect(celsiusToFahrenheit(-20)).toBe(-4);
    });

    it('converts typical ambient/thermal values with precision', () => {
      expect(celsiusToFahrenheit(25)).toBe(77);
      expect(celsiusToFahrenheit(30)).toBe(86);
      expect(celsiusToFahrenheit(29.83)).toBeCloseTo(85.694, 3);
    });
  });

  describe('celsiusDeltaToFahrenheitDelta (Temperature Deltas)', () => {
    it('converts zero delta without adding 32 offset', () => {
      expect(celsiusDeltaToFahrenheitDelta(0)).toBe(0);
    });

    it('scales delta by 9/5 without adding 32 (ΔF = ΔC * 1.8)', () => {
      expect(celsiusDeltaToFahrenheitDelta(1)).toBe(1.8);
      expect(celsiusDeltaToFahrenheitDelta(2)).toBe(3.6);
      expect(celsiusDeltaToFahrenheitDelta(2.2)).toBeCloseTo(3.96, 4);
      expect(celsiusDeltaToFahrenheitDelta(3.07)).toBeCloseTo(5.526, 4);
    });

    it('converts negative deltas correctly without 32 offset', () => {
      expect(celsiusDeltaToFahrenheitDelta(-1)).toBe(-1.8);
      expect(celsiusDeltaToFahrenheitDelta(-5)).toBe(-9);
    });
  });

  describe('fmtTemp (Formatted Absolute Temperatures)', () => {
    it('formats Celsius temperatures with unit suffix and 2 decimal places by default', () => {
      expect(fmtTemp(25.5, 'C')).toBe('25.50°C');
      expect(fmtTemp(0, 'C')).toBe('0.00°C');
      expect(fmtTemp(-5.123, 'C')).toBe('-5.12°C');
    });

    it('formats Fahrenheit temperatures with unit suffix and 2 decimal places by default', () => {
      expect(fmtTemp(0, 'F')).toBe('32.00°F');
      expect(fmtTemp(25, 'F')).toBe('77.00°F');
      expect(fmtTemp(29.83, 'F')).toBe('85.69°F');
      expect(fmtTemp(-40, 'F')).toBe('-40.00°F');
    });

    it('supports custom decimal precision', () => {
      expect(fmtTemp(25, 'C', 0)).toBe('25°C');
      expect(fmtTemp(25, 'F', 0)).toBe('77°F');
      expect(fmtTemp(25.1234, 'C', 3)).toBe('25.123°C');
    });
  });

  describe('fmtTempDelta (Formatted Temperature Deltas)', () => {
    it('formats positive deltas with leading + sign in Celsius', () => {
      expect(fmtTempDelta(2.2, 'C')).toBe('+2.20°C');
      expect(fmtTempDelta(3.07, 'C')).toBe('+3.07°C');
    });

    it('formats positive deltas with leading + sign in Fahrenheit (scaled, no +32)', () => {
      expect(fmtTempDelta(2.2, 'F')).toBe('+3.96°F');
      expect(fmtTempDelta(3.07, 'F')).toBe('+5.53°F');
    });

    it('formats zero delta without + sign', () => {
      expect(fmtTempDelta(0, 'C')).toBe('0.00°C');
      expect(fmtTempDelta(0, 'F')).toBe('0.00°F');
    });

    it('formats negative deltas with minus sign in both units', () => {
      expect(fmtTempDelta(-1.5, 'C')).toBe('-1.50°C');
      expect(fmtTempDelta(-1.5, 'F')).toBe('-2.70°F');
    });
  });

  describe('fmtTempValue & tempUnitSuffix', () => {
    it('returns raw numeric string value without suffix', () => {
      expect(fmtTempValue(29.83, 'C')).toBe('29.83');
      expect(fmtTempValue(29.83, 'F')).toBe('85.69');
      expect(fmtTempValue(0, 'F')).toBe('32.00');
    });

    it('returns unit suffix strings', () => {
      expect(tempUnitSuffix('C')).toBe('°C');
      expect(tempUnitSuffix('F')).toBe('°F');
    });
  });

  describe('getThermalLegendTicks', () => {
    it('returns Celsius ticks matching expected domain breakpoints', () => {
      const ticks = getThermalLegendTicks('C');
      expect(ticks).toHaveLength(4);
      expect(ticks[0].label).toBe('≤28');
      expect(ticks[1].label).toBe('28-30');
      expect(ticks[2].label).toBe('30-32');
      expect(ticks[3].label).toBe('>32');
    });

    it('returns Fahrenheit ticks with converted integer approximations', () => {
      const ticks = getThermalLegendTicks('F');
      expect(ticks).toHaveLength(4);
      // 28°C = 82.4°F -> 82
      expect(ticks[0].label).toBe('≤82');
      // 28-30°C = 82-86°F
      expect(ticks[1].label).toBe('82-86');
      // 30-32°C = 86-90°F
      expect(ticks[2].label).toBe('86-90');
      // >32°C = >90°F
      expect(ticks[3].label).toBe('>90');
    });
  });

  describe('loadTempUnit & saveTempUnit (Persistence)', () => {
    const mockStorage: Record<string, string> = {};

    beforeEach(() => {
      for (const k in mockStorage) delete mockStorage[k];

      vi.stubGlobal('localStorage', {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn((key: string, val: string) => {
          mockStorage[key] = val;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
      });
    });

    it('defaults to DEFAULT_TEMP_UNIT (F) when storage is empty', () => {
      expect(DEFAULT_TEMP_UNIT).toBe('F');
      expect(loadTempUnit()).toBe('F');
    });

    it('persists and retrieves C preference', () => {
      saveTempUnit('C');
      expect(loadTempUnit()).toBe('C');
    });

    it('persists and retrieves F preference', () => {
      saveTempUnit('F');
      expect(loadTempUnit()).toBe('F');
    });

    it('falls back to default F when storage contains invalid data', () => {
      mockStorage[TEMP_UNIT_KEY] = 'INVALID';
      expect(loadTempUnit()).toBe('F');
    });
  });

  describe('translateExplanationToUnit', () => {
    const mockExplanation = {
      summary: 'Recommended Plan: Deploy to LOC-A from 10:00 to 13:00 UTC. The mean modeled temperature is 21.25°C.',
      whyThisPlan: 'This plan achieved the lowest modeled exposure score (21.25°C). Deploying here avoids a +1.20°C modeled exposure delta compared to the highest-exposure feasible plan.',
      constraintImpact: 'Constraint Cost of +6.84°C mean modeled temperature increase.',
      epistemicNotice: 'Notice text.',
      generatedBy: 'DETERMINISTIC_FALLBACK' as const,
      dataSource: 'FIXTURE' as const,
      modelVersion: 'v1.0.0-spatial-thermal-baseline',
      evidenceGrounding: { 
        referencedTemperatures: [30.5],
        referencedLocations: ['LOC_1'],
        referencedTimes: ['12:00'],
        allowedNumbers: [30.5]
      }
    };

    it('returns the same object if unit is C', () => {
      const translated = translateExplanationToUnit(mockExplanation, 'C');
      expect(translated).toEqual(mockExplanation);
    });

    it('translates absolute temperatures and deltas to F correctly', () => {
      const translated = translateExplanationToUnit(mockExplanation, 'F');
      
      // 21.25°C -> 70.25°F
      expect(translated.summary).toContain('70.25°F');
      expect(translated.summary).not.toContain('21.25°C');
      
      // +1.20°C (delta) -> +2.16°F
      expect(translated.whyThisPlan).toContain('70.25°F');
      expect(translated.whyThisPlan).toContain('+2.16°F');
      
      // +6.84°C (delta) -> +12.31°F
      expect(translated.constraintImpact).toContain('+12.31°F');
    });

    it('handles negative deltas correctly', () => {
      const expl = {
        ...mockExplanation,
        whyThisPlan: 'Saved -0.50°C overall.'
      };
      const translated = translateExplanationToUnit(expl, 'F');
      // -0.50 * 1.8 = -0.90
      expect(translated.whyThisPlan).toContain('-0.90°F');
    });
  });
});

