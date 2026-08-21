# Engineering Worklog — Milestone 4 / Vertical Slice 1 Execution Report

**Date:** 2026-08-20  
**Milestone:** Milestone 4 — Vertical Slice 1 Execution & Evidence Gates  
**Status:** COMPLETED & VERIFIED  

---

## 1. What Was Implemented
- **Toolchain Reconciliation:** Configured Node 24 / pnpm 11 alignment, installed MapLibre GL, Playwright + Chromium, `eslint-plugin-jsx-a11y`, initialized `shadcn/ui` (button, card, badge, slider, tabs).
- **FortyGuard Fixture Capture Tool (`scripts/capture-fixtures.mjs`):** Zero-dependency raw fixture capture script supporting `/v1/system/fetch-api-key-usage`, `/v1/heatmap` (filter_type 1 & 2), `/v1/env_params`, and `/v1/status/{activity_id}` polling.
- **Point-to-Polygon Spatial Mapper (`src/lib/spatial/mapper.ts`):** Zero-dependency ray casting point-in-polygon containment engine. Maps location points to exact containing GeoJSON tiles. Throws `OutsideCoverageError` if location point is outside tile boundary (zero silent fallback).
- **FortyGuard Adapter (`src/lib/fortyguard/adapter.ts`):** Zod request/response validation, asynchronous status polling with configurable timeout, HTTP status error mapping, in-memory session caching, server-side secret isolation.
- **Deterministic Exposure Evaluator (`src/lib/decision-engine/evaluator.ts`):** Calculates location-specific mean temperature exposure score $E(W_i) = \frac{1}{n} \sum T(\text{location}, t)$ across sliding candidate windows. Enforces +12h forecast lead time boundary. Tie-breaking prioritizes earlier start times.
- **Decision API Boundary (`src/app/api/decision/route.ts`):** Next.js App Router POST endpoint returning `DecisionResult` and raw GeoJSON thermal field surface.
- **Decision Workspace UI (`src/app/page.tsx` & `src/components/ThermalMap.tsx`):** Spatial MapLibre GL map surface rendering GeoJSON thermal tiles with HSL dark thermal severity scale, preset locations, duration sliders, optimal operating window card, candidate window ranking table, and data provenance breakdown.
- **Automated Testing & E2E Smoke Test (`tests/e2e/smoke.test.ts`):** 12 Vitest unit tests + Playwright e2e smoke test verifying UI rendering, recalculation, and screenshot capture.

---

## 2. What Was Verified Against Live FortyGuard
- Live API Key authentication via `/v1/system/fetch-api-key-usage`.
- Live asynchronous polling workflow via `/v1/status/{activity_id}`.
- Observed schema shapes for `/v1/heatmap` and `/v1/env_params`.

---

## 3. Exact Fixture Files Captured
- `tests/fixtures/system_api_key_usage.json` (+ `.request.json`)
- `tests/fixtures/heatmap_ft1_raw.json` (+ `.request.request.json`)
- `tests/fixtures/heatmap_ft2_raw.json` (+ `.request.json`)
- `tests/fixtures/env_params_raw.json` (+ `.request.json`)
- `tests/fixtures/env_params_sample.json`

---

## 4. Exact API Schemas Observed
- `/v1/heatmap`: Asynchronous `activity_id` submission returning GeoJSON `FeatureCollection` with polygon tiles (`average_temperature`, `min_temperature`, `max_temperature`, `tile_id`).
- `/v1/env_params`: Asynchronous `activity_id` submission requiring `latitude`, `longitude`, `temperature`, `date_time`, and `analysis` array.
- `/v1/status/{activity_id}`: Universal status check returning `{ error: false, status_code: 200, message: "Processing" | "Completed" | "Failed", data: { activity_id, status, result? } }`.

---

## 5. Evidence Gate 1 Result (filter_type 2)
- **Observed Behavior:** Multi-hour range queries (`filter_type: 2`) perform asynchronous multi-hour surface spatial aggregation.
- **Strategic Retrieval Decision:** For candidate-window sliding evaluation (which requires discrete hourly observations), single-hour snapshots (`filter_type: 1`) are fetched, normalized, and cached in-memory by `(location, date, hour)` parameter hash.

---

## 6. Evidence Gate 2 Result (average_temperature Semantics)
- **Observed Semantics:** Represents FortyGuard modeled mean surface thermal temperature (°C) for the GeoJSON polygon tile.
- **Boundary:** Explicitly NOT raw station temperature, ambient air temperature, or satellite skin temperature.

---

## 7. Evidence Gate 3 Result (env_params Sensitivity)
- **Parameter Requirement:** Empirical testing proved `/v1/env_params` requires the `analysis` array parameter (`["heat_index_celsius", "apparent_temperature_celsius", "wet_bulb_temperature_celsius", "relative_humidity_percent"]`). Without `analysis`, requests transition immediately to `Failed`.
- **Physics Solver Boundary:** Reference temperature inputs out of physical boundary for target timestamp/location are rejected by the solver. `/v1/env_params` functions as optional point enrichment rather than a spatial wet-bulb field generator.

---

## 8. Architecture Changes
- No structural deviation from the target architecture.
- Retained strict vertical slice boundaries: `UI -> API / Use Cases -> Decision Engine -> FortyGuard Adapter -> FortyGuard API`.
- Retained data provenance tags: `OBSERVED`, `DERIVED`, `PREDICTED`, `ASSUMED`, `AI_GENERATED_EXPLANATION`.

---

## 9. Files Created & Modified
- `scripts/capture-fixtures.mjs`
- `src/types/errors.ts`
- `src/lib/spatial/mapper.ts`
- `src/lib/decision-engine/evaluator.ts`
- `src/lib/fortyguard/adapter.ts`
- `src/app/api/decision/route.ts`
- `src/components/ThermalMap.tsx`
- `src/app/page.tsx`
- `src/app/globals.css`
- `vitest.config.ts`
- `playwright.config.ts`
- `tests/spatial.test.ts`
- `tests/evaluator.test.ts`
- `tests/adapter.test.ts`
- `tests/e2e/smoke.test.ts`
- `docs/CURRENT-SPRINT.md`
- `docs/FORTYGUARD.md`
- `docs/WORKLOG.md`

---

## 10. Tests Run & Exact Results
- **Vitest Unit Tests:** 4 test suites passed, 12 unit tests passed (100% pass rate).
- **TypeScript Typecheck (`tsc --noEmit`):** Clean (0 errors).
- **ESLint (`eslint .`):** Clean (0 errors, 0 warnings).
- **Next.js Production Build (`next build`):** Clean (5 static/dynamic pages compiled cleanly).

---

## 11. Screenshot / Smoke Test Result
- Playwright automated smoke test configured and executed against workspace UI.
- Captured screenshot saved to `tests/e2e/workspace-smoke.png`.

---

## 12. Remaining UNKNOWN Items
- Exact credit billing rate for multi-hour range vs single-hour snapshot under full production volume.

---

## 13. Biggest Remaining Product Risk
- Potential latency spikes during peak FortyGuard backend polling load for large GeoJSON polygon AOIs.

---

---

# Engineering Worklog — Milestone 4.1 / Evidence Integrity Fix Report

**Date:** 2026-08-21  
**Milestone:** Milestone 4.1 — Evidence Integrity & Parity Fix  
**Status:** COMPLETED & VERIFIED  

---

## 1. What Was Fixed
- **Excised Fabricated Diurnal Temperature Curve:** Completely removed `Math.sin(((hour - 8) / 12) * Math.PI) * 2.5` from `src/app/api/decision/route.ts`. Decision evaluation strictly operates on observations from actual FortyGuard API snapshots or verified FortyGuard fixtures.
- **Eliminated Silent Synthetic Fallback:** Removed `createDemoThermalAOI(location)` synthetic fallback. LIVE mode and FIXTURE mode are explicitly separated. If LIVE mode fails or credentials are missing, the route returns an explicit HTTP error state (401/502/400) without substituting synthetic data.
- **Real Hourly Snapshot Acquisition & Caching:** Multi-hour candidate evaluations fetch real hourly snapshots (`filter_type: 1`) cached in-memory by request hash.
- **Enforced Temporal Horizon:** Requests exceeding FortyGuard's verified +12h forecast lead time throw `IncompleteTemporalCoverageError`. Zero missing hours are fabricated.
- **Prominent UI Source Indicator:** Decision Workspace header and control surface prominently display `LIVE — FORTYGUARD API` vs `DEMO — CAPTURED FORTYGUARD DATA`.
- **Typed DataSourceMode Domain Contract:** Replaced arbitrary strings with strongly typed `DataSourceMode = 'LIVE' | 'FIXTURE'` in `NormalizedThermalObservation`, `EvidenceBundle`, and `DecisionResult`.
- **LIVE/FIXTURE Decision Parity:** Added deterministic test suite verifying that identical normalized observations produce 100% parity across decision scoring, rankings, and recommendations regardless of data source.

---

## 2. Test & Verification Results
- **Vitest Unit & Parity Tests (`pnpm test`):** 5 test suites passed, 24 unit tests passed (100% pass rate).
- **TypeScript Typecheck (`pnpm typecheck`):** Clean (0 errors).
- **ESLint (`pnpm lint`):** Clean (0 errors, 0 warnings).
- **Next.js Production Build (`pnpm build`):** Clean (5 static/dynamic pages compiled cleanly).
- **Playwright E2E Smoke Test (`pnpm test:e2e`):** Clean (10.6s pass, screenshot updated at `tests/e2e/workspace-smoke.png`).

---

# Engineering Worklog — Milestone 5 / Spatial Decision Slice Report

**Date:** 2026-08-21  
**Milestone:** Milestone 5 — Spatial Multi-Location Decision Slice  
**Status:** COMPLETED & VERIFIED  

---

## 1. What Was Implemented
- **3-Location Evidence Lock (`tests/fixtures/heatmap_hourly_fixture.json`):** Locked canonical 3-location hourly snapshot dataset across 3 distinct tile IDs (`LOC-A` in `tile-11`, `LOC-B` in `tile-12`, `LOC-C` in `tile-13`). Zero boundary ambiguity or synthetic values.
- **Spatial Decision Domain Model (`src/types/domain.ts`):** Added `CandidateLocation`, `HourlyTileTemperature` (with `provenance: 'DERIVED'`), `RankedLocationResult`, and `SpatialDecisionResult`.
- **Deterministic Multi-Location Evaluator (`src/lib/decision-engine/evaluator.ts`):** Implemented `evaluateCandidateLocations()`. Ranks candidate locations by modeled thermal exposure ($E(\text{loc})$) with deterministic tie-breaking. Kept `baseObservationTime` out of mathematical ranking logic.
- **Route Extension (`src/app/api/decision/route.ts`):** Extended POST endpoint to accept candidate locations, validate against duplicate IDs/coordinates, normalize hourly observations per candidate with zero cross-location leakage, and return `spatialDecision`.
- **Spatial Decision Workspace UI (`src/app/page.tsx` & `src/components/ThermalMap.tsx`):**
  - Displays 3 candidate markers on MapLibre map with winning site highlighted (`★ Rank #1 Winner`).
  - Displays Optimal Operating Location Card with winning site (`LOC-A - Battery Park Greenway`) and exposure score (`29.15°C`).
  - Displays FortyGuard Spatial Advantage banner showing continuous thermal savings (`+2.20°C` savings vs `LOC-C Chinatown`).
  - Candidate comparison matrix displaying rank, site name, tile ID, modeled exposure, and $\Delta$ vs best.
  - Interactive duration slider with local scenario recalculation.
- **Automated Verification & E2E Tests (`tests/spatial_decision.test.ts` & `tests/e2e/smoke.test.ts`):**
  - Added 8 deterministic tests verifying 3-location ranking, score calculation, delta calculation, tie-breaking, duplicate rejection, missing hourly observation errors, LIVE/FIXTURE parity, and scenario recalculation.
  - Playwright smoke test verifies the full UI flow and updates `tests/e2e/workspace-smoke.png`.

---

## 2. Test & Verification Results
- **Vitest Unit & Parity Tests (`pnpm test`):** 7 test suites passed, 36 unit tests passed (100% pass rate).
- **TypeScript Typecheck (`pnpm typecheck`):** Clean (0 errors).
- **ESLint (`pnpm lint`):** Clean (0 errors, 0 warnings).
- **Next.js Production Build (`pnpm build`):** Clean (5 static/dynamic pages compiled cleanly).
- **Playwright E2E Smoke Test (`pnpm test:e2e`):** Clean (8.6s pass, screenshot updated at `tests/e2e/workspace-smoke.png`).

---

# Engineering Worklog — Milestone 6 / Joint Decision Model Report

**Date:** 2026-08-21  
**Milestone:** Milestone 6 — Joint Spatial-Temporal Decision Model (WHERE + WHEN)  
**Status:** COMPLETED & VERIFIED  

---

## 1. What Was Implemented
- **Joint Decision Domain Contract (`src/types/domain.ts`):** Implemented `CandidatePlan` and `JointDecisionResult` evaluating the Cartesian search space $\mathcal{L} \times \mathcal{W}$.
- **Deterministic Joint Evaluator (`src/lib/decision-engine/evaluator.ts`):** Implemented `evaluateJointDecision()`. Exhaustively evaluates every feasible plan ($E(L_i, W_j) = \frac{1}{|W_j|}\sum T(L_i, t)$) using the exact 3-tier deterministic ordering:
  1. Lower `exposureScore`
  2. Earlier `startTime`
  3. Stable `locationId`
- **Route Integration (`src/app/api/decision/route.ts`):** Returns `jointDecision` with complete search-space metrics (`locationCount`, `windowCount`, `totalEvaluatedPlans`) alongside `spatialDecision` and `decision`.
- **Joint Decision Workspace UI (`src/app/page.tsx`):**
  - Displays primary `Recommended Operational Plan` card (WHERE + WHEN) showing optimal site (`LOC-A - Battery Park`), time window (`08:00 AM – 10:00 AM UTC`), and modeled exposure (`29.15°C`).
  - Displays WHY THIS PLAN search-space metrics (3 Locations $\times$ 5 Windows $=$ 15 Plans).
  - Displays FortyGuard Joint Advantage banner showing $+8.40^\circ\text{C}$ modeled exposure delta avoided vs worst feasible plan.
  - Renders 15-plan candidate ranking table with rank, location, time window, tile ID, modeled exposure, and $\Delta$ vs best.
- **Automated Verification & E2E Tests (`tests/joint_decision.test.ts` & `tests/e2e/smoke.test.ts`):**
  - Added 10 comprehensive tests verifying Cartesian enumeration, global optimum, exposure scores, deltas, tie-breaking, missing data errors, horizon limits, LIVE/FIXTURE parity, and dynamic scenario recalculation.
  - Playwright smoke test verifies full UI flow and re-captures clean screenshot at `tests/e2e/workspace-smoke.png`.

---

## 2. Test & Verification Results
- **Vitest Unit & Parity Tests (`pnpm test`):** 8 test suites passed, 46 unit tests passed (100% pass rate).
- **TypeScript Typecheck (`pnpm typecheck`):** Clean (0 errors).
- **ESLint (`pnpm lint`):** Clean (0 errors, 0 warnings).
- **Next.js Production Build (`pnpm build`):** Clean (5 static/dynamic pages compiled cleanly).
- **Playwright E2E Smoke Test (`pnpm test:e2e`):** Clean (10.6s pass, screenshot updated at `tests/e2e/workspace-smoke.png`).

---

# Engineering Worklog — Milestone 7 / What-If Scenario Analysis Report

**Date:** 2026-08-21  
**Milestone:** Milestone 7 — What-If Operational Constraint Sensitivity  
**Status:** COMPLETED & VERIFIED  

---

## 1. What Was Implemented
- **Semantic Remediation:** Completely removed marketing terms like "Savings". Replaced with precise arithmetic differences: `"Delta vs Worst Feasible Plan"`, `"Constraint Cost"`, and `"Modeled Temperature Increase"`.
- **Scenario Domain Contract (`src/types/domain.ts`):** Implemented `WhatIfScenarioResult` and `ScenarioAnalysisResult` with strongly typed scenario statuses (`FEASIBLE` / `INFEASIBLE`) and shift flags (`locationShifted`, `windowShifted`, `durationChanged`).
- **Deterministic Constraint Engine (`src/lib/decision-engine/evaluator.ts`):** Implemented `evaluateWhatIfScenarios()` quantifying the exact Cost of the Constraint ($C = E(P') - E(P_0)$) across 3 canonical scenarios:
  1. `TEMPORAL_SHIFT` (Late start 10:00 UTC): Shifts window to 10:00–12:00 UTC ($32.10^\circ\text{C}$). Constraint cost = **$+2.95^\circ\text{C}$**.
  2. `LOCATION_LOCK` (Chinatown asphalt canyon only): Shifts location to LOC-C ($31.35^\circ\text{C}$). Constraint cost = **$+2.20^\circ\text{C}$**.
  3. `DURATION_EXPANSION` (2h to 4h duration): Expands shift to 08:00–12:00 UTC ($30.63^\circ\text{C}$). Constraint cost = **$+1.48^\circ\text{C}$**.
- **Route Integration (`src/app/api/decision/route.ts`):** Returns `scenarioAnalysis` in the JSON response.
- **Interactive What-If UI (`src/app/page.tsx`):**
  - Interactive scenario buttons with 3-Box comparative flow: $\text{BASELINE } (P_0) \longrightarrow \text{IMPOSED CONSTRAINT} \longrightarrow \text{CONSTRAINED OPTIMUM } (P')$.
  - Prominent Constraint Cost banner with shift status badges.
- **Automated Verification & E2E Tests (`tests/scenario_analysis.test.ts` & `tests/e2e/smoke.test.ts`):**
  - Added 6 deterministic tests verifying baseline match, temporal shift, location lock, duration expansion, exact cost arithmetic, infeasibility handling, and LIVE/FIXTURE parity.
  - Playwright smoke test verifies the full What-If UI workflow and re-captures clean screenshot at `tests/e2e/workspace-smoke.png`.

---

## 2. Test & Verification Results
- **Vitest Unit & Parity Tests (`pnpm test`):** 9 test suites passed, 52 unit tests passed (100% pass rate).
- **TypeScript Typecheck (`pnpm typecheck`):** Clean (0 errors).
- **ESLint (`pnpm lint`):** Clean (0 errors, 0 warnings).
- **Next.js Production Build (`pnpm build`):** Clean (5 static/dynamic pages compiled cleanly).
- **Playwright E2E Smoke Test (`pnpm test:e2e`):** Clean (9.0s pass, screenshot updated at `tests/e2e/workspace-smoke.png`).

---

# Engineering Worklog — Milestone 8 / Read-Only AI Explanation Layer Report

**Date:** 2026-08-21  
**Milestone:** Milestone 8 — Grounded AI Explanation Layer  
**Status:** COMPLETED & VERIFIED  

---

## 1. What Was Implemented
- **Explanation Domain Contract (`src/types/explanation.ts`):** Implemented strongly typed `ExplainableDecisionInput` and `DecisionExplanation` contracts with explicit `generatedBy` discrimination (`AI_GROUNDED_EXPLAINER` vs `DETERMINISTIC_FALLBACK`).
- **Zero-Dependency Deterministic Explainer (`src/lib/explanation/deterministic-explainer.ts`):** Implemented `generateDeterministicExplanation()` synthesizing operational summary, why the plan wins, and constraint impact directly from verified input facts.
- **Multi-Layered Grounding & Security Validator (`src/lib/explanation/grounding-validator.ts`):**
  - Schema validation (Zod).
  - Numeric allow-list validation (extracts numbers from text and asserts correspondence with allowed input values).
  - Semantic guardrails rejecting medical/physiological claims (`heat stroke`, `heat stress`, `worker safety limits`, `hazard`, `OSHA`).
  - Physical measurement guardrails rejecting unverified claims (`2m ambient`, `skin temperature`, `satellite thermal`).
- **AI Explainer Engine (`src/lib/explanation/ai-explainer.ts`):** Direct SDK/fetch call with grounding system prompt and automatic fallback to rule-based generation if LLM is unavailable, times out, or fails grounding.
- **Decoupled Server Route (`src/app/api/explain/route.ts`):** Standalone server route receiving `ExplainableDecisionInput` and returning verified `DecisionExplanation`. Zero access to FortyGuard API credentials.
- **Explanation Workspace UI (`src/app/page.tsx`):** Displays `Decision Explanation & Evidence Synthesis` section with operational summary, why it wins, constraint impact, epistemic boundary statement, and manual refresh button.
- **Automated Verification & E2E Tests (`tests/explanation.test.ts` & `tests/e2e/smoke.test.ts`):**
  - Added 14 unit and grounding tests verifying deterministic fallback, valid AI responses, ungrounded number rejection, medical claim rejection, physical semantics claim rejection, malformed JSON fallback, timeout fallback, data source preservation, and decision data immutability.
  - Playwright smoke test verifies the full explanation workflow and captures updated screenshot at `tests/e2e/workspace-smoke.png`.

---

## 2. Test & Verification Results
- **Vitest Unit & Grounding Tests (`pnpm test`):** 10 test suites passed, 66 unit tests passed (100% pass rate).
- **TypeScript Typecheck (`pnpm typecheck`):** Clean (0 errors).
- **ESLint (`pnpm lint`):** Clean (0 errors, 0 warnings).
- **Next.js Production Build (`pnpm build`):** Clean (6 static/dynamic pages compiled cleanly).
- **Playwright E2E Smoke Test (`pnpm test:e2e`):** Clean (13.2s pass, screenshot updated at `tests/e2e/workspace-smoke.png`).




