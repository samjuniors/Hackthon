# Decision Engine Model — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M3 — Architecture Lock & Domain Interfaces  

- **Product Direction:** `LOCKED`
- **MVP Scope Boundary:** `LOCKED`
- **FortyGuard API Capabilities:** `VERIFIED`
- **Thermal Exposure Function:** `PROVISIONAL — MODEL TO BE DEFINED`

---

## 1. Decision Model Architecture & Deterministic Guarantees

The Decision Engine is a pure mathematical domain service responsible for generating candidate operating windows, computing modeled thermal exposure via a versioned exposure model interface, and ranking candidate options.

**Fundamental Guarantees:**
1. **100% Deterministic Execution:** Identical inputs and constraints always produce identical decision rankings. Ties are broken deterministically by earlier start timestamp.
2. **Zero LLM Calculation:** The LLM NEVER computes scores, generates candidate windows, or evaluates mathematical formulas. It synthesizes narrative explanations strictly from verified `Evidence Bundle` outputs.
3. **Strict Data Provenance Alignment:**
   - `OBSERVED`: Direct raw API payload readings (e.g. point telemetry).
   - `DERIVED`: Aggregated or computed metrics (e.g. tile average temperature `average_temperature`). Derived metrics must NEVER be labeled `OBSERVED`.
   - `PREDICTED`: Verified FortyGuard forecast series (+12h horizon).
   - `ASSUMED`: User-specified scenario parameters.
   - `AI_GENERATED_EXPLANATION`: Grounded LLM narrative outputs.
4. **No Medical / Safety Certification Claims:** Outputs represent *modeled thermal exposure* and relative operational burden.

---

## 2. Gate 0: Heatmap Temporal Model Evidence (`VERIFIED`)

Based on verified FortyGuard documentation and live API payload observations:
1. **Timestamps in `/v1/heatmap`:** For single-hour queries (`filter_type: 1`), `/v1/heatmap` returns GeoJSON tile features representing a single 1-hour temporal snapshot. For multi-hour/multi-day queries (`filter_type: 2, 3, 4`), FortyGuard returns aggregate analytics (`analytic_type`: `tcm`, `exceedance`, `persistence`).
2. **Multiple Temporal Observations:** Generating discrete hourly time-series across a forecast horizon involves requesting discrete hourly snapshots or evaluating multi-hour window analytics.
3. **Forecast Horizon:** Up to +12 hours past current time with 1-hour temporal resolution.
4. **Candidate Window Step:** `CandidateWindowStep = DATA_RESOLUTION` (1-hour step for hourly forecast endpoints).
5. **Timestamp Alignment:** All external timestamps are normalized to UTC for calculation, and converted to local time using FortyGuard timezone metadata (`metadata.timezone`, `metadata.timezone_offset_hours`) for UI display.

---

## 3. Exposure Model Interface (`GATE 1` — No Arbitrary Weights)

Arbitrary user-configurable metric weights are removed from the public model configuration. Exposure models follow an immutable, versioned abstraction:

```typescript
export interface ExposureModel {
  readonly modelVersion: string;
  readonly requiredInputs: readonly string[];
  evaluate(observations: NormalizedThermalObservation[], window: CandidateWindow): ExposureResult;
  explain?(result: ExposureResult): string[];
}
```

- Exposure Function Formula Status: `PROVISIONAL — MODEL TO BE DEFINED`.
- Evaluation Interface: `evaluateExposure(observations, window, modelConfig)`.

---

## 4. Optimization Problem & Deterministic Ranking

Given permissible operating window $[T_{\text{start}}, T_{\text{end}}]$, duration $d$, step size `CandidateWindowStep = DATA_RESOLUTION`, and candidate windows $W_i = [t_i, t_i + d]$:

$$\text{Select } W^* = \arg\min_{W_i \in \mathcal{W}_{\text{feasible}}} E(W_i)$$

Where:
- $E(W_i)$ is the exposure score evaluated deterministically by the active `ExposureModel`.
- Deterministic Tie-Breaking: If $E(W_i) == E(W_j)$, the window with the earlier start timestamp $t_i < t_j$ is ranked higher.

---

## 5. Integration Dependency Resolution (`/v1/env_params`)

- **API Requirement:** `/v1/env_params` requires a `temperature` parameter input.
- **Status:** `UNKNOWN — VERIFY` (The semantic correctness of supplying heatmap tile averages as `env_params` temperature input is unconfirmed).
- **Domain Adapter Architecture:** The FortyGuard adapter treats `/v1/env_params` as an **optional enrichment layer**. If `/v1/env_params` is unavailable or fails, core candidate window ranking operates on verified thermal heatmap telemetry without blocking execution.

---

## 6. What-If Scenario Scope

- **Supported Parameters:** Operation duration $d$, permissible time bounds $[T_{\text{start}}, T_{\text{end}}]$, location selection.
- **Excluded from MVP:** Mitigation factors ($M$), shade/cooling multipliers (deferred to future work due to lack of validated scientific mapping).
