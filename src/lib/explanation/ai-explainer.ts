import type {
  ExplainableDecisionInput,
  DecisionExplanation,
} from '@/types/explanation';
import { generateDeterministicExplanation } from './deterministic-explainer';
import { validateGroundedExplanation } from './grounding-validator';

/**
 * System prompt strictly grounding the LLM to verified EvidenceBundle inputs only.
 */
export const EXPLAINER_SYSTEM_PROMPT = `You are a specialized read-only decision explainer for the Thermal Decision Engine.
Your task is to produce a concise, clear explanation of an operational thermal decision evaluated deterministically by the decision engine.

CRITICAL NON-NEGOTIABLE RULES:
1. Grounding Truth: Use ONLY the numbers, locations, and time windows provided in the input JSON. DO NOT invent or estimate any temperatures, deltas, dates, or counts.
2. No Medical Claims: DO NOT mention heat stroke, heat stress, worker safety limits, health risks, or physiological comfort. This is a relative thermal baseline only.
3. No Sensor Inventions: DO NOT claim the data is "2m ambient air" or "land surface skin temperature". Physical measurement level is treated as a relative baseline.
4. Output Format: Return a strictly valid JSON object with the following schema:
{
  "summary": "Concise summary of recommended location, window, and mean modeled temperature.",
  "whyThisPlan": "Why this plan is optimal among evaluated candidate plans and the delta avoided vs worst feasible plan.",
  "constraintImpact": "Impact of the active operational constraint, including the constrained plan and exact Constraint Cost (mean modeled temperature increase). Omit if no scenario.",
  "epistemicNotice": "Explicit notice that this represents a deterministic modeled thermal baseline from FortyGuard heatmap data (v1.0.0-spatial-thermal-baseline) and is not a medical or physiological assessment."
}`;

/**
 * Generates an operational explanation for a decision result.
 * Seamlessly falls back to deterministic rule-based generation if LLM is unavailable or fails validation.
 */
export async function explainDecision(
  input: ExplainableDecisionInput,
  options?: {
    apiKey?: string;
    model?: string;
    timeoutMs?: number;
    mockLlmResponse?: unknown; // Useful for deterministic testing
  }
): Promise<DecisionExplanation> {
  // If mock response provided (for testing validation pipeline)
  if (options?.mockLlmResponse !== undefined) {
    const validation = validateGroundedExplanation(options.mockLlmResponse, input);
    if (validation.valid && validation.explanation) {
      return validation.explanation;
    }
    return generateDeterministicExplanation(input, validation.reason || 'MOCK_VALIDATION_FAILED');
  }

  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return generateDeterministicExplanation(
      input,
      'LLM_API_KEY_NOT_CONFIGURED: Defaulting to deterministic rule-based explanation.'
    );
  }

  const timeoutMs = options?.timeoutMs || 5000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || process.env.EXPLAINER_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: EXPLAINER_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Explain this deterministic decision evidence bundle:\n${JSON.stringify(input, null, 2)}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return generateDeterministicExplanation(
        input,
        `LLM_HTTP_ERROR_${res.status}: Failed to obtain LLM explanation.`
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return generateDeterministicExplanation(
        input,
        'EMPTY_LLM_RESPONSE: Received empty content from LLM.'
      );
    }

    const rawJson = JSON.parse(content);
    const validation = validateGroundedExplanation(rawJson, input);

    if (!validation.valid || !validation.explanation) {
      return generateDeterministicExplanation(
        input,
        `GROUNDING_REJECTED: ${validation.reason}`
      );
    }

    return validation.explanation;
  } catch (error) {
    clearTimeout(timeoutId);
    const reason = error instanceof Error && error.name === 'AbortError'
      ? 'LLM_TIMEOUT: Request exceeded time limit.'
      : `LLM_INVOCATION_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`;

    return generateDeterministicExplanation(input, reason);
  }
}
