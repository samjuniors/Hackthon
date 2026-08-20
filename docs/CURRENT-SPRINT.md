# Current Sprint — Milestone 3.5: Exposure Model & Evidence Gate

**Status:** ACTIVE (M3.5 Exposure Model Locked)  
**Current Milestone:** M3.5 — Exposure Model & Evidence Gate  
**Submission Deadline:** 2026-08-30  
**Last Updated:** 2026-08-20  

---

## 🎯 Sprint Goal
Finalize the scientific data contract, `env_params` semantics, exposure model selection (`v1.0.0-spatial-thermal-baseline`), and Strategy A temporal acquisition prior to Milestone 4 (Vertical Slice 1 Execution).

---

## 📋 Task Breakdown

### Milestone 3.5 Evidence Gate (`COMPLETED`)
- [x] **`env_params` Semantics Verification:** Verified live that `/v1/env_params` accepts reference temperature anchor and forecast timestamps, returning non-linear physics parameters (wet-bulb, heat index, solar GHI/DNI).
- [x] **Exposure Model Strategy Evaluation:** Evaluated 6 model candidates. Rejected arbitrary metric weighting formulas. Selected **Primary Spatial Tile Temperature Metric + Supporting Telemetry Evidence (`v1.0.0-spatial-thermal-baseline`)**.
- [x] **Temporal Acquisition Strategy:** Locked **Strategy A (Hourly Snapshots Downloaded Once & Local Window Evaluation)** for credit efficiency and responsive local what-if simulation.
- [x] **Documentation Synchronization:** Updated [docs/FORTYGUARD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/FORTYGUARD.md), [docs/DECISION-ENGINE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DECISION-ENGINE.md), [docs/EVALUATION.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/EVALUATION.md), [docs/WORKLOG.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/WORKLOG.md), and [docs/CURRENT-SPRINT.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/CURRENT-SPRINT.md).

### NEXT (Milestone 4 — Vertical Slice 1 Execution)
- [ ] Implement FortyGuard Adapter (`src/lib/fortyguard/adapter.ts`) with Zod validation, async polling, and caching.
- [ ] Implement baseline `v1.0.0-spatial-thermal-baseline` exposure evaluator (`src/lib/decision-engine/evaluator.ts`).
- [ ] Implement decision pipeline orchestrator for single location + candidate time windows (`src/lib/decision-engine/pipeline.ts`).
- [ ] Build end-to-end Slice 1 API route and Decision Workspace UI.

### 🚧 BLOCKED
- **Vertical Slice 1 Feature Coding:** Feature coding is strictly blocked until this M3.5 report is reviewed and approved by the founder/team.
