# Design & UX Guidelines — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. Design Philosophy & Aesthetic Goals

The Thermal Decision Engine must provide an intuitive, high-density, mission-critical interface that immediately instills technical confidence and operational clarity.

- **Theme:** Sleek, modern dark-mode primary aesthetic with high-contrast data visualization.
- **Tone:** Professional, analytical, authoritative, and responsive.
- **Density:** High information density without visual clutter, utilizing card hierarchy and collapsible detail drawers.

---

## 2. Visual Differentiation of Data Origins

To eliminate ambiguity and prevent AI hallucination confusion, data elements are color-coded and badged by provenance:

| Badge / Tag | Meaning | Visual Style |
| :--- | :--- | :--- |
| `OBSERVED` | Direct FortyGuard measurement | Blue / Cyan border badge |
| `DERIVED` | Calculated domain metric | Indigo / Purple badge |
| `PREDICTED` | FortyGuard forecast interval | Amber / Orange badge |
| `ASSUMED` | User scenario parameter | Slate / Dashed border badge |
| `AI EXPLAIN` | LLM narrative synthesis | Emerald / Green badge |

---

## 3. Thermal Severity Scale

A standardized thermal color palette reflecting operational risk:

- **Low Risk / Safe:** `Emerald / Teal` (< 28°C / normal range)
- **Caution / Elevated:** `Yellow / Amber` (28°C - 34°C)
- **Warning / High Risk:** `Orange / Coral` (34°C - 40°C)
- **Extreme / Critical:** `Crimson / Red` (> 40°C)
*(Exact temperature thresholds to be finalized in DECISION-ENGINE.md based on use case)*

---

## 4. Key UI Workflows

1. **Location & Thermal Profile:** Clean selector for monitored zones/coordinates with instant thermal status readout.
2. **Decision & Risk Summary:** Prominent recommendation card highlighting the primary action (e.g., *"Shift Dispatch to 16:30"*, *"Trigger Cooling Station Delta"*).
3. **What-If Scenario Sandbox:** Interactive sliders allowing instant parameter adjustments with side-by-side delta visualization.
4. **Explainability Drawer:** Collapsible panel presenting the logical rationale, mathematical formulas used, and data provenance.
