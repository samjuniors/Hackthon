import 'server-only';
import type { AnalysisTemporalInput } from './analysis-window';
import {
  TIME_MODE_FILTER_TYPE,
  effectiveTimeBounds,
  deriveDurationHours,
  FIXTURE_TEMPORAL_METADATA,
} from './analysis-window';

/**
 * Server-side local→UTC conversion for the analysis temporal input.
 *
 * Per product spec Section 6: "If FortyGuard requires UTC internally, perform
 * the conversion at the adapter boundary. Do not let Gemini perform date/time
 * conversion. The deterministic engine remains the source of truth."
 *
 * This module is server-only (no client import). It uses the standard
 * Intl/Date APIs — deterministic, never AI.
 */

/** FortyGuard date_time block (matches the adapter's request schema). */
export interface FortyGuardDateTime {
  start_date: string; // YYYY-MM-DD
  start_time?: string; // HH:MM
  end_time?: string; // HH:MM
  end_date?: string; // YYYY-MM-DD
  filter_type: 1 | 2 | 3;
}

/** Engine constraints (ISO UTC) derived from the temporal input. */
export interface EngineTemporalConstraints {
  allowedStart: string; // ISO 8601 UTC
  allowedEnd: string; // ISO 8601 UTC
  durationHours: number;
}

/**
 * Convert a local (date, HH:MM) pair in the given IANA timezone to an ISO UTC
 * timestamp. Uses the wall-clock interpretation (no DST guessing beyond what
 * Intl provides) — exactly what the user picked.
 */
export function localToUtcIso(
  date: string,
  time: string,
  timezone: string
): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  // Build a UTC epoch for the local wall-clock, then let Intl shift it back.
  // The trick: format the same wall-clock AS the target timezone, which
  // produces the UTC instant that corresponds to that wall-clock in tz.
  const wallClockUtc = Date.UTC(y, m - 1, d, hh, mm, 0);
  // Compute the timezone offset at that instant.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(wallClockUtc));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const tzYear = Number(get('year'));
  const tzMonth = Number(get('month'));
  const tzDay = Number(get('day'));
  const tzHour = Number(get('hour')) % 24;
  const tzMinute = Number(get('minute'));
  const tzSecond = Number(get('second'));
  // The UTC instant whose wall-clock in `timezone` equals (tzYear, tzMonth,
  // tzDay, tzHour, tzMinute, tzSecond). We want the instant that, when
  // formatted in `timezone`, shows (y, m, d, hh, mm). That instant is:
  //   wallClockUtc - (tzOffsetMs)
  // where tzOffsetMs = wallClockUtc - instantRepresentingTzWallClock.
  const tzWall = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute, tzSecond);
  // Double-iteration offset: the difference between "desired wall-clock read
  // as UTC" and "the same instant re-read as UTC after one tz round-trip".
  // For New York (EDT = UTC-4): desired local 04:00 → wallClockUtc = 04:00Z,
  // displayed back as 00:00 EDT → tzWall = 00:00Z → offset = +4h →
  // instant = 08:00Z, which is exactly 04:00 EDT.
  const offsetMs = wallClockUtc - tzWall;
  const instant = wallClockUtc + offsetMs;
  return new Date(instant).toISOString();
}

/**
 * Build the engine's ISO UTC constraints from the temporal input.
 * The engine works entirely in UTC — this conversion happens at the adapter
 * boundary, not in the UI and never in the AI.
 */
export function buildEngineConstraints(
  input: AnalysisTemporalInput,
  timezone: string
): EngineTemporalConstraints {
  const { start, end } = effectiveTimeBounds(input);
  const allowedStart = localToUtcIso(input.date, start, timezone);
  // For single-day mode, the end bound is 20:00 of the same date.
  // For single-hour, end = start + 1h (still same date unless wrapping).
  const endOnDate = end <= start
    ? addDay(input.date, 1) // wrapped past midnight
    : input.date;
  const allowedEnd = localToUtcIso(endOnDate, end, timezone);
  return {
    allowedStart,
    allowedEnd,
    durationHours: deriveDurationHours(input),
  };
}

/**
 * Build the FortyGuard date_time block from the temporal input.
 * - single-hour (filter_type=1)  → start_date + start_time
 * - range-of-hours (filter_type=2) → start_date + start_time + end_time
 * - single-day (filter_type=3)  → start_date + end_date (same day)
 *
 * Times are LOCAL to the location's timezone. The adapter sends these strings
 * to FortyGuard verbatim — FortyGuard interprets them in the AOI's local
 * timezone. We do NOT pre-convert to UTC for FortyGuard (the API contract
 * expects local wall-clock strings anchored to the AOI).
 */
export function buildFortyGuardDateTime(
  input: AnalysisTemporalInput
): FortyGuardDateTime {
  const { start, end } = effectiveTimeBounds(input);
  const filterType = TIME_MODE_FILTER_TYPE[input.timeMode];
  const endOnDate = end <= start ? addDay(input.date, 1) : input.date;

  switch (input.timeMode) {
    case 'single-hour':
      return {
        start_date: input.date,
        start_time: start,
        filter_type: 1,
      };
    case 'single-day':
      return {
        start_date: input.date,
        end_date: input.date,
        filter_type: 3,
      };
    case 'range-of-hours':
    default:
      return {
        start_date: input.date,
        start_time: start,
        end_time: end,
        end_date: endOnDate !== input.date ? endOnDate : undefined,
        filter_type: 2,
      };
  }
}

/** Add N days to a YYYY-MM-DD string (returns YYYY-MM-DD). */
export function addDay(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d);
  const next = new Date(base + days * 86400000);
  return next.toISOString().slice(0, 10);
}

/**
 * Build hourly UTC timestamps between [allowedStart, allowedEnd) stepping 1h.
 * The engine evaluates a candidate observation per hourly timestamp so it can
 * rank operating windows. This is independent of the user's selected
 * filter_type — the engine always needs hourly resolution for windowing.
 */
export function buildHourlyTimestamps(
  allowedStart: string,
  allowedEnd: string
): string[] {
  const startMs = new Date(allowedStart).getTime();
  const endMs = new Date(allowedEnd).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [];
  }
  const out: string[] = [];
  for (let t = startMs; t < endMs; t += 3600000) {
    out.push(new Date(t).toISOString());
  }
  return out;
}

/**
 * DEMO mode: return the fixture's temporal metadata so the UI can display
 * honest temporal provenance (never "Today" for a historical capture).
 */
export function getFixtureTemporalMetadata() {
  return FIXTURE_TEMPORAL_METADATA;
}
