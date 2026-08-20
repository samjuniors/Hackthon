# Design & UX Guidelines — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M2.1 — Decision Model Reconciliation  

---

## 1. Design Paradigm: Decision Workspace

The interface is designed as an operational **Decision Workspace**, distinct from a passive weather dashboard. Every visual component directly supports answering the primary user question: *"When should this operation occur at the selected location to minimize modeled thermal exposure?"*

---

## 2. Primary Screen Layout (8 Core Sections)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        THERMAL DECISION ENGINE                          │
├────────────────────────────────────┬────────────────────────────────────┤
│ 1. Location & Operating Area       │ 2. Operation Parameters            │
│    (Coordinates / Polygon AOI)     │    (Duration, Allowed Time Bounds) │
├────────────────────────────────────┴────────────────────────────────────┤
│ 3. Spatial Thermal Context Map                                          │
│    (FortyGuard GeoJSON Heatmap Overlay + Tile Temperature Breakdown)    │
├────────────────────────────────────┬────────────────────────────────────┤
│ 4. Candidate Time Windows          │ 5. Recommended Operating Window    │
│    (Timeline chart / Ranked list)  │    (Optimal start time + exposure)   │
├────────────────────────────────────┼────────────────────────────────────┤
│ 6. Verified Evidence Drawer        │ 7. What-If Comparison Sandbox      │
│    (Telemetry, tile stats, provenance)│ (Local responsive duration slider) │
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
| `DERIVED` | Tile aggregation or computed metric (e.g. tile avg temp) | Indigo / Purple badge |
| `PREDICTED` | FortyGuard forecast interval (+12h horizon) | Amber / Orange badge |
| `ASSUMED` | User scenario input parameter (duration, time bounds) | Slate / Dashed border badge |
| `AI EXPLAIN` | Grounded LLM narrative synthesis | Emerald / Green badge |

*Provenance Guardrail:* Derived tile aggregations must NEVER be labeled `OBSERVED`.

---

## 4. Relative Thermal Severity Palette

Instead of universal hardcoded medical danger thresholds, the visual system uses relative severity levels configured by operational context:

- **Nominal / Low Exposure:** `Teal / Emerald`
- **Moderate Exposure:** `Amber / Yellow`
- **Elevated Exposure:** `Orange / Coral`
- **High Exposure:** `Crimson / Red`
