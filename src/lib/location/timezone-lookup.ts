/**
 * Offline coordinate → IANA timezone resolution.
 *
 * Wraps @photostructure/tz-lookup (a compact GeoTIFF-based lookup, no network
 * required, deterministic). Server-side only.
 */

// Server-only module import kept dynamic-friendly for test environments.
import tzLookup from '@photostructure/tz-lookup';

/**
 * Resolve the IANA timezone for a coordinate (e.g. 37.8044, -122.2713 →
 * 'America/Los_Angeles'). Returns undefined when the lookup cannot resolve
 * (invalid coordinate) — callers fall back to UTC display.
 */
export function lookupTimezone(latitude: number, longitude: number): string | undefined {
  try {
    return tzLookup(latitude, longitude);
  } catch {
    return undefined;
  }
}
