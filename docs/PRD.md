# Product Requirements Document (PRD) — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M3.6 — Location-Specific Thermal Baseline Correction  

- **Product Direction:** `LOCKED`
- **MVP Scope Boundary:** `LOCKED`
- **FortyGuard API Capabilities:** `VERIFIED`
- **Primary Model Version:** `v1.0.0-spatial-thermal-baseline` (`LOCKED`)

---

## 1. Problem Statement

Heat-exposed operations suffer from thermal burden when scheduled blindly against low-resolution regional weather forecasts. Generic weather apps do not capture microclimate thermal dynamics, spatial variations, and optimal operational time windows.

Raw heatmaps display thermal intensity but do not answer the core operational choice: *"When should an operation at a specific location be scheduled to minimize modeled thermal exposure while satisfying operational time constraints?"*

---

## 2. Product Abstraction & Model Positioning

- **Product Abstraction:** Decision intelligence for *heat-exposed operations*.
- **Demonstration Vertical:** Outdoor field operations (used as the primary demo scenario for judging).
- **Model Positioning Definition:** `v1.0.0-spatial-thermal-baseline` is an **intentionally simple spatial thermal baseline**. It is NOT a human heat-stress model, worker safety model, or medically validated index. Its purpose is to demonstrate deterministic temporal window optimization using verified FortyGuard thermal observations.

---

## 3. Primary Core User Decision

> **Primary Core User Question:**  
> *"I need to run a 3-hour outdoor operation at this location today within the next 12 hours. When should I do it to minimize modeled thermal exposure while satisfying my operating time constraints?"*

**Decision Flow:**  
`Location Point (lat, lon) → Containing Tile Feature → Hourly average_temperature Telemetry → Candidate Windows → Mean Temperature E(W) → Deterministic Ranking → Recommended Window → Evidence Bundle`

---

## 4. Vertical Slice 1 Acceptance Criteria (9 Steps)

A valid Vertical Slice 1 implementation must satisfy all 9 criteria:

1. **User Location Selection:** User selects one operational location point $(lat, lon)$.
2. **Point-to-Tile Mapping:** System maps the point deterministically to its containing FortyGuard heatmap tile feature.
3. **Hourly Telemetry Acquisition:** System obtains verified hourly temperature observations (`average_temperature` in °C) strictly within the supported **+12-hour forecast horizon**.
4. **Candidate Window Generation:** System generates feasible candidate operation windows $W_i = [t_i, t_i + d]$ using step `CandidateWindowStep = DATA_RESOLUTION` (1h).
5. **Mean Exposure Evaluation:** System computes the mean window temperature $E(W_i) = \frac{1}{n} \sum_{t \in W_i} T(\text{location}, t)$ for each candidate window.
6. **Deterministic Ranking:** System ranks feasible candidate windows from lowest to highest mean temperature, with deterministic tie-breaking (earlier start timestamp).
7. **Recommendation:** System recommends the lowest-temperature feasible window $W^*$.
8. **Evidence Display:** System displays the actual tile observations, timestamps, and model version used in the `Evidence Bundle`.
9. **Zero Data Fabrication:** If forecast data is incomplete, out-of-bounds ($>12\text{h}$), or location mapping fails, the system refuses to fabricate results and throws an explicit structured error (`IncompleteTemporalCoverageError` or `ValidationError`).

---

## 5. Non-Goals & MVP Exclusions

- **NO AOI-Wide Maximum:** Core ranking relies on the tile temperature corresponding to the selected operational location, NOT the hottest tile in the AOI.
- **NO Unvalidated Safety Claims:** No claims of medical safety, health advice, or occupational safety certification.
- **NO Heavy Infrastructure:** No user accounts, billing, databases, Python services, Redis, queues, or Kubernetes.
