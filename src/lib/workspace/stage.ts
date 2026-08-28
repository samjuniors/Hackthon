/**
 * Explicit workspace state machine (Section 1) + Generate readiness (Section 11).
 *
 *   EMPTY → LOCATION_SELECTED → AOI_VALID → READY → GENERATING → RESULT
 *                                          ↘ AOI_INVALID (recovery: fix the area)
 *   ERROR (any stage → provider/pipeline failure, with a recovery action)
 *   NO_DEMO_CAPTURE (DEMO data source, location without a genuine capture)
 *
 * DEMO and LIVE are DATA SOURCES that feed the SAME workflow — never implicit
 * workspace states. All derivation is PURE so the exact logic the page renders
 * is unit-testable without a browser.
 *
 * Pure logic only — no React, no zod, no fetch. Safe for client + tests.
 */
import type { AoiValidationResult } from '@/lib/spatial/aoi-validation';

/**
 * The explicit workspace stages. Rendered on the app root via
 * data-workflow-stage so the state machine is observable and testable.
 */
export type WorkflowStage =
  | 'EMPTY'
  | 'LOCATION_SELECTED'
  | 'AOI_VALID'
  | 'AOI_INVALID'
  | 'READY'
  | 'GENERATING'
  | 'RESULT'
  | 'ERROR'
  | 'NO_DEMO_CAPTURE';

export interface WorkspaceStageInput {
  /** True when an operating location is selected. */
  hasLocation: boolean;
  /** True when an analysis AOI geometry exists for the location. */
  hasAoi: boolean;
  /** Validation result for the canonical AOI (valid flag only is read). */
  aoiValid: boolean;
  /** True when the analysis is ready to Generate (temporal + candidates valid). */
  ready: boolean;
  /** True while the decision pipeline is running. */
  loading: boolean;
  /** True when a completed analysis result exists. */
  hasResult: boolean;
  /** Stable error code currently surfaced, or null. */
  errorCode: string | null;
}

/**
 * Derive the CURRENT workspace stage from observable state.
 *
 * Precedence (first match wins):
 *   EMPTY           — no location: nothing else may exist.
 *   GENERATING      — pipeline in flight (user pressed Generate).
 *   NO_DEMO_CAPTURE — DEMO source + location without a genuine capture.
 *   AOI_INVALID     — the canonical AOI is currently invalid (retained visibly).
 *   ERROR           — a provider/pipeline error is surfaced (with recovery).
 *   RESULT          — a completed analysis result is displayed.
 *   READY           — everything valid; Generate enabled.
 *   AOI_VALID       — AOI configured; temporal/candidates still incomplete.
 *   LOCATION_SELECTED — location chosen, AOI not yet established.
 */
export function deriveWorkflowStage(input: WorkspaceStageInput): WorkflowStage {
  if (!input.hasLocation) return 'EMPTY';
  if (input.loading) return 'GENERATING';
  if (input.errorCode === 'NO_DEMO_CAPTURE') return 'NO_DEMO_CAPTURE';
  if (input.hasAoi && !input.aoiValid) return 'AOI_INVALID';
  if (input.errorCode) return 'ERROR';
  if (input.hasResult) return 'RESULT';
  if (input.ready) return 'READY';
  if (input.hasAoi) return 'AOI_VALID';
  return 'LOCATION_SELECTED';
}

export interface GenerateReadinessInput {
  /** Data source mode — DEMO (FIXTURE) and LIVE have different contracts. */
  mode: 'LIVE' | 'FIXTURE';
  /** True when an operating location is selected. */
  hasLocation: boolean;
  /** Validation of the canonical AOI (null when no AOI exists yet). */
  aoiValidation: AoiValidationResult | null;
  /** True when the explicit WHEN inputs are complete and valid. */
  temporalValid: boolean;
  /** LIVE user-placed candidate sites (presence + AOI containment flags). */
  candidateCount: number;
  outsideCandidateCount: number;
  /** DEMO only: true when the selected location has a genuine capture. */
  demoCaptureAvailable: boolean;
}

export interface GenerateReadiness {
  /** True when the Generate control may be pressed. */
  enabled: boolean;
  /** Human reason shown when disabled (undefined when enabled). */
  reason?: string;
}

/**
 * Derive whether Generate may run and, when it may not, the single most
 * actionable reason WHY (Section 11 — Generate is enabled only when
 * location + AOI + temporal + candidate contracts all hold).
 */
export function deriveGenerateReadiness(input: GenerateReadinessInput): GenerateReadiness {
  if (!input.hasLocation) {
    return { enabled: false, reason: 'Select an operating location first.' };
  }
  if (input.aoiValidation && !input.aoiValidation.valid) {
    return { enabled: false, reason: input.aoiValidation.message };
  }
  if (input.mode === 'FIXTURE' && !input.demoCaptureAvailable) {
    return {
      enabled: false,
      reason: 'No DEMO capture available for this location — switch to LIVE or pick a Manhattan DEMO location.',
    };
  }
  if (!input.temporalValid) {
    return { enabled: false, reason: 'Set a valid WHEN date and time window.' };
  }
  if (input.mode === 'LIVE') {
    if (input.candidateCount === 0) {
      return {
        enabled: false,
        reason: 'Add at least one candidate location inside the analysis area — LIVE never fabricates candidates.',
      };
    }
    if (input.outsideCandidateCount > 0) {
      const plural = input.outsideCandidateCount > 1 ? 's' : '';
      return {
        enabled: false,
        reason: `${input.outsideCandidateCount} candidate site${plural} outside the analysis area — move ${plural ? 'them' : 'it'} inside or drag the AOI to cover.`,
      };
    }
  }
  return { enabled: true };
}
