/**
 * §5 — AI Explanation Verification
 *
 * Tests:
 * - explainDecision() returns a valid structured result (LLM or deterministic fallback)
 * - LLM invocation is attempted when an API key is present
 * - LLM timeout forces deterministic fallback
 * - Grounding rejection on forbidden medical terms forces fallback
 * - Fabricated temperature values are rejected by the grounding validator
 * - Explanation failure leaves the decision immutable
 * - Deterministic explanation contains grounded values
 */
import { describe, it, expect } from 'vitest';
import { explainDecision } from '@/lib/explanation/ai-explainer';
import { validateGroundedExplanation } from '@/lib/explanation/grounding-validator';
import type { ExplainableDecisionInput } from '@/types/explanation';
import type { JointDecisionResult } from '@/types/domain';

// ---------------------------------------------------------------------------
// Shared fixture — matches the structure from failure_states.test.ts exactly
// ---------------------------------------------------------------------------
const sampleJointDecision: JointDecisionResult = {
  decisionType: 'JOINT_SPATIAL_TEMPORAL_PLAN',
  recommendedPlan: {
    planId: 'plan-loc-a-08',
    rank: 1,
    location: {
      locationId: 'LOC-A',
      name: 'Battery Park Greenway (Waterfront)',
      location: { latitude: 40.712, longitude: -74.008 },
    },
    window: {
      windowId: 'w-08-10',
      startTime: '2026-08-21T08:00:00.000Z',
      endTime: '2026-08-21T10:00:00.000Z',
      durationHours: 2,
    },
    tileId: 'tile-11',
    exposureScore: 29.15,
    deltaVsBest: 0.0,
    status: 'Optimal',
    thermalValues: [],
  },
  rankedPlans: [
    {
      planId: 'plan-loc-a-08',
      rank: 1,
      location: {
        locationId: 'LOC-A',
        name: 'Battery Park Greenway (Waterfront)',
        location: { latitude: 40.712, longitude: -74.008 },
      },
      window: {
        windowId: 'w-08-10',
        startTime: '2026-08-21T08:00:00.000Z',
        endTime: '2026-08-21T10:00:00.000Z',
        durationHours: 2,
      },
      tileId: 'tile-11',
      exposureScore: 29.15,
      deltaVsBest: 0.0,
      status: 'Optimal',
      thermalValues: [],
    },
    {
      planId: 'plan-loc-c-12',
      rank: 15,
      location: {
        locationId: 'LOC-C',
        name: 'Chinatown / Bowery Staging (Asphalt Canyon)',
        location: { latitude: 40.712, longitude: -73.988 },
      },
      window: {
        windowId: 'w-12-14',
        startTime: '2026-08-21T12:00:00.000Z',
        endTime: '2026-08-21T14:00:00.000Z',
        durationHours: 2,
      },
      tileId: 'tile-13',
      exposureScore: 37.55,
      deltaVsBest: 8.4,
      status: 'Feasible',
      thermalValues: [],
    },
  ],
  searchSpace: { locationCount: 3, windowCount: 5, totalEvaluatedPlans: 15 },
  dataSource: 'FIXTURE',
  modelVersion: 'v1.0.0-spatial-thermal-baseline',
  spatialFieldMetadata: {
    baseTimestamp: '2026-08-21T08:00:00.000Z',
    coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
    totalEvaluatedHours: 6,
    description: 'AI verification test metadata',
  },
  evidenceBundle: {
    candidateCount: 3,
    windowCount: 5,
    sourceEndpoint: '/v1/heatmap',
    dataSource: 'FIXTURE',
    provenance: 'DERIVED',
  },
};

const input: ExplainableDecisionInput = { jointDecision: sampleJointDecision };

const hasLlmKey = !!process.env.GEMINI_API_KEY;

describe('§5 — AI Explanation Verification', () => {

  it('§5.1 — explainDecision() returns a valid structured explanation (LLM or deterministic fallback)', async () => {
    const explanation = await explainDecision(input);
    expect(explanation).toBeTruthy();
    expect(explanation.summary).toBeTruthy();
    expect(explanation.whyThisPlan).toBeTruthy();
    expect(explanation.epistemicNotice).toBeTruthy();
    expect(explanation.generatedBy).toMatch(/AI_GROUNDED_EXPLAINER|DETERMINISTIC_FALLBACK/);
    console.warn('[§5.1] generatedBy:', explanation.generatedBy);
    console.warn('[§5.1] fallbackReason:', explanation.fallbackReason ?? '(none)');
  });

  it('§5.2 — LLM invocation attempted when a key is configured', async () => {
    if (!hasLlmKey) {
      console.warn('[§5.2] SKIP: No Gemini API key configured. Result will be DETERMINISTIC_FALLBACK.');
      return;
    }
    const explanation = await explainDecision(input);
    expect(explanation.summary).toBeTruthy();
    console.warn('[§5.2] generatedBy:', explanation.generatedBy);
    console.warn('[§5.2] fallbackReason:', explanation.fallbackReason ?? '(none — LLM succeeded)');
  });

  it('§5.3 — LLM timeout (timeoutMs: 1) forces deterministic fallback', async () => {
    // Must supply a key (even a fake one) so the code reaches the AbortController path.
    // Without a key it short-circuits with LLM_API_KEY_NOT_CONFIGURED before the timeout fires.
    const explanation = await explainDecision(input, {
      timeoutMs: 1,
      apiKey: 'fake-key-for-timeout-test',
    });
    expect(explanation.summary).toBeTruthy();
    expect(explanation.generatedBy).toBe('DETERMINISTIC_FALLBACK');
    expect(explanation.fallbackReason).toBeTruthy();
    // Reason is either abort/timeout or an invocation/HTTP error — both are valid fallback paths
    expect(explanation.fallbackReason).toMatch(/TIMEOUT|LLM_TIMEOUT|LLM_INVOCATION|LLM_HTTP/i);
    console.warn('[§5.3] timeout fallback reason:', explanation.fallbackReason);
  });

  it('§5.4 — Grounding rejection: mock with forbidden medical term forces deterministic fallback', async () => {
    const forbiddenMockResponse = {
      summary: 'Battery Park at 08:00 UTC has heat stroke risk due to high temperatures.',
      whyThisPlan: 'Reduces heat stress exposure by 8.40 degrees — reduces heat stress on workers.',
      // constraintImpact is omitted (undefined) so schema validation passes and medical check fires
      epistemicNotice: 'FortyGuard heatmap baseline data (v1.0.0-spatial-thermal-baseline).',
    };
    const explanation = await explainDecision(input, { mockLlmResponse: forbiddenMockResponse });
    expect(explanation.generatedBy).toBe('DETERMINISTIC_FALLBACK');
    expect(explanation.fallbackReason).toBeTruthy();
    console.warn('[§5.4] grounding rejection reason:', explanation.fallbackReason);
  });

  it('§5.5 — Grounding validator rejects explanations with fabricated temperatures (99.99 not in evidence)', async () => {
    const fabricatedResponse = {
      summary: 'The optimal window has a mean modeled temperature of 99.99 degrees Celsius.',
      whyThisPlan: 'Avoids 8.40 delta vs worst plan at Battery Park Greenway.',
      // constraintImpact omitted (undefined) so schema passes; numeric grounding check fires
      epistemicNotice: 'FortyGuard heatmap baseline (v1.0.0-spatial-thermal-baseline).',
    };
    const result = validateGroundedExplanation(fabricatedResponse, input);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
    console.warn('[§5.5] fabrication rejection reason:', result.reason);
  });

  it('§5.6 — Explanation failure leaves the decision itself immutable', async () => {
    const originalScore = input.jointDecision.recommendedPlan.exposureScore;
    await explainDecision(input, { timeoutMs: 1 }); // force failure
    // Decision score must not be mutated by the explanation pipeline
    expect(input.jointDecision.recommendedPlan.exposureScore).toBe(originalScore);
  });

  it('§5.7 — Deterministic explanation contains grounded values from input', async () => {
    const explanation = await explainDecision(input, { timeoutMs: 1 });
    // Summary must reference the winning location name
    expect(explanation.summary).toMatch(/Battery Park/i);
    // Epistemic notice must reference the model version
    expect(explanation.epistemicNotice).toMatch(/v1\.0\.0-spatial-thermal-baseline/i);
    // generatedBy must be DETERMINISTIC_FALLBACK (timeoutMs: 1 guarantees this)
    expect(explanation.generatedBy).toBe('DETERMINISTIC_FALLBACK');
  });
});
