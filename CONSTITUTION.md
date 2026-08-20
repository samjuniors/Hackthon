# Thermal Decision Engine — Constitution

**Status:** LOCKED  
**Last Updated:** 2026-08-20  

---

## 1. Core Principles

### Principle 1: Evidence Over Assumptions
- Never invent FortyGuard API capabilities, endpoints, schemas, limits, pricing, data resolution, or permissions.
- If something is unconfirmed, it MUST be marked: `UNKNOWN — VERIFY`.
- Official documentation and actual API responses are the sole source of truth.

### Principle 2: Value Layer Above FortyGuard
- FortyGuard provides underlying thermal/environmental intelligence.
- The Thermal Decision Engine must add deterministic decision value, operational workflows, scenario modeling, and explainability above this data layer.
- We are NOT building a generic weather dashboard, a simple raw heatmap viewer, a generic chatbot, or a clone of FortyGuard's core products.

### Principle 3: AI Truth & Guardrails
- The AI/LLM must never fabricate temperatures, forecasts, environmental measurements, spatial observations, API results, calculated values, or confidence scores.
- Clear distinctions must be maintained across all UI and data representations:
  - `OBSERVED`: Raw verified telemetry from FortyGuard API.
  - `DERIVED`: Deterministic mathematical/domain calculation.
  - `PREDICTED`: Verified forecast models from FortyGuard.
  - `ASSUMED`: User-specified scenario parameters.
  - `AI-GENERATED EXPLANATION`: LLM-synthesized narrative or contextual reasoning.

### Principle 4: Deterministic Decision Logic
- Core scoring, threshold evaluations, impact calculations, and operational recommendations must reside in deterministic, fully tested domain logic.
- The LLM acts as an explainer, synthesizer, and interactive assistant, not the underlying calculation engine.

### Principle 5: Vertical Slice Discipline
- Development proceeds via fully functioning vertical slices:  
  `User → UI → Application → Domain Logic → FortyGuard Adapter → Result → UI`
- Each slice must be built, tested, reviewed, demonstrated, and verified before moving to the next.

### Principle 6: Scope & Hackathon Focus
- Hard Submission Deadline: **2026-08-30**.
- Value depth, accuracy, rock-solid demo workflows, and tangible utility over shallow feature sprawl or speculative abstractions.
- No unnecessary microservices, secondary databases, or heavy infrastructure unless proven strictly necessary.

### Principle 7: Security & Secrets
- Never commit API keys, tokens, or credentials.
- All external API calls containing secrets must occur server-side.
- All external payloads must be validated at system boundaries with Zod schemas.

### Principle 8: Documentation as Single Source of Truth
- Material decisions must be documented immediately in architecture docs or ADRs.
- Code and documentation must never silently diverge.
