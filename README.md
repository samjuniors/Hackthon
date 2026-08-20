# Thermal Decision Engine

> **FortyGuard Hackathon'26 Project Submission**  
> **Submission Deadline:** 2026-08-30  
> **Status:** M2 — Product Lock (`LOCKED`)

---

## 🎯 Product Overview

The **Thermal Decision Engine** is a decision-intelligence platform that transforms FortyGuard's hyperlocal spatial and temporal thermal intelligence into optimal operating window recommendations, interactive what-if scenario simulations, and evidence-grounded explanations for heat-exposed operations.

### Core User Question
> *"I need to run a 3-hour outdoor operation at this location tomorrow. When and where should I do it to minimize modeled thermal exposure while satisfying my operating constraints?"*

---

## ⚡ Core MVP Capabilities

1. **Thermal Assessment:** Ingests verified FortyGuard thermal telemetry (`wet_bulb_temperature_celsius`, `heat_index`, `solar_irradiance`).
2. **Spatial Thermal Context:** Renders spatial heat variations using FortyGuard GeoJSON heatmap tiles.
3. **Temporal Decision:** Evaluates candidate operating windows across temporal forecast series (+12h horizon).
4. **Deterministic Decision Engine:** Ranks candidate operating windows deterministically to minimize modeled exposure given operational constraints.
5. **What-If Scenarios:** Interactive sandbox for instant scenario recalculation (duration, shift timing, mitigation factors).
6. **Evidence-Grounded AI Explanation:** Synthesizes clear narrative explanations using strictly verified decision outputs and evidence bundles.

---

## 🧭 Documentation Map

All system architecture, product requirements, decision models, and API integrations are tracked within the documentation system. See [INDEX.md](file:///e:/Projects/NewProjetcs/Hackthon/INDEX.md) for full details.

| Document | Purpose | Status |
| :--- | :--- | :--- |
| [CONSTITUTION.md](file:///e:/Projects/NewProjetcs/Hackthon/CONSTITUTION.md) | Non-negotiable engineering principles & data integrity rules | `LOCKED` |
| [AGENTS.md](file:///e:/Projects/NewProjetcs/Hackthon/AGENTS.md) | Multi-agent protocols & vertical slice roadmap | `VERIFIED` |
| [docs/VISION.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/VISION.md) | Long-term vision for heat-exposed operations | `LOCKED` |
| [docs/PRD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/PRD.md) | Product requirements, 6 MVP capabilities, acceptance criteria | `LOCKED` |
| [docs/ARCHITECTURE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/ARCHITECTURE.md) | System boundaries, App Router layers, AI grounding flow | `LOCKED` |
| [docs/DESIGN.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DESIGN.md) | Decision Workspace 8-section layout & provenance badges | `LOCKED` |
| [docs/DECISION-ENGINE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DECISION-ENGINE.md) | Deterministic decision model & optimization pipeline | `LOCKED` |
| [docs/FORTYGUARD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/FORTYGUARD.md) | Verified FortyGuard API intelligence & live schemas | `VERIFIED` |
| [docs/CURRENT-SPRINT.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/CURRENT-SPRINT.md) | Milestone 2 operational sprint tracking | `ACTIVE` |
| [docs/WORKLOG.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/WORKLOG.md) | Chronological record of engineering actions & decisions | `VERIFIED` |
| [docs/EVALUATION.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/EVALUATION.md) | Test matrix & evidence verification strategy | `LOCKED` |
| [docs/adr/0002-thermal-operations-decision-model.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/adr/0002-thermal-operations-decision-model.md) | Decision model & product scope lock record | `LOCKED` |

---

## 🛠️ Technology Stack

- **Framework:** Next.js (App Router, React 19)
- **Language:** TypeScript (Strict mode)
- **Styling:** Tailwind CSS + Radix UI / shadcn primitives
- **Validation:** Zod (for boundary schemas)
- **Testing:** Vitest
- **Package Manager:** pnpm

---

## 🚀 Getting Started

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Run test suite
pnpm test

# Run build verification
pnpm build
```

---

## ⚠️ Important Disclaimer

The Thermal Decision Engine provides modeled operational guidance derived from available thermal and environmental inputs. It is decision support and does **NOT** constitute medical advice or occupational safety certification.
