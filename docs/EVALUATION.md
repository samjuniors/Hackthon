# Evaluation & Verification Plan — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M2.1 — Decision Model Reconciliation  

---

## 1. Quality & Verification Strategy

The Thermal Decision Engine uses a structured verification test matrix covering timestamp alignment, candidate window generation, deterministic tie-breaking, schema validation, scenario recalculation, and AI grounding.

> **Important Operational & Non-Medical Disclaimer:**  
> The decision engine provides modeled operational guidance derived from available thermal and environmental telemetry inputs. It is strictly decision support and does **NOT** constitute medical advice or occupational safety certification.

---

## 2. Hardened Test Matrix

### 2.1 Timezone & Temporal Alignment Tests
- **Timezone Conversion:** All external FortyGuard API timestamps are correctly converted to UTC for candidate window generation and rendered in local time for display.
- **Timestamp Alignment:** Forecast timestamps match expected intervals without gaps or silent assumptions.
- **Unit Conversion:** Verified handling of temperature (°C) and duration (hours) units.

### 2.2 Deterministic Candidate Window & Ranking Tests
- **Candidate Window Generation:** Correct sliding window generation across permissible time bounds ($[T_{\text{start}}, T_{\text{end}}]$ with duration $d$ and step `CandidateWindowStep = DATA_RESOLUTION`).
- **Constraint Filtering:** Candidate windows breaching user bounds are correctly marked infeasible.
- **Deterministic Ranking & Tie-Breaking:** Feasible candidate windows are ordered from lowest to highest exposure. Equal exposure scores break ties deterministically (e.g. by earlier start timestamp).
- **Identical Input Guarantee:** Identical inputs and constraints always produce identical candidate window rankings (`Input(A) == Input(B) => Result(A) == Result(B)`).

### 2.3 Boundary & Resilient Failure Tests
- **Missing Telemetry Fields:** Handling `null` values in FortyGuard payload arrays gracefully.
- **Optional `env_params` Fallback:** Core decision ranking functions cleanly even if `/v1/env_params` telemetry is omitted or fails.
- **Incomplete Temporal Coverage:** Informative error handling when requested forecast time range exceeds available FortyGuard data.
- **Malformed Response & API Failure:** Zod schemas reject invalid responses and trigger graceful fallback states.

### 2.4 Scenario Recalculation & Provenance Tests
- **Local Scenario Recalculation:** Adjusting duration or time bounds re-evaluates candidate rankings responsively using cached telemetry without re-querying external APIs.
- **Provenance Classification:** Verifying that direct point API readings are tagged `OBSERVED`, tile aggregations are tagged `DERIVED`, scenario inputs are tagged `ASSUMED`, and narrative outputs are tagged `AI_GENERATED_EXPLANATION`.

### 2.5 AI Grounding Tests
- **Evidence Bundle Isolation:** The AI Explanation Synthesizer receives structured `Evidence Bundles` only. Tests confirm no invented numbers or ungrounded health claims.

---

## 3. Milestone Verification Checklist

Before declaring any milestone or vertical slice complete, verify:
- [ ] TypeScript typecheck passes (`pnpm typecheck`)
- [ ] Linter passes with zero errors (`pnpm lint`)
- [ ] Automated unit test suite passes (`pnpm test`)
- [ ] Production build succeeds (`pnpm build`)
- [ ] No secrets committed in code or documentation
- [ ] Documentation updated to reflect changes
