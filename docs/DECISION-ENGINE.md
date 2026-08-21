# Decision Engine Model — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M3.6 — Location-Specific Thermal Baseline Correction  

- **Product Direction:** `LOCKED`
- **MVP Scope Boundary:** `LOCKED`
- **FortyGuard API Capabilities:** `VERIFIED`
- **Primary Model Version:** `v1.0.0-spatial-thermal-baseline` (`LOCKED`)

---

## 1. Model Positioning & Non-Medical Disclaimer

> **Model Positioning Definition:**  
> `v1.0.0-spatial-thermal-baseline` is defined as an **intentionally simple spatial thermal baseline**.  
>  
> It is **NOT** a human heat-stress model, worker safety model, medically validated risk score, or complete thermal comfort index. Temperature is a physical thermal observation, but temperature alone does not represent total human thermal stress.  
>  
> **Primary Purpose of v1:** Demonstrate deterministic temporal window optimization using verified FortyGuard hyperlocal thermal observations for a selected operational location.

---

## 2. Location-Specific Pipeline & Point-to-Tile Mapping

```
               [ User Selects Location Point (lat, lon) ]
                                   │
                                   ▼
        [ Map Point to Containing FortyGuard Heatmap Feature/Tile ]
           (Spatial point-in-polygon bounding check for AOI)
                                   │
                                   ▼
        [ Extract Hourly average_temperature Observations for Tile ]
                                   │
                                   ▼
        [ Generate Candidate Windows W_i (Step CandidateWindowStep = 1h) ]
                                   │
                                   ▼
        [ Compute Mean Window Temperature E(W_i) = (1/n) Σ T(location, t) ]
                                   │
                                   ▼
        [ Rank Feasible Windows (Deterministic tie-breaking by earlier start) ]
                                   │
                                   ▼
        [ Recommend Optimal Window W* + Output Evidence Bundle ]
```

*Mapping Rule:* The user point $(lat, lon)$ MUST map deterministically to a specific FortyGuard heatmap tile feature. If the point falls outside returned tile coverage, the system throws an explicit error (`ValidationError`). It MUST NOT silently fall back to the AOI-wide maximum or hottest tile.

---

## 3. Location-Specific Baseline Exposure Formula (`v1.0.0-spatial-thermal-baseline`)

For a candidate operating window $W_i = [t_i, t_i + d]$ comprising $n$ hourly timestamps:

$$E(W_i) = \frac{1}{n} \sum_{t \in W_i} T(\text{location}, t)$$

Where:
- $T(\text{location}, t)$ is the verified `average_temperature` (in °C) associated with the selected operational location's containing tile at timestamp $t$.
- $n = |W_i|$ is the number of hourly observations in duration $d$.
- **Deterministic Tie-Breaking:** If two candidate windows have equal mean temperature scores $E(W_i) == E(W_j)$, the window with the earlier start timestamp $t_i < t_j$ is ranked higher.

---

## 4. Temporal Constraints & Forecast Horizon Boundary

- **Verified Forecast Lead Time:** Up to **+12 hours** from the current UTC time.
- **Horizon Enforcement:** Permissible operating bounds $[T_{\text{start}}, T_{\text{end}}]$ and candidate windows $W_i$ MUST fall entirely within the verified +12-hour lead time.
- **Incomplete Temporal Range:** If a requested operating period extends beyond available forecast lead time, the engine refuses to fabricate data and throws an explicit `IncompleteTemporalCoverageError`.

---

## 6. Joint Spatial-Temporal Decision Model (WHERE + WHEN)

Evaluates the joint candidate space:

$$\text{CandidatePlan} = \text{CandidateLocation} \times \text{CandidateWindow}$$

$$P^* = \arg\min_{(L_i, W_j)} E(L_i, W_j)$$

**Deterministic 3-Tier Tie-Breaking:**
1. Lowest Mean Exposure Score ($E(L_i, W_j)$)
2. Earlier Window Start Time ($t_{\text{start}}$)
3. Stable Alphabetical Location ID (`locationId`)

---

## 7. What-If Constraint Sensitivity Engine

Computes the exact mathematical Cost of an Operational Constraint:

$$C = E(P') - E(P_0)$$

Where:
- $P_0$: Unconstrained global optimum across all candidate locations and feasible sliding windows.
- $P'$: Constrained optimum under an imposed single operational restriction (e.g. `TEMPORAL_SHIFT`, `LOCATION_LOCK`, `DURATION_EXPANSION`).
- $C$: Arithmetic mean modeled temperature increase (in °C) resulting from the constraint.

---

## 8. Read-Only AI Explanation & Grounding Guardrails

### Core Authority Invariant:
The deterministic decision engine is the sole mathematical authority. The AI layer acts strictly as a read-only explainer and cannot mutate, override, interpolate, or recalculate decision outputs.

### Grounding Validation Boundaries:
1. **Schema Validation:** Enforces strict Zod parsing of operational summary, comparative rationale, and epistemic notices.
2. **Numeric Allow-List Auditor:** Extracts all numbers from generated text and verifies that every numerical value corresponds to verified numbers in the `EvidenceBundle` within strict tolerance ($\le 0.01^\circ\text{C}$).
3. **Evidence Timestamp/Date Recognition:** Validates that mentioned timestamps, calendar years, and clock hours match verified evidence timestamps.
4. **Negative Semantic Guardrails:** Intercepts and rejects forbidden medical, physiological, or worker safety claims (`heat stroke`, `heat stress`, `OSHA`, `hazard`).
5. **Physical Semantics Guardrails:** Rejects unverified assertions (`2m ambient`, `land-surface temperature`, `skin temperature`, `calibrated sensor`).
6. **Honest Epistemic Limitation:** The validator guarantees **syntactic compliance**, **numeric accuracy**, and **negative safety boundaries**. It does not perform formal natural language causal entailment theorem proving.
7. **Deterministic Fallback:** Any validation rejection, network timeout ($>5000\text{ms}$), or missing API key immediately routes to the synchronous, zero-dependency `generateDeterministicExplanation()`.

