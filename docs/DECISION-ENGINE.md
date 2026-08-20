# Decision Engine Model — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. Core Purpose & Determinism Guarantee

The Decision Engine is a pure mathematical and rules-based domain service. It processes validated thermal observations and scenario parameters, evaluates operational constraints, and computes deterministic recommendations.

**Fundamental Rule:** Decision evaluation NEVER relies on an LLM for calculation or scoring. Output for any identical input set is 100% deterministic, testable, and reproducible.

---

## 2. Generic Decision Domain Pipeline

```
[ Validated FortyGuard Telemetry ]
                 │
                 ▼
[ Derived Features & Thermal Indicators ]
  - Metric aggregations / exposure calculations
  - Specific formulas: UNKNOWN — VERIFY (pending confirmed API fields)
                 │
                 ▼
[ Domain Constraints & Thresholds ]
  - User-defined limits, operational bounds, time windows
                 │
                 ▼
[ Candidate Actions & Mitigations ]
  - Feasible operational adjustments (timing, routing, intervention)
                 │
                 ▼
[ Deterministic Decision Evaluation ]
  - Multi-criteria scoring / cost-benefit / rule evaluation
                 │
                 ▼
[ Recommended Action & Evidence Bundle ]
  - Primary recommendation
  - Relative risk score
  - Supporting evidence metrics & delta impacts
```

---

## 3. Mathematical & Algorithmic Models (`UNKNOWN — VERIFY`)

*The specific mathematical formulas, stress indices, and optimization algorithms are intentionally deferred until FortyGuard API telemetry fields and temporal/spatial resolutions are confirmed:*

- **Thermal Exposure & Stress Formulation:** `UNKNOWN — VERIFY` (depends on whether FortyGuard provides ambient, surface, heat index, or humidity fields).
- **Time-Window Optimization Algorithm:** `UNKNOWN — VERIFY` (depends on forecast horizon and temporal step intervals).
- **Scenario Delta Formulation:** `UNKNOWN — VERIFY` (depends on supported intervention and parameter types).

---

## 4. Unknowns & Verifications Needed

- Available FortyGuard telemetry parameters (ambient temp, surface temp, humidity, solar exposure, etc.): `UNKNOWN — VERIFY`
- Format and granularity of forecast series: `UNKNOWN — VERIFY`
- Spatial resolution and query mechanics: `UNKNOWN — VERIFY`
