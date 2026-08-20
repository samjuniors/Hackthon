# Current Sprint — Milestone 3.6: Location-Specific Baseline Correction

**Status:** ACTIVE (M3.6 Corrected & Locked)  
**Current Milestone:** M3.6 — Model Correction  
**Submission Deadline:** 2026-08-30  
**Last Updated:** 2026-08-20  

---

## 🎯 Sprint Goal
Correct the baseline exposure model to use location-specific point-to-tile mapping and mean tile temperature $E(W_i) = \frac{1}{n} \sum T(\text{location}, t)$ prior to Milestone 4 (Vertical Slice 1 Execution).

---

## 📋 Task Breakdown

### Milestone 3.6 Model Correction (`COMPLETED`)
- [x] **Removed AOI Maximum:** Replaced AOI-wide `max(tile ∈ AOI)` formula with point-to-tile mapped mean temperature $E(W_i) = \frac{1}{n} \sum T(\text{location}, t)$.
- [x] **Point-to-Tile Mapping Definition:** Locked spatial point-in-polygon bounding check. System throws explicit error if location falls outside tile coverage; zero silent fallback to hottest tile.
- [x] **Model Positioning:** Tagged `v1.0.0-spatial-thermal-baseline` as an *intentionally simple spatial thermal baseline* (not a medical or heat-stress model).
- [x] **+12h Forecast Horizon Enforcement:** Constrained candidate window evaluation strictly within FortyGuard +12h forecast lead time. Throws `IncompleteTemporalCoverageError` if window exceeds lead time.
- [x] **Type & Schema Synchronization:** Updated [src/types/domain.ts](file:///e:/Projects/NewProjetcs/Hackthon/src/types/domain.ts), [docs/DECISION-ENGINE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DECISION-ENGINE.md), [docs/PRD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/PRD.md), [docs/EVALUATION.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/EVALUATION.md), [docs/DESIGN.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DESIGN.md), [docs/WORKLOG.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/WORKLOG.md), and [docs/CURRENT-SPRINT.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/CURRENT-SPRINT.md).

### NEXT (Milestone 4 — Vertical Slice 1 Execution)
- [ ] Implement FortyGuard Adapter (`src/lib/fortyguard/adapter.ts`) with Zod validation, async polling, and caching.
- [ ] Implement point-to-tile spatial mapper utility (`src/lib/spatial/mapper.ts`).
- [ ] Implement baseline `v1.0.0-spatial-thermal-baseline` location-specific exposure evaluator (`src/lib/decision-engine/evaluator.ts`).
- [ ] Implement decision pipeline orchestrator for single location + candidate time windows (`src/lib/decision-engine/pipeline.ts`).
- [ ] Build end-to-end Slice 1 API route and Decision Workspace UI.

### 🚧 BLOCKED
- **Vertical Slice 1 Feature Coding:** Feature coding is strictly blocked until this M3.6 report is reviewed and approved by the founder/team.
