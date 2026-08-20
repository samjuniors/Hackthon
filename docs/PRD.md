# Product Requirements Document (PRD) — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. Product Overview

The **Thermal Decision Engine** is an operational decision platform that ingests FortyGuard hyperlocal thermal intelligence to produce deterministic operational recommendations, spatial-temporal risk assessments, and scenario what-if simulations.

---

## 2. Target Personas (Provisional)

1. **Operational Safety Manager:** Needs to ensure field/outdoor teams do not exceed heat stress thresholds while minimizing productivity loss.
2. **Logistics & Dispatch Planner:** Needs to identify optimal dispatch windows and routes that minimize thermal exposure for sensitive cargo or equipment.
3. **Urban Resilience Planner:** Needs to evaluate microclimate impact and simulate the benefits of localized cooling or operational timing shifts.

---

## 3. Scope & Phased Capabilities

### Phase 1: MVP Vertical Slices
- **Slice 0 (Evidence):** Verified FortyGuard API client and capability map.
- **Slice 1 (First Thermal Decision):** Single location query → FortyGuard telemetry fetch → deterministic thermal threshold assessment → operational recommendation display with clear evidence.
- **Slice 2 (Spatial Intelligence):** Spatial thermal visualization, hotspot detection, and zone-level risk rating.
- **Slice 3 (Temporal Decision):** Time-series / forecast integration to identify operational windows and risk peaks.
- **Slice 4 (What-If Scenarios):** User-controlled parameter adjustments (e.g., timing shifts, threshold changes, intervention simulations) with instant comparison.
- **Slice 5 (AI Explainability Layer):** LLM-based narrative synthesizer explaining why a recommendation was generated based strictly on verified domain metrics.

---

## 4. Non-Goals

- We are **NOT** building a generic consumer weather dashboard.
- We are **NOT** building an ungrounded LLM chatbot that hallucinates weather facts.
- We are **NOT** re-creating FortyGuard's internal spatial modeling engine or data generation pipelines.
- We are **NOT** building complex multi-tenant enterprise billing or authentication during the hackathon MVP.

---

## 5. Known Facts vs. Unknowns

### Known Facts
- Hackathon deadline is **2026-08-30**.
- Product must leverage FortyGuard hyperlocal temperature data.
- Stack is TypeScript, Next.js, React, Tailwind, and Vitest.

### Unknowns (`UNKNOWN — VERIFY`)
- Exact FortyGuard API endpoints, parameters, and authentication scheme: `UNKNOWN — VERIFY`
- Supported geographic locations and spatial coordinate bounds: `UNKNOWN — VERIFY`
- Temporal resolution (real-time intervals, historical depth, forecast horizon): `UNKNOWN — VERIFY`
- Environmental parameters provided beyond ambient temperature (e.g., surface temp, humidity, solar radiation, heat index): `UNKNOWN — VERIFY`
- Rate limits and query quota for the hackathon API key: `UNKNOWN — VERIFY`

---

## 6. Acceptance Criteria (MVP Baseline)

1. Zero fabricated metrics: All numbers shown are either labeled `OBSERVED` (from FortyGuard) or `DERIVED` (from tested domain code).
2. Deterministic reproducibility: Given identical thermal inputs and scenario constraints, the decision engine outputs identical recommendations.
3. Sub-second scenario recalculation in client UI.
4. Clean end-to-end user workflow demoable in under 3 minutes.
