import 'server-only';
import type { ProviderCapability } from '@/types/fortyguard-capability';
import { FORTYGUARD_AOI_LIMIT_DOCUMENTED_MI2 } from '@/types/fortyguard-capability';

/**
 * FortyGuard capability probe — server-side only.
 *
 * Calls /v1/system/fetch-api-key-usage to surface the ACTUAL plan, credit
 * ledger, and billing window the configured key exposes. NEVER fabricates a
 * coverage region or AOI limit the API does not surface.
 *
 * Per product spec Section 1: "If the actual API exposes/returns plan or
 * coverage information, surface it in Settings / provider diagnostics. If it
 * does not, label the capability as 'FortyGuard coverage: United States'
 * rather than claiming California-only access."
 */

interface RawKeyUsage {
  subscription_id?: string;
  plan_details?: {
    plan_type?: string;
    cycle_type?: string;
    subscription_start_date?: string;
    billing_period?: string;
    active?: boolean;
    credits_reset_date?: string;
  };
  api_key_details?: {
    status?: string;
    valid?: boolean;
    expiry_date?: string;
    api_access_available?: boolean;
  };
  credit_summary?: {
    total_available_credits?: number;
    cycle_credits_used?: number;
    cycle_remaining_credits?: number;
    cycle_usage_percentage?: number;
    total_credits_used?: number;
    total_remaining_credits?: number;
  };
  activity_breakdown?: Array<{
    name: string;
    credits: number;
    count: number;
    percentage: number;
  }>;
  billing_cycle?: {
    start_date?: string;
    end_date?: string;
    credits_reset_date?: string;
  };
}

/**
 * Probe the configured FortyGuard key's plan, credits, and billing window.
 * Returns a ProviderCapability with everything honestly labelled.
 *
 * Does NOT perform any heatmap call — only the free fetch-api-key-usage
 * endpoint. So this probe costs zero credits and can run on every health check.
 */
export async function probeProviderCapability(
  options?: { apiKey?: string; baseUrl?: string; timeoutMs?: number }
): Promise<ProviderCapability> {
  const apiKey = options?.apiKey ?? process.env.FORTYGUARD_API_KEY ?? '';
  const baseUrl = (
    options?.baseUrl ||
    process.env.FORTYGUARD_API_BASE_URL ||
    'https://api.fortyguard.com'
  ).replace(/\/+$/, '');
  const timeoutMs = options?.timeoutMs ?? 6000;
  const checkedAt = new Date().toISOString();

  if (!apiKey) {
    return {
      coverageRegion: 'United States',
      coverageConfidence: 'documented',
      aoiLimitConfidence: 'documented',
      aoiLimitDocumentedMi2: FORTYGUARD_AOI_LIMIT_DOCUMENTED_MI2,
      supportedResolutions: [60, 80, 100],
      connectivity: 'unconfigured',
      checkedAt,
      note: 'No FORTYGUARD_API_KEY configured. Coverage and AOI limit are documented defaults only.',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/v1/system/fetch-api-key-usage`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ api_key: apiKey }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.status === 401 || res.status === 403) {
      return {
        coverageRegion: 'United States',
        coverageConfidence: 'documented',
        aoiLimitConfidence: 'documented',
        aoiLimitDocumentedMi2: FORTYGUARD_AOI_LIMIT_DOCUMENTED_MI2,
        supportedResolutions: [60, 80, 100],
        connectivity: 'auth-error',
        checkedAt,
        note: 'The configured key was rejected (401/403). Coverage and AOI limit remain documented defaults.',
      };
    }

    if (!res.ok) {
      return {
        coverageRegion: 'United States',
        coverageConfidence: 'documented',
        aoiLimitConfidence: 'documented',
        aoiLimitDocumentedMi2: FORTYGUARD_AOI_LIMIT_DOCUMENTED_MI2,
        supportedResolutions: [60, 80, 100],
        connectivity: 'unknown',
        checkedAt,
        note: `fetch-api-key-usage returned HTTP ${res.status}. Coverage and AOI limit remain documented defaults.`,
      };
    }

    const raw = (await res.json()) as RawKeyUsage;

    // Parse billing period: prefer the structured billing_cycle, fall back to
    // the human-readable billing_period string.
    let billingPeriod: ProviderCapability['billingPeriod'];
    if (raw.billing_cycle?.start_date && raw.billing_cycle?.end_date) {
      billingPeriod = {
        start: raw.billing_cycle.start_date,
        end: raw.billing_cycle.end_date,
        creditsResetDate: raw.billing_cycle.credits_reset_date,
      };
    } else if (raw.plan_details?.billing_period) {
      // "Aug 20, 2026 – Sep 24, 2026" — keep as-is, no end-to-end parsing
      billingPeriod = {
        start: raw.plan_details.billing_period.split('–')[0].trim(),
        end: raw.plan_details.billing_period.split('–')[1]?.trim(),
        creditsResetDate: raw.plan_details.credits_reset_date,
      };
    }

    const cycleRemaining = raw.credit_summary?.cycle_remaining_credits ?? 0;
    const exhausted = cycleRemaining <= 0;
    const totalAvailable = raw.credit_summary?.total_available_credits ?? 0;
    const cycleUsed = raw.credit_summary?.cycle_credits_used ?? 0;

    const apiAccessAvailable = raw.api_key_details?.api_access_available === true;
    const planName = raw.plan_details?.plan_type;

    // The fetch-api-key-usage endpoint does NOT surface a coverage region or
    // a max AOI area. So coverage stays "documented" (FortyGuard public docs
    // describe United States regional coverage) and the AOI limit stays
    // "documented" (public docs state 150 mi²). Nothing fabricated.
    const capability: ProviderCapability = {
      coverageRegion: 'United States',
      coverageConfidence: 'documented',
      planName,
      apiAccessAvailable,
      billingPeriod,
      creditSummary: {
        totalAvailable,
        cycleUsed,
        cycleRemaining,
        exhausted,
      },
      aoiLimitConfidence: 'documented',
      aoiLimitDocumentedMi2: FORTYGUARD_AOI_LIMIT_DOCUMENTED_MI2,
      supportedResolutions: [60, 80, 100],
      connectivity: exhausted ? 'exhausted' : 'connected',
      checkedAt,
      note: exhausted
        ? `Plan "${planName ?? 'unknown'}" credits exhausted (${cycleUsed.toLocaleString()} used of ${totalAvailable.toLocaleString()}). LIVE heatmap requests will return HTTP 402 until credits reset${raw.billing_cycle?.credits_reset_date ? ` on ${raw.billing_cycle.credits_reset_date.slice(0, 10)}` : ''}. Coverage region and AOI limit are documented defaults — the key-usage endpoint did not surface either.`
        : `Plan "${planName ?? 'unknown'}" active. Coverage region and AOI limit are documented defaults — the key-usage endpoint did not surface either.`,
    };
    return capability;
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      coverageRegion: 'United States',
      coverageConfidence: 'documented',
      aoiLimitConfidence: 'documented',
      aoiLimitDocumentedMi2: FORTYGUARD_AOI_LIMIT_DOCUMENTED_MI2,
      supportedResolutions: [60, 80, 100],
      connectivity: 'unknown',
      checkedAt,
      note: `Capability probe failed: ${err instanceof Error ? err.message : String(err)}. Coverage and AOI limit remain documented defaults.`,
    };
  }
}
