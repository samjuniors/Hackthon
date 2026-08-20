# Decision Engine Model — Thermal Decision Engine

**Status:** LOCKED  
**Last Updated:** 2026-08-20  
**Milestone:** M2 — Product Lock  

---

## 1. Decision Model Architecture & Deterministic Guarantee

The Decision Engine is a pure mathematical domain service responsible for evaluating candidate operating windows, computing modeled thermal exposure, enforcing operational constraints, and ranking candidate options.

**Fundamental Principles:**
1. **100% Deterministic Execution:** Identical inputs and constraints always produce identical decision rankings and exposure scores.
2. **Zero LLM Calculation:** The LLM NEVER computes scores, filters candidate windows, or evaluates mathematical formulas. It synthesizes explanations strictly from verified decision outputs.
3. **No Unsubstantiated Safety Claims:** All output metrics measure *modeled thermal exposure* and relative operational burden. The engine does not issue medical safety certifications.

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
     (Zod schema parsing, null handling, unit alignment)
                       │
                       ▼
         [ DERIVED THERMAL FEATURES ]
 (Composite thermal stress index, spatial peak temperature extraction)
                       │
                       ▼
             [ CANDIDATE WINDOWS ]
   (Generate sliding intervals W_i of duration d across window)
                       │
                       ▼
             [ CONSTRAINT FILTER ]
 (Discard candidate windows violating mandatory user thresholds)
                       │
                       ▼
           [ EXPOSURE EVALUATION ]
 (Calculate integrated modeled thermal exposure for each candidate window)
                       │
                       ▼
                 [ RANKING ]
 (Order feasible candidate windows from lowest to highest exposure)
                       │
                       ▼
           [ RECOMMENDED WINDOW ]
  (Primary recommendation W* + secondary ranked candidate windows)
                       │
                       ▼
              [ EVIDENCE BUNDLE ]
 (Structured telemetry, tile stats, calculation steps, lineage tags)
                       │
                       ▼
            [ AI EXPLANATION LAYER ]
  (Narrative synthesis grounded strictly in the Evidence Bundle)
```

---

## 3. Optimization Problem Formulation

Given:
- Location / Area of Interest $L$
- Operation Duration $d$ (e.g. 3 hours)
- Permissible Time Window $[T_{\text{start}}, T_{\text{end}}]$
- Temporal step size $\Delta t$ (e.g. 1 hour)
- Operational Constraints $C$

The set of candidate operating windows $\mathcal{W}$ consists of all intervals $W_i = [t_i, t_i + d]$ such that $T_{\text{start}} \le t_i$ and $t_i + d \le T_{\text{end}}$.

The Decision Engine evaluates the Modeled Thermal Exposure $E(W_i)$ for each candidate window $W_i$:

$$E(W_i) = \int_{t_i}^{t_i + d} \text{ThermalStressIndex}(L, t) \, dt$$

The recommended window $W^*$ is selected by:

$$W^* = \arg\min_{W_i \in \mathcal{W}_{\text{feasible}}} E(W_i)$$

Where $\mathcal{W}_{\text{feasible}} = \{ W_i \in \mathcal{W} \mid \text{Satisfies}(W_i, C) \}$.

*Note: "Optimal" is defined strictly relative to the candidate set $\mathcal{W}$ and active constraints $C$.*

---

## 4. Integration Dependency Resolution (`/v1/env_params` Temperature Input)

- **Verified API Requirement:** The FortyGuard `/v1/env_params` endpoint requires a `temperature` parameter in the request body (`latitude`, `longitude`, `temperature`, `date_time`).
- **Sourcing Protocol:**
  1. Primary Source: Temperature values supplied to `/v1/env_params` are extracted from the corresponding `/v1/heatmap` tile data (`average_temperature` or `max_temperature`) for the specified location and timestamp.
  2. Fallback Source: Observed baseline location telemetry or user-provided site baseline measurement.
- **Data Lineage:** The temperature input to `/v1/env_params` is tagged as `OBSERVED` (if from raw observation) or `DERIVED` (if from tile aggregation).

---

## 5. What-If Scenario Calculation Protocol

When a user adjusts a parameter in the What-If Sandbox (e.g., duration $d \to d'$, constraint threshold $C \to C'$, or applying a mitigation factor $M$):
1. The engine re-evaluates the candidate set $\mathcal{W}'$.
2. Re-calculates exposure $E(W_i)'$ incorporating the delta parameter or mitigation scalar.
3. Computes the Scenario Delta:
   $$\Delta E = E(W^*_{\text{new}})' - E(W^*_{\text{baseline}})$$
4. Returns the updated candidate ranking and side-by-side scenario comparison in $< 100\text{ ms}$.
