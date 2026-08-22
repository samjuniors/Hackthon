import { GoogleGenAI, Type } from '@google/genai';
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
 * Generates an operational explanation for a decision result using Google Gemini (@google/genai).
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

  const apiKey = (options && 'apiKey' in options)
    ? options.apiKey
    : process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return generateDeterministicExplanation(
      input,
      'LLM_API_KEY_NOT_CONFIGURED: Defaulting to deterministic rule-based explanation.'
    );
  }

  const timeoutMs = options?.timeoutMs || 3000;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const generatePromise = ai.models.generateContent({
      model: options?.model || process.env.EXPLAINER_MODEL || 'gemini-3.7-flash',
      contents: `Explain this deterministic decision evidence bundle:\n${JSON.stringify(input, null, 2)}`,
      config: {
        systemInstruction: EXPLAINER_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Concise summary of recommended location, window, and mean modeled temperature.',
            },
            whyThisPlan: {
              type: Type.STRING,
              description: 'Why this plan is optimal among evaluated candidate plans and the delta avoided vs worst feasible plan.',
            },
            constraintImpact: {
              type: Type.STRING,
              description: 'Impact of the active operational constraint, including the constrained plan and exact Constraint Cost (mean modeled temperature increase). Omit if no scenario.',
            },
            epistemicNotice: {
              type: Type.STRING,
              description: 'Explicit notice that this represents a deterministic modeled thermal baseline from FortyGuard heatmap data (v1.0.0-spatial-thermal-baseline) and is not a medical or physiological assessment.',
            },
          },
          required: ['summary', 'whyThisPlan', 'epistemicNotice'],
        },
        temperature: 0.1,
      },
    });

    let timeoutHandle: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const error = new Error('Request exceeded time limit.');
        error.name = 'AbortError';
        reject(error);
      }, timeoutMs);
    });

    const response = await Promise.race([generatePromise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutHandle);
    });

    const content = response.text;
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
    const isTimeout = (error instanceof Error && (error.name === 'AbortError' || error.message.includes('time limit')));
    const reason = isTimeout
      ? 'LLM_TIMEOUT: Request exceeded time limit.'
      : `LLM_INVOCATION_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`;

    return generateDeterministicExplanation(input, reason);
  }
}
