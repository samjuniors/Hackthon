# Current Sprint — Milestone 2: Product & Decision Model Contract Lock

**Status:** ACTIVE (M2.1 Reconciled & Hardened)  
**Current Milestone:** M2 — Product Lock & Decision Model Contract  
**Submission Deadline:** 2026-08-30  
**Last Updated:** 2026-08-20  

---

## 🎯 Sprint Goal
Lock the product abstraction, decision model contract, and provenance guardrails prior to implementation.

---

## 📋 Task Breakdown

### NOW (Milestone 2.1 Reconciliation — `COMPLETED`)
- [x] Reconcile [docs/PRD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/PRD.md) (Core user question, 6 MVP capabilities, non-medical disclaimer).
- [x] Reconcile [docs/VISION.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/VISION.md) (Broad heat-exposed operations abstraction, outdoor field ops demo).
- [x] Reconcile [docs/ARCHITECTURE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/ARCHITECTURE.md) (Decouple data acquisition from local scenario recalculation, credit safety caching).
- [x] Reconcile [docs/DECISION-ENGINE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DECISION-ENGINE.md) (Abstract exposure evaluator contract `PROVISIONAL`, `CandidateWindowStep = DATA_RESOLUTION`, strict provenance).
- [x] Reconcile [docs/DESIGN.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DESIGN.md) (8-section Decision Workspace, provenance badges).
- [x] Reconcile [docs/EVALUATION.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/EVALUATION.md) (Hardened test matrix, deterministic tie-breaking).
- [x] Resolve `/v1/env_params` temperature input dependency (marked `UNKNOWN — VERIFY`; adapter treats `/v1/env_params` as optional enrichment).

### NEXT (Milestone 3 — Architecture Lock & Domain Interfaces)
- [ ] Define normalized FortyGuard TypeScript/Zod schemas.
- [ ] Define core domain model interfaces (`ExposureEvaluator`, `EvidenceBundle`, `CandidateWindow`).
- [ ] Design Vertical Slice 1 execution flow (Single location + multiple candidate time windows).

### 🚧 BLOCKED
- **Production Feature Implementation:** Feature coding is strictly blocked until Milestone 2 review is complete and Milestone 3 architecture lock is approved.
