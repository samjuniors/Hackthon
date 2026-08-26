/**
 * Analysis Temporal Model — client-safe types + helpers.
 *
 * Replaces the previous duration-only UX with an explicit WHEN:
 *   Date (YYYY-MM-DD) + Start (HH:MM) + End (HH:MM) + Time Mode + Duration.
 *
 * The duration is DERIVED from start/end (not the only temporal input) per
 * product spec Section 4. Time modes (Section 5): Single Hour, Range of
 * Hours, Single Day. Default = Range of Hours (the hackathon's preferred
 * WHERE + WHEN workflow).
 *
 * This module is pure + client-safe — no zod, no fetch, no process.env.
 * Server-side local→UTC conversion lives in ./server-conversion.ts and is
 * performed at the adapter boundary (never by the AI).
 */

/** Time mode selector mapped to FortyGuard filter_type semantics. */
export type AnalysisTimeMode = 'single-hour' | 'range-of-hours' | 'single-day';

/** Maps a UI time mode to the FortyGuard date_time.filter_type value. */
export const TIME_MODE_FILTER_TYPE: Record<AnalysisTimeMode, 1 | 2 | 3> = {
  'single-hour': 1,
  'range-of-hours': 2,
  'single-day': 3,
};

export const TIME_MODE_OPTIONS: ReadonlyArray<{
  value: AnalysisTimeMode;
  label: string;
  description: string;
}> = [
  {
    value: 'single-hour',
    label: 'Single Hour',
    description: 'One hour snapshot — evaluates that exact hour.',
  },
  {
    value: 'range-of-hours',
    label: 'Range of Hours',
    description: 'A start-to-end range — evaluates every hour in the window.',
  },
  {
    value: 'single-day',
    label: 'Single Day',
    description: 'A full day — finds the best operating window within it.',
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
  /** HH:MM (24h, local). For single-day mode, this is the day's end bound. */
  endTime: string;
  timeMode: AnalysisTimeMode;
  /**
   * For single-day mode, the operating-window length the engine should find
   * within the day (2h/3h/4h). For single-hour and range-of-hours modes this
   * is ignored — duration is fully derived from start/end.
   */
  dayWindowHours?: 2 | 3 | 4;
}

export const DEFAULT_TIME_MODE: AnalysisTimeMode = 'range-of-hours';
export const DEFAULT_DAY_WINDOW_HOURS: 2 | 3 | 4 = 3;

/**
 * Produce today's date in YYYY-MM-DD form for the given IANA timezone.
 * Used for the current-day default (Section 7) — the date is always visible.
 */
export function todayLocalDate(timezone?: string): string {
  const now = new Date();
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
 * Default temporal input for the hackathon's preferred Range of Hours workflow.
 * Date = today (visible, editable); Start = 05:00; End = 08:00.
 */
export function defaultTemporalInput(timezone?: string): AnalysisTemporalInput {
  return {
    date: todayLocalDate(timezone),
    startTime: '05:00',
    endTime: '08:00',
    timeMode: DEFAULT_TIME_MODE,
    dayWindowHours: DEFAULT_DAY_WINDOW_HOURS,
  };
}

/**
 * Derive the engine's `durationHours` from the temporal input.
 * - single-hour     → 1
 * - range-of-hours  → (end - start) in hours
 * - single-day      → dayWindowHours (the window length to find within the day)
 */
export function deriveDurationHours(input: AnalysisTemporalInput): number {
  if (input.timeMode === 'single-hour') return 1;
  if (input.timeMode === 'single-day') return input.dayWindowHours ?? DEFAULT_DAY_WINDOW_HOURS;
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
 * Resolve the effective local start/end times for a given time mode.
 * - single-hour → start = picked hour, end = start + 1h
 * - single-day → 06:00 to 20:00 (sensible daytime window the engine evaluates)
 * - range-of-hours → as picked
 */
export function effectiveTimeBounds(
  input: AnalysisTemporalInput
): { start: string; end: string } {
  switch (input.timeMode) {
    case 'single-hour':
      return { start: input.startTime, end: addHour(input.startTime, 1) };
    case 'single-day':
      return { start: '06:00', end: '20:00' };
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

/**
 * DEMO fixture temporal metadata. The fixture captures 12 hourly snapshots
 * starting 2026-08-21T08:00:00Z (04:00 EDT). These are EXPLICIT temporal
 * provenance — we never label DEMO data as "Today".
 */
export const FIXTURE_TEMPORAL_METADATA = {
  firstSnapshotIso: '2026-08-21T08:00:00.000Z',
  lastSnapshotIso: '2026-08-21T19:00:00.000Z',
  fixtureTimezone: 'America/New_York',
  snapshotCount: 12,
  captureLabel: 'August 21, 2026 · 04:00–15:00 EDT (captured FortyGuard)',
};

/**
 * Build a temporal input aligned to the DEMO fixture's captured window.
 * Used when the user is in DEMO mode so the displayed WHEN matches the
 * fixture data (no silent "Today" claim).
 *
 * Fixture first 3 snapshots: 08:00Z, 09:00Z, 10:00Z = 04:00, 05:00, 06:00 EDT.
 * Default Range of Hours = 04:00–07:00 EDT (maps to first 3 fixture hours).
 */
export function buildFixtureTemporalInput(): AnalysisTemporalInput {
  return {
    date: '2026-08-21',
    startTime: '04:00',
    endTime: '07:00',
    timeMode: 'range-of-hours',
    dayWindowHours: 3,
  };
}
