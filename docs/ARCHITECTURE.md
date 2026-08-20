# System Architecture — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. System Overview & Boundaries

The system is structured as a unified Next.js TypeScript application leveraging server routes for protected external integrations and client components for interactive scenario modeling.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                  │
│  ┌─────────────────────────┐         ┌──────────────────────────────┐  │
│  │   Interactive UI / Map  │ ◄─────► │  Scenario / What-If Engine   │  │
│  │   (Visualizer)          │         │  (Client-Side Simulation)    │  │
│  └───────────┬─────────────┘         └──────────────┬───────────────┘  │
│              │                                      │                  │
└──────────────┼──────────────────────────────────────┼──────────────────┘
               │ (Type-Safe Internal API Routes)      │
┌──────────────▼──────────────────────────────────────▼──────────────────┐
│                           SERVER LAYER                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Next.js Server Handlers (app/api/*)                             │  │
│  │  - Input validation (Zod)                                        │  │
│  │  - Cache & rate-limit handling                                   │  │
│  │  - AI Explanation Synthesizer (LLM adapter with strict prompt)   │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  Domain Decision Engine (Pure TypeScript Core)                   │  │
│  │  - Deterministic risk evaluation & decision rules                │  │
│  │  - Scenario delta calculation                                    │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  FortyGuard API Adapter                                          │  │
│  │  - Secure credential injection                                   │  │
│  │  - Schema normalization & boundary validation (Zod)              │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │
                      ▼
        [ FortyGuard External API ]
```

---

## 2. Technology Stack

- **Runtime & Language:** Node.js (>= 20), TypeScript (strict mode)
- **Framework:** Next.js (App Router, React 19)
- **Styling:** Tailwind CSS + Radix UI primitives
- **Validation:** Zod for all external API and user-input boundaries
- **Deterministic Domain Core:** Pure TypeScript functions with zero I/O side effects for testability
- **Testing:** Vitest for unit and domain logic testing
- **Spatial / Map Visualization:** `UNKNOWN — VERIFY` (Selection of MapLibre GL, react-map-gl, or lightweight GeoJSON rendering is deferred until FortyGuard spatial data formats and coordinate structures are verified).

*Note: No separate backend services (Python, Redis, Queues, DB) will be introduced unless justified by confirmed requirements.*

---

## 3. Data Lineage & Provenance Model

Every data item presented in the system carries an explicit lineage tag:

```typescript
export type DataOrigin = 
  | 'OBSERVED'                  // Direct verified FortyGuard measurement
  | 'DERIVED'                   // Deterministic domain calculation
  | 'PREDICTED'                 // Forecast data from FortyGuard
  | 'ASSUMED'                   // User-specified scenario parameter
  | 'AI_GENERATED_EXPLANATION'; // Narrative synthesis
```

---

## 4. Security Architecture

1. **Secrets Isolation:** FortyGuard API keys and LLM tokens reside strictly in server-side environment variables (`.env.local`).
2. **No Client Secret Exposure:** Client components communicate only through internal server route handlers (`/api/*`).
3. **Boundary Sanitization:** All incoming FortyGuard data is validated with Zod before entering the domain layer.
