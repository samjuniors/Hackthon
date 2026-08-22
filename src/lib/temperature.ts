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
// Map Legend helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate thermal legend tick labels for the current unit.
 * The underlying MapLibre color scale always operates in Celsius
 * (FortyGuard data is Celsius); only the legend *labels* are converted.
 */
export function getThermalLegendTicks(unit: TempUnit): { color: string; label: string }[] {
  const ticks: { celsiusBound: number | null; color: string; labelPrefix?: string; labelSuffix?: string }[] = [
    { celsiusBound: 28,   color: '#10b981', labelPrefix: '≤' },
    { celsiusBound: 30,   color: '#eab308' },
    { celsiusBound: 32,   color: '#f97316' },
    { celsiusBound: null, color: '#ef4444', labelPrefix: '>' },
  ];

  return ticks.map((tick, i) => {
    const prev = i > 0 ? ticks[i - 1].celsiusBound : null;
    const curr = tick.celsiusBound;

    if (tick.labelPrefix === '≤' && curr !== null) {
      const v = unit === 'F' ? Math.round(celsiusToFahrenheit(curr)) : curr;
      return { color: tick.color, label: `≤${v}` };
    }
    if (tick.labelPrefix === '>' && prev !== null) {
      const v = unit === 'F' ? Math.round(celsiusToFahrenheit(prev)) : prev;
      return { color: tick.color, label: `>${v}` };
    }
    // Middle range: "prevVal–currVal"
    if (prev !== null && curr !== null) {
      const lo = unit === 'F' ? Math.round(celsiusToFahrenheit(prev)) : prev;
      const hi = unit === 'F' ? Math.round(celsiusToFahrenheit(curr)) : curr;
      return { color: tick.color, label: `${lo}-${hi}` };
    }
    return { color: tick.color, label: '?' };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// localStorage persistence
// ─────────────────────────────────────────────────────────────────────────────

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
