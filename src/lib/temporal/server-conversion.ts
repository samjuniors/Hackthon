import type { AnalysisTemporalInput } from './analysis-window';
import {
  effectiveTimeBounds,
  deriveDurationHours,
  FIXTURE_TEMPORAL_METADATA,
  localToUtcIso,
} from './analysis-window';
import { ValidationError } from '@/types/errors';

/**
 * Server-side local→UTC conversion for the analysis temporal input.
 *
 * Per product spec Section 6: "If FortyGuard requires UTC internally, perform
 * the conversion at the adapter boundary. Do not let Gemini perform date/time
 * conversion. The deterministic engine remains the source of truth."
 *
 * localToUtcIso now lives in the client-safe analysis-window module (ONE
 * implementation shared by the UI wire preview and the server adapter
 * boundary) and is re-exported here for the existing server import sites.
 */
export { localToUtcIso } from './analysis-window';

/**
 * The date_time block of a SINGLE-HOURLY FortyGuard /v1/heatmap request.
 *
 * This is the VERIFIED wire contract: every evaluated hour is sent as its own
 * request with `filter_type: 1` and UTC date/hour strings. filter_type 2/3
 * are NOT sent by this application — nothing may claim otherwise.
 */
export interface FortyGuardHourlyRequestDateTime {
  start_date: string; // YYYY-MM-DD (UTC)
  start_time: string; // HH:MM (UTC)
  filter_type: 1;
}

/** Engine constraints (ISO UTC) derived from the temporal input. */
export interface EngineTemporalConstraints {
  allowedStart: string; // ISO 8601 UTC
  allowedEnd: string; // ISO 8601 UTC
  durationHours: number;
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
  // End is start + 1h for single-hour mode (same date unless it wraps past
  // midnight); as picked for range-of-hours mode.
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
 * Build the date_time block for ONE hourly FortyGuard request from an ISO UTC
 * timestamp — the exact block the adapter transmits on the wire.
 *
 * Single source of truth: the adapter uses this to build each request, and
 * the decision route uses it to record temporal provenance, so the recorded
 * provenance can never drift from the actual request payload.
 */
export function buildHourlyRequestDateTime(
  timestamp: string
): FortyGuardHourlyRequestDateTime {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) {
    throw new ValidationError(`Invalid hourly timestamp: ${timestamp}`);
  }
  return {
    start_date: d.toISOString().slice(0, 10),
    start_time: `${String(d.getUTCHours()).padStart(2, '0')}:00`,
    filter_type: 1,
  };
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
 * rank operating windows. Every one of these hours is sent to FortyGuard as
 * its own single-hour request (filter_type: 1).
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
