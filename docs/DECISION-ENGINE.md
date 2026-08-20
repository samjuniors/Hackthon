# Decision Engine Model — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M2.1 — Decision Model Reconciliation  

- **Product Direction:** `LOCKED`
- **MVP Scope Boundary:** `LOCKED`
- **FortyGuard API Capabilities:** `VERIFIED`
- **Thermal Exposure Function:** `PROVISIONAL — MODEL TO BE DEFINED`

---

## 1. Decision Model Architecture & Deterministic Guarantees

The Decision Engine is a pure mathematical domain service responsible for evaluating candidate operating windows, computing modeled thermal exposure, enforcing operational constraints, and ranking candidate options.

**Fundamental Guarantees:**
1. **100% Deterministic Execution:** Identical inputs and constraints always produce identical decision rankings. Tie-breaking is deterministic (e.g., earlier start time breaks equal exposure ties).
2. **Zero LLM Calculation:** The LLM NEVER computes scores, generates candidate windows, or evaluates mathematical formulas.
3. **Strict Provenance Alignment:** Direct API payload readings are tagged `OBSERVED`. Aggregated metrics (e.g., tile averages) are tagged `DERIVED`. Derived metrics must NEVER be tagged `OBSERVED`.
4. **No Medical / Safety Certification Claims:** Outputs represent *modeled thermal exposure* and relative operational burden.

---

## 2. Conceptual Decision Pipeline

```
              [ USER CONSTRAINTS ]
(Location, Date, Duration d, Allowed Window [T_start, T_end])
                       │
                       ▼
          [ FORTYGUARD OBSERVATIONS ]
  (Heatmap tiles, Env Params: Wet-Bulb, Heat Index, Solar)
                       │
                       ▼
         [ VALIDATION / NORMALIZATION ]
 (Timezone alignment, UTC/Local conversion, boundary checks)
                       │
                       ▼
         [ DERIVED THERMAL FEATURES ]
 (Tile average/max extraction, temporal feature aggregation)
                       │
                       ▼
             [ CANDIDATE WINDOWS ]
   (Generate sliding windows W_i with step CandidateWindowStep = DATA_RESOLUTION)
                       │
                       ▼
             [ CONSTRAINT FILTER ]
 (Discard candidate windows violating mandatory user bounds)
                       │
                       ▼
           [ EXPOSURE EVALUATION ]
 (Evaluate exposure score via interface evaluateExposure(observations, window, modelConfig))
                       │
                       ▼
                 [ RANKING ]
 (Order feasible candidate windows from lowest to highest exposure; deterministic tie-breaking)
                       │
                       ▼
           [ RECOMMENDED WINDOW ]
  (Primary recommendation W* + secondary ranked candidate windows)
                       │
                       ▼
              [ EVIDENCE BUNDLE ]
 (Structured object containing observed, derived, model config, and candidate metrics)
                       │
                       ▼
            [ AI EXPLANATION LAYER ]
  (Narrative synthesis grounded strictly in the Evidence Bundle)
```

---

## 3. Mathematical Optimization Contract & Model Interface

### 3.1 Optimization Problem
Given permissible window $[T_{\text{start}}, T_{\text{end}}]$, duration $d$, step size `CandidateWindowStep = DATA_RESOLUTION`, and candidate windows $W_i = [t_i, t_i + d]$:

$$\text{Select } W^* = \arg\min_{W_i \in \mathcal{W}_{\text{feasible}}} E(W_i)$$

Where:
- $E(W_i)$ is the deterministic exposure score computed via the exposure model interface.
- Formula Status: `PROVISIONAL — MODEL TO BE DEFINED`.

### 3.2 Model Interface Signature (Pure TypeScript Contract)

```typescript
export interface ModelConfig {
  modelVersion: string;
  metricWeights?: Record<string, number>;
}

export interface ExposureResult {
  exposureScore: number;
  metricBreakdown: Record<string, number>;
}

export type ExposureEvaluator = (
  observations: NormalizedTelemetry[],
  window: CandidateWindow,
  config: ModelConfig
) => ExposureResult;
```

---

## 4. Temporal Resolution & Timezone Alignment

- **Step Size:** `CandidateWindowStep = DATA_RESOLUTION` (aligned to FortyGuard temporal data intervals, e.g. 1-hour hourly intervals for forecast/historical endpoints).
- **Timezone Safety:**
  - All external FortyGuard API timestamps are converted and normalized to UTC for internal calculations.
  - User-facing UI displays local time using the location's verified timezone metadata (`metadata.timezone`, `metadata.timezone_offset_hours`).
  - Interval boundaries are strictly defined (inclusive start timestamp, exclusive end timestamp).

---

## 5. Integration Dependency Resolution (`/v1/env_params`)

- **Dependency:** `/v1/env_params` requires a `temperature` input parameter.
- **Status:** `UNKNOWN — VERIFY` (The semantic correctness of supplying heatmap tile averages as `env_params` temperature input is unconfirmed).
- **Domain Adapter Architecture:** The FortyGuard adapter treats `/v1/env_params` as an **optional enrichment layer**. If `/v1/env_params` is unavailable or fails, core candidate window ranking operates on verified thermal heatmap telemetry without blocking execution.
