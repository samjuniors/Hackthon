# Current Sprint — Final Adversarial Audit & Submission Hardening

**Status:** COMPLETED, TESTED & VERIFIED
**Current Milestone:** Final Adversarial Audit (contract-hardening pass)
**Submission Deadline:** 2026-08-30
**Last Updated:** 2026-08-28

---

## 🎯 Sprint Goal

No new features. Attack the implementation as a hostile technical judge: documentation
consistency, honest plan-limit semantics, provable AOI geometry chain, verbatim provider
geometry with an explicit coverage metric, DEMO-replay lockdown, distinct LIVE failure
states, complete decision provenance, stale-data elimination, and mobile verification.

---

## 📋 Current Verified State (single source of truth)

### Test & Quality Gates (run via `bun run …` — the project uses bun + vitest)

> **Runner note:** the canonical test command is `bun run test` (vitest). Running the
> raw `bun test` bun-native runner is NOT supported (it lacks `vi.stubGlobal` and does
> not load `.env.local`) and is not a gate.

- [x] **Vitest suite:** 394 tests passing across 34 files (100% pass rate).
- [x] **TypeScript typecheck (`bun run typecheck`):** 0 errors.
- [x] **ESLint (`bun run lint`):** 0 errors, 0 warnings.
- [x] **Production build (`bun run build`):** clean.
- [x] **Browser verification:** desktop + 390px/430px mobile (see §Evidence).

### Provider Contract (three layers — never conflated)

- **DOCUMENTED LIMIT** (official docs, verified 2026-08-28): heatmap area
  API Basic 10 mi² · Premium 50 mi² · Startup 10 mi²; granularity 60/80/100 m;
  filter_type 1/2/3 (ft2 = same-day range, max 23 h); dates 2019-01-01 → now +12 h;
  United States coverage only; constraint violations are HTTP 400 and never charged.
- **EMPIRICALLY VERIFIED ACCOUNT CAPABILITY:** Hackathon plan, 2 M credit cap,
  async activity polling; the account exposes NO area limit of its own.
- **CURRENT LIVE ACCOUNT STATE:** credits exhausted (HTTP 402 on submission) —
  surfaced honestly in the UI; LIVE requests fail with a distinct actionable state
  and NEVER fall back to DEMO data.

The enforced limit for this account is the **conservative documented ceiling
(10 mi²), labelled `conservative`** — the Hackathon plan is never represented as
"Basic". The stale 150 mi² assumption is permanently retired and test-guarded.

### DEMO Replay (finite evidence dataset)

- One genuine captured FortyGuard `/v1/heatmap` response: **425 provider cells,
  100 m granularity, single hour 2026-08-14 12:00 UTC, Lower Manhattan**
  (activity `800a20e2…`, captured 2026-08-21).
- DEMO parameters outside the capture (date/time mode, AOI shape/size, resolution,
  non-Manhattan locations) are **locked or rejected** — changing them can never
  imply a new FortyGuard query. DEMO = replay · LIVE = new provider request.

### Decision Provenance (inspectable chain)

`candidate coordinate → containing provider polygon/tile → hourly modeled
temperature observations → window mean → exposure score → deterministic ranking →
recommendation` — rendered as a compact evidence surface (Top Candidates → Data
provenance) and persisted in every history record. The AI explainer only narrates
the deterministic result under a grounding validator; it never determines it.

### Coverage Honesty

Provider geometry is rendered verbatim — never stretched, clipped, interpolated,
subdivided, or edge-filled. Coverage is reported as
`provider-covered AOI area ÷ requested AOI area` (sampled planar estimate) with the
formula surfaced in the UI; gaps are shown, never filled.

### Analysis History (browser-local IndexedDB)

Completed analyses only (failed LIVE requests are never saved). Records carry the
full reproduction payload (location, AOI geometry + area, temporal input + timezone,
resolution, candidates, activity IDs, verbatim thermal field, decisions,
explanation, timestamps). Restore is pure local state rehydration — zero provider
requests (test-proven).

---

## 🗂 Historical Milestones

Previous milestone reports live in `docs/WORKLOG.md` (dated execution reports —
read as history, not current state). Earlier sprint goals (12-phase production
verification, live provider readiness, °F/°C preferences) were completed and
superseded by the contract-hardening and adversarial-audit passes.
