# Current Sprint — Milestone 2: Product Lock & Domain Model

**Status:** ACTIVE  
**Current Milestone:** M2 — Product Lock  
**Submission Deadline:** 2026-08-30  
**Last Updated:** 2026-08-20  

---

## 🎯 Sprint Goal
Lock the primary hackathon use case, domain decision logic, and acceptance criteria based on verified FortyGuard API capabilities (GeoJSON Heatmaps, Environmental Parameters, Wet Bulb, Heat Index, Air Quality, and Solar Irradiance).

---

## 📋 Task Breakdown

### Milestone 1: API Reconnaissance (`COMPLETED`)
- [x] Obtain API credentials and documentation portal link.
- [x] Extract all official endpoint specifications and schemas.
- [x] Verify account tier (`Hackathon` with 2,000,000 credits).
- [x] Execute live `POST /v1/env_params` query and verify response schema.
- [x] Execute live `POST /v1/heatmap` query and verify GeoJSON polygon output.
- [x] Document verified capability matrix in [docs/FORTYGUARD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/FORTYGUARD.md).

### Milestone 2: Product Lock (`IN PROGRESS`)
- [ ] Select primary vertical use case from candidate hypotheses:
  - Option A: Outdoor Worker Thermal Safety & Work-Rest Optimization (leveraging Wet Bulb Temp, Heat Index, Solar GHI/DNI).
  - Option B: Thermal-Aware Route & Time-Window Logistics (leveraging GeoJSON heatmaps, exceedance, persistence).
  - Option C: Urban Heat Resilience & Microclimate Intervention Sandbox (leveraging heatmaps, segmentation, and env params).
- [ ] Update [docs/PRD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/PRD.md) with locked use case and workflows.
- [ ] Formalize deterministic decision formulas in [docs/DECISION-ENGINE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DECISION-ENGINE.md).
- [ ] Prepare for Milestone 3 (Architecture Lock & FortyGuard Adapter implementation).
