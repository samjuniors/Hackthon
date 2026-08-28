# Evaluation & Verification Plan — Thermal Decision Engine

**Status:** RECONCILED & HARDENED  
**Last Updated:** 2026-08-20  
**Milestone:** M3.6 — Location-Specific Thermal Baseline Correction  

---

## 1. Quality & Verification Strategy

The Thermal Decision Engine uses a structured test matrix covering point-to-tile spatial mapping, mean window exposure evaluation (`v1.0.0-spatial-thermal-baseline`), candidate window generation, deterministic tie-breaking, schema validation, and boundary error handling.

> **Non-Medical Disclaimer:**  
> The decision engine provides modeled operational guidance derived from available thermal and environmental telemetry inputs. It is strictly decision support and does **NOT** constitute medical advice or occupational safety certification.

---

## 2. Hardened Test Matrix for Slice 1

### 2.1 Spatial Point-to-Tile Mapping Tests
- **Deterministic Point-in-Polygon Check:** Verifies that user coordinates $(lat, lon)$ map deterministically to the containing FortyGuard GeoJSON tile feature `tile_id`.
- **Location Outside Coverage:** Throws `ValidationError` when user coordinates fall outside the returned heatmap polygon bounds, refusing to fall back silently to the hottest tile.

### 2.2 Location-Specific Baseline Evaluator Tests (`v1.0.0-spatial-thermal-baseline`)
- **Mean Temperature Calculation:** Verifies that exposure score $E(W_i) = \frac{1}{n} \sum_{t \in W_i} T(\text{location}, t)$ computes the exact mean `average_temperature` across window duration $d$.
- **Zero AOI Maximum Leakage:** Confirms that the exposure score uses ONLY the selected location's tile temperature, NOT the AOI-wide maximum.
- **Model Version Tagging:** Verifies that exposure outputs carry `modelVersion: 'v1.0.0-spatial-thermal-baseline'`.

### 2.3 Candidate Window & Deterministic Ranking Tests
- **Candidate Window Generation:** Generates valid candidate operating windows $W_i = [t_i, t_i + d]$ across permissible bounds $[T_{\text{start}}, T_{\text{end}}]$ with step `CandidateWindowStep = DATA_RESOLUTION` (1h).
- **Deterministic Tie-Breaking:** Candidate windows with identical mean temperatures break ties deterministically by earlier start timestamp ($t_i < t_j$).
- **No Feasible Window:** Throws `InfeasibleConstraintsError` when duration $d$ exceeds permissible window bounds.

### 2.4 Temporal Boundary & API Failure Tests
- **Incomplete Forecast Coverage:** Throws `IncompleteTemporalCoverageError` when requested operating window extends beyond verified FortyGuard +12-hour forecast lead time.
- **Malformed Tile Response:** Zod schema rejects invalid payload structures and throws `FortyGuardApiError`.
- **API Processing Error:** Poll timeout or status `Failed` throws typed `FortyGuardProcessingError`.

---

## 3. Milestone Verification Checklist

Before declaring any milestone or vertical slice complete, verify:
- [ ] TypeScript typecheck passes (`bun run typecheck`)
- [ ] Linter passes with zero errors (`bun run lint`)
- [ ] Automated unit test suite passes (`bun run test` — vitest; the raw `bun test` bun-native runner is NOT supported)
- [ ] Production build succeeds (`bun run build`)
- [ ] No secrets committed in code or documentation
- [ ] Documentation updated to reflect changes
