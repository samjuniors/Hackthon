/**
 * FortyGuard Provider Capability / Access Model.
 *
 * Represents what we HONESTLY know about the configured FortyGuard API key's
 * access — coverage region, plan/capability, max AOI area, supported
 * resolutions, and live connectivity. Nothing here is fabricated.
 *
 * Per the product-model spec Section 1 + Section 13:
 *   - Do NOT assume the key is California-only.
 *   - Do NOT hard-claim the 150 mi² AOI limit unless the configured capability
 *     actually confirms it (the live plan_details endpoint did not surface it).
 *   - If the API returns plan or coverage info, surface it; if not, label the
 *     capability honestly as "documented" rather than inventing a region.
 */
import type { AnalysisResolution } from '@/lib/user-preferences';

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
 * AOI-limit confidence — whether the 150 mi² ceiling is actually enforced by
 * the configured key, or only documented in public API docs.
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
  /** AOI area limit (mi²) — only set if confirmed by the capability. */
  maxAoiAreaMi2?: number;
  aoiLimitConfidence: AoiLimitConfidence;
  aoiLimitDocumentedMi2: number;
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
 * Documented FortyGuard AOI limit (square miles) from public API docs.
 * NOT claimed as "confirmed by the configured key" — the live plan_details
 * endpoint did not surface a max_aoi_area field, so this stays "documented".
 */
export const FORTYGUARD_AOI_LIMIT_DOCUMENTED_MI2 = 150;

/**
 * Default (conservative) capability used before any live probe completes.
 * Everything is labelled "documented" or "unknown" — nothing fabricated.
 */
export const DEFAULT_PROVIDER_CAPABILITY: ProviderCapability = {
  coverageRegion: 'United States',
  coverageConfidence: 'documented',
  aoiLimitConfidence: 'documented',
  aoiLimitDocumentedMi2: FORTYGUARD_AOI_LIMIT_DOCUMENTED_MI2,
  supportedResolutions: [60, 80, 100],
  connectivity: 'unknown',
  checkedAt: '',
  note: 'FortyGuard public docs describe United States regional coverage. The configured key\'s plan_details endpoint did not surface a coverage region or a max AOI area, so both are labelled "documented" rather than "confirmed".',
};
