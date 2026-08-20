# Thermal Decision Engine

> **FortyGuard Hackathon'26 Project**  
> **Submission Deadline:** 2026-08-30  
> **Status:** M0 — Repository Bootstrap & API Reconnaissance (`PROVISIONAL`)

---

## ⚠️ Provisional Direction Notice

> [!IMPORTANT]
> The product direction described herein is **PROVISIONAL** and subject to revision following formal FortyGuard API reconnaissance and capability validation. No FortyGuard capabilities, resolutions, or endpoints are assumed as facts until verified via actual API interactions.

**Provisional Core Mission:**
An AI-powered Thermal Decision Engine that transforms hyperlocal temperature intelligence into actionable, explainable operational decisions and what-if scenarios.

---

## 🎯 Project Overview

Thermal conditions and urban heat stress create severe operational, logistical, safety, and energy challenges. While temperature data exists, raw thermal maps do not make decisions. The Thermal Decision Engine bridges the gap between raw spatial thermal observations and high-stakes operational choices by:

1. Ingesting and validating hyperlocal thermal intelligence (FortyGuard).
2. Applying deterministic, domain-specific evaluation logic.
3. Simulating what-if scenarios under altered operating conditions or mitigation strategies.
4. Delivering verified, explainable recommendations with clear attribution of observed, derived, and simulated values.

---

## 🧭 Documentation Map

All project architecture, requirements, decisions, and domain models are tracked within the structured documentation system. See [INDEX.md](file:///e:/Projects/NewProjetcs/Hackthon/INDEX.md) for full details.

| Document | Purpose | Status |
| :--- | :--- | :--- |
| [CONSTITUTION.md](file:///e:/Projects/NewProjetcs/Hackthon/CONSTITUTION.md) | Non-negotiable engineering & product rules | `LOCKED` |
| [AGENTS.md](file:///e:/Projects/NewProjetcs/Hackthon/AGENTS.md) | Multi-agent collaboration protocols & roadmap | `VERIFIED` |
| [docs/VISION.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/VISION.md) | Long-term vision and problem statement | `PROVISIONAL` |
| [docs/PRD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/PRD.md) | Product requirements and acceptance criteria | `PROVISIONAL` |
| [docs/ARCHITECTURE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/ARCHITECTURE.md) | Technical architecture & system boundaries | `PROVISIONAL` |
| [docs/DESIGN.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DESIGN.md) | UX principles & thermal visualization guidelines | `PROVISIONAL` |
| [docs/DECISION-ENGINE.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/DECISION-ENGINE.md) | Deterministic decision logic & scenario models | `PROVISIONAL` |
| [docs/FORTYGUARD.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/FORTYGUARD.md) | Verified FortyGuard API intelligence & schemas | `DRAFT` |
| [docs/CURRENT-SPRINT.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/CURRENT-SPRINT.md) | Active milestone operational tracking | `VERIFIED` |
| [docs/WORKLOG.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/WORKLOG.md) | Chronological log of actual engineering actions | `VERIFIED` |
| [docs/EVALUATION.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/EVALUATION.md) | Quality, correctness, and demo validation plan | `PROVISIONAL` |
| [docs/adr/0001-initial-architecture.md](file:///e:/Projects/NewProjetcs/Hackthon/docs/adr/0001-initial-architecture.md) | Initial stack & architecture decision record | `VERIFIED` |

---

## 🛠️ Technology Stack

- **Framework:** Next.js (App Router, React 19)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Radix UI / shadcn/ui primitives
- **Validation:** Zod (for strict boundary schemas)
- **Testing:** Vitest (unit/integration)
- **Package Manager:** pnpm

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 20.x
- pnpm >= 9.x

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Run development server
pnpm dev

# Run test suite
pnpm test

# Run build verification
pnpm build
```

---

## 🛡️ License & Attribution

Developed for FortyGuard Hackathon'26. Hyperlocal thermal data attribution is governed by FortyGuard API terms.
