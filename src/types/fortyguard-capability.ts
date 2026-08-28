/**
 * FortyGuard Provider Capability / Access Model.
 *
 * Represents what we HONESTLY know about the configured FortyGuard API key's
 * access — coverage region, plan/capability, max AOI area, supported
 * resolutions, and live connectivity. Nothing here is fabricated.
 *
 * Three DISTINCT layers (never conflated):
 *   1. DOCUMENTED PROVIDER LIMIT — official public docs (verified 2026-08-28):
 *      heatmap max area 10 mi² (Basic/Startup) / 50 mi² (Premium); US coverage;
 *      granularity 60/80/100m; dates 2019-01-01 → now+12h.
 *   2. EMPIRICALLY VERIFIED ACCOUNT CAPABILITY — what the Hackathon key
 *      actually proved live (docs/FORTYGUARD.md).
 *   3. CURRENT LIVE ACCOUNT STATE — plan/credits from the free
 *      fetch-api-key-usage probe at runtime.
 *
 * Per the product-model spec Section 1 + Section 13:
 *   - Do NOT assume the key is California-only.
 *   - The applicable AOI limit is the documented plan limit resolved from the
 *     LIVE plan name (conservative Basic 10 mi² when the plan exposes none) —
 *     the stale 150 mi² assumption is permanently retired.
 *   - If the API returns plan or coverage info, surface it; if not, label the
 *     capability honestly as "documented" rather than inventing a region.
 */
import type { AnalysisResolution } from '@/lib/user-preferences';
import type { ApplicableAoiLimit } from '@/lib/fortyguard/plan-limits';

/**
 * Coverage confidence — what we actually know about the key's regional access.
 * - 'confirmed'  : the live API response proved this region (success OR a
 *                   region-specific rejection).
 * - 'documented' : FortyGuard's public docs state the region, but the live
 *                   key did not confirm or deny it (e.g. credit gate fired first).
 * - 'unknown'    : no evidence either way.
 */
export type CoverageConfidence = 'confirmed' | 'documented' | 'unknown';

/**
 * AOI-limit confidence — whether the applicable area limit is actually
 * enforced/surfaced by the configured key, or only documented in public docs.
 */
export type AoiLimitConfidence = 'confirmed' | 'documented' | 'unknown';

export interface ProviderCapability {
  /** Human label for the coverage region, e.g. "United States". */
  coverageRegion: string;
  coverageConfidence: CoverageConfidence;
  /** Plan/capability name if known from the live API, e.g. "Hackathon". */
  planName?: string;
  /** True if the live API confirmed the key is active & valid. */
  apiAccessAvailable?: boolean;
  /** Subscription / billing window if surfaced by the API. */
  billingPeriod?: { start: string; end: string; creditsResetDate?: string };
  /** Credit ledger if surfaced by the API. */
  creditSummary?: {
    totalAvailable: number;
    cycleUsed: number;
    cycleRemaining: number;
    exhausted: boolean;
  };
  /** ALL documented plan-level heatmap area limits (official docs). */
  aoiLimitsDocumentedMi2: { basic: number; premium: number; startup: number };
  /** The limit this application ENFORCES — resolved from the live plan name. */
  applicableAoiLimit: ApplicableAoiLimit;
  aoiLimitConfidence: AoiLimitConfidence;
  /** Resolutions the UI offers (always 60/80/100 — these are FortyGuard's). */
  supportedResolutions: readonly AnalysisResolution[];
  /** Live connectivity verdict from the most recent health probe. */
  connectivity: 'connected' | 'exhausted' | 'auth-error' | 'unconfigured' | 'unknown';
  /** ISO timestamp of the last capability probe. */
  checkedAt: string;
  /** ISO timestamp of the last SUCCESSFUL FortyGuard heatmap completion (server runtime). */
  lastSuccessfulHeatmapAt?: string;
  /** FortyGuard activity_id of the last successful heatmap (server runtime). */
  lastHeatmapActivityId?: string;
  /** Honest, human-readable note about any uncertainty. */
  note?: string;
}

/**
 * Documented FortyGuard AOI area limits (square miles) from the official API
 * docs (verified live 2026-08-28): Basic = 10, Premium = 50, Startup = 10.
 * The stale 150 mi² assumption is permanently retired (guarded by tests).
 */
export const FORTYGUARD_AOI_LIMITS_DOCUMENTED_MI2 = { basic: 10, premium: 50, startup: 10 } as const;

/**
 * Default (conservative) capability used before any live probe completes.
 * Everything is labelled "documented" or "unknown" — nothing fabricated.
 */
export const DEFAULT_PROVIDER_CAPABILITY: ProviderCapability = {
  coverageRegion: 'United States',
  coverageConfidence: 'documented',
  aoiLimitsDocumentedMi2: FORTYGUARD_AOI_LIMITS_DOCUMENTED_MI2,
  applicableAoiLimit: {
    limitMi2: 10,
    planLabel: 'Basic',
    confidence: 'documented',
    note: 'Conservative documented Basic limit enforced until the configured plan exposes its own area limit.',
  },
  aoiLimitConfidence: 'documented',
  supportedResolutions: [60, 80, 100],
  connectivity: 'unknown',
  checkedAt: '',
  note: 'FortyGuard public docs describe United States regional coverage and heatmap area limits of 10 mi² (Basic/Startup) / 50 mi² (Premium). The configured key\'s plan endpoint does not surface an area limit, so the conservative documented Basic limit applies.',
};
