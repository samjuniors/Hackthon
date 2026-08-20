# Engineering Worklog

**Status:** VERIFIED  
**Last Updated:** 2026-08-20  

---

## 2026-08-20 — Milestone 3.6: Location-Specific Baseline Model Correction

### Summary of Actions & Corrections:
1. **Removed AOI-Wide Maximum Formula:**
   - Rejected `max(tile ∈ AOI)` formula. Corrected baseline formula to use the verified temperature observation associated with the user's selected operational location/tile over time.
   - Core Formula: $E(W_i) = \frac{1}{n} \sum_{t \in W_i} T(\text{location}, t)$, where $T(\text{location}, t)$ is the tile `average_temperature` in °C.
2. **Point-to-Tile Spatial Mapping:**
   - User point $(lat, lon)$ maps deterministically to its containing FortyGuard heatmap tile feature via point-in-polygon bounding check.
   - Explicit failure handling: If user coordinates fall outside returned tile coverage, the system throws `ValidationError` and refuses to fall back silently to the AOI-wide maximum.
3. **Model Positioning Definition:**
   - Tagged `v1.0.0-spatial-thermal-baseline` as an **intentionally simple spatial thermal baseline**. Explicitly documented that it is NOT a human heat-stress or medical safety model.
4. **+12h Forecast Lead Time Enforcement:**
   - Enforced strict check against FortyGuard +12-hour forecast horizon. Permissible windows extending past +12h throw `IncompleteTemporalCoverageError`.
5. **Documentation & Type Updates:**
   - Updated `src/types/domain.ts`, `docs/DECISION-ENGINE.md`, `docs/PRD.md`, `docs/EVALUATION.md`, `docs/DESIGN.md`, `docs/CURRENT-SPRINT.md`, and `docs/WORKLOG.md`.

---

## 2026-08-20 — Milestone 3.5: Exposure Model & Env Params Evidence Gate

### Summary of Actions:
1. Verified live `/v1/env_params` reference temperature anchor physics and +12h forecast compatibility.
2. Selected primary spatial tile temperature metric strategy and Strategy A temporal caching.

---

## 2026-08-20 — Milestone 3 Approval: Hourly Forecast Retrieval Contract Verification

### Summary of Actions:
1. Verified `/v1/heatmap` forecast requests for single-hour (`filter_type: 1`) and multi-hour range (`filter_type: 2`).
2. Confirmed +12h forecast lead time boundary and 2,000 credit per-call parameters.
