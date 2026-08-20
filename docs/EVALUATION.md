# Evaluation & Verification Plan — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M3 — Architecture Lock & Domain Interfaces  

---

## 1. Quality & Test Strategy

The Thermal Decision Engine utilizes a comprehensive automated test matrix covering adapter payload validation, data normalization, candidate window generation, deterministic tie-breaking, and AI grounding protocols.

> **Non-Medical Disclaimer:**  
> The decision engine provides modeled operational guidance derived from available thermal and environmental telemetry inputs. It is strictly decision support and does **NOT** constitute medical advice or occupational safety certification.

---

## 2. Milestone 3 Hardened Test Matrix

### 2.1 Adapter Response & Normalization Tests
- **Zod Schema Parsing:** Verifies that raw FortyGuard responses (e.g. `tests/fixtures/env_params_sample.json`) parse correctly or throw typed `FortyGuardApiError` on invalid structures.
- **Data Normalization:** Raw payload structures are normalized into `NormalizedThermalObservation` objects with correct `OBSERVED` vs `DERIVED` lineage tags.
- **Timezone Conversion:** All timestamps are converted to UTC for domain calculations and formatted with location local offset (`metadata.timezone_offset_hours`) for display.

### 2.2 Candidate Window & Deterministic Ranking Tests
- **Candidate Window Generation:** Correct sliding window generation across permissible time bounds ($[T_{\text{start}}, T_{\text{end}}]$ with duration $d$ and step `CandidateWindowStep = DATA_RESOLUTION`).
- **Constraint Filtering:** Windows breaching user constraints are marked infeasible and appended to `rejectedWindows`.
- **Deterministic Exposure Model Contract:** The `ExposureModel` contract evaluates candidate windows deterministically. (Note: Tests verify contract interfaces, NOT unverified scientific formulas).
- **Deterministic Tie-Breaking:** Windows with identical exposure scores break ties deterministically by earlier start timestamp ($t_i < t_j$).
- **Identical Input Guarantee:** Identical inputs and constraints always produce identical window rankings.

### 2.3 Boundary & Failure Mode Tests
- **Incomplete Temporal Coverage:** Returns `IncompleteTemporalCoverageError` when requested operating window exceeds FortyGuard forecast lead time (+12h).
- **Infeasible Constraints:** Returns `InfeasibleConstraintsError` when duration exceeds permissible window bounds.
- **API Failure Resilience:** Adapter handles HTTP 4xx/5xx errors and poll timeouts by throwing typed `FortyGuardApiError` or `FortyGuardProcessingError` without leaking secrets.

### 2.4 Provenance & AI Grounding Tests
- **Lineage Classification:** Verifies point API telemetry is tagged `OBSERVED`, tile averages are tagged `DERIVED`, scenario parameters are tagged `ASSUMED`, and narrative outputs are tagged `AI_GENERATED_EXPLANATION`.
- **Evidence Bundle Isolation:** AI Explanation Synthesizer tests confirm that explanations cite ONLY metrics present in the structured `Evidence Bundle`.

---

## 3. Continuous Verification Pipeline

Before declaring any milestone or vertical slice complete, verify:
- [ ] TypeScript typecheck passes (`pnpm typecheck`)
- [ ] Linter passes with zero errors (`pnpm lint`)
- [ ] Automated unit test suite passes (`pnpm test`)
- [ ] Production build succeeds (`pnpm build`)
- [ ] No secrets committed in code or documentation
- [ ] Documentation updated to reflect changes
