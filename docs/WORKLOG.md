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
