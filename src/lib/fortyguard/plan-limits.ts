/**
 * FortyGuard DOCUMENTED provider contract — plan limits, temporal bounds, coverage.
 *
 * SOURCE OF TRUTH (official FortyGuard API documentation, verified live on
 * 2026-08-28 against https://docs-api.fortyguard.com/docs/create-heatmap and
 * https://docs-api.fortyguard.com/docs/limitations):
 *
 *   DOCUMENTED PROVIDER LIMITS (plan-level, from the public docs):
 *     - Heatmap max area:  API Basic = 10 mi² · API Premium = 50 mi² ·
 *                          API Startup = 10 mi².
 *     - Granularity:       60m / 80m / 100m.
 *     - filter_type:       1 (Single Hour) · 2 (Range of Hours, same day,
 *                          max 23h, end_time required) · 3 (Single Day).
 *     - Date range:        2019-01-01 through (now + 12h). Earlier than 2019 or
 *                          more than 12h ahead → HTTP 400, NOT charged.
 *     - Regional coverage: United States only (current release).
 *     - polygon_aoi:       GeoJSON FeatureCollection with a closed Polygon.
 *     - Credits:           deducted only on Completed activities; constraint
 *                          violations (400) are never charged.
 *
 *   EMPIRICALLY VERIFIED ACCOUNT CAPABILITY (docs/FORTYGUARD.md — the
 *   Hackathon account): plan "Hackathon", 2M credits, async
 *   POST /v1/heatmap → activity_id → GET /v1/status/{id} polling. The account's
 *   fetch-api-key-usage endpoint does NOT surface an AOI area limit.
 *
 *   CURRENT LIVE ACCOUNT STATE: surfaced at runtime by the capability probe
 *   (plan name + credit ledger). When the plan does not expose an area limit,
 *   the CONSERVATIVE documented Basic limit (10 mi²) is used and labelled
 *   "documented" — never the stale 150 mi² assumption.
 *
 * This module is PURE + client-safe (no zod, no fetch, no process.env).
 */

/** Documented plan-level heatmap area limits (mi²) — official docs. */
export const FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2 = {
  basic: 10,
  premium: 50,
  startup: 10,
} as const;

/** Documented earliest supported date (YYYY-MM-DD) — official docs. */
export const FORTYGUARD_DOCUMENTED_DATE_RANGE_START = '2019-01-01';

/** Documented forecast horizon: requests may extend at most +12h past now. */
export const FORTYGUARD_FORECAST_HORIZON_HOURS = 12;

/** Documented max range for filter_type 2 (Range of Hours, same day). */
export const FORTYGUARD_FILTER2_MAX_RANGE_HOURS = 23;

/** Documented regional coverage label (current release). */
export const FORTYGUARD_DOCUMENTED_COVERAGE = 'United States' as const;

/**
 * The AOI area limit enforced by default. The Hackathon plan does not expose an
 * area limit, so the CONSERVATIVE documented Basic limit applies (10 mi²).
 * This is THE active provider limit in this application — the former 150 mi²
 * value was a stale assumption and is permanently retired (guarded by tests).
 */
export const FORTYGUARD_AOI_LIMIT_MI2 = FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2.basic;

/** Resolved applicable AOI limit for a plan name. */
export interface ApplicableAoiLimit {
  /** The limit to enforce (mi²). */
  limitMi2: number;
  /** Human plan label: a documented tier name, or "conservative" for unknown plans. */
  planLabel: string;
  /**
   * How the limit was resolved:
   *   - 'plan-documented'      → the live plan name matches a documented tier
   *                             (Basic/Startup/Premium) and that tier's
   *                             DOCUMENTED limit is applied.
   *   - 'conservative-fallback' → the live plan name (e.g. "Hackathon") exposes
   *                             NO area limit — its exact limit is UNKNOWN, so
   *                             the smallest documented plan limit is enforced
   *                             as a conservative ceiling. The plan is NEVER
   *                             silently represented as "Basic".
   */
  kind: 'plan-documented' | 'conservative-fallback';
  /** Always 'documented' until a live plan endpoint actually surfaces a limit. */
  confidence: 'documented' | 'confirmed';
  /** Honest note about how the limit was resolved. */
  note: string;
}

/**
 * Resolve the applicable AOI area limit for a plan name (from the live
 * fetch-api-key-usage probe when available).
 *
 *   - Plan names containing "premium"   → documented Premium limit (50 mi²).
 *   - Plan names containing "basic"     → documented Basic limit (10 mi²).
 *   - Plan names containing "startup"   → documented Startup limit (10 mi²).
 *   - Anything else (incl. "Hackathon" / undefined) → the plan's own area
 *     limit is UNKNOWN; the CONSERVATIVE documented ceiling (10 mi² — the
 *     smallest documented plan limit) is enforced and labelled "conservative".
 *     The account is NEVER silently represented as "Basic".
 */
export function resolveApplicableAoiLimit(planName?: string | null): ApplicableAoiLimit {
  const name = (planName ?? '').toLowerCase();
  if (name.includes('premium')) {
    return {
      limitMi2: FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2.premium,
      planLabel: 'Premium',
      kind: 'plan-documented',
      confidence: 'documented',
      note: 'Documented FortyGuard Premium heatmap area limit (public API docs).',
    };
  }
  if (name.includes('basic')) {
    return {
      limitMi2: FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2.basic,
      planLabel: 'Basic',
      kind: 'plan-documented',
      confidence: 'documented',
      note: 'Documented FortyGuard Basic heatmap area limit (public API docs).',
    };
  }
  if (name.includes('startup')) {
    return {
      limitMi2: FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2.startup,
      planLabel: 'Startup',
      kind: 'plan-documented',
      confidence: 'documented',
      note: 'Documented FortyGuard Startup heatmap area limit (public API docs).',
    };
  }
  return {
    limitMi2: FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2.basic,
    planLabel: 'conservative',
    kind: 'conservative-fallback',
    confidence: 'documented',
    note: `Plan "${planName ?? 'unknown'}" does not expose a heatmap area limit — its exact limit is UNKNOWN, so the conservative documented ceiling (${FORTYGUARD_DOCUMENTED_PLAN_LIMITS_MI2.basic} mi², the smallest documented plan limit) is enforced.`,
  };
}

/** Human label for an applicable limit, honestly reflecting its resolution. */
export function formatAoiLimitLabel(limit: ApplicableAoiLimit): string {
  return limit.kind === 'conservative-fallback'
    ? `Conservative documented FortyGuard limit: ${limit.limitMi2} mi² (this plan's own area limit is UNKNOWN)`
    : `FortyGuard ${limit.planLabel} limit: ${limit.limitMi2} mi²`;
}

/**
 * Documented US coverage bounding boxes (approximate, permissive unions).
 * The docs state the current release serves "United States only" — a LIVE
 * request whose analysis area lies outside these boxes would be rejected by
 * the provider (HTTP 400, uncharged), so the client pre-flights honestly.
 */
export const US_COVERAGE_BBOXES: ReadonlyArray<{ minLng: number; maxLng: number; minLat: number; maxLat: number }> = [
  { minLng: -125.0, maxLng: -66.5, minLat: 24.0, maxLat: 49.5 }, // continental US
  { minLng: -180.0, maxLng: -129.5, minLat: 51.0, maxLat: 72.0 }, // Alaska
  { minLng: -161.0, maxLng: -154.0, minLat: 18.5, maxLat: 22.5 }, // Hawaii
];

/** True when a point lies inside the documented US coverage boxes. */
export function isWithinDocumentedCoverage(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  return US_COVERAGE_BBOXES.some(
    (b) => longitude >= b.minLng && longitude <= b.maxLng && latitude >= b.minLat && latitude <= b.maxLat
  );
}
