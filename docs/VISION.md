# Product Vision — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. Executive Summary

As urban environments and industrial systems experience localized thermal variations and severe heat stress, operational leaders struggle to translate raw ambient data into actionable choices.

FortyGuard provides the underlying hyperlocal thermal and environmental data intelligence. The **Thermal Decision Engine** is a decision-support and scenario-modeling platform built above FortyGuard, turning hyperlocal thermal intelligence into explainable operational decisions and what-if analysis.

---

## 2. The Core Problem

1. **Data vs. Decision Gap:** Raw heatmaps and temperature readings display thermal severity but do not answer operational questions (e.g., when to schedule activities, how to optimize operating windows, or which mitigation measures yield the highest impact).
2. **Hyperlocal Complexity:** Macro-weather feeds miss microclimate variations caused by urban materials, shade, surface heat retention, and localized thermal dynamics.
3. **Absence of Scenario Simulation:** Operators lack lightweight, deterministic tools to simulate the effect of altered timing, operational constraints, or localized cooling interventions prior to execution.
4. **AI Hallucination Risk:** Ungrounded AI tools frequently invent temperatures, compute invalid metrics, or deliver unverified operational advice.

---

## 3. Value Layer Above FortyGuard

```
[ FortyGuard Hyperlocal Thermal Telemetry ]
                    │
                    ▼
       [ Ingestion & Validation ] (Strict Zod Schemas)
                    │
                    ▼
     [ Deterministic Thermal Analysis ] (Domain Engine)
                    │
                    ▼
     [ Scenario & What-If Simulation ] (Parametric Modeling)
                    │
                    ▼
   [ Evidence-Backed Recommendations ] (Deterministic Rules)
                    │
                    ▼
     [ AI Synthesis & Interaction ] (Explainable Narrative)
```

---

## 4. Candidate Domain Hypotheses (PROVISIONAL)

*Note: No specific industry or domain is selected. The following are candidate application hypotheses to be evaluated against verified FortyGuard API capabilities:*

- **Hypothesis A — Operational Labor & Field Safety:** Dynamic operational window scheduling and heat-risk mitigation based on hyperlocal thermal exposure.
- **Hypothesis B — Logistics & Thermal-Sensitive Operations:** Route and dispatch time-window optimization to reduce heat exposure for sensitive assets or cargo.
- **Hypothesis C — Urban Infrastructure & Municipal Interventions:** Comparative simulation of microclimate interventions and targeted thermal relief zones.

The final vertical domain will be selected in Milestone 2 (Product Lock) based on actual API capabilities, spatial resolution, and available parameters confirmed in Milestone 1.

---

## 5. Success Criteria & Differentiators

- **Zero Hallucinated Metrics:** Absolute boundary separation between observed API data, derived deterministic calculations, user scenario assumptions, and AI explanations.
- **Actionability:** Clear, deterministic operational guidance with explicit trade-offs.
- **Interactive Simulation:** Rapid scenario recalculation enabling users to evaluate operational what-if parameters.
