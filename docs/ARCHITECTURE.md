# System Architecture — Thermal Decision Engine

**Status:** LOCKED  
**Last Updated:** 2026-08-20  
**Milestone:** M2 — Product Lock  

---

## 1. High-Level Architectural Layers

The Thermal Decision Engine is built as a single, unified Next.js TypeScript application. System boundaries are strictly layered to isolate external API integration, deterministic domain logic, scenario simulation, and AI narrative synthesis.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND UI                               │
│  ┌─────────────────────────┐         ┌──────────────────────────────┐  │
│  │   Decision Workspace    │ ◄─────► │  Scenario / What-If Sandbox  │  │
│  │   (8-Section Layout)    │         │  (Client-Side Simulation)    │  │
│  └───────────┬─────────────┘         └──────────────┬───────────────┘  │
└──────────────┼──────────────────────────────────────┼──────────────────┘
               │ (Type-Safe RPC / Internal API Routes)│
┌──────────────▼──────────────────────────────────────▼──────────────────┐
│                           SERVER LAYER                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Application / Use Cases Layer (app/api/decisions/*)            │  │
│  │  - Orchestrates telemetry fetch, caching, and evaluation         │  │
│  │  - Formats Evidence Bundle for AI Explainer                      │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  Domain Decision Engine (Pure TypeScript Core)                   │  │
│  │  - Deterministic candidate window generation & ranking           │  │
│  │  - Objective function evaluation & constraint filtering          │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  FortyGuard API Adapter                                          │  │
│  │  - Manages async activity_id status polling with backoff         │  │
│  │  - Strict Zod boundary validation & data normalization           │  │
│  │  - Sources env_params temperature input from heatmap tile data   │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │
                      ▼
        [ FortyGuard External API ]
```

---

## 2. Component Layer Responsibilities

1. **UI Layer (`src/app/*`, `src/components/*`):**
   - Renders the Decision Workspace (Location selector, operational parameters, spatial thermal map, candidate windows, recommended window, evidence drawer, what-if sandbox, AI explanation panel).
   - Manages interactive slider state for instant client-side scenario re-evaluation.
2. **Application / Use Cases Layer (`src/app/api/*`):**
   - Coordinates multi-step FortyGuard requests (Heatmap fetch $\to$ Temperature extraction $\to$ Environmental Parameters fetch $\to$ Decision Engine evaluation).
   - Passes *structured decision outputs and evidence bundles* (never raw unvalidated payloads) to the AI Explanation Synthesizer.
3. **Domain Decision Engine (`src/lib/decision-engine/*`):**
   - Pure TypeScript core with zero I/O side effects.
   - Evaluates objective functions, candidate windows, and what-if scenario deltas deterministically.
4. **FortyGuard Adapter (`src/lib/fortyguard/*`):**
   - Injects server-side API keys (`FORTYGUARD_API_KEY`).
   - Polls `/v1/status/{activity_id}` until `Completed`.
   - Validates external payloads against Zod schemas.
   - Resolves the `/v1/env_params` temperature input dependency by piping `/v1/heatmap` tile temperature averages into environmental parameter requests.

---

## 3. Technology Stack

- **Framework:** Next.js (App Router, React 19)
- **Language:** TypeScript (Strict mode)
- **Styling:** Tailwind CSS + Radix UI primitives
- **Validation:** Zod (for boundary schemas)
- **Testing:** Vitest
- **Package Manager:** pnpm

*Note: No separate backend services (Python, Redis, Queues, DB, Kubernetes) are used.*

---

## 4. AI Grounding & Information Flow Boundary

```
[ Domain Decision Engine Output ] ──► [ Structured Evidence Bundle ] ──► [ AI Explanation Synthesizer ] ──► [ UI Narrative ]
```

- The AI explanation layer consumes **ONLY** the structured `Evidence Bundle` produced by the deterministic engine.
- The AI layer is strictly prohibited from fetching raw weather APIs or calculating numerical scores.
