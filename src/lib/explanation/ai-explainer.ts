import type {
  ExplainableDecisionInput,
  DecisionExplanation,
} from '@/types/explanation';
import type { PreferredAIProvider } from '@/types/provider';
import { generateDeterministicExplanation } from './deterministic-explainer';
import { validateGroundedExplanation } from './grounding-validator';
import {
  invokeSpecificProvider,
  buildProviderChain,
  classifyInvocationError,
  type ProviderKind,
} from './ai-provider';

/**
 * System prompt strictly grounding the LLM to verified EvidenceBundle inputs only.
 * Identical for every provider — no provider receives a different or relaxed prompt.
 */
export const EXPLAINER_SYSTEM_PROMPT = `You are a specialized read-only decision explainer for the Thermal Decision Engine.
Your task is to produce a concise, clear explanation of an operational thermal decision evaluated deterministically by the decision engine.

CRITICAL NON-NEGOTIABLE RULES:
1. Grounding Truth: Use ONLY the numbers, locations, and time windows provided in the input JSON. DO NOT invent or estimate any temperatures, deltas, dates, or counts.
2. No Medical Claims: DO NOT mention heat stroke, heat stress, worker safety limits, health risks, or physiological comfort. This is a relative thermal baseline only.
3. No Sensor Inventions: DO NOT claim the data is "2m ambient air" or "land surface skin temperature". Physical measurement level is treated as a relative baseline.
4. Numeric Formatting: You MUST format absolute temperatures WITHOUT a leading sign (e.g. 21.25°C). You MUST format temperature deltas WITH a leading sign (e.g. +1.20°C or -0.50°C).
5. Output Format: Return a strictly valid JSON object with the following schema:
{
  "summary": "Concise summary of recommended location, window, and mean modeled temperature.",
  "whyThisPlan": "Why this plan is optimal among evaluated candidate plans and the delta avoided vs worst feasible plan.",
  "constraintImpact": "Impact of the active operational constraint, including the constrained plan and exact Constraint Cost (mean modeled temperature increase). Omit if no scenario.",
  "epistemicNotice": "Explicit notice that this represents a deterministic modeled thermal baseline from FortyGuard heatmap data (v1.0.0-spatial-thermal-baseline) and is not a medical or physiological assessment."
}
6. NUMERIC ALLOW-LIST (strictly enforced): Every number that appears anywhere in your response — including in prose, deltas, counts, ranks, and times — MUST be copied verbatim from the input evidence JSON. Do NOT write any number that does not appear in the input. Do NOT write version numbers, model version strings, decimal counts, or computed values. Do NOT write dates in YYYY-MM-DD form; reference times only using the exact hour:minute values present in the input window strings. Do NOT invent negative numbers; a leading minus sign is only permitted on a temperature delta that exactly matches a value in the input.`;

/**
 * Robustly extract a JSON object from an LLM text response.
 * Strips markdown fences, leading/trailing prose, and code-block wrappers.
 * Throws if no valid JSON object can be recovered (→ MALFORMED → fall back).
 */
function extractJsonObject(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

export interface ExplainDecisionOptions {
  /** User/system preferred provider (affects chain head). Default 'auto'. */
  preferredProvider?: PreferredAIProvider;
  /** Per-provider timeout. Default 10000ms. */
  timeoutMs?: number;
  /** Test hook: supply a canned response to exercise the validation pipeline. */
  mockLlmResponse?: unknown;
  /** Test hook: skip providers and force deterministic. */
  forceDeterministic?: boolean;
}

/**
 * Generates an operational explanation for a decision result using the provider
 * fallback chain: Gemini → Claude → Z.ai → deterministic.
 *
 * EPISTEMIC INVARIANTS:
 *  - Every provider receives the SAME immutable ExplainableDecisionInput.
 *  - Every provider's raw output is validated by the SAME grounding validator
 *    (±0.01°C numeric allow-list + forbidden-claim guardrails). The validator
 *    is NEVER weakened for any provider.
 *  - Fallback triggers: timeout, HTTP 429, HTTP 5xx, malformed JSON, empty
 *    response, or grounding-validation failure.
 *  - The deterministic engine remains the only decision authority; no provider
 *    can alter WHERE/WHEN, ranking, or What-If cost.
 */
export async function explainDecision(
  input: ExplainableDecisionInput,
  options?: ExplainDecisionOptions,
): Promise<DecisionExplanation> {
  // ── Test hook: mock response exercises the grounding pipeline directly. ──
  if (options?.mockLlmResponse !== undefined) {
    const validation = validateGroundedExplanation(options.mockLlmResponse, input);
    if (validation.valid && validation.explanation) {
      return { ...validation.explanation, providerUsed: 'NONE', fallbackTrace: [] };
    }
    return generateDeterministicExplanation(input, validation.reason || 'MOCK_VALIDATION_FAILED');
  }

  if (options?.forceDeterministic) {
    return generateDeterministicExplanation(input, 'FORCED_DETERMINISTIC');
  }

  const preferred = options?.preferredProvider ?? 'auto';
  const timeoutMs = options?.timeoutMs ?? 10000;
  const chain = buildProviderChain(preferred);

  const userPrompt = `Explain this deterministic decision evidence bundle:\n${JSON.stringify(input, null, 2)}`;
  const fallbackTrace: string[] = [];

  for (const provider of chain) {
    const providerLabel = provider.toUpperCase();

    // ── 1. Invoke the provider (throws on timeout/429/5xx/empty). ──
    let text: string;
    try {
      const result = await invokeSpecificProvider(
        provider,
        EXPLAINER_SYSTEM_PROMPT,
        userPrompt,
        { timeoutMs },
      );
      text = result.text;
    } catch (err) {
      const reason = classifyInvocationError(err, provider);
      fallbackTrace.push(`${providerLabel}: ${reason}`);
      continue; // advance chain
    }

    // ── 2. Parse JSON (malformed → advance chain). ──
    let rawJson: unknown;
    try {
      rawJson = extractJsonObject(text);
    } catch {
      fallbackTrace.push(`${providerLabel}: MALFORMED_JSON`);
      continue;
    }

    // ── 3. Grounding validation (SAME validator, never weakened). ──
    const validation = validateGroundedExplanation(rawJson, input);
    if (!validation.valid || !validation.explanation) {
      fallbackTrace.push(`${providerLabel}: GROUNDING_REJECTED (${validation.reason})`);
      continue;
    }

    // ── 4. Success — return grounded explanation with provider provenance. ──
    const providerName = provider === 'gemini' ? 'GEMINI' : provider === 'claude' ? 'CLAUDE' : 'ZAI';
    return {
      ...validation.explanation,
      providerUsed: providerName,
      fallbackTrace,
    };
  }

  // ── 5. All providers exhausted → deterministic fallback (sole decision authority for narrative). ──
  const reason = chain.length === 0
    ? 'LLM_API_KEY_NOT_CONFIGURED: No AI provider configured. Defaulting to deterministic rule-based explanation.'
    : `ALL_PROVIDERS_EXHAUSTED: ${fallbackTrace.join('; ')}`;

  return generateDeterministicExplanation(input, reason);
}
