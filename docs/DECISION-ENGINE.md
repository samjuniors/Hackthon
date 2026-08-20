# Decision Engine Model — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M3.5 — Exposure Model & Evidence Gate  

- **Product Direction:** `LOCKED`
- **MVP Scope Boundary:** `LOCKED`
- **FortyGuard API Capabilities:** `VERIFIED`
- **Primary Model Version:** `v1.0.0-spatial-thermal-baseline` (`LOCKED`)

---

## 1. Decision Model Architecture & Principles

The Decision Engine is a pure mathematical domain service responsible for generating candidate operating windows, computing modeled thermal exposure via an immutable versioned exposure model interface, and ranking candidate options.

**Fundamental Guarantees:**
1. **Zero Arbitrary Metric Weights:** Arbitrary composite weighting formulas (e.g. `0.4*Temp + 0.3*Humidity + 0.3*Solar`) are **REJECTED**. The engine uses one scientifically defensible primary metric for core ranking and presents all other telemetry as supporting contextual evidence.
2. **100% Deterministic Execution:** Identical inputs and constraints always produce identical decision rankings. Equal exposure scores break ties deterministically by earlier start timestamp ($t_i < t_j$).
3. **Zero LLM Calculation:** The LLM NEVER computes scores, generates candidate windows, or evaluates mathematical formulas. It synthesizes narrative explanations strictly from verified `Evidence Bundle` outputs.
4. **Strict Data Provenance Alignment:**
   - `OBSERVED`: Direct raw API payload readings (e.g. point telemetry).
   - `DERIVED`: Aggregated or computed metrics (e.g. tile average temperature `average_temperature`). Derived metrics are **NEVER** labeled `OBSERVED`.
   - `PREDICTED`: Verified FortyGuard forecast series (+12h horizon).
   - `ASSUMED`: User-specified scenario parameters.
   - `AI_GENERATED_EXPLANATION`: Grounded LLM narrative outputs.
5. **No Medical / Safety Claims:** Outputs represent *modeled thermal exposure* and relative operational burden.

---

## 2. Exposure Model Strategy Evaluation & Selection

### 2.1 Candidate Strategy Comparison

| Strategy | Scientific Defensibility | Data Requirements | Judge Defensibility | Status |
| :--- | :--- | :--- | :--- | :--- |
| **A. Primary Spatial Tile Temperature** | **High** (Direct physical measurement) | Spatial GeoJSON Heatmap tiles (`average_temperature` / `max_temperature`) | **High** (Clear, transparent, zero arbitrary weights) | **SELECTED (`v1.0.0-spatial-thermal-baseline`)** |
| **B. Wet-Bulb Temperature Primary** | High (Physiological heat stress) | Point `/v1/env_params` query per hour | High | **DEFERRED (Point metric, optional enrichment)** |
| **C. Arbitrary Composite Score** | **UNSCIENTIFIC / INVALID** (Combining temp + humidity + solar with arbitrary weights is mathematically unbacked) | Multiple correlated telemetry feeds | **Extremely Low (Judges reject arbitrary weights)** | **REJECTED** |

### 2.2 Selected Model Specification (`v1.0.0-spatial-thermal-baseline`)

The primary exposure score $E(W_i)$ for a candidate operating window $W_i = [t_i, t_i + d]$ is the mean peak tile temperature across the duration $d$:

$$E(W_i) = \frac{1}{|W_i|} \sum_{t \in W_i} \max_{\text{tile} \in \text{AOI}} \text{TileTemperature}(\text{tile}, t)$$

- **Primary Ranking:** Candidates are ordered from lowest to highest mean peak exposure score $E(W_i)$.
- **Supporting Evidence Bundle:** The decision result attaches point telemetry (`wet_bulb_temperature_celsius`, `solar_irradiance` GHI/DNI, `relative_humidity_percent`) as supporting contextual evidence in the `Evidence Bundle` without corrupting the core deterministic ranking formula.

---

## 3. Exposure Model Interface Definition

```typescript
export interface ExposureModel {
  readonly modelVersion: string;
  readonly requiredInputs: readonly string[];
  evaluate(observations: NormalizedThermalObservation[], window: CandidateWindow): ExposureResult;
}
```

---

## 4. Temporal Acquisition & Scenario Performance Strategy

- **Strategy A (Hourly Snapshots Downloaded Once):**
  1. Download discrete 1-hour heatmap snapshots (`filter_type: 1`) for each hour in the permissible operating window $[T_{\text{start}}, T_{\text{end}}]$.
  2. Cache normalized observations in-memory by request key `(location, date, hour)`.
  3. Generate candidate windows $W_i = [t_i, t_i + d]$ and compute $E(W_i)$ locally in-memory.
- **Responsive What-If Sandbox:** User parameter adjustments (changing operation duration $d$, shifting time bounds) re-evaluate candidate windows locally using cached hourly telemetry without repeating FortyGuard API submissions.
