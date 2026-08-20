# System Architecture — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M2.1 — Decision Model Reconciliation  

---

## 1. High-Level Architectural Layers

The Thermal Decision Engine is built as a single, unified Next.js TypeScript application. System boundaries strictly separate external API acquisition from local deterministic domain evaluation.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND UI                               │
│  ┌─────────────────────────┐         ┌──────────────────────────────┐  │
│  │   Decision Workspace    │ ◄─────► │  Scenario / What-If Sandbox  │  │
│  │   (8-Section Layout)    │         │  (Local Responsive Engine)   │  │
│  └───────────┬─────────────┘         └──────────────┬───────────────┘  │
└──────────────┼──────────────────────────────────────┼──────────────────┘
               │ (Type-Safe RPC / Internal API Routes)│
┌──────────────▼──────────────────────────────────────▼──────────────────┐
│                           SERVER LAYER                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Application / Use Cases Layer (app/api/decisions/*)            │  │
│  │  - Orchestrates data acquisition and evaluation pipeline         │  │
│  │  - Formats Evidence Bundle for AI Explainer                      │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  Domain Decision Engine (Pure TypeScript Core)                   │  │
│  │  - Pluggable Exposure Evaluator interface                        │  │
│  │  - Deterministic candidate window ranking & tie-breaking         │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  FortyGuard Adapter & Caching Layer                              │  │
│  │  - Manages async activity_id status polling with backoff         │  │
│  │  - In-memory result cache to conserve API credits                │  │
│  │  - Treats env_params as optional enrichment                      │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │
                      ▼
        [ FortyGuard External API ]
```

---

## 2. Separation of Concerns & Performance Architecture

The system strictly decouples data acquisition latency from scenario simulation responsiveness:

### Phase 1: Initial Data Acquisition (External API Boundary)
- Executes async FortyGuard submissions (`POST /v1/heatmap`, `/v1/env_params`).
- Handles bounded polling (`GET /v1/status/{activity_id}`).
- **Credit Safety Strategy:** Completed activity results are cached in-memory by request hash (location, time range, granularity). Duplicate requests and aggressive polling are prevented.

### Phase 2: Scenario Recalculation (Local Deterministic Boundary)
- Runs locally in-memory using pre-loaded telemetry.
- Re-evaluates candidate windows, objective functions, and parameter deltas responsively without repeating external FortyGuard network requests.

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

## 4. AI Grounding Boundary

```
[ Domain Decision Engine Output ] ──► [ Structured Evidence Bundle ] ──► [ AI Explanation Synthesizer ] ──► [ UI Narrative ]
```

- The AI explanation layer consumes **ONLY** the structured `Evidence Bundle` produced by the deterministic engine.
- The AI layer is strictly prohibited from fetching raw weather APIs or calculating numerical scores.
