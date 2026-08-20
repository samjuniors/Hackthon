# Design & UX Guidelines — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. Design Philosophy & Aesthetic Goals

The Thermal Decision Engine provides a high-density, mission-critical operational interface with clear visual hierarchy, immediate status legibility, and transparent data provenance.

- **Theme:** Modern dark-mode primary aesthetic with high-contrast data visualization.
- **Tone:** Professional, analytical, authoritative, and responsive.
- **Density:** Structured card hierarchy with collapsible detail drawers to balance overview and deep evidence.

---

## 2. Visual Differentiation of Data Provenance

To eliminate ambiguity and prevent AI hallucination confusion, data elements are explicitly tagged with distinct visual badges:

| Lineage Tag | Description | Visual Style |
| :--- | :--- | :--- |
| `OBSERVED` | Direct FortyGuard measurement | Blue / Cyan outline badge |
| `DERIVED` | Calculated domain metric | Indigo / Violet badge |
| `PREDICTED` | FortyGuard forecast interval | Amber / Orange badge |
| `ASSUMED` | User scenario parameter | Slate / Dashed border badge |
| `AI EXPLAIN` | LLM narrative synthesis | Emerald / Green badge |

---

## 3. Relative Severity Color Palette (PROVISIONAL)

A standardized relative severity scale representing thermal risk levels without hardcoding premature temperature cutoffs:

- **Nominal / Low Severity:** `Emerald / Teal` (Conditions within baseline range)
- **Elevated / Moderate Severity:** `Amber / Yellow` (Moderate deviation from baseline)
- **High Severity:** `Orange / Coral` (Significant thermal stress / threshold breach)
- **Critical Severity:** `Crimson / Red` (Extreme conditions requiring operational intervention)

*Note: Specific temperature ranges, threshold rules, and units (°C/°F) will be configured in the domain model once the use case and API data types are locked.*

---

## 4. Core UI Interaction Patterns

1. **Location / Zone Selection:** Intuitive selector for monitored coordinates or zones with real-time status indication.
2. **Decision & Risk Summary:** Clear presentation of the primary deterministic recommendation and associated risk indicators.
3. **What-If Scenario Sandbox:** Interactive controls (sliders, toggles) enabling parameter adjustments with instant side-by-side delta visualization.
4. **Evidence & Explainability Drawer:** Structured display of underlying verified telemetry, calculation steps, and AI-assisted narrative explanations.
