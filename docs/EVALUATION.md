# Evaluation & Verification Plan — Thermal Decision Engine

**Status:** LOCKED  
**Last Updated:** 2026-08-20  
**Milestone:** M2 — Product Lock  

---

## 1. Quality & Verification Strategy

The Thermal Decision Engine uses a rigorous verification plan covering deterministic domain logic, API boundary resilience, scenario recalculation accuracy, and AI grounding protocols.

> **Important Scientific & Operational Disclaimer:**  
> The decision engine provides modeled operational guidance derived from available thermal and environmental telemetry inputs. It is strictly decision support and does **NOT** constitute medical advice or occupational safety certification.

---

## 2. Mandatory Test Matrix

### 2.1 Deterministic Domain Logic Tests
- **Identical Input Guarantee:** Identical location, duration, constraints, and FortyGuard telemetry inputs must yield 100% identical window rankings and exposure scores (`Input(A) == Input(B) => Result(A) == Result(B)`).
- **Candidate Window Generation:** Correct sliding window generation across permissible time bounds ($[T_{\text{start}}, T_{\text{end}}]$ with duration $d$).
- **Constraint Filtering:** Windows breaching mandatory user threshold limits are correctly filtered into the infeasible set.
- **Deterministic Exposure Ranking:** Feasible candidate windows are correctly ordered from lowest to highest modeled exposure.
- **Impossible Constraints:** Handling impossible operating constraints (e.g. duration > allowed window) by returning explicit infeasibility notices without crashing.

### 2.2 Boundary & Error Resilience Tests
- **Missing Telemetry Fields:** Handling `null` or missing FortyGuard parameter arrays gracefully (e.g., fallback calculations or explicit data missing flags).
- **Malformed API Responses:** Zod schema validation correctly rejects invalid external payloads and returns structured domain errors.
- **API Failure Handling:** Graceful fallback and error messaging when FortyGuard endpoints return 4xx/5xx errors or poll timeouts.

### 2.3 Scenario & What-If Comparison Tests
- **Scenario Recalculation Accuracy:** Altering duration (e.g., 3h $\to$ 2h) or window bounds correctly re-evaluates candidates and calculates exact exposure deltas ($\Delta E$).
- **Sub-Second Performance:** Client-side scenario recalculation executes in $< 100\text{ ms}$.

### 2.4 Provenance & AI Grounding Tests
- **Lineage Tag Correctness:** Every metric displayed carries its correct lineage tag (`OBSERVED`, `DERIVED`, `PREDICTED`, `ASSUMED`, `AI_GENERATED_EXPLANATION`).
- **AI Grounding Isolation:** The AI Explanation Synthesizer receives structured `Evidence Bundles` only. AI output tests confirm no invented temperatures or ungrounded claims.

---

## 3. Continuous Verification Pipeline

Before declaring any milestone or vertical slice complete, verify:
- [ ] TypeScript typecheck passes (`pnpm typecheck`)
- [ ] Linter passes with zero errors (`pnpm lint`)
- [ ] Automated unit test suite passes (`pnpm test`)
- [ ] Production build succeeds (`pnpm build`)
- [ ] No secrets committed in code or documentation
- [ ] Documentation updated to reflect changes
