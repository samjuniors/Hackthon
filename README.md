# Thermal Decision Engine

> **FortyGuard Hackathon'26 Project Submission**  
> **Submission Deadline:** 2026-08-30  
> **Status:** Production Hackathon Submission (`VERIFIED & LOCKED`)  
> **Commit Target:** Final Production Release  

---

## 🎯 Product Overview

The **Thermal Decision Engine** solves joint spatial-temporal operational dispatch ($\arg\min_{(L, W)} E(L, W)$) using FortyGuard's hyperlocal microclimate temperature intelligence, deterministically quantifying the exact thermal penalty of operational constraints ($C = E(P') - E(P_0)$) and synthesizing the decision through a strictly grounded, read-only AI explanation layer.

### Core User Question
> *"I need to run a heat-exposed operation in a metropolitan area. WHERE and WHEN should I operate to minimize modeled thermal exposure, and what does each operational constraint cost me?"*

---

## 🏗️ System Architecture Pipeline

The system enforces a strict one-way dataflow where deterministic mathematics is the sole source of truth:

```
FortyGuard Hyperlocal Thermal Surface (GeoJSON Polygon Heatmap Tiles)
  ↓
Point-in-Polygon Containment & Normalization (Ray Casting, Zero Interpolation)
  ↓
Deterministic Joint Spatial-Temporal Optimizer (Exhaustive Cartesian Search: L × W)
  ↓
What-If Constraint Sensitivity Engine (Exact Arithmetic Penalty: C = E(P') - E(P₀))
  ↓
Structured Evidence Bundle (Numeric Allow-Lists, Immutable Domain Facts in Celsius)
  ↓
Grounded Read-Only AI Explanation Layer (Strict Grounding Validator, ±0.01°C Tolerance)
  ↓
Interactive Decision Workspace UI (MapLibre GL, °F/°C Toggle, 3-Box Flow, Real-Time Scenario Chips)
```

---

## ⚡ Core Capabilities

1. **Hyperlocal Microclimate Intelligence:** Ingests discrete FortyGuard polygon tiles revealing significant temperature variations between urban waterfronts and asphalt street canyons within a 1 km radius.
2. **Joint WHERE + WHEN Optimization:** Evaluates all candidate locations and sliding time windows simultaneously ($\mathcal{L} \times \mathcal{W} = 15\text{ candidate plans}$), recommending the globally optimal operational plan.
3. **What-If Constraint Sensitivity:** Deterministically calculates the exact modeled temperature increase ($C = E(P') - E(P_0)$) when operational constraints (e.g., site locks, curfew shifts, extended durations) restrict the unconstrained optimum.
4. **Grounded Read-Only AI Synthesis:** Translates verified mathematical outputs into structured narratives powered by Google Gemini with multi-layered validation (numeric allow-lists, forbidden medical/safety claim rejection, zero-credential deterministic fallback).
5. **Global Temperature Display Preference (°F / °C):** Seamless UI unit conversion defaulting to °F for US context while preserving strict Celsius internal evaluation and grounding invariants.
6. **Zero-Dependency Demo Reliability:** Default DEMO mode runs 100% offline from captured FortyGuard API fixture data with zero external network dependencies.

---

## ⏱️ 60-Second Demo Walkthrough

1. **[00:00–00:15] Spatial Variance:** Observe the **Hyperlocal Thermal Field** map showing Manhattan microclimates varying across adjacent candidate operational sites.
2. **[00:15–00:30] Joint WHERE + WHEN Decision:** Click **⚡ Calculate Decision**. The **Recommended Operational Plan** card identifies the global optimum:
   - **Recommended Site:** `Battery Park Greenway (Waterfront) (LOC-A)`
   - **Operating Window:** `08:00 AM – 11:00 AM UTC (3h Duration)`
   - **Mean Modeled Temperature:** `85.69°F` (`29.83°C` in Celsius mode)
   - **Advantage Summary:** Best feasible plan evaluated across 3 sites × 5 windows.
3. **[00:30–00:45] What-If Constraint Cost:** Single-click the **Site Lock (Chinatown Asphalt Canyon)** preset chip. The 3-Box comparison visually shifts to show **`Constraint Cost: +4.27°F`** (`+2.37°C` in Celsius mode).
4. **[00:45–01:00] Grounded AI Synthesis:** Scroll to **Decision Explanation** to inspect the grounded narrative verified against strict evidence allow-lists ($\le 0.01^\circ\text{C}$ precision) with zero hallucination.

---

## 🛡️ Epistemic & Authority Boundaries

- **Deterministic Optimizer Authority:** The AI layer has **zero decision authority**. It cannot select locations, alter operating windows, re-rank plans, or modify numerical scores.
- **Provenance Transparency:** All FortyGuard tile temperatures are tagged `DERIVED`.
- **Score Semantics:** Exposure scores represent the arithmetic **Mean Modeled Temperature across the operating window** under `v1.0.0-spatial-thermal-baseline`.
- **Safety Invariant:** The system does not compute physiological heat strain (e.g., WBGT, UTCI) and does not provide medical or worker safety certification.

---

## 🧭 Documentation Map

All system architecture, product requirements, decision models, and API integrations are tracked within the documentation system:

| Document | Purpose | Status |
| :--- | :--- | :--- |
| [CONSTITUTION.md](CONSTITUTION.md) | Non-negotiable engineering principles & data integrity rules | `LOCKED` |
| [AGENTS.md](AGENTS.md) | Multi-agent protocols & vertical slice roadmap | `LOCKED` |
| [docs/VISION.md](docs/VISION.md) | Long-term vision for heat-exposed operations decision intelligence | `LOCKED` |
| [docs/PRD.md](docs/PRD.md) | Product requirements, 6 MVP capabilities, acceptance criteria | `LOCKED` |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System boundaries, execution phases, credit safety caching | `LOCKED` |
| [docs/DESIGN.md](docs/DESIGN.md) | Decision Workspace layout & provenance badges | `LOCKED` |
| [docs/DECISION-ENGINE.md](docs/DECISION-ENGINE.md) | Mathematical formulation of joint optimizer, What-If engine, and grounding validator | `LOCKED` |
| [docs/FORTYGUARD.md](docs/FORTYGUARD.md) | Verified FortyGuard API intelligence & live schemas | `LOCKED` |
| [docs/CURRENT-SPRINT.md](docs/CURRENT-SPRINT.md) | Milestone tracking and operational sprint records | `VERIFIED` |
| [docs/WORKLOG.md](docs/WORKLOG.md) | Chronological record of engineering actions & decisions | `VERIFIED` |
| [docs/EVALUATION.md](docs/EVALUATION.md) | Hardened test matrix & evidence verification strategy | `LOCKED` |

---

## 🛠️ Technology Stack

- **Framework:** Next.js 15 (App Router, React 19)
- **Language:** TypeScript (Strict mode)
- **Mapping & Spatial:** MapLibre GL + Zero-Dependency Ray Casting
- **Styling:** Tailwind CSS + Radix UI / shadcn primitives
- **Validation:** Zod
- **Testing:** Vitest (178/178 passed, 100%) + Playwright (82/90 passed; 8 failures are isolated California LIVE external API timeouts documented as provider latency, not logic regressions). Typecheck, Lint, Build, and Smoke tests: PASS.
- **Package Manager:** pnpm

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Run development server (defaults to 100% offline DEMO mode)
pnpm dev

# 3. Run automated verification suite
pnpm test          # 158 Vitest unit, failure, grounding, and provider tests
pnpm typecheck     # TypeScript strict validation
pnpm lint          # ESLint rules
pnpm build         # Production Next.js build
pnpm test:e2e      # 68 Playwright Desktop & Mobile browser E2E tests
```

---

## ⚠️ Non-Medical Disclaimer

The Thermal Decision Engine provides modeled operational guidance derived from available thermal and environmental inputs. It is decision support and does **NOT** constitute medical advice or occupational safety certification.
