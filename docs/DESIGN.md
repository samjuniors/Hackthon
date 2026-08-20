# Design & UX Guidelines — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M3.6 — Location-Specific Thermal Baseline Correction  

---

## 1. Design Paradigm: Decision Workspace

The interface is designed as an operational **Decision Workspace**. Every visual component supports answering the primary user question: *"When should an operation at this location be scheduled to minimize modeled thermal exposure?"*

---

## 2. Primary Screen Layout (8 Core Sections)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        THERMAL DECISION ENGINE                          │
├────────────────────────────────────┬────────────────────────────────────┤
│ 1. Selected Operational Location   │ 2. Operation Parameters            │
│    (Coordinates + Selected Tile ID)│    (Duration, Allowed Time Bounds) │
├────────────────────────────────────┴────────────────────────────────────┤
│ 3. Spatial Thermal Context Map                                          │
│    (FortyGuard GeoJSON Tile Overlay + Highlighted Selected Tile)        │
├────────────────────────────────────┬────────────────────────────────────┤
│ 4. Candidate Time Windows          │ 5. Recommended Operating Window    │
│    (Timeline chart / Ranked list)  │    (Optimal start time + mean temp) │
├────────────────────────────────────┼────────────────────────────────────┤
│ 6. Verified Evidence Drawer        │ 7. What-If Comparison Sandbox      │
│    (Hourly tile temps + provenance)│    (Local responsive duration slider)│
├────────────────────────────────────┴────────────────────────────────────┤
│ 8. Grounded AI Explanation Panel                                        │
│    (Narrative synthesis citing verified Evidence Bundle only)           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Visual Data Provenance Badges

| Lineage Tag | Definition | Visual Style |
| :--- | :--- | :--- |
| `OBSERVED` | Direct FortyGuard point telemetry reading | Blue / Cyan outline badge |
| `DERIVED` | Tile average temperature associated with selected location | Indigo / Purple badge |
| `PREDICTED` | FortyGuard forecast interval (+12h horizon) | Amber / Orange badge |
| `ASSUMED` | User scenario input parameter (duration, bounds) | Slate / Dashed border badge |
| `AI EXPLAIN` | Grounded LLM narrative synthesis | Emerald / Green badge |

*Provenance Guardrail:* Derived tile aggregations must NEVER be labeled `OBSERVED`.
