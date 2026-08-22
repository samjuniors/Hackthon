import type {
  ExplainableDecisionInput,
  DecisionExplanation,
} from '@/types/explanation';
import { generateDeterministicExplanation } from './deterministic-explainer';
import { validateGroundedExplanation } from './grounding-validator';
import { invokeAIProvider, detectAIProvider, type AIProviderConfig } from './ai-provider';

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
 * Generates an operational explanation for a decision result using configured AI Provider (Gemini / OpenAI).
 * Seamlessly falls back to deterministic rule-based generation if LLM is unavailable or fails validation.
 */
export async function explainDecision(
  input: ExplainableDecisionInput,
  options?: {
    provider?: 'gemini' | 'openai' | 'deterministic';
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

  const providerConfig: AIProviderConfig | undefined = options?.apiKey || options?.provider
    ? {
        provider: options.provider || (options.apiKey?.startsWith('AIzaSy') ? 'gemini' : 'openai'),
        apiKey: options.apiKey,
        model: options.model,
      }
    : undefined;

  const detected = detectAIProvider(providerConfig);
  if (detected.provider === 'deterministic' || !detected.apiKey) {
    return generateDeterministicExplanation(
      input,
      'LLM_API_KEY_NOT_CONFIGURED: Defaulting to deterministic rule-based explanation.'
    );
  }

  const userPrompt = `Explain this deterministic decision evidence bundle:\n${JSON.stringify(input, null, 2)}`;

  try {
    const { text } = await invokeAIProvider(
      EXPLAINER_SYSTEM_PROMPT,
      userPrompt,
      {
        timeoutMs: options?.timeoutMs ?? 5000,
        providerConfig,
      }
    );

    let rawJson: unknown;
    try {
      let cleaned = text.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith('```')) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      rawJson = JSON.parse(cleaned);
    } catch {
      return generateDeterministicExplanation(
        input,
        'MALFORMED_LLM_JSON: LLM output was not valid JSON.'
      );
    }

    const validation = validateGroundedExplanation(rawJson, input);
    if (!validation.valid || !validation.explanation) {
      return generateDeterministicExplanation(
        input,
        `GROUNDING_REJECTED: ${validation.reason}`
      );
    }

    return validation.explanation;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && (error.name === 'AbortError' || msg.includes('abort') || msg.includes('timeout'));

    const reason = isTimeout
      ? 'LLM_TIMEOUT: Request exceeded time limit.'
      : msg.startsWith('GEMINI_HTTP_ERROR') || msg.startsWith('OPENAI_HTTP_ERROR')
      ? msg
      : `LLM_INVOCATION_ERROR: ${msg}`;

    return generateDeterministicExplanation(input, reason);
  }
}
