# Evaluation & Verification Plan — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M3.5 — Exposure Model & Evidence Gate  

---

## 1. Quality & Verification Strategy

The Thermal Decision Engine uses a structured test matrix covering baseline exposure evaluation (`v1.0.0-spatial-thermal-baseline`), candidate window generation, deterministic tie-breaking, schema validation, and AI grounding protocols.

> **Non-Medical Disclaimer:**  
> The decision engine provides modeled operational guidance derived from available thermal and environmental telemetry inputs. It is strictly decision support and does **NOT** constitute medical advice or occupational safety certification.

---

## 2. Hardened Test Matrix

### 2.1 Baseline Exposure Evaluator Tests (`v1.0.0-spatial-thermal-baseline`)
- **Deterministic Exposure Computation:** Verifies that `evaluateBaselineExposure` produces exact, reproducible exposure scores $E(W_i)$ from normalized tile telemetry.
- **Model Version Reproducibility:** Verifies that results carry `modelVersion: 'v1.0.0-spatial-thermal-baseline'`.
- **Zero Arbitrary Weights:** Tests confirm that score calculation relies strictly on verified primary tile temperatures and does not use arbitrary weight multipliers.

### 2.2 Candidate Window & Deterministic Ranking Tests
- **Candidate Window Generation:** Sliding window generation across permissible bounds $[T_{\text{start}}, T_{\text{end}}]$ with duration $d$ and step `CandidateWindowStep = DATA_RESOLUTION` (1h).
- **Deterministic Tie-Breaking:** Candidate windows with identical exposure scores break ties deterministically by earlier start timestamp ($t_i < t_j$).
- **Identical Input Guarantee:** Identical inputs and constraints always produce identical window rankings.

### 2.3 Temporal Alignment & Boundary Tests
- **Timezone Conversion:** Timestamps are normalized to UTC for calculation and formatted with location local offset (`metadata.timezone_offset_hours`) for display.
- **Incomplete Hourly Coverage:** Returns `IncompleteTemporalCoverageError` when requested operating window exceeds available FortyGuard forecast lead time (+12h).
- **Missing Telemetry Handling:** Handles missing or null tile parameters gracefully without throwing uncaught exceptions.

### 2.4 Provenance & Evidence Bundle Tests
- **Data Lineage Classification:** Verifies point API telemetry is tagged `OBSERVED`, tile averages are tagged `DERIVED`, scenario parameters are tagged `ASSUMED`, and narrative outputs are tagged `AI_GENERATED_EXPLANATION`.
- **Evidence Bundle Integrity:** Confirms that supporting telemetry (`wet_bulb_temperature_celsius`, `solar_irradiance`, `relative_humidity_percent`) is correctly attached to the `Evidence Bundle`.

---

## 3. Milestone Verification Checklist

Before declaring any milestone or vertical slice complete, verify:
- [ ] TypeScript typecheck passes (`pnpm typecheck`)
- [ ] Linter passes with zero errors (`pnpm lint`)
- [ ] Automated unit test suite passes (`pnpm test`)
- [ ] Production build succeeds (`pnpm build`)
- [ ] No secrets committed in code or documentation
- [ ] Documentation updated to reflect changes
