# ADR 0002: Thermal Operations Decision Model & Scope Lock

**Status:** LOCKED  
**Date:** 2026-08-20  
**Deciders:** Team / Lead Architect  

---

## 1. Context & Problem Statement

Following Milestone 1 API Reconnaissance, FortyGuard capabilities were confirmed (GeoJSON heatmap tiles, environmental parameters including wet-bulb and heat index, 12h forecasts). We conducted an adversarial product review to lock the architectural boundary, MVP scope, and product abstraction for the hackathon submission deadline (**2026-08-30**).

---

## 2. Decision

1. **Product Abstraction & Boundary:**
   - **Product Name:** Thermal Decision Engine.
   - **Abstraction:** Decision-intelligence system for *heat-exposed operations*.
   - **Demonstration Vertical:** Outdoor field operations (used as the primary demo scenario, NOT as the hard architectural boundary).
   - **Non-Claims:** The system explicitly does **NOT** claim medical safety, worker safety certification, heat injury prevention, or global health guarantees. All outputs represent *modeled thermal exposure* and relative operational risk.

2. **Core Decision Problem:**
   - Input: Location + Time Constraints + Operation Duration + Constraints.
   - Flow: FortyGuard Telemetry $\to$ Candidate Windows $\to$ Deterministic Exposure Evaluation $\to$ Recommended Window $\to$ Evidence $\to$ What-If Comparison.

3. **Core MVP Scope (Locked to 6 Capabilities):**
   - Thermal Assessment
   - Spatial Thermal Context
   - Temporal Decision (Window Ranking)
   - Deterministic Decision Engine
   - What-If Scenario Comparison
   - Evidence-Grounded AI Explanation

4. **Integration Dependency Resolution (`env_params` temperature input):**
   - The verified `/v1/env_params` endpoint requires a `temperature` input parameter.
   - Sourcing Strategy: Temperature inputs to `env_params` are sourced from user-provided baseline observations, observed location telemetry, or from the corresponding `/v1/heatmap` tile data (`average_temperature` / `max_temperature`).

5. **Exclusions from MVP:**
   - Satellite / Streetview segmentation and PDF report generation endpoints remain documented in `FORTYGUARD.md` as optional future capabilities, but are excluded from MVP core.
   - Excluded: User accounts, billing, medical diagnostics, logistics network routing, databases, Python microservices, Redis, queues, Kubernetes.

---

## 3. Consequences

### Positive
- Strict, evidence-backed product scope achievable before the hackathon deadline.
- Clear separation between scientific telemetry, deterministic calculation, and AI explanation.
- No liability risk from unvalidated health/medical claims.

### Negative / Trade-offs
- PDF report generation and satellite/streetview features are omitted from the primary demo flow to maximize depth in decision intelligence.
