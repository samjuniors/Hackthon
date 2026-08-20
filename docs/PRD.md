# Product Requirements Document (PRD) — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M2.1 — Decision Model Reconciliation  

- **Product Direction:** `LOCKED`
- **MVP Scope Boundary:** `LOCKED`
- **FortyGuard API Capabilities:** `VERIFIED`
- **Thermal Exposure Function:** `PROVISIONAL — MODEL TO BE DEFINED`

---

## 1. Problem Statement

Heat-exposed operations (e.g., outdoor maintenance shifts, field inspections, site operations) suffer from elevated thermal burden and efficiency loss when scheduled blindly against macro-weather forecasts. Generic weather apps provide coarse regional forecasts that fail to capture microclimate thermal dynamics, spatial variations, and optimal operating windows.

Raw heatmaps display thermal intensity but do not answer the core operational decision question: *"When should an operation be executed at a given location to minimize modeled thermal exposure while satisfying operating constraints?"*

---

## 2. Product Hypothesis

By combining FortyGuard's verified hyperlocal thermal intelligence with a deterministic decision-ranking engine and a local scenario recalculation layer, operators can identify optimal operational time windows and quantify exposure trade-offs with transparent evidence.

---

## 3. Product Abstraction & Demo Vertical

- **Product Abstraction:** Heat-exposed operations decision intelligence.
- **Demonstration Vertical:** Outdoor field operations (serves as the primary demo scenario for judging; does NOT constitute a medical or safety certification boundary).
- **Primary User Persona:** Field Operations Planner / Shift Coordinator.

---

## 4. Primary Core Decision

> **Primary Core User Question:**  
> *"I need to run a 3-hour outdoor operation at this location tomorrow. When should I do it to minimize modeled thermal exposure while satisfying my operating constraints?"*

**Decision Flow:**  
`Location + Time Constraints + Operation Duration → FortyGuard Telemetry → Candidate Windows → Deterministic Evaluation → Recommended Window → Evidence Bundle → Scenario Comparison`

---

## 5. First Vertical Slice Definition (Slice 1)

**Scope of Slice 1:**
- **Spatial Scope:** **ONE** selected location / AOI + **MULTIPLE** candidate time windows.
- **User Inputs:** Location/AOI, operation duration (e.g. 3h), permissible operating period (e.g. 06:00–18:00 local time).
- **System Actions:**
  1. Obtains verified FortyGuard telemetry for target location.
  2. Normalizes timestamps (UTC/local conversion) and units.
  3. Generates feasible candidate windows using step size `CandidateWindowStep = DATA_RESOLUTION`.
  4. Evaluates modeled thermal exposure using the approved deterministic model interface `evaluateExposure(observations, window, modelConfig)`.
  5. Ranks candidate windows with deterministic tie-breaking.
  6. Recommends the lowest-exposure feasible window.
  7. Displays supporting Evidence Bundle.
- **Slice 1 Exclusions:** AI layer, mitigation factors, satellite/streetview segmentation, routing, multi-location comparison, user accounts, databases.

---

## 6. System Inputs & Provenance Classification

1. **User / Operational Inputs (`ASSUMED`):**
   - Target Location / AOI coordinates.
   - Operation Duration $d$ (e.g. 1 to 8 hours).
   - Permissible Operating Time Bounds $[T_{\text{start}}, T_{\text{end}}]$ with explicit timezone context.
2. **FortyGuard Telemetry Inputs (`OBSERVED` vs `DERIVED`):**
   - `OBSERVED`: Direct point API responses (e.g. point telemetry).
   - `DERIVED`: Tile aggregations computed from heatmap telemetry (e.g. `average_temperature`, `min_temperature`, `max_temperature`).
   - `PREDICTED`: Verified FortyGuard forecast series (+12h horizon).

---

## 7. Integration Dependency Resolution (`/v1/env_params`)

- **API Requirement:** `/v1/env_params` requires a `temperature` input parameter.
- **Status:** `UNKNOWN — VERIFY` (The semantic relationship of supplying heatmap tile averages to `env_params` is unconfirmed).
- **Architectural Handling:** The FortyGuard adapter treats `/v1/env_params` as an **optional enrichment layer**. Core decision window ranking relies on verified thermal telemetry and does not block if `env_params` is omitted or unavailable.
- **No User Measurement Fallbacks:** User-provided site baseline measurements are removed from core architecture; all inputs must be 100% reproducible from verified API data.

---

## 8. Decision Objective & Model Contract

$$\text{Select } W^* = \arg\min_{W_i \in \mathcal{W}_{\text{feasible}}} E(W_i)$$

Where:
- $W_i = [t_i, t_i + d]$ represents candidate operating window $i$.
- $\mathcal{W}_{\text{feasible}}$ is the set of candidate windows satisfying user time bounds.
- $E(W_i)$ is the deterministic exposure score computed via interface `evaluateExposure(observations, window, modelConfig)`.
- Exposure formula status: `PROVISIONAL — MODEL TO BE DEFINED`.

---

## 9. What-If Scenario Sandbox Scope

- **Supported Parameters:** Operation duration $d$, permissible time bounds $[T_{\text{start}}, T_{\text{end}}]$, location selection.
- **Removed from Core MVP:** Mitigation factors ($M$), shade/intervention simulation (deferred to future work due to lack of validated scientific mapping).
- **Performance Model:**
  - *Data Acquisition:* Asynchronous FortyGuard API fetching & polling.
  - *Scenario Recalculation:* Local, in-memory deterministic re-evaluation (local and responsive after telemetry is loaded).

---

## 10. Evidence Bundle Specification

The deterministic engine produces a structured `Evidence Bundle` consumed by the UI and downstream AI explainer:

```typescript
export interface EvidenceBundle {
  sourceEndpoint: string;
  requestLocation: { lat: number; lon: number } | { aoi: object };
  requestTimeRange: { start: string; end: string; timezone: string };
  observationTimestamp: string;
  units: { temperature: 'celsius'; duration: 'hours' };
  observedValues: Record<string, number | null>;
  derivedValues: Record<string, number | null>;
  modelVersion: string;
  candidateWindows: Array<{
    windowId: string;
    startTime: string;
    endTime: string;
    exposureScore: number;
    rank: number;
    isFeasible: boolean;
  }>;
  recommendation: {
    recommendedWindowId: string;
    startTime: string;
    endTime: string;
    exposureScore: number;
  };
}
```

---

## 11. AI Role & Grounding Protocol

- **Role:** Narrative explainer synthesizing the `Evidence Bundle`.
- **Grounding Rule:** AI receives ONLY the structured `Evidence Bundle`. AI never fetches raw API data, invents temperatures, or computes risk scores.

---

## 12. Non-Goals & MVP Exclusions

- **NO Medical / Safety Claims:** No claims of medical safety, worker safety certification, or heat injury prevention.
- **NO Mitigation Simulation:** No unvalidated shade or cooling reduction multipliers in core calculation.
- **NO Heavy Infrastructure:** No user accounts, billing, databases, Python services, Redis, queues, or Kubernetes.

---

## 13. Acceptance Criteria

1. **Strict Provenance Integrity:** Derived tile metrics are never labeled `OBSERVED`.
2. **Deterministic Reproducibility & Tie-Breaking:** Identical inputs and constraints always produce identical window rankings with deterministic tie-breaking.
3. **Responsive Scenario Recalculation:** Local scenario re-evaluations compute responsively without repeating external API requests.
4. **Timezone Safety:** All timestamp operations explicitly handle local vs UTC conversions without silent assumptions.
