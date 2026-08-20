# Engineering Worklog

**Status:** VERIFIED  
**Last Updated:** 2026-08-20  

---

## 2026-08-20 — Milestone 3.5: Exposure Model & Env Params Evidence Gate

### Summary of Actions & Discoveries:
1. **`env_params` Semantics & Forecast Verification:**
   - Executed live API query to `/v1/env_params` for a $+2\text{h}$ forecast timestamp (`2026-08-20T10:00:00-05:00`) with reference temperature anchor $30.0^\circ\text{C}$.
   - Verified that `/v1/env_params` returns complete calculated non-linear physics metrics: `heat_index_celsius` (31.8°C), `apparent_temperature_celsius` (31.5°C), `wet_bulb_temperature_celsius` (21.4°C), `relative_humidity_percent` (54.6%), `solar_irradiance` (GHI: 747.72, DNI: 794.69, DHI: 126.75 W/m²), and air quality metrics.
   - Cost confirmed: 2,000 credits per request activity.
   - Adapter handling: `/v1/env_params` is configured as an **optional enrichment layer**. Core candidate window ranking operates on verified heatmap tile telemetry (`average_temperature` / `max_temperature`) so the engine functions deterministically even if `/v1/env_params` is omitted.
2. **Exposure Model Strategy Selection:**
   - Evaluated 6 candidate model strategies. Rejected arbitrary metric weighting formulas (e.g. `0.4*Temp + 0.3*Humidity + 0.3*Solar`) as unscientific, unindictable, and prone to double-counting.
   - Selected **Primary Spatial Tile Temperature Metric + Supporting Telemetry Evidence (`v1.0.0-spatial-thermal-baseline`)**.
   - Score formula: Mean peak tile temperature $E(W_i) = \frac{1}{|W_i|} \sum_{t \in W_i} \max_{\text{tile}} \text{TileTemp}(\text{tile}, t)$.
   - Supporting telemetry (`wet_bulb_temperature_celsius`, `solar_irradiance`, `relative_humidity_percent`) is presented in the `Evidence Bundle` as contextual evidence without corrupting the core deterministic ranking.
3. **Temporal Acquisition Strategy:**
   - Locked **Strategy A (Hourly Snapshots Downloaded Once & Local Window Evaluation)**.
   - Hourly snapshots (`filter_type: 1`) are fetched once per session and stored in-memory.
   - Candidate window evaluation and local what-if parameter changes (operation duration, allowed time bounds) run locally in-memory without repeating external FortyGuard API submissions.
4. **Documentation Updates:**
   - Synchronized `docs/FORTYGUARD.md`, `docs/DECISION-ENGINE.md`, `docs/EVALUATION.md`, `docs/WORKLOG.md`, and `docs/CURRENT-SPRINT.md`.

---

## 2026-08-20 — Milestone 3 Approval: Hourly Forecast Retrieval Contract Verification

### Summary of Actions:
1. Verified `/v1/heatmap` forecast requests for single-hour (`filter_type: 1`) and multi-hour range (`filter_type: 2`).
2. Confirmed +12h forecast lead time boundary and 2,000 credit per-call parameters.

---

## 2026-08-20 — Milestone 3: Architecture Lock & Domain Interfaces

### Summary of Actions:
1. Established 1-hour temporal resolution and versioned `ExposureModel` contract.
2. Created domain types in `src/types/domain.ts`, `src/types/fortyguard.ts`, `src/types/provenance.ts`, and `src/types/errors.ts`.
