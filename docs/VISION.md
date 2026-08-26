# Product Vision — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M2.1 — Decision Model Reconciliation  

---

## 1. Executive Summary

As climate volatility increases localized heat stress, organizations managing physical operations face significant operational disruption. Raw weather feeds and static heatmaps display ambient temperatures, but fail to answer the core operational question: *"When should heat-exposed operations be scheduled to minimize modeled thermal exposure while meeting operational constraints?"*

FortyGuard provides underlying hyperlocal thermal telemetry. The **Thermal Decision Engine** is a decision-intelligence system built above FortyGuard, transforming hyperlocal spatial and temporal thermal data into optimal operating window recommendations, interactive scenario comparisons, and evidence-grounded explanations.

---

## 2. Product Abstraction vs. Demonstration Vertical

- **General Product Abstraction:** Decision intelligence for *heat-exposed operations*. The underlying engine evaluates candidate operating windows, temporal variations, and operating constraints for time-sensitive outdoor or heat-exposed activities.
- **Demonstration Vertical:** Outdoor field operations (e.g., field maintenance crews, inspection shifts). Outdoor field operations serve as the primary demo scenario for hackathon judging, but do not define the architectural boundary of the product.
- **Non-Medical Boundary:** The system provides decision support based on *modeled thermal exposure*. It explicitly does **NOT** issue medical advice, worker health guarantees, or occupational safety certifications.

---

## 3. Core Principles

1. **Decision Intelligence over Passive Display:** Focuses on evaluating candidate operating windows rather than merely rendering raw weather feeds.
2. **Deterministic Engine Contract:** Window ranking and exposure evaluations execute deterministically. The AI layer explains verified outputs without inventing numbers.
3. **Responsive Local Scenario Recalculation:** Separates external API acquisition from fast, in-memory scenario re-evaluation.
4. **Strict Provenance Differentiation:** Maintains clear distinctions between raw API readings (`OBSERVED`), tile aggregations (`DERIVED`), forecasts (`PREDICTED`), scenario inputs (`ASSUMED`), and narrative explanations (`AI_GENERATED_EXPLANATION`).
