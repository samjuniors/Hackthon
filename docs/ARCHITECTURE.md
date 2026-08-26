# System Architecture — Thermal Decision Engine

**Status:** LOCKED  
**Last Updated:** 2026-08-20  
**Milestone:** M3 — Architecture Lock & Domain Interfaces  

---

## 1. High-Level Architectural Structure

The Thermal Decision Engine is built as a single, unified Next.js TypeScript application. System boundaries strictly isolate vendor integration, deterministic evaluation, scenario simulation, and AI narrative synthesis.

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
│  │  - Orchestrates telemetry acquisition & normalized data pipeline │  │
│  │  - Formats Evidence Bundle for AI Explainer                      │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  Domain Decision Engine (Pure TypeScript Core)                   │  │
│  │  - Immutable ExposureModel evaluator interface                   │  │
│  │  - Deterministic candidate window ranking & tie-breaking         │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  FortyGuard Adapter & Caching Layer                              │  │
│  │  - In-memory result cache to conserve API credits                │  │
│  │  - Handles async activity_id status polling with backoff         │  │
│  │  - Validates raw JSON with Zod & normalizes to domain types      │  │
│  │  - Treats env_params as optional enrichment                      │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │
                      ▼
        [ FortyGuard External API ]
```

---

## 2. AI Explanation Flow Boundary

```
[ DecisionResult ] ──► [ Evidence Bundle ] ──► [ AI Explanation Synthesizer ] ──► [ UI Narrative ]
```

- The AI explanation layer operates strictly **outside** the deterministic decision engine.
- AI receives **ONLY** the structured `Evidence Bundle`.
- The AI layer is strictly prohibited from calling FortyGuard APIs, calculating exposure scores, modifying decision results, or inventing missing telemetry.

---

## 3. Separation of Execution Phases & Credit Safety

1. **Initial Data Acquisition Phase (External Boundary):**
   - Submits async FortyGuard requests (`POST /v1/heatmap`, `/v1/env_params`).
   - Polls `/v1/status/{activity_id}` with bounded backoff.
   - **In-Memory Caching:** Completed activity results are cached by request parameter hash (location, time range, granularity). Duplicate submissions and aggressive polling are prevented to conserve API credits.
2. **Scenario Recalculation Phase (Local Boundary):**
   - Recalculates responsively in-memory using pre-loaded telemetry.
   - Re-evaluates candidate window bounds and durations without making external network calls.

---

## 4. Vendor Adapter Boundary Isolation

Application and domain logic do **NOT** depend directly on raw FortyGuard JSON payloads, API field names, `activity_id` values, or HTTP status structures.

The FortyGuard Adapter owns:
- In-memory caching and request deduplication.
- API Key authentication header injection.
- Async activity polling and backoff timing.
- Zod schema validation of all external API payloads.
- Data normalization into domain `NormalizedThermalObservation` objects.
- Error translation into typed application errors (`AuthenticationError`, `FortyGuardApiError`, `FortyGuardProcessingError`).

---

## 5. Typed Application Error Hierarchy

```typescript
AppError (base)
 ├── AuthenticationError (401)
 ├── FortyGuardApiError (502)
 ├── FortyGuardProcessingError (502)
 ├── ValidationError (400)
 ├── IncompleteTemporalCoverageError (400)
 └── InfeasibleConstraintsError (422)
```

Errors sanitise sensitive data and ensure API keys or raw tokens are never leaked in error logs or UI messages.
