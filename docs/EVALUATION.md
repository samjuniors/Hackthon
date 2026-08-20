# Evaluation & Verification Plan — Thermal Decision Engine

**Status:** PROVISIONAL  
**Last Updated:** 2026-08-20  

---

## 1. Quality & Correctness Strategy

To deliver a reliable hackathon submission by **2026-08-30**, the Thermal Decision Engine employs a multi-tiered verification framework.

---

## 2. Evaluation Pillars

### 2.1 Deterministic Domain Logic Verification
- **Unit Tests:** 100% test coverage on pure calculation functions (scoring, threshold checks, delta impact).
- **Invariant Tests:** Guarantee that lower temperatures never produce higher risk scores, and mitigation scenarios never report negative benefits without trade-offs.
- **Edge Case Tests:** Handling missing fields, null humidity, extreme temperatures (-20°C to +60°C), and invalid coordinates.

### 2.2 Boundary & Schema Validation
- **Zod Schema Tests:** Verify that mocked and real FortyGuard responses strictly parse or fail gracefully with descriptive error boundaries.

### 2.3 End-to-End User Journey Verification
- **Vertical Slice Validation:** Every vertical slice is validated via automated integration/UI tests to ensure end-to-end data flow (`User → UI → Engine → Adapter → Display`).

### 2.4 AI Grounding & Anti-Hallucination Checks
- **Prompt Isolation Tests:** Validate that AI explanation prompts receive structured JSON data only and cannot invent numbers outside the provided context.

---

## 3. Continuous Verification Checklist

Before any milestone is declared complete:
- [ ] TypeScript typecheck passes (`pnpm typecheck` or `pnpm build`)
- [ ] ESLint passes without errors (`pnpm lint`)
- [ ] Unit tests pass (`pnpm test`)
- [ ] Build passes cleanly (`pnpm build`)
- [ ] No secrets committed in source code or documentation
- [ ] Documentation updated to reflect changes
