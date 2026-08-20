# Current Sprint — Milestone 3: Architecture Lock & Domain Interfaces

**Status:** ACTIVE (M3 Architecture & Interfaces Locked)  
**Current Milestone:** M3 — Architecture Lock  
**Submission Deadline:** 2026-08-30  
**Last Updated:** 2026-08-20  

---

## 🎯 Sprint Goal
Lock system architecture, domain interface contracts, FortyGuard adapter boundary, and test specifications prior to feature implementation.

---

## 📋 Task Breakdown

### Milestone 3 Tasks (`COMPLETED`)
- [x] **Gate 0:** Verified heatmap temporal data model (1-hour forecast resolution, +12h lead time, `CandidateWindowStep = DATA_RESOLUTION`).
- [x] **Gate 1:** Removed arbitrary metric weights from public model config; established immutable versioned `ExposureModel` contract.
- [x] **Domain Interfaces:** Created [src/types/domain.ts](file:///e:/Projects/NewProjetcs/Hackthon/src/types/domain.ts), [src/types/fortyguard.ts](file:///e:/Projects/NewProjetcs/Hackthon/src/types/fortyguard.ts), [src/types/provenance.ts](file:///e:/Projects/NewProjetcs/Hackthon/src/types/provenance.ts), and [src/types/errors.ts](file:///e:/Projects/NewProjetcs/Hackthon/src/types/errors.ts).
- [x] **Architecture Lock:** Decoupled external API data acquisition from fast local scenario recalculation. Defined in-memory credit-safety caching strategy.
- [x] **Documentation Alignment:** Reconciled [docs/ARCHITECTURE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/ARCHITECTURE.md), [docs/DECISION-ENGINE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DECISION-ENGINE.md), [docs/PRD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/PRD.md), [docs/EVALUATION.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/EVALUATION.md), and [docs/adr/0002-thermal-operations-decision-model.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/adr/0002-thermal-operations-decision-model.md).

### NEXT (Milestone 4 — Vertical Slice 1 Execution)
- [ ] Implement FortyGuard Adapter (`src/lib/fortyguard/adapter.ts`) with Zod validation, async polling, and caching.
- [ ] Implement baseline `ExposureModel` evaluator shell (`src/lib/decision-engine/evaluator.ts`).
- [ ] Implement decision pipeline orchestrator for single location + candidate time windows (`src/lib/decision-engine/pipeline.ts`).
- [ ] Build end-to-end Slice 1 API route and Decision Workspace UI.

### 🚧 BLOCKED
- **Vertical Slice 1 Feature Coding:** Implementation coding is strictly blocked until Milestone 3 report review is approved.
