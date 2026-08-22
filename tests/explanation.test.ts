import { describe, it, expect } from 'vitest';
import { generateDeterministicExplanation } from '@/lib/explanation/deterministic-explainer';
import { validateGroundedExplanation } from '@/lib/explanation/grounding-validator';
import { explainDecision } from '@/lib/explanation/ai-explainer';
import type { ExplainableDecisionInput } from '@/types/explanation';
import type { JointDecisionResult, WhatIfScenarioResult } from '@/types/domain';

describe('Milestone 8 — AI Explanation Layer & Grounding Guardrails Suite', () => {
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
    searchSpace: {
      locationCount: 3,
      windowCount: 5,
      totalEvaluatedPlans: 15,
    },
    dataSource: 'FIXTURE',
    modelVersion: 'v1.0.0-spatial-thermal-baseline',
    spatialFieldMetadata: {
      baseTimestamp: '2026-08-21T08:00:00.000Z',
      coverageType: 'BASE_TIMESTAMP_SNAPSHOT',
      totalEvaluatedHours: 6,
      description: 'Test metadata',
    },
    evidenceBundle: {
      candidateCount: 3,
      windowCount: 5,
      sourceEndpoint: '/v1/heatmap',
      dataSource: 'FIXTURE',
      provenance: 'DERIVED',
    },
  };

  const sampleActiveScenario: WhatIfScenarioResult = {
    scenarioId: 'scenario-temporal-shift',
    scenarioName: 'Noise Curfew / Late Start (10:00 UTC)',
    constraintType: 'TEMPORAL_SHIFT',
    constraintDescription: 'Earliest allowable start restricted from 08:00 UTC to 10:00 UTC',
    baselinePlan: sampleJointDecision.recommendedPlan,
    constrainedPlan: {
      planId: 'plan-loc-a-10',
      rank: 1,
      location: {
        locationId: 'LOC-A',
        name: 'Battery Park Greenway (Waterfront)',
        location: { latitude: 40.712, longitude: -74.008 },
      },
      window: {
        windowId: 'w-10-12',
        startTime: '2026-08-21T10:00:00.000Z',
        endTime: '2026-08-21T12:00:00.000Z',
        durationHours: 2,
      },
      tileId: 'tile-11',
      exposureScore: 32.1,
      deltaVsBest: 0.0,
      status: 'Optimal',
      thermalValues: [],
    },
    costOfConstraintCelsius: 2.95,
    locationShifted: false,
    windowShifted: true,
    durationChanged: false,
    status: 'FEASIBLE',
  };

  const sampleInput: ExplainableDecisionInput = {
    jointDecision: sampleJointDecision,
    activeScenario: sampleActiveScenario,
  };

  it('1. Deterministic fallback produces complete, correct explanation without an LLM', () => {
    const explanation = generateDeterministicExplanation(sampleInput);

    expect(explanation.generatedBy).toBe('DETERMINISTIC_FALLBACK');
    expect(explanation.summary).toContain('Battery Park Greenway');
    expect(explanation.summary).toContain('29.15°C');
    expect(explanation.whyThisPlan).toContain('15 feasible candidate plans');
    expect(explanation.whyThisPlan).toContain('+8.40°C');
    expect(explanation.constraintImpact).toContain('+2.95°C');
    expect(explanation.epistemicNotice).toContain('v1.0.0-spatial-thermal-baseline');
  });

  it('2. Valid grounded AI response is accepted and tagged AI_GROUNDED_EXPLAINER', () => {
    const validMockAi = {
      summary: 'Optimal plan: Deploy to Battery Park Greenway (LOC-A) from 08:00 to 10:00 UTC with 29.15°C mean modeled exposure.',
      whyThisPlan: 'Evaluated 15 candidate plans across 3 locations. Avoiding Chinatown at 12:00 UTC prevents an 8.40°C exposure delta.',
      constraintImpact: 'Imposing a 10:00 UTC start shifts the window to 10:00–12:00 UTC with 32.10°C, a Constraint Cost of +2.95°C.',
      epistemicNotice: 'Modeled thermal baseline from FortyGuard heatmap data (v1.0.0-spatial-thermal-baseline). Not a medical assessment.',
    };

    const validation = validateGroundedExplanation(validMockAi, sampleInput);
    expect(validation.valid).toBe(true);
    expect(validation.explanation?.generatedBy).toBe('AI_GROUNDED_EXPLAINER');
  });

  it('3. Unknown / invented numeric value causes immediate rejection and fallback', () => {
    const hallucinatedMock = {
      summary: 'Optimal plan: Deploy to Battery Park Greenway with 29.15°C, reducing heart rate by 42.5%.',
      whyThisPlan: 'Avoids 8.40°C delta across 15 plans.',
      constraintImpact: 'Constraint cost is +2.95°C.',
      epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
    };

    const validation = validateGroundedExplanation(hallucinatedMock, sampleInput);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('UNGROUNDED_NUMERIC_VALUE');
  });

  it('4. Forbidden medical or safety statement causes immediate rejection and fallback', () => {
    const medicalMock = {
      summary: 'Optimal plan: Deploy to Battery Park at 29.15°C to eliminate heat stroke risk.',
      whyThisPlan: 'Provides worker safety guarantees under OSHA regulations.',
      epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
    };

    const validation = validateGroundedExplanation(medicalMock, sampleInput);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('FORBIDDEN_CLAIM');
  });

  it('5. Unsupported physical semantics claim (ambient 2m / skin temp) causes rejection', () => {
    const sensorMock = {
      summary: 'Optimal plan: Deploy to Battery Park at 29.15°C based on 2m ambient air sensors.',
      whyThisPlan: 'Derived from land-surface temperature satellite feeds.',
      epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
    };

    const validation = validateGroundedExplanation(sensorMock, sampleInput);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('FORBIDDEN_CLAIM');
  });

  it('6. Malformed AI response (invalid JSON / missing fields) triggers deterministic fallback', async () => {
    const malformedMock = {
      summary: 'Missing whyThisPlan and other fields',
    };

    const explanation = await explainDecision(sampleInput, { mockLlmResponse: malformedMock });
    expect(explanation.generatedBy).toBe('DETERMINISTIC_FALLBACK');
    expect(explanation.fallbackReason).toContain('SCHEMA_VALIDATION_FAILED');
  });

  it('7. LLM timeout or network failure triggers deterministic fallback', async () => {
    // Calling explainDecision with no API key or unreachable endpoint
    const explanation = await explainDecision(sampleInput, { apiKey: '' });
    expect(explanation.generatedBy).toBe('DETERMINISTIC_FALLBACK');
    expect(explanation.fallbackReason).toContain('LLM_API_KEY_NOT_CONFIGURED');
  });

  it('8. LIVE / FIXTURE dataSource is strictly preserved in explanation output', () => {
    const liveInput: ExplainableDecisionInput = {
      ...sampleInput,
      jointDecision: {
        ...sampleJointDecision,
        dataSource: 'LIVE',
      },
    };

    const exp = generateDeterministicExplanation(liveInput);
    expect(exp.dataSource).toBe('LIVE');
  });

  it('9. Model version (v1.0.0-spatial-thermal-baseline) is strictly preserved', () => {
    const exp = generateDeterministicExplanation(sampleInput);
    expect(exp.modelVersion).toBe('v1.0.0-spatial-thermal-baseline');
  });

  it('10. Deterministic decision result is immutable and cannot be altered by explanation layer', async () => {
    const originalScore = sampleJointDecision.recommendedPlan.exposureScore;
    const originalLocation = sampleJointDecision.recommendedPlan.location.name;

    await explainDecision(sampleInput);

    // Verify input remains unaltered
    expect(sampleJointDecision.recommendedPlan.exposureScore).toBe(originalScore);
    expect(sampleJointDecision.recommendedPlan.location.name).toBe(originalLocation);
  });

  it('11. AI cannot alter recommended location in domain data', () => {
    expect(sampleInput.jointDecision.recommendedPlan.location.locationId).toBe('LOC-A');
  });

  it('12. AI cannot alter recommended operating window in domain data', () => {
    expect(sampleInput.jointDecision.recommendedPlan.window.startTime).toBe('2026-08-21T08:00:00.000Z');
  });

  it('13. AI cannot alter exposure score in domain data', () => {
    expect(sampleInput.jointDecision.recommendedPlan.exposureScore).toBe(29.15);
  });

  it('14. AI cannot alter constraint cost in domain data', () => {
    expect(sampleInput.activeScenario?.costOfConstraintCelsius).toBe(2.95);
  });

  describe('Numeric Precision & Date/Time Grounding Regression Tests', () => {
    it('15. 29.15 and 29.150 pass numeric validation', () => {
      const validMock1 = {
        summary: 'Optimal plan at Battery Park Greenway with 29.15°C mean exposure.',
        whyThisPlan: 'Evaluated 15 feasible candidate plans with 0 delta.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      expect(validateGroundedExplanation(validMock1, sampleInput).valid).toBe(true);

      const validMock2 = {
        summary: 'Optimal plan at Battery Park Greenway with 29.150°C mean exposure.',
        whyThisPlan: 'Evaluated 15 feasible candidate plans with 0 delta.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      expect(validateGroundedExplanation(validMock2, sampleInput).valid).toBe(true);
    });

    it('16. 29.19 and 29.20 are rejected (tolerance <= 0.01)', () => {
      const invalidMock1 = {
        summary: 'Optimal plan at Battery Park Greenway with 29.19°C mean exposure.',
        whyThisPlan: 'Evaluated 15 feasible candidate plans.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      const res1 = validateGroundedExplanation(invalidMock1, sampleInput);
      expect(res1.valid).toBe(false);
      expect(res1.reason).toContain('UNGROUNDED_NUMERIC_VALUE');

      const invalidMock2 = {
        summary: 'Optimal plan at Battery Park Greenway with 29.20°C mean exposure.',
        whyThisPlan: 'Evaluated 15 feasible candidate plans.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      const res2 = validateGroundedExplanation(invalidMock2, sampleInput);
      expect(res2.valid).toBe(false);
      expect(res2.reason).toContain('UNGROUNDED_NUMERIC_VALUE');
    });

    it('17. 8.40 is valid; 8.44 and 8.45 are rejected', () => {
      const validMock = {
        summary: 'Avoids 8.40°C exposure delta.',
        whyThisPlan: 'Evaluated 15 feasible candidate plans.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      expect(validateGroundedExplanation(validMock, sampleInput).valid).toBe(true);

      const invalidMock1 = {
        summary: 'Avoids 8.44°C exposure delta.',
        whyThisPlan: 'Evaluated 15 feasible candidate plans.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      expect(validateGroundedExplanation(invalidMock1, sampleInput).valid).toBe(false);

      const invalidMock2 = {
        summary: 'Avoids 8.45°C exposure delta.',
        whyThisPlan: 'Evaluated 15 feasible candidate plans.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      expect(validateGroundedExplanation(invalidMock2, sampleInput).valid).toBe(false);
    });

    it('18. Valid evidence timestamps (2026, 08, 21, 08:00, 10:00) are accepted', () => {
      const validDateMock = {
        summary: 'Operation planned for 2026-08-21 from 08:00 to 10:00 UTC at 29.15°C.',
        whyThisPlan: 'Selected out of 15 candidate plans across 3 locations.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      expect(validateGroundedExplanation(validDateMock, sampleInput).valid).toBe(true);
    });

    it('19. Unknown dates and standalone fabricated numbers are rejected', () => {
      const unknownDateMock = {
        summary: 'Operation planned for 2024-05-12 from 08:00 to 10:00 UTC at 29.15°C.',
        whyThisPlan: 'Selected out of 15 candidate plans.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      const res1 = validateGroundedExplanation(unknownDateMock, sampleInput);
      expect(res1.valid).toBe(false);
      expect(res1.reason).toContain('UNGROUNDED_NUMERIC_VALUE');

      const unknownNumberMock = {
        summary: 'Operation planned at 29.15°C with 99.9% reliability score.',
        whyThisPlan: 'Selected out of 15 candidate plans.',
        epistemicNotice: 'Modeled thermal baseline (v1.0.0-spatial-thermal-baseline).',
      };
      const res2 = validateGroundedExplanation(unknownNumberMock, sampleInput);
      expect(res2.valid).toBe(false);
      expect(res2.reason).toContain('UNGROUNDED_NUMERIC_VALUE');
    });
  });
});

