/**
 * Temporal window validation against the DOCUMENTED FortyGuard contract.
 *
 * Official docs (verified live 2026-08-28, https://docs-api.fortyguard.com):
 *   - date_time.start_date supported range: **2019-01-01 through 12 hours past
 *     the current time**. Earlier than 2019 or more than 12h ahead → HTTP 400,
 *     NOT charged against the credit balance.
 *   - 2019 → now = historical / real-time; up to +12h = forecast.
 *
 * This module classifies every request (historical / current / forecast) and
 * pre-flights the documented bounds so an invalid window is blocked BEFORE
 * submission with zero provider credits spent. It also renders the provider
 * WIRE preview (UTC) so the user always sees exactly what will be transmitted.
 *
 * Client-safe + server-safe (pure; shared by ControlRail and the decision route).
 */
import type { AnalysisTemporalInput } from './analysis-window';
import { effectiveTimeBounds, localToUtcIso, todayLocalDate } from './analysis-window';
import {
  FORTYGUARD_DOCUMENTED_DATE_RANGE_START,
  FORTYGUARD_FORECAST_HORIZON_HOURS,
} from '@/lib/fortyguard/plan-limits';

/** How the request relates to the present moment (documented semantics). */
export type TemporalClassification = 'historical' | 'current' | 'forecast';

export type TemporalValidationCode =
  | 'TEMPORAL_BEFORE_PROVIDER_RANGE'
  | 'TEMPORAL_BEYOND_FORECAST_HORIZON'
  | 'TEMPORAL_RANGE_EXCEEDS_ENGINE_HORIZON';

export interface TemporalWindowFacts {
  classification: TemporalClassification;
  /** ISO UTC start of the evaluated window. */
  startUtc: string;
  /** ISO UTC end of the evaluated window. */
  endUtc: string;
  /** Human wire preview, e.g. "FortyGuard request: 2026-08-28 11:00 UTC". */
  wirePreview: string;
  /** Hours from now until the window start (negative = past). */
  hoursFromNow: number;
}

export interface TemporalValidationResult extends TemporalWindowFacts {
  /** True when the window may be submitted to FortyGuard. */
  valid: boolean;
  /** Present only when invalid — stable machine-readable code. */
  code?: TemporalValidationCode;
  /** Human explanation (why blocked). */
  message: string;
  /** Human recovery instruction. */
  recovery: string;
}

/** Maximum evaluation-window span (hours) the engine supports. */
export const ENGINE_MAX_WINDOW_HOURS = 12;

/** Format an ISO UTC timestamp as "YYYY-MM-DD HH:MM UTC". */
function formatWireTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/**
 * Compute the UTC facts of the evaluated window (start/end/classification/
 * wire preview) WITHOUT any validity judgement. `now` is injectable for tests.
 *
 * Classification (documented semantics): the request's LOCAL DATE vs today in
 * the analysis timezone — a later date = forecast, an earlier date =
 * historical, the same date = current.
 */
export function classifyTemporalWindow(
  input: AnalysisTemporalInput,
  timezone: string,
  now: Date = new Date()
): TemporalWindowFacts {
  const { start, end } = effectiveTimeBounds(input);
  const startUtc = localToUtcIso(input.date, start, timezone);
  // End may wrap past midnight (handled the same way as buildEngineConstraints).
  const endOnDate = end <= start ? addDayIso(input.date) : input.date;
  const endUtc = localToUtcIso(endOnDate, end, timezone);
  const hoursFromNow = (new Date(startUtc).getTime() - now.getTime()) / 3600000;

  // "Today" must be derived from the SAME clock as hoursFromNow — otherwise an
  // injected `now` (tests / server consistency) disagrees with classification.
  const today = todayLocalDate(timezone, now);
  const classification: TemporalClassification =
    input.date > today ? 'forecast' : input.date < today ? 'historical' : 'current';

  const durationH = Math.max(
    0,
    Math.round((new Date(endUtc).getTime() - new Date(startUtc).getTime()) / 3600000)
  );
  const wirePreview =
    durationH > 1
      ? `FortyGuard request: ${formatWireTime(startUtc).replace(/ UTC$/, '')} – ${endUtc.slice(11, 16)} UTC`
      : `FortyGuard request: ${formatWireTime(startUtc)}`;

  return { classification, startUtc, endUtc, wirePreview, hoursFromNow };
}

/** Add one day to a YYYY-MM-DD string. */
function addDayIso(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + 86400000).toISOString().slice(0, 10);
}

/**
 * Validate the temporal window against the DOCUMENTED provider contract:
 *   1. Window start must not be earlier than 2019-01-01.
 *   2. Window start must not be more than +12h past now (forecast ceiling).
 *   3. Range span must not exceed the engine's 12h evaluation horizon.
 *
 * Constraint violations are HTTP 400 at the provider and NEVER charged — this
 * pre-flight blocks them client/server-side before any submission.
 */
export function validateTemporalWindow(
  input: AnalysisTemporalInput,
  timezone: string,
  now: Date = new Date()
): TemporalValidationResult {
  const facts = classifyTemporalWindow(input, timezone, now);

  // 1. Documented date-range floor (2019-01-01).
  if (input.date < FORTYGUARD_DOCUMENTED_DATE_RANGE_START || facts.startUtc.slice(0, 10) < FORTYGUARD_DOCUMENTED_DATE_RANGE_START) {
    return {
      ...facts,
      valid: false,
      code: 'TEMPORAL_BEFORE_PROVIDER_RANGE',
      message: `The requested date (${input.date}) is before the documented FortyGuard supported range, which begins ${FORTYGUARD_DOCUMENTED_DATE_RANGE_START}. Request blocked before submission — no credits consumed.`,
      recovery: `Pick a date from ${FORTYGUARD_DOCUMENTED_DATE_RANGE_START} onward.`,
    };
  }

  // 2. Documented forecast ceiling (now + 12h).
  if (facts.hoursFromNow > FORTYGUARD_FORECAST_HORIZON_HOURS) {
    return {
      ...facts,
      valid: false,
      code: 'TEMPORAL_BEYOND_FORECAST_HORIZON',
      message: `The requested window starts ${facts.hoursFromNow.toFixed(1)}h from now — beyond the documented FortyGuard forecast horizon (+${FORTYGUARD_FORECAST_HORIZON_HOURS}h). Request blocked before submission — no credits consumed.`,
      recovery: `Pick a window that begins within the next ${FORTYGUARD_FORECAST_HORIZON_HOURS} hours, or an earlier date.`,
    };
  }

  // 3. Engine evaluation-window horizon.
  const durationH =
    (new Date(facts.endUtc).getTime() - new Date(facts.startUtc).getTime()) / 3600000;
  if (durationH > ENGINE_MAX_WINDOW_HOURS) {
    return {
      ...facts,
      valid: false,
      code: 'TEMPORAL_RANGE_EXCEEDS_ENGINE_HORIZON',
      message: `The requested range spans ${Math.round(durationH)}h — beyond the engine's ${ENGINE_MAX_WINDOW_HOURS}h evaluation horizon.`,
      recovery: `Keep the start-to-end range within ${ENGINE_MAX_WINDOW_HOURS} hours.`,
    };
  }

  return { ...facts, valid: true, message: '', recovery: '' };
}
