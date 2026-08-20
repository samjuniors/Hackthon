# Engineering Worklog

**Status:** VERIFIED  
**Last Updated:** 2026-08-20  

---

## 2026-08-20 — Milestone 2.1: Adversarial Decision-Model Correction & Scope Hardening

### Summary of Actions & Decisions:
1. **Strategic Product Alignment:**
   - Evaluated M1 FortyGuard evidence (verified GeoJSON heatmaps, wet-bulb temp, heat index, solar GHI/DNI).
   - Adversarially rejected "worker safety" and medical advice as the hard product boundary due to lack of medical validation.
   - Reframed product abstraction around *heat-exposed operations decision intelligence*.
   - Selected *outdoor field operations* as the primary demonstration scenario for judging.
2. **Decision Engine & Model Contract Corrections:**
   - Abstracted exposure function formula to `PROVISIONAL — MODEL TO BE DEFINED`. Replaced hardcoded formulas with pluggable interface `evaluateExposure(observations, window, modelConfig)`.
   - Corrected Data Provenance rules: Direct API readings are `OBSERVED`; tile aggregations (e.g. `average_temperature`) are `DERIVED`. Derived metrics must NEVER be labeled `OBSERVED`.
   - Set temporal step size to `CandidateWindowStep = DATA_RESOLUTION` with explicit UTC/local timezone handling and deterministic tie-breaking.
   - Decoupled `INITIAL DATA ACQUISITION` (async FortyGuard polling & caching) from `SCENARIO RECALCULATION` (fast local in-memory re-evaluation).
3. **Integration & Scope Hardening:**
   - Re-examined `/v1/env_params` temperature input dependency. Marked semantic relationship as `UNKNOWN — VERIFY`. Configured adapter to treat `/v1/env_params` as an optional enrichment layer rather than a blocking dependency.
   - Removed unvalidated mitigation factors ($M$), shade multipliers, satellite/streetview segmentation, PDF report generators, routing algorithms, user accounts, and external DB dependencies from core MVP scope.
   - Defined Slice 1 scope: **ONE location/AOI + MULTIPLE candidate time windows**.
4. **Documentation Architecture Updates:**
   - Updated `docs/PRD.md`, `docs/VISION.md`, `docs/DECISION-ENGINE.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `docs/EVALUATION.md`, `docs/CURRENT-SPRINT.md`, and `docs/adr/0002-thermal-operations-decision-model.md`.

---

## 2026-08-20 — Milestone 1: Live FortyGuard API Reconnaissance

### Summary of Actions:
1. Ingested official documentation and verified subscription tier (`Hackathon` with 2,000,000 credits).
2. Executed live API calls to `/v1/env_params` and `/v1/heatmap`. Verified GeoJSON polygon output, wet-bulb temp, heat index, and solar irradiance.
3. Updated `docs/FORTYGUARD.md` and saved test fixture `tests/fixtures/env_params_sample.json`.

---

## 2026-08-20 — Milestone 0: Initial Repository Bootstrap

### Summary of Actions:
1. Initialized Next.js 15 TypeScript project with Tailwind CSS, Zod, and Vitest.
2. Established core documentation architecture.
