# Product Vision — Thermal Decision Engine

**Status:** LOCKED  
**Last Updated:** 2026-08-20  
**Milestone:** M2 — Product Lock  

---

## 1. Executive Summary

As global climate volatility drives intense localized thermal stress, organizations managing physical, industrial, and outdoor operations face severe operational disruptions. Raw temperature feeds and static thermal maps display heat intensity, but do not tell operators *when* or *where* to conduct activities to minimize thermal risk while fulfilling operational constraints.

FortyGuard provides underlying hyperlocal thermal and environmental telemetry. The **Thermal Decision Engine** is a decision-intelligence system built above FortyGuard, transforming hyperlocal spatial and temporal thermal data into optimal operating window recommendations, interactive scenario simulations, and evidence-grounded explanations.

---

## 2. Core Value Proposition

```
[ FortyGuard Telemetry (Heatmaps, Wet-Bulb, Solar Irradiance) ]
                               │
                               ▼
        [ Operational Constraints (Duration, Time Windows) ]
                               │
                               ▼
          [ Deterministic Window Ranking & Exposure Evaluation ]
                               │
                               ▼
         [ Interactive What-If Scenario Comparison Sandbox ]
                               │
                               ▼
        [ Grounded AI Narrative Explanation & Evidence Summary ]
```

---

## 3. Product Abstraction vs. Demo Vertical

- **Architectural Product Abstraction:** Heat-Exposed Operations Decision Intelligence. The underlying engine evaluates candidate operating windows, spatial variations, and scenario constraints for *any* time-sensitive outdoor or thermally sensitive activity.
- **Primary Demonstration Vertical:** Outdoor Field Operations (e.g., outdoor maintenance shifts, inspection teams, site crews). Outdoor field operations serve as the concrete judging narrative for the hackathon MVP, but do not constrain the general-purpose decision model.

---

## 4. Key Differentiators

1. **Decision Intelligence over Raw Data:** Moves beyond viewing heatmaps to solving the operational choice: *"When and where should this operation occur?"*
2. **Deterministic Integrity:** Calculations, ranking algorithms, and scenario deltas are 100% mathematical and testable. AI never calculates temperatures or invents metrics.
3. **Interactive Scenario Simulation:** Allows operators to test "what-if" changes (e.g., shifting start times, shortening shift durations, applying mitigation factors) with instant side-by-side exposure comparisons.
4. **No Unsubstantiated Health Claims:** Strictly focused on *modeled thermal exposure* and relative operational burden, eliminating misleading medical safety claims.
