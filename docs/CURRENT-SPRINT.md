# Current Sprint — Milestone 9: System Hardening & Failure States

**Status:** COMPLETED & VERIFIED  
**Current Milestone:** M9 — System Hardening & Failure States  
**Submission Deadline:** 2026-08-30  
**Last Updated:** 2026-08-21  

---

## 🎯 Sprint Goal
Harden the entire Thermal Decision Engine pipeline under failure, strictly enforce numeric grounding precision ($\le 0.01^\circ\text{C}$), enforce semantic date/time handling, cap FortyGuard interactive polling timeout to 30s, ensure clean state transitions on error recovery, and add a comprehensive 13-test failure-state invariant suite.

---

## 📋 Task Breakdown

### Milestone 4 Execution (`COMPLETED`)
- [x] **Phase 0 — Toolchain Reconciliation:** Integrated `maplibre-gl`, `@playwright/test`, `eslint-plugin-jsx-a11y`, initialized `shadcn/ui` (button, card, badge, slider, tabs). Verified `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- [x] **Phase 1 — Evidence Gates:** Created `scripts/capture-fixtures.mjs`. Tested live FortyGuard endpoints (`/v1/system/fetch-api-key-usage`, `/v1/heatmap`, `/v1/env_params`). Captured raw API shapes into `tests/fixtures/`.
- [x] **FortyGuard Adapter (`src/lib/fortyguard/adapter.ts`):** Zod request/response validation, async polling, HTTP error mapping, in-memory session caching, zero credential leakage.
- [x] **Point-to-Polygon Spatial Mapper (`src/lib/spatial/mapper.ts`):** Zero-dependency ray casting point-in-polygon algorithm. Throws `OutsideCoverageError` if target location is outside tile coverage (zero silent fallbacks).
- [x] **Deterministic Exposure Evaluator (`src/lib/decision-engine/evaluator.ts`):** Calculates mean temperature exposure score $E(W_i) = \frac{1}{n} \sum T(\text{location}, t)$ across sliding candidate windows. Enforces +12h forecast lead boundary.
- [x] **Decision Pipeline & API Boundary (`src/app/api/decision/route.ts`):** Server-side use-case boundary returning `DecisionResult` and raw GeoJSON thermal surface.
- [x] **Decision Workspace UI (`src/app/page.tsx` & `src/components/ThermalMap.tsx`):** Spatial MapLibre GL tile rendering, candidate location presets, duration sliders, optimal operating window card, and data provenance breakdown.
### Milestone 5 — Spatial Location Decision Slice (`COMPLETED & VERIFIED`)
- [x] **Empirical Evidence Lock:** Locked 3-location hourly snapshot dataset across 3 distinct tile IDs (`LOC-A` in `tile-11`, `LOC-B` in `tile-12`, `LOC-C` in `tile-13`). Zero boundary ambiguity or synthetic values.
- [x] **Spatial Decision Domain Model:** Implemented `CandidateLocation`, `HourlyTileTemperature` (with `provenance: 'DERIVED'`), `RankedLocationResult`, and `SpatialDecisionResult`.
- [x] **Deterministic Multi-Location Evaluator:** Extended `evaluateCandidateLocations()` to rank candidate sites by modeled thermal exposure with stable `locationId` tie-breaking. Kept `baseObservationTime` out of mathematical ranking logic.
- [x] **Decision Route Extension (`/api/decision`):** Supports candidate arrays, validates duplicate candidate IDs/coordinates, normalizes observations per candidate with zero cross-location leakage.
- [x] **Spatial Decision Workspace UI:** Displays 3 candidate markers on MapLibre map, highlights winning site with `★ Rank #1 Winner`, displays savings banner (`+2.20°C` savings vs worst site), and provides interactive duration recalculation.
- [x] **Verification & Adversarial Testing:** 36 Vitest tests passing across 7 test suites (100% pass rate). Playwright smoke test verified with screenshot saved at `tests/e2e/workspace-smoke.png`.
### Milestone 6 — Joint Spatial-Temporal Decision Model (`COMPLETED & VERIFIED`)
- [x] **Joint Decision Domain Contract:** Implemented `CandidatePlan` and `JointDecisionResult` in `src/types/domain.ts`.
- [x] **Exhaustive Joint Evaluator:** Implemented `evaluateJointDecision()` evaluating $\mathcal{L} \times \mathcal{W}$ using exact 3-tier deterministic ordering (lower score $\to$ earlier start $\to$ stable locationId).
- [x] **Route Integration:** Extended `/api/decision` returning `jointDecision` with complete search-space metrics (`locationCount`, `windowCount`, `totalEvaluatedPlans`).
- [x] **Joint Decision Workspace UI:** Prominently highlights `Recommended Operational Plan` (WHERE + WHEN), WHY THIS PLAN search-space metrics, FortyGuard Joint Advantage banner (+8.40°C delta vs worst feasible plan), and full 15-plan ranking matrix.
- [x] **Verification & Parity Testing:** 46 Vitest tests passing across 8 test suites (100% pass rate). Playwright smoke test verified with updated screenshot.
### Milestone 7 — What-If Constraint Sensitivity (`COMPLETED & VERIFIED`)
- [x] **Semantic Remediation:** Completely excised marketing terms like "Savings". Quantified delta as exact arithmetic mean temperature differences ("Constraint Cost" / "Modeled Temperature Increase").
- [x] **Scenario Domain Contract:** Implemented `WhatIfScenarioResult` and `ScenarioAnalysisResult` in `src/types/domain.ts`.
- [x] **Deterministic Constraint Engine:** Implemented `evaluateWhatIfScenarios()` calculating exact cost $C = E(P') - E(P_0)$ across 3 canonical scenarios:
  1. `TEMPORAL_SHIFT` (Late start 10:00 UTC) $\to +2.95^\circ\text{C}$, `windowShifted: true`.
  2. `LOCATION_LOCK` (Chinatown asphalt canyon only) $\to +2.20^\circ\text{C}$, `locationShifted: true`.
  3. `DURATION_EXPANSION` (2h $\to$ 4h shift) $\to +1.48^\circ\text{C}$, `durationChanged: true`.
- [x] **Interactive What-If UI:** Created 3-Box visual flow ($P_0 \to \text{Constraint} \to P'$) with clear constraint cost readout and shift status badges.
- [x] **Verification & Parity:** 52 Vitest tests passing across 9 test suites (100% pass rate). Playwright smoke test verified with screenshot.
### Milestone 8 — Read-Only AI Explanation Layer (`COMPLETED & VERIFIED`)
- [x] **Explanation Domain Contract:** Implemented `ExplainableDecisionInput` and `DecisionExplanation` in `src/types/explanation.ts`.
- [x] **Deterministic Explainer:** Implemented `generateDeterministicExplanation()` producing structured, factual summaries without LLM dependencies.
- [x] **Multi-Layered Grounding Validator:** Implemented `validateGroundedExplanation()` enforcing numeric allow-lists, rejecting forbidden medical/safety claims, and validating strict JSON schemas.
- [x] **AI Explainer Engine:** Implemented `explainDecision()` with OpenAI/Gemini support, grounding prompt, timeout handling, and automatic fallback to rule-based explanation on failure or grounding violation.
- [x] **Server Explanation Route (`/api/explain`):** Created standalone server-side route completely decoupled from FortyGuard credentials.
- [x] **Explanation UI:** Added `Decision Explanation & Evidence Synthesis` section with operational summary, why it wins, constraint impact, epistemic notice, and refresh button.
### Milestone 9 — System Hardening & Failure States (`COMPLETED & VERIFIED`)
- [x] **Numeric Grounding Hardening:** Tightened float comparison tolerance from $\pm 0.05 \to \pm 0.01$. Added date separator sanitization (`2026-08-21` $\to$ `2026 08 21`) and semantic date component extraction.
- [x] **FortyGuard Polling Timeout Hardening:** Reduced interactive polling ceiling from 120s (60 attempts) to 30s (15 attempts).
- [x] **State Transition Invariants:** Verified clean state reset on error in React state (`setDecision(null)`, `setJointDecision(null)`, `setExplanation(null)`).
- [x] **Comprehensive Failure-State Test Suite:** Added `tests/failure_states.test.ts` (13 tests) covering 401 missing key, 401 invalid key, 500 error, malformed activity_id, polling timeout, missing hourly snapshot, +12h lead time boundary, outside coverage, explanation timeout fallback, grounding rejection fallback, decision immutability, LIVE failure isolation, and FIXTURE preservation.
- [x] **Verification & Parity:** 84 Vitest tests passing across 11 test suites (100% pass rate). Next.js build clean. Playwright E2E smoke test passing.





