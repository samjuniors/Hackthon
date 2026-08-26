import type {
  ExplainableDecisionInput,
  DecisionExplanation,
} from '@/types/explanation';

/**
 * Extracts all verified numeric values from the decision input for grounding allow-lists.
 */
export function extractAllowedNumbers(input: ExplainableDecisionInput): number[] {
  const nums = new Set<number>();

  const rec = input.jointDecision.recommendedPlan;
  nums.add(rec.exposureScore);
  nums.add(rec.window.durationHours);
  nums.add(input.jointDecision.searchSpace.locationCount);
  nums.add(input.jointDecision.searchSpace.windowCount);
  nums.add(input.jointDecision.searchSpace.totalEvaluatedPlans);

  // Ranked plans exposure scores and deltas
  for (const plan of input.jointDecision.rankedPlans) {
    nums.add(plan.exposureScore);
    nums.add(plan.deltaVsBest);
    nums.add(plan.rank);
  }

  // Hours & Evidence Timestamps
  const timestamps = [
    rec.window.startTime,
    rec.window.endTime,
    input.jointDecision.spatialFieldMetadata?.baseTimestamp,
  ];
  if (input.activeScenario?.constrainedPlan) {
    timestamps.push(input.activeScenario.constrainedPlan.window.startTime);
    timestamps.push(input.activeScenario.constrainedPlan.window.endTime);
  }

  for (const ts of timestamps) {
    if (ts) {
      const d = new Date(ts);
      if (!isNaN(d.getTime())) {
        nums.add(d.getUTCFullYear());
        nums.add(d.getUTCMonth() + 1);
        nums.add(d.getUTCDate());
        nums.add(d.getUTCHours());
        nums.add(d.getUTCMinutes());
      }
    }
  }

  if (input.activeScenario) {
    if (input.activeScenario.costOfConstraintCelsius !== null) {
      nums.add(input.activeScenario.costOfConstraintCelsius);
    }
    if (input.activeScenario.constrainedPlan) {
      const cPlan = input.activeScenario.constrainedPlan;
      nums.add(cPlan.exposureScore);
      nums.add(cPlan.window.durationHours);
    }
  }

  // Common descriptive small numbers (1 for rank #1, 0 for delta baseline)
  nums.add(1);
  nums.add(0);


  return Array.from(nums).sort((a, b) => a - b);
}

/**
 * Generates a purely deterministic, rule-based operational explanation from the verified EvidenceBundle.
 */
export function generateDeterministicExplanation(
  input: ExplainableDecisionInput,
  fallbackReason?: string
): DecisionExplanation {
  const rec = input.jointDecision.recommendedPlan;
  const worst = input.jointDecision.rankedPlans[input.jointDecision.rankedPlans.length - 1];
  const search = input.jointDecision.searchSpace;

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

  const worstStartUtc = new Date(worst.window.startTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });

  const summary = `Recommended Plan: Deploy to ${rec.location.name} (${rec.location.locationId}) from ${recStartUtc} to ${recEndUtc} UTC. The mean modeled temperature across the ${rec.window.durationHours}h operating window is ${rec.exposureScore.toFixed(2)}°C.`;

  const whyThisPlan = `Out of ${search.totalEvaluatedPlans} feasible candidate plans (${search.locationCount} candidate locations × ${search.windowCount} sliding windows), this plan achieved the lowest modeled exposure score (${rec.exposureScore.toFixed(2)}°C). Deploying at this site and time avoids a +${worst.deltaVsBest.toFixed(2)}°C modeled exposure delta compared to the highest-exposure feasible plan (${worst.location.name} @ ${worstStartUtc} UTC).`;

  let constraintImpact: string | undefined;

  if (input.activeScenario) {
    const sc = input.activeScenario;
    if (sc.status === 'FEASIBLE' && sc.constrainedPlan && sc.costOfConstraintCelsius !== null) {
      const cStartUtc = new Date(sc.constrainedPlan.window.startTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      });
      const cEndUtc = new Date(sc.constrainedPlan.window.endTime).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      });

      constraintImpact = `Under ${sc.scenarioName} (${sc.constraintDescription}), the constrained optimal plan shifts to ${sc.constrainedPlan.location.name} from ${cStartUtc} to ${cEndUtc} UTC with a modeled score of ${sc.constrainedPlan.exposureScore.toFixed(2)}°C. Imposing this constraint carries a Constraint Cost of +${sc.costOfConstraintCelsius.toFixed(2)}°C mean modeled temperature increase.`;
    } else {
      constraintImpact = `Under ${sc.scenarioName} (${sc.constraintDescription}), no feasible operational plan could be scheduled within the active constraints.`;
    }
  }

  const epistemicNotice = `This explanation interprets deterministic modeled thermal baselines derived from FortyGuard heatmap data (${input.jointDecision.modelVersion}). Specific physical sensor measurement level (ambient air vs skin temperature) is not asserted. This is not a physiological or medical heat-stress evaluation.`;

  const allowedNumbers = extractAllowedNumbers(input);

  const referencedTemperatures = [rec.exposureScore, worst.exposureScore];
  if (input.activeScenario?.constrainedPlan) {
    referencedTemperatures.push(input.activeScenario.constrainedPlan.exposureScore);
  }

  const referencedLocations = [rec.location.name, worst.location.name];
  if (input.activeScenario?.constrainedPlan) {
    referencedLocations.push(input.activeScenario.constrainedPlan.location.name);
  }

  const referencedTimes = [`${recStartUtc}–${recEndUtc} UTC`];

  return {
    summary,
    whyThisPlan,
    constraintImpact,
    evidenceGrounding: {
      referencedTemperatures,
      referencedLocations,
      referencedTimes,
      allowedNumbers,
    },
    epistemicNotice,
    generatedBy: 'DETERMINISTIC_FALLBACK',
    fallbackReason,
    dataSource: input.jointDecision.dataSource,
    modelVersion: input.jointDecision.modelVersion,
  };
}
