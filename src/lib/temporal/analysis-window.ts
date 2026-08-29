/**
 * Analysis Temporal Model — client-safe types + helpers.
 *
 * Explicit WHEN: Date (YYYY-MM-DD) + Start (HH:MM) + End (HH:MM) + Evaluation
 * Window mode + derived Duration.
 *
 * EVALUATION WINDOW (not provider "Time Mode"): the UI never claims a provider
 * filter_type. The VERIFIED wire contract is that every evaluated hour is sent
 * to FortyGuard as a single-hour request (filter_type: 1). A "Time range" is
 * therefore evaluated as a SEQUENCE of hourly provider requests. "Single Day"
 * was removed: its 14-hour span predictably violates the engine's +12h
 * forecast horizon, so it is not offered until provider support is verified.
 *
 * This module is pure + client-safe — no zod, no fetch, no process.env.
 * Server-side local→UTC conversion lives in ./server-conversion.ts and is
 * performed at the adapter boundary (never by the AI).
 */

/** Evaluation-window mode (UI concept — NOT a provider filter_type). */
export type AnalysisTimeMode = 'single-hour' | 'range-of-hours';

export const TIME_MODE_OPTIONS: ReadonlyArray<{
  value: AnalysisTimeMode;
  label: string;
  description: string;
}> = [
  {
    value: 'single-hour',
    label: 'Single hour',
    description: 'One hour snapshot — evaluates that exact hour (1 FortyGuard hourly request).',
  },
  {
    value: 'range-of-hours',
    label: 'Time range',
    description: 'A start-to-end range — evaluated as a sequence of hourly FortyGuard requests (one request per hour).',
  },
];

/**
 * Structured temporal input collected by the UI. All times are LOCAL to the
 * selected location's timezone. The server converts to UTC at the adapter
 * boundary — the AI never performs date/time conversion.
 */
export interface AnalysisTemporalInput {
  /** YYYY-MM-DD in the location's local timezone. */
  date: string;
  /** HH:MM (24h, local). */
  startTime: string;
  /** HH:MM (24h, local). Derived (start + 1h) for single-hour mode. */
  endTime: string;
  timeMode: AnalysisTimeMode;
}

/**
 * DEFAULT_TIME_MODE is 'single-hour' — guarantees exactly ONE FortyGuard
 * /v1/heatmap credit is spent per Generate press in LIVE mode.
 * 'range-of-hours' is still available in the UI Settings for users who
 * explicitly want multi-hour analysis.
 */
export const DEFAULT_TIME_MODE: AnalysisTimeMode = 'single-hour';

/**
 * Timezone the DEMO fixture capture is anchored in. The capture's request
 * hour is stored as a UTC instant, so DEMO times are displayed in UTC —
 * never silently re-anchored to a local timezone.
 */
export const FIXTURE_TIMEZONE = 'UTC' as const;

/**
 * Produce today's date in YYYY-MM-DD form for the given IANA timezone.
 * Used for the current-day default (Section 7) — the date is always visible.
 * `now` is injectable so date-dependent logic is deterministic under test.
 */
export function todayLocalDate(timezone?: string, now: Date = new Date()): string {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone || undefined,
  };
  const parts = new Intl.DateTimeFormat('en-CA', opts).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

/**
 * Default temporal input: single-hour at 05:00 (1 FortyGuard request).
 * Date = today (visible, editable); Start = 05:00; End = 06:00 (derived).
 * Single-hour mode ensures exactly ONE /v1/heatmap credit per Generate.
 */
export function defaultTemporalInput(timezone?: string): AnalysisTemporalInput {
  return {
    date: todayLocalDate(timezone),
    startTime: '05:00',
    endTime: '06:00',
    timeMode: DEFAULT_TIME_MODE, // 'single-hour'
  };
}

/**
 * Derive the engine's `durationHours` from the temporal input.
 * - single-hour     → 1
 * - range-of-hours  → (end - start) in hours
 */
export function deriveDurationHours(input: AnalysisTemporalInput): number {
  if (input.timeMode === 'single-hour') return 1;
  return hoursBetween(input.startTime, input.endTime);
}

/** Difference in whole hours between two HH:MM strings (end - start). */
export function hoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(eh)) return 0;
  const startMin = sh * 60 + (sm || 0);
  const endMin = eh * 60 + (em || 0);
  if (endMin <= startMin) return 0;
  return Math.round((endMin - startMin) / 60);
}

/**
 * Resolve the effective local start/end times for a given evaluation window.
 * - single-hour → start = picked hour, end = start + 1h
 * - range-of-hours → as picked
 */
export function effectiveTimeBounds(
  input: AnalysisTemporalInput
): { start: string; end: string } {
  switch (input.timeMode) {
    case 'single-hour':
      return { start: input.startTime, end: addHour(input.startTime, 1) };
    case 'range-of-hours':
    default:
      return { start: input.startTime, end: input.endTime };
  }
}

/** Add N hours to an HH:MM string, wrapping past 24h (returns HH:MM). */
export function addHour(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h)) return time;
  const totalMin = h * 60 + (m || 0) + hours * 60;
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const eh = Math.floor(wrapped / 60);
  const em = wrapped % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

/**
 * Format the temporal input for the map header (Section 8).
 * Example: "August 26, 2026 · 05:00–08:00 AM PDT"
 */
export function formatTemporalForHeader(
  input: AnalysisTemporalInput,
  timezone?: string
): string {
  const { start, end } = effectiveTimeBounds(input);
  const dateLabel = formatDateLong(input.date, timezone);
  const windowLabel = formatTimeWindowLocal(start, end, timezone);
  return `${dateLabel} · ${windowLabel}`;
}

/** Format a YYYY-MM-DD as "August 26, 2026" in the given timezone. */
export function formatDateLong(dateStr: string, timezone?: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: timezone || 'UTC',
  }).format(date);
}

/**
 * Format an HH:MM–HH:MM window with AM/PM + timezone abbreviation.
 * Example: "05:00–08:00 AM PDT"
 */
export function formatTimeWindowLocal(
  start: string,
  end: string,
  timezone?: string
): string {
  const startLabel = formatTime12h(start);
  const endLabel = formatTime12h(end);
  const tzAbbr = timezoneAbbr(timezone);
  return `${startLabel}–${endLabel}${tzAbbr ? ` ${tzAbbr}` : ''}`;
}

/** Format HH:MM as "05:00 AM" (12-hour with leading zero). */
export function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h)) return time;
  const period = h < 12 || h === 24 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${period}`;
}

/** Get a timezone abbreviation like "PDT"/"PST" for the given IANA tz. */
export function timezoneAbbr(timezone?: string): string {
  if (!timezone) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** Validate a YYYY-MM-DD string (basic shape check). */
export function isValidDateStr(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
}

/** Validate an HH:MM (24h) string. */
export function isValidTimeStr(s: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  const [h, m] = s.split(':').map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL → UTC CONVERSION (client-safe single source of truth)
//
// Used by the UI (wire preview) AND the server (adapter boundary) so the
// displayed FortyGuard request time can never drift from the transmitted one.
// src/lib/temporal/server-conversion.ts re-exports this for its existing
// server-side import sites.
// ─────────────────────────────────────────────────────────────────────────────

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
  const offsetMs = wallClockUtc - tzWall;
  const instant = wallClockUtc + offsetMs;
  return new Date(instant).toISOString();
}

/**
 * DEMO fixture temporal metadata — the REAL capture contains ONE hourly
 * snapshot: the hour its provider request asked for (2026-08-14 12:00 UTC,
 * filter_type 1). We never fabricate additional hours from the single
 * snapshot, and we never label DEMO data as "Today".
 */
export const FIXTURE_TEMPORAL_METADATA = {
  firstSnapshotIso: '2026-08-14T12:00:00.000Z',
  lastSnapshotIso: '2026-08-14T12:00:00.000Z',
  fixtureTimezone: FIXTURE_TIMEZONE,
  snapshotCount: 1,
  captureLabel: 'August 14, 2026 · 12:00 UTC (captured FortyGuard — one-hour snapshot)',
};

/**
 * Build a temporal input aligned to the DEMO fixture's captured hour.
 * Used when the user is in DEMO mode so the displayed WHEN matches the
 * captured data (no silent "Today" claim, no fabricated hours).
 */
export function buildFixtureTemporalInput(): AnalysisTemporalInput {
  return {
    date: '2026-08-14',
    startTime: '12:00',
    endTime: '13:00',
    timeMode: 'single-hour',
  };
}
