# Evaluation & Verification Plan — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. Quality & Correctness Strategy

To deliver a reliable, evidence-backed hackathon submission by **2026-08-30**, the Thermal Decision Engine utilizes a structured verification plan across all system layers.

---

## 2. Core Evaluation Pillars

### 2.1 Deterministic Domain Logic Verification
- **Unit & Logic Testing:** Comprehensive unit tests on all deterministic calculation functions, risk scoring, and scenario delta evaluations.
- **Model-Specific Invariants:** Invariant properties (e.g., monotonic risk scaling, bounded delta ranges) will be formalized and tested once the specific domain model and formulas are locked in Milestone 2.
- **Boundary & Edge Cases:** Robust handling of null or missing telemetry fields, coordinate extremes, and unexpected numeric outliers.

### 2.2 Boundary & Schema Validation
- **Zod Schema Tests:** Strict parsing of FortyGuard API payloads to ensure graceful failure on malformed external responses.

### 2.3 End-to-End Vertical Slice Verification
- **Integration Testing:** Verification of data flow across system layers (`User Request → UI → Server Handler → Adapter → Domain Logic → Rendered Output`).

### 2.4 AI Grounding & Anti-Hallucination Guardrails
- **Context Isolation:** AI explanation prompts are fed only validated domain data and deterministic outputs to prevent metric fabrication.

### 2.5 Security & Secret Sanitization
- **No Committed Credentials:** Automated checks and `.gitignore` enforcement ensuring no `.env.local` or secret tokens enter version control.

---

## 3. Milestone Verification Checklist

Before declaring any milestone or vertical slice complete, verify:
- [ ] TypeScript typecheck passes (`pnpm typecheck`)
- [ ] Linter passes with zero errors (`pnpm lint`)
- [ ] Domain unit tests pass (`pnpm test`)
- [ ] Production build succeeds (`pnpm build`)
- [ ] No secrets committed in source code or documentation
- [ ] Documentation updated to reflect changes
