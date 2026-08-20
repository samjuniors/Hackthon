# Product Requirements Document (PRD) — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. Product Overview & Hypothesis

The **Thermal Decision Engine** is an operational decision-support tool that consumes FortyGuard hyperlocal thermal intelligence to produce deterministic recommendations, risk assessments, and interactive scenario simulations.

**Core Product Hypothesis:**
By wrapping raw hyperlocal thermal intelligence in a deterministic decision engine and what-if simulation layer, operators can make evidence-backed operational decisions faster and with higher confidence than using raw heatmaps or generic weather feeds alone.

---

## 2. Candidate Personas & Use Case Hypotheses (PROVISIONAL)

*The exact target persona and workflow will be locked during Milestone 2 based on verified FortyGuard capabilities:*

- **Candidate Persona 1 — Field Operations Manager:** Needs to optimize operational time windows, evaluate thermal stress on personnel/equipment, and plan mitigation steps.
- **Candidate Persona 2 — Logistics & Asset Dispatcher:** Needs to avoid peak thermal exposure windows along transit corridors or asset staging areas.
- **Candidate Persona 3 — Urban / Facility Resilience Planner:** Needs to simulate and compare the relative effectiveness of localized thermal mitigation interventions.

---

## 3. General MVP Capability Roadmap (PROVISIONAL)

- **Slice 0 (Evidence):** Verified FortyGuard API client and capability matrix.
- **Slice 1 (First Thermal Decision):** Single location query → FortyGuard telemetry fetch → deterministic evaluation → operational recommendation display with clear evidence.
- **Slice 2 (Spatial Intelligence):** Spatial thermal visualization, hotspot identification, and zone-level risk rating (format pending API verification).
- **Slice 3 (Temporal Decision):** Time-series or forecast evaluation to identify optimal operating windows.
- **Slice 4 (What-If Scenarios):** User-controlled scenario parameter adjustments with instant side-by-side delta comparison.
- **Slice 5 (AI Explainability Layer):** LLM-based narrative explainer synthesizing verified domain outputs without hallucinating facts.

---

## 4. Non-Goals

- We are **NOT** building a generic consumer weather dashboard.
- We are **NOT** building an ungrounded LLM chatbot that invents weather metrics.
- We are **NOT** re-creating FortyGuard's internal spatial modeling engine or data generation pipelines.
- We are **NOT** building complex multi-tenant billing or auth systems for the hackathon MVP.

---

## 5. Known Facts vs. Unknowns

### Known Facts
- Hackathon deadline is **2026-08-30**.
- Product must leverage FortyGuard hyperlocal temperature data.
- Stack is Next.js, TypeScript, Tailwind, and Vitest.

### Unknowns (`UNKNOWN — VERIFY`)
- Exact FortyGuard API endpoints, parameters, and authentication scheme: `UNKNOWN — VERIFY`
- Supported geographic locations and spatial coordinate bounds: `UNKNOWN — VERIFY`
- Temporal resolution (real-time intervals, historical depth, forecast horizon): `UNKNOWN — VERIFY`
- Environmental parameters provided beyond ambient temperature: `UNKNOWN — VERIFY`
- Rate limits and query quota for the hackathon API key: `UNKNOWN — VERIFY`

---

## 6. Domain-Independent Acceptance Criteria (MVP Baseline)

1. **Zero Fabricated Facts:** All values displayed are strictly categorized as `OBSERVED`, `DERIVED`, `PREDICTED`, `ASSUMED`, or `AI-GENERATED EXPLANATION`.
2. **Deterministic Reproducibility:** Identical thermal inputs and scenario parameters always yield identical decision outputs and risk evaluations.
3. **Responsive Simulation:** Scenario parameter changes recalculate deterministically with sub-second latency in the client UI.
4. **Resilient Error Handling:** External API timeouts, rate limits, or invalid schemas fail gracefully with actionable user feedback.
5. **Clear Demo Workflow:** End-to-end user journey can be demonstrated clearly in under 3 minutes.
