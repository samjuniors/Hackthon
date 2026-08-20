# Decision Engine Model — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. Core Purpose & Determinism Guarantee

The Decision Engine is a pure mathematical and rules-based domain service. It takes validated thermal observations and scenario parameters, evaluates risk thresholds, and computes deterministic operational recommendations.

**Core Rule:** Decision calculation NEVER invokes an LLM. The output for any identical set of inputs is 100% deterministic and reproducible.

---

## 2. Decision Logic Pipeline

```
[ FortyGuard Normalized Telemetry ]
   ├── Current Ambient / Surface Temp (T_obs)
   ├── Relative Humidity (RH_obs) [UNKNOWN — VERIFY if available]
   └── Forecast Series (T_forecast[t]) [UNKNOWN — VERIFY if available]
                 │
                 ▼
[ Derived Thermal Indices Calculation ]
   ├── Heat Index / Wet-Bulb Approximation (HI)
   └── Thermal Exposure Duration (E_duration)
                 │
                 ▼
[ Operational Constraint Evaluation ]
   ├── User / Industry Thresholds (T_critical)
   ├── Time-window constraints
   └── Mitigation parameters (cooling, shading, route shift)
                 │
                 ▼
[ Recommendation & Risk Score Generation ]
   ├── Risk Level: SAFE | CAUTION | WARNING | CRITICAL
   ├── Recommended Action: PROCEED | DELAY | REROUTE | MITIGATE
   └── Delta Impact Metrics (under What-If adjustments)
```

---

## 3. Candidate Decision Rules & Formulas (PROVISIONAL)

### 3.1 Thermal Stress Index (TSI)
$$TSI = f(T_{ambient}, T_{surface}, RH, SolarExposure)$$
*(Exact mathematical formulation to be locked following FortyGuard API field verification: `UNKNOWN — VERIFY`)*

### 3.2 Time Window Optimization
Given a required operational task duration $\Delta t$, the engine computes the optimal start time $t^*$ minimizing cumulative thermal stress:
$$t^* = \arg\min_{t \in [t_{start}, t_{end}]} \int_{t}^{t + \Delta t} TSI(t') \, dt'$$

---

## 4. Unknowns & Verifications Needed

- Which specific environmental parameters FortyGuard returns (e.g., surface temperature vs ambient temperature vs apparent temperature): `UNKNOWN — VERIFY`
- Format and granularity of FortyGuard forecast horizons: `UNKNOWN — VERIFY`
- Spatial polygon vs point query capabilities: `UNKNOWN — VERIFY`
