# Product Requirements Document (PRD) — Thermal Decision Engine

**Status:** LOCKED  
**Last Updated:** 2026-08-20  
**Milestone:** M2 — Product Lock  

---

## 1. Problem Statement

Heat-exposed operations (e.g., outdoor maintenance, construction shifts, field inspections, utility repairs) suffer from severe efficiency loss and elevated thermal exposure when scheduled blindly against macro-weather forecasts. Generic weather apps provide low-resolution, regional forecasts that fail to capture microclimate thermal dynamics, spatial variations, and optimal operating windows.

Raw heatmaps display thermal intensity but do not answer the core operational question: *"When and where should this operation be executed to minimize modeled thermal exposure while meeting operational constraints?"*

---

## 2. Product Hypothesis

By combining FortyGuard's verified hyperlocal thermal intelligence with a deterministic decision-ranking engine and an interactive what-if sandbox, operators can identify optimal operational windows, quantify risk trade-offs, and justify timing decisions with transparent evidence.

---

## 3. Primary User & Demo Abstraction

- **Product Abstraction:** Heat-exposed operations decision intelligence.
- **Demonstration Vertical:** Outdoor field operations (used as the primary demo workflow).
- **Primary User Persona:** Field Operations Planner / Shift Supervisor responsible for scheduling outdoor activities under time and resource constraints.

---

## 4. Primary Core User Decision

> **Primary User Question:**  
> *"I need to run a 3-hour outdoor operation at this location tomorrow. When and where should I do it to minimize modeled thermal exposure while satisfying my operating constraints?"*

---

## 5. End-to-End User Journey

```
[ User defines operation: Location, Date, Duration (e.g. 3h), Operating Window Bounds ]
                                     │
                                     ▼
             [ FortyGuard Hyperlocal Telemetry Fetch ]
      (Heatmap GeoJSON tiles + Environmental Parameters: Wet-Bulb, Solar)
                                     │
                                     ▼
               [ Candidate Operating Windows Generated ]
       (Sliding time-windows evaluated across temporal horizon)
                                     │
                                     ▼
               [ Deterministic Exposure & Risk Ranking ]
  (Window evaluated by objective function: min modeled exposure given constraints)
                                     │
                                     ▼
       [ Recommended Window + Spatial Context + Evidence Display ]
                                     │
                                     ▼
            [ What-If Sandbox: Adjust Duration / Constraints ]
        (Instant recalculation and side-by-side scenario comparison)
                                     │
                                     ▼
          [ AI Explanation Layer: Narrative Grounded in Evidence ]
```

---

## 6. System Inputs

1. **User / Operational Inputs:**
   - Target Location / Area (Latitude, Longitude or AOI Polygon).
   - Operation Duration (e.g., 1 to 8 hours).
   - Permissible Time-Window Bounds (e.g., 06:00 to 18:00).
   - Operational Constraints (e.g., maximum acceptable modeled heat index, mandatory shade/mitigation assumptions).
2. **Verified FortyGuard Telemetry Inputs (`VERIFIED`):**
   - GeoJSON Heatmap Tiles (`average_temperature`, `min_temperature`, `max_temperature`, `analytic_type`: `tcm`, `exceedance`, `persistence`).
   - Environmental Parameters (`wet_bulb_temperature_celsius`, `heat_index_celsius`, `apparent_temperature_celsius`, `relative_humidity_percent`, `solar_irradiance`: `ghi`, `dni`, `dhi`).

---

## 7. System Outputs

1. **Recommended Operating Window:** Optimal start/end time minimizing modeled thermal burden.
2. **Ranked Candidate Windows:** Secondary feasible windows with relative exposure scores and delta metrics.
3. **Spatial Thermal Context:** Heatmap polygon overlay indicating localized hot spots and microclimate variations.
4. **What-If Scenario Comparison:** Side-by-side delta view contrasting baseline vs. modified constraints (e.g., 3h vs 2h duration, 08:00 vs 14:00 start).
5. **Grounded AI Narrative:** Structured explanation explaining the recommendation using verified evidence only.

---

## 8. Decision Objective Function

The Decision Engine evaluates all candidate windows $W_i$ within the permissible timeframe:

$$\text{Select } W^* = \arg\min_{W_i \in \text{Feasible}} \text{ModeledThermalExposure}(W_i)$$

Where feasibility requires satisfying all user-defined constraints (e.g., time-window boundaries, maximum allowed temperature threshold).

*Note: "Optimal" is strictly defined relative to the candidate set and active constraints.*

---

## 9. Operating Constraints

- Start/End time window boundaries.
- Required continuous operation duration.
- Spatial boundaries (AOI polygon or location coordinates).
- Optional exposure ceiling threshold.

---

## 10. Core MVP Capabilities (Locked to 6)

1. **Thermal Assessment:** Fetch verified FortyGuard thermal telemetry for target coordinates/AOI.
2. **Spatial Thermal Context:** Render spatial thermal variation using FortyGuard GeoJSON heatmap tile features.
3. **Temporal Decision:** Evaluate candidate operating windows across available forecast/temporal series.
4. **Deterministic Decision Engine:** Rank candidate windows deterministically against the objective function and operational constraints.
5. **What-If Scenarios:** Interactive sandbox to alter duration, timing window, or mitigation assumptions with sub-second recalculation and comparison.
6. **Evidence-Grounded AI Explanation:** LLM narrative synthesizer explaining *why* a window was selected using strictly verified outputs.

---

## 11. What-If Scenarios

Users can adjust:
- **Operation Duration:** Compare 2-hour vs 3-hour vs 4-hour operational exposure.
- **Allowed Time Window:** Evaluate morning (06:00-12:00) vs afternoon (12:00-18:00) shift availability.
- **Mitigation Factor:** Simulate the exposure reduction of adding localized cooling or shade assumptions.

---

## 12. AI Role & Grounding Protocol

- **Role:** Explainer and synthesizer, NOT calculation engine.
- **Constraint:** AI receives structured JSON outputs from the deterministic engine. AI never fetches raw weather data or computes numerical metrics.

---

## 13. Data Provenance & Lineage Badging

All UI elements explicitly display provenance tags:
- `OBSERVED`: Raw FortyGuard measurements.
- `DERIVED`: Deterministic domain outputs.
- `PREDICTED`: FortyGuard forecast series.
- `ASSUMED`: User scenario inputs.
- `AI_GENERATED_EXPLANATION`: LLM narrative synthesis.

---

## 14. Non-Goals & MVP Exclusions

- **NO Medical / Safety Guarantees:** No claims of medical safety, health advice, or occupational safety certification.
- **NO Worker-Specific Medical Diagnostics:** No physiological modeling (heart rate, core body temp).
- **NO Logistics Network Routing:** No multi-node vehicle routing or turn-by-turn navigation algorithms.
- **NO Urban Planning / PDF Product:** Satellite/streetview segmentation and PDF report generation endpoints are excluded from the primary MVP demo flow.
- **NO Heavy Infrastructure:** No user accounts, billing, databases, Python services, Redis, queues, or Kubernetes.

---

## 15. Domain-Independent Acceptance Criteria

1. **Zero Fabricated Metrics:** Every metric displayed is traceable to an `OBSERVED`, `DERIVED`, `PREDICTED`, or `ASSUMED` lineage tag.
2. **Deterministic Reproducibility:** Identical inputs and constraints always produce identical candidate window rankings.
3. **Sub-Second Recalculation:** Scenario parameter updates in the UI recalculate in $< 100\text{ ms}$.
4. **Graceful Error Recovery:** Malformed API responses or network timeouts fall back safely with actionable feedback.

---

## 16. Demo Workflow (3-Minute Judging Flow)

1. **Set Operation:** Select location, set 3-hour duration for tomorrow's shift.
2. **View Thermal Context & Recommendation:** System displays FortyGuard spatial heatmap, evaluates temporal series, and highlights the recommended window (e.g., 07:00-10:00).
3. **Run What-If Comparison:** User shifts constraint to afternoon (13:00 start) or reduces duration to 2 hours $\to$ side-by-side delta view shows increase in thermal burden.
4. **Inspect AI Evidence:** Expand AI drawer to read grounded explanation citing specific FortyGuard wet-bulb and solar irradiance metrics.

---

## 17. Product Differentiation

Unlike generic weather apps or raw FortyGuard API feeds:
- **Weather Apps:** Macro-level, low-resolution, no scenario simulation, no operational window optimization.
- **Raw FortyGuard API:** High-resolution telemetry, but requires decision logic to turn heatmaps into operational choices.
- **Thermal Decision Engine:** Synthesizes FortyGuard spatial-temporal telemetry + operational constraints + deterministic window ranking + what-if simulation + grounded AI explanations into a single actionable workspace.

---

## 18. Known Limitations & Integration Dependencies

- **`/v1/env_params` Temperature Input Dependency:** The verified `/v1/env_params` endpoint requires a `temperature` parameter in the request payload. In our architecture, this temperature is deterministically supplied from the `/v1/heatmap` tile data (`average_temperature` / `max_temperature`) or verified location observation.
- **Forecast Horizon:** Forecast capabilities are limited to the verified FortyGuard model horizon (+12 hours into the future).
- **No Health Guarantees:** Output metrics represent *modeled thermal exposure* and relative operational burden, not medical safety advice.
