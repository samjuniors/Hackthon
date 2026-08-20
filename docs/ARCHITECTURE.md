# System Architecture — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. System Overview & Boundaries

The system is structured as a unified Next.js TypeScript application leveraging server routes for protected external integrations and client components for reactive UI and instant scenario modeling.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                  │
│  ┌─────────────────────────┐         ┌──────────────────────────────┐  │
│  │   Interactive Map / UI  │ ◄─────► │  Scenario / What-If Engine   │  │
│  └───────────┬─────────────┘         └──────────────┬───────────────┘  │
│              │                                      │                  │
└──────────────┼──────────────────────────────────────┼──────────────────┘
               │ (Type-Safe RPC / API Routes)         │
┌──────────────▼──────────────────────────────────────▼──────────────────┐
│                           SERVER LAYER                                 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  Next.js Server Handlers (app/api/*)                             │  │
│  │  - Input validation (Zod)                                        │  │
│  │  - Rate-limit & Caching Layer                                    │  │
│  │  - AI Explanation Synthesizer (LLM adapter with strict prompt)   │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  Domain Decision Engine (Pure TS Core)                           │  │
│  │  - Deterministic risk scoring & threshold evaluation             │  │
│  │  - Operational recommendation rules                              │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
│                     │                                                  │
│  ┌──────────────────▼───────────────────────────────────────────────┐  │
│  │  FortyGuard API Adapter                                          │  │
│  │  - Auth headers / Bearer tokens                                  │  │
│  │  - Strict response validation & normalization                    │  │
│  └──────────────────┬───────────────────────────────────────────────┘  │
└─────────────────────┼──────────────────────────────────────────────────┘
                      │
                      ▼
        [ FortyGuard External API ]
```

---

## 2. Technology Stack

- **Runtime & Language:** Node.js (>= 20), TypeScript (strict mode)
- **Framework:** Next.js (App Router)
- **UI & Styling:** React, Tailwind CSS, Lucide Icons, Radix UI primitives
- **Validation:** Zod for all external API and user-input boundaries
- **Deterministic Core:** Pure TypeScript modules with zero I/O side effects for easy testability
- **Testing:** Vitest for fast unit/integration testing
- **Mapping (Provisional):** MapLibre GL / react-map-gl (pending FortyGuard spatial format verification)

---

## 3. Data Integrity & Tagging Model

Every data item flowing through the system carries an explicit lineage tag:

```typescript
export type DataOrigin = 
  | 'OBSERVED'              // Raw FortyGuard telemetry
  | 'DERIVED'               // Computed by deterministic domain rules
  | 'PREDICTED'             // Forecast model from FortyGuard
  | 'ASSUMED'               // User-supplied scenario input
  | 'AI_GENERATED_EXPLANATION'; // Narrative synthesis
```

---

## 4. Security Architecture

1. **Secrets Isolation:** FortyGuard API keys and LLM tokens reside strictly in server-side environment variables (`.env.local`).
2. **No Secret Leaks:** Client code interacts only with internal API routes (`/api/*`).
3. **Payload Sanitization:** All incoming external data is validated against strict Zod schemas before being processed by domain logic.
