# Design & UX Guidelines — Thermal Decision Engine

**Status:** LOCKED  
**Last Updated:** 2026-08-20  
**Milestone:** M2 — Product Lock  

---

## 1. Design Paradigm: Decision Workspace

The interface is designed as an operational **Decision Workspace**, distinct from a passive weather dashboard. Every visual component directly supports answering the primary user question: *"When and where should this operation occur to minimize modeled thermal exposure?"*

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
│    (FortyGuard GeoJSON Heatmap Overlay + Hotspot Analysis)              │
├────────────────────────────────────┬────────────────────────────────────┤
│ 4. Candidate Time Windows          │ 5. Recommended Operating Window    │
│    (Timeline chart / Ranked list)  │    (Optimal start time + delta score)│
├────────────────────────────────────┼────────────────────────────────────┤
│ 6. Verified Evidence Drawer        │ 7. What-If Comparison Sandbox      │
│    (Wet-Bulb, Solar, Lineage tags) │    (Interactive sliders & deltas)  │
├────────────────────────────────────┴────────────────────────────────────┤
│ 8. Grounded AI Explanation Panel                                        │
│    (Narrative synthesis citing verified Evidence Bundle only)           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Section Details & Interaction Design

1. **Location & Operating Area:** AOI selector, coordinate readout, and geographic bounds.
2. **Operation Parameters:** Controls for operation duration (e.g., 3 hours), allowed time window (e.g., 06:00–18:00), and operational constraints.
3. **Spatial Thermal Context Map:** High-contrast GeoJSON tile layer rendering FortyGuard thermal variations across the target area.
4. **Candidate Time Windows:** Timeline visualization showing evaluated candidate windows ranked by modeled exposure.
5. **Recommended Operating Window:** Prominent hero card displaying the optimal recommended start time, expected exposure index, and relative exposure savings.
6. **Verified Evidence Drawer:** Collapsible panel presenting raw telemetry values (`wet_bulb_temperature_celsius`, `heat_index`, `solar_irradiance`) with explicit lineage badges.
7. **What-If Comparison Sandbox:** Slider controls allowing instant testing of alternative durations (e.g. 2h vs 3h), shift times, or mitigation factors with side-by-side delta visualization.
8. **Grounded AI Explanation Panel:** Synthesized explanation detailing *why* the recommended window was selected, citing verified metrics only.

---

## 4. Visual Data Provenance Badges

| Badge Tag | Meaning | Visual Style |
| :--- | :--- | :--- |
| `OBSERVED` | Direct FortyGuard telemetry | Blue / Cyan border badge |
| `DERIVED` | Calculated domain output | Indigo / Purple badge |
| `PREDICTED` | FortyGuard forecast interval | Amber / Orange badge |
| `ASSUMED` | User scenario parameter | Slate / Dashed border badge |
| `AI EXPLAIN` | LLM narrative synthesis | Emerald / Green badge |

---

## 5. Relative Thermal Severity Scale

Instead of universal hardcoded danger thresholds, the visual system uses relative severity levels configured by operational context:

- **Nominal / Low Exposure:** `Teal / Emerald`
- **Moderate Exposure:** `Amber / Yellow`
- **Elevated Exposure:** `Orange / Coral`
- **High Exposure:** `Crimson / Red`
