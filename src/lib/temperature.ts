'use client';

import { useSyncExternalStore, useCallback } from 'react';
import type { DecisionExplanation } from '@/types/explanation';

/**
 * Temperature Unit Utility — Thermal Decision Engine
 *
 * DESIGN INVARIANTS:
 *  1. All FortyGuard API data, domain calculations, evidence bundles,
 *     and stored decision scores remain in Celsius.
 *  2. This module is the SINGLE source of truth for UI display conversion.
 *  3. Ordinary temperatures: F = C × 9/5 + 32
 *  4. Temperature DELTAS:    ΔF = ΔC × 9/5  (no +32 offset)
 *  5. The grounding validator EvidenceBundle stays Celsius; conversions
 *     never feed back into decision logic.
 */

/** User-visible temperature unit preference. */
export type TempUnit = 'C' | 'F';

/** localStorage key for persisting the unit preference. */
export const TEMP_UNIT_KEY = 'tde_temp_unit' as const;

/** Default unit for the US-focused product. */
export const DEFAULT_TEMP_UNIT: TempUnit = 'F';

// ─────────────────────────────────────────────────────────────────────────────
// Conversion
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an ordinary temperature (not a delta) from Celsius to Fahrenheit.
 * Rounds to 2 decimal places to preserve display precision.
 */
export function celsiusToFahrenheit(celsius: number): number {
  return celsius * (9 / 5) + 32;
}

/**
 * Convert a temperature DELTA from Celsius to Fahrenheit.
 * Δ F = Δ C × 9/5. Never adds 32 — deltas do not carry the offset.
 */
export function celsiusDeltaToFahrenheitDelta(deltaC: number): number {
  return deltaC * (9 / 5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format an ordinary Celsius temperature for display in the current unit.
 * Returns a string such as "85.69°F" or "29.83°C".
 *
 * @param celsius  Source value in °C (never modified internally)
 * @param unit     Display unit preference
 * @param decimals Number of decimal places (default: 2)
 */
export function fmtTemp(celsius: number, unit: TempUnit, decimals = 2): string {
  if (unit === 'F') {
    return `${celsiusToFahrenheit(celsius).toFixed(decimals)}°F`;
  }
  return `${celsius.toFixed(decimals)}°C`;
}

/**
 * Format a temperature delta for display in the current unit.
 * Prepends "+" when the delta is positive.
 * Never adds 32 to a delta.
 *
 * @param deltaC  Source delta in °C
 * @param unit    Display unit preference
 * @param decimals Number of decimal places (default: 2)
 */
export function fmtTempDelta(deltaC: number, unit: TempUnit, decimals = 2): string {
  const value = unit === 'F' ? celsiusDeltaToFahrenheitDelta(deltaC) : deltaC;
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}°${unit}`;
}

/**
 * Return just the numeric display value as a string (no unit suffix).
 * Useful when the unit suffix is rendered separately.
 */
export function fmtTempValue(celsius: number, unit: TempUnit, decimals = 2): string {
  if (unit === 'F') {
    return celsiusToFahrenheit(celsius).toFixed(decimals);
  }
  return celsius.toFixed(decimals);
}

/**
 * Return the unit suffix string, e.g. "°C" or "°F".
 */
export function tempUnitSuffix(unit: TempUnit): string {
  return `°${unit}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thermal color ramp — SINGLE source of truth
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Professional continuous thermal ramp (cool → warm), shared by:
 *   - the MapLibre `thermal-tiles-fill` paint interpolation (ThermalMap.tsx)
 *   - the map legend gradient bar + tick labels (below)
 *
 * Stops are in °C. Colors form a smooth perceptual-ish progression so
 * adjacent provider cells read as a continuous thermal surface while
 * retaining enough variation for individual 100m cells to stay perceptible.
 */
export const THERMAL_RAMP_STOPS: ReadonlyArray<{ c: number; color: string }> = [
  { c: 16, color: '#2f6bd8' }, // deep blue — cool
  { c: 20, color: '#14a3c9' }, // cyan
  { c: 23, color: '#14b88a' }, // teal-green
  { c: 26, color: '#7cb83c' }, // lime-green
  { c: 28, color: '#dfb33a' }, // yellow
  { c: 30, color: '#f08c2e' }, // orange
  { c: 32, color: '#e2503a' }, // red-orange
  { c: 35, color: '#c02948' }, // red
  { c: 40, color: '#8f1d42' }, // deep crimson — extreme
];

/** CSS linear-gradient string for the legend bar (left → right = cool → warm). */
export function thermalRampGradientCss(): string {
  const stops = THERMAL_RAMP_STOPS.map((s) => `${s.color} ${s.c}°C`).join(', ');
  return `linear-gradient(to right, ${stops})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Map Legend helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate thermal legend tick labels for the current unit.
 * Tick colors are SAMPLED from THERMAL_RAMP_STOPS so the legend always
 * matches the rendered field. The underlying MapLibre color scale always
 * operates in Celsius (FortyGuard data is Celsius); only labels convert.
 */
export function getThermalLegendTicks(unit: TempUnit): { color: string; label: string }[] {
  const band = (cLow: number, cHigh: number | null): { color: string; label: string } => {
    // Sample the ramp color at the band's midpoint (or upper edge for open bands).
    const probe = cHigh === null ? cLow + 2 : (cLow + cHigh) / 2;
    const color = sampleThermalRampColor(probe);
    const conv = (c: number) => (unit === 'F' ? Math.round(celsiusToFahrenheit(c)) : c);
    return cHigh === null
      ? { color, label: `>${conv(cLow)}` }
      : { color, label: `${conv(cLow)}–${conv(cHigh)}` };
  };

  return [
    band(0, 26),
    band(26, 28),
    band(28, 30),
    band(30, 32),
    band(32, null),
  ];
}

/**
 * Linearly interpolate the ramp color at an arbitrary °C value.
 * Clamps outside the stop range. Pure function — used by the legend and
 * any UI element that needs to color-match a specific temperature.
 */
export function sampleThermalRampColor(celsius: number): string {
  const stops = THERMAL_RAMP_STOPS;
  if (celsius <= stops[0].c) return stops[0].color;
  const last = stops[stops.length - 1];
  if (celsius >= last.c) return last.color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (celsius >= a.c && celsius <= b.c) {
      const t = (celsius - a.c) / (b.c - a.c);
      return mixHex(a.color, b.color, t);
    }
  }
  return last.color;
}

/** Hex color interpolation helper (no alpha handling — ramp colors are RGB). */
function mixHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage persistence & React Hook
// ─────────────────────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

/** Load the persisted unit preference. Falls back to DEFAULT_TEMP_UNIT. */
export function loadTempUnit(): TempUnit {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(TEMP_UNIT_KEY);
      if (stored === 'C' || stored === 'F') return stored;
    }
  } catch {
    // localStorage unavailable (e.g. private browsing with strict settings or SSR)
  }
  return DEFAULT_TEMP_UNIT;
}

/** Persist the unit preference for the current browser session. */
export function saveTempUnit(unit: TempUnit): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TEMP_UNIT_KEY, unit);
    }
  } catch {
    // Ignore write errors
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', callback);
    }
  };
}

function getSnapshot(): TempUnit {
  return loadTempUnit();
}

function getServerSnapshot(): TempUnit {
  return DEFAULT_TEMP_UNIT;
}

/**
 * React hook to synchronize temperature unit preference across components,
 * page reloads, and browser storage without hydration mismatches.
 */
export function useTempUnit(): [TempUnit, (unit: TempUnit) => void] {
  const unit = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setUnit = useCallback((newUnit: TempUnit) => {
    saveTempUnit(newUnit);
    for (const listener of listeners) {
      listener();
    }
  }, []);

  return [unit, setUnit];
}

// ─────────────────────────────────────────────────────────────────────────────
// Explanation Translation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translates a single explanation text string from Celsius to the target unit.
 */
function translateTextToUnit(text: string, unit: TempUnit): string {
  if (unit === 'C') return text;
  
  return text.replace(/([-+]?)(\d+(?:\.\d+)?)°C/g, (match, sign, numStr) => {
    const num = parseFloat(numStr);
    if (isNaN(num)) return match;
    
    const isDelta = sign !== '';
    if (isDelta) {
      const converted = celsiusDeltaToFahrenheitDelta(num);
      return `${sign}${converted.toFixed(2)}°F`;
    } else {
      const converted = celsiusToFahrenheit(num);
      return `${converted.toFixed(2)}°F`;
    }
  });
}

/**
 * Translates the user-facing text of a DecisionExplanation from Celsius to the target unit.
 * Used at the presentation layer so grounding validation can remain strictly in Celsius.
 */
export function translateExplanationToUnit(explanation: DecisionExplanation, unit: TempUnit): DecisionExplanation {
  if (unit === 'C') return explanation;
  
  return {
    ...explanation,
    summary: translateTextToUnit(explanation.summary, unit),
    whyThisPlan: translateTextToUnit(explanation.whyThisPlan, unit),
    constraintImpact: explanation.constraintImpact ? translateTextToUnit(explanation.constraintImpact, unit) : undefined,
  };
}
