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
### Milestone 4.1 — Evidence Integrity Fix (`COMPLETED & VERIFIED`)
- [x] **Excised Fabricated Diurnal Curve:** Completely removed `Math.sin` curve formula. Observations strictly reflect FortyGuard API or verified FortyGuard fixtures.
- [x] **Eliminated Silent Fallbacks & Explicit Mode Separation:** Decoupled `LIVE` mode (pure API, hard failures on network/auth error) and `FIXTURE` mode (captured FortyGuard data, explicitly tagged).
- [x] **Discrete Hourly Snapshot Acquisition & Caching:** Multi-hour candidate evaluations fetch real hourly snapshots (`filter_type: 1`) cached in-memory by request hash.
- [x] **Enforced Temporal Horizon:** Requests exceeding FortyGuard's +12h forecast lead time throw `IncompleteTemporalCoverageError`. Zero fabricated missing hours.
- [x] **Prominent UI Source Indicator:** Decision Workspace prominently displays `LIVE — FORTYGUARD API` vs `DEMO — CAPTURED FORTYGUARD DATA`.
- [x] **LIVE/FIXTURE Decision Parity Testing:** Added comprehensive test suite verifying 100% parity across decision scoring and candidate window rankings.
