# ADR 0001: Initial Technical Stack & Architecture

**Status:** VERIFIED  
**Date:** 2026-08-20  
**Deciders:** Team / Bootstrap Agent  

---

## 1. Context & Problem Statement

The FortyGuard Hackathon'26 submission requires a production-grade, highly reliable Thermal Decision Engine MVP by 2026-08-30. We need a modern, maintainable, type-safe stack capable of rapid vertical slice development, secure external API communication, deterministic mathematical calculations, and rich interactive scenario simulations.

---

## 2. Decision

We adopt the following core stack:
1. **Next.js (App Router) + React 19 + TypeScript:** Provides unified server and client runtime. Server route handlers securely manage FortyGuard API credentials and AI provider communication, while client components deliver sub-second interactive simulation.
2. **Tailwind CSS + Radix UI Primitives:** Accelerates accessible, high-density dashboard development with predictable styling.
3. **Zod:** Enforces strict runtime validation at all system boundaries (API responses and user inputs).
4. **Vitest:** High-speed TypeScript test runner for unit testing deterministic domain logic.
5. **pnpm:** Fast, deterministic package management.

---

## 3. Alternatives Considered

- **Separate Python FastAPI Backend + Next.js Frontend:**
  - *Rejected:* Adds deployment overhead, multi-process management, and inter-service serialization latency without necessity for MVP scale.
- **Vite SPA without Server:**
  - *Rejected:* Exposes FortyGuard API keys in client-side bundles or requires an external proxy.

---

## 4. Consequences

### Positive
- Single unified codebase and type system across frontend, API routes, and domain logic.
- Secure by design: credentials never touch the browser.
- Rapid test iteration cycle for decision algorithms.

### Negative / Trade-offs
- Heavy geospatial processing (if needed beyond client MapLibre / GeoJSON) must be kept lightweight within Node.js runtime limits.
