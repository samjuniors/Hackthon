import type {
  JointDecisionResult,
  WhatIfScenarioResult,
} from './domain';

import type { DataSourceMode } from './provenance';

export type ExplanationGeneratorType = 'AI_GROUNDED_EXPLAINER' | 'DETERMINISTIC_FALLBACK';

export interface ExplainableDecisionInput {
  jointDecision: JointDecisionResult;
  activeScenario?: WhatIfScenarioResult;
}

export interface DecisionExplanation {
  summary: string;
  whyThisPlan: string;
  constraintImpact?: string;
  evidenceGrounding: {
    referencedTemperatures: number[];
    referencedLocations: string[];
    referencedTimes: string[];
    allowedNumbers: number[];
  };
  epistemicNotice: string;
  generatedBy: ExplanationGeneratorType;
  fallbackReason?: string;
  dataSource: DataSourceMode;
  modelVersion: 'v1.0.0-spatial-thermal-baseline';
}
