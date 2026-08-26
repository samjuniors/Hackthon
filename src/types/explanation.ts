import type {
  JointDecisionResult,
  WhatIfScenarioResult,
} from './domain';

import type { DataSourceMode } from './provenance';
import type { AIProviderName } from './provider';

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
  /** Which AI provider actually produced this grounded explanation ('NONE' for deterministic). */
  providerUsed?: AIProviderName;
  /** Ordered trace of providers attempted + why each fell back. Empty when the first provider succeeded. */
  fallbackTrace?: string[];
}
