# Current Sprint — Milestone 4: Spatial Thermal Decision Surface (Vertical Slice 1)

**Status:** COMPLETED & VERIFIED  
**Current Milestone:** M4 — Vertical Slice 1 Execution  
**Submission Deadline:** 2026-08-30  
**Last Updated:** 2026-08-20  

---

## 🎯 Sprint Goal
Deliver an end-to-end working vertical slice combining verified FortyGuard spatial thermal intelligence with deterministic location-specific candidate window evaluation, spatial MapLibre visualization, and data provenance tracking.

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

