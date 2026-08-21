import { z } from 'zod';
import type {
  ExplainableDecisionInput,
  DecisionExplanation,
} from '@/types/explanation';
import { extractAllowedNumbers } from './deterministic-explainer';

export const RawExplanationSchema = z.object({
  summary: z.string().min(10),
  whyThisPlan: z.string().min(10),
  constraintImpact: z.string().optional(),
  epistemicNotice: z.string().min(10),
});

// Forbidden claims regular expressions
const FORBIDDEN_MEDICAL_SAFETY = [
  /\bheat\s*stroke\b/i,
  /\bheat\s*stress\b/i,
  /\bcardiovascular\b/i,
  /\bworker\s*safety\b/i,
  /\bsafety\s*guarantee\b/i,
  /\bmedical\s*risk\b/i,
  /\bhazard(ous)?\b/i,
  /\binjury\b/i,
  /\bosha\b/i,
  /\bwbgt\b/i,
];

const FORBIDDEN_PHYSICAL_SEMANTICS = [
  /\b2m\s*ambient\b/i,
  /\bambient\s*2m\b/i,
  /\bland[\s-]surface\s*temperature\b/i,
  /\bskin\s*temperature\b/i,
  /\bsatellite\s*derived\b/i,
  /\bcalibrated\s*sensor\b/i,
  /\breal\s*sensor\s*feed\b/i,
];

/**
 * Extracts floating point and integer numbers from text.
 */
export function extractNumbersFromText(text: string): number[] {
  // Match standard numbers, floats, percentages, etc.
  const regex = /[-+]?\d*\.?\d+/g;
  const matches = text.match(regex);
  if (!matches) return [];
  return matches
    .map((m) => Number(m))
    .filter((n) => !isNaN(n));
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  explanation?: DecisionExplanation;
}

/**
 * Validates raw AI output against grounding allow-lists and strict non-medical semantic guardrails.
 */
export function validateGroundedExplanation(
  rawJson: unknown,
  input: ExplainableDecisionInput
): ValidationResult {
  // 1. Schema Validation
  const parseResult = RawExplanationSchema.safeParse(rawJson);
  if (!parseResult.success) {
    return {
      valid: false,
      reason: `SCHEMA_VALIDATION_FAILED: ${parseResult.error.message}`,
    };
  }

  const parsed = parseResult.data;
  const fullText = `${parsed.summary} ${parsed.whyThisPlan} ${parsed.constraintImpact || ''} ${parsed.epistemicNotice}`;

  // 2. Forbidden Medical/Safety Claims Check
  for (const pattern of FORBIDDEN_MEDICAL_SAFETY) {
    if (pattern.test(fullText)) {
      return {
        valid: false,
        reason: `FORBIDDEN_CLAIM: Medical/safety terminology detected matching ${pattern}`,
      };
    }
  }

  // 3. Forbidden Physical Semantics Claims Check
  for (const pattern of FORBIDDEN_PHYSICAL_SEMANTICS) {
    if (pattern.test(fullText)) {
      return {
        valid: false,
        reason: `FORBIDDEN_CLAIM: Unsupported physical measurement semantics detected matching ${pattern}`,
      };
    }
  }

  // 4. Numeric Grounding Verification
  const allowedNumbers = extractAllowedNumbers(input);
  const textNumbers = extractNumbersFromText(`${parsed.summary} ${parsed.whyThisPlan} ${parsed.constraintImpact || ''}`);

  for (const num of textNumbers) {
    // Check if number matches any allowed number within a tight delta (0.05) or integer match
    const isAllowed = allowedNumbers.some((allowed) => Math.abs(num - allowed) < 0.05);
    if (!isAllowed) {
      return {
        valid: false,
        reason: `UNGROUNDED_NUMERIC_VALUE: Number ${num} does not exist in the verified EvidenceBundle`,
      };
    }
  }

  // 5. Build clean, verified DecisionExplanation
  const rec = input.jointDecision.recommendedPlan;
  const worst = input.jointDecision.rankedPlans[input.jointDecision.rankedPlans.length - 1];

  const referencedTemperatures = [rec.exposureScore, worst.exposureScore];
  if (input.activeScenario?.constrainedPlan) {
    referencedTemperatures.push(input.activeScenario.constrainedPlan.exposureScore);
  }

  const referencedLocations = [rec.location.name, worst.location.name];
  if (input.activeScenario?.constrainedPlan) {
    referencedLocations.push(input.activeScenario.constrainedPlan.location.name);
  }

  const recStartUtc = new Date(rec.window.startTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  const recEndUtc = new Date(rec.window.endTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  return {
    valid: true,
    explanation: {
      summary: parsed.summary,
      whyThisPlan: parsed.whyThisPlan,
      constraintImpact: parsed.constraintImpact,
      evidenceGrounding: {
        referencedTemperatures,
        referencedLocations,
        referencedTimes: [`${recStartUtc}–${recEndUtc} UTC`],
        allowedNumbers,
      },
      epistemicNotice: parsed.epistemicNotice,
      generatedBy: 'AI_GROUNDED_EXPLAINER',
      dataSource: input.jointDecision.dataSource,
      modelVersion: input.jointDecision.modelVersion,
    },
  };
}
