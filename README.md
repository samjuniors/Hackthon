# Thermal Decision Engine

Operational dashboard that turns **FortyGuard hyperlocal thermal fields** into
deterministic operating decisions (WHERE to stage, WHEN to operate, WHAT-IF
exposure) with grounded, provenance-explicit AI narration.

Built for the FortyGuard Hackathon'26.

---

## Data sources — DEMO vs LIVE

| | DEMO | LIVE |
|---|---|---|
| Source | Captured FortyGuard fixture (`tests/fixtures/heatmap_hourly_fixture.json`) | Real FortyGuard `/v1/heatmap` API |
| Provider calls | **Zero** — fully offline | Consumes credits (2,000 per successful call per verified plan recon) |
| Coverage | Manhattan capture only (lat ~40.712, lon ~-74.008) | Anywhere the account has coverage |
| Temporal label | Honest capture window (August 21, 2026 · 04:00–15:00 EDT, captured FortyGuard) | The exact user-selected date/time |
| UI structure | Identical to LIVE | Identical to DEMO |

Only provenance differs. There is no fake demo map. A failed LIVE request is
**never** silently replaced by DEMO data — the UI halts with an explicit
"Analysis Halted / FortyGuard provider error" banner offering
**Retry Live** or **Continue with Verified Demo**.

## Credit-safe architecture

- Only an explicit **Generate Thermal Field** operation may create provider
  activity. Map rendering, theme switching, °F/°C toggles, What-If scenario
  selection, AI explanation refreshes, scrolling, and viewport changes make
  **zero** FortyGuard calls.
- Every successful heatmap response is cached under a deterministic request
  identity covering AOI geometry + date + start/end time + filter_type +
  resolution + analytic parameters (`buildHeatmapCacheKey`,
  `src/lib/fortyguard/adapter.ts`). An identical repeat Generate reuses the
  cached result instead of creating another billable activity.
- Location selection never auto-runs a LIVE query; it only updates the
  workspace and waits for an explicit Generate.
- `/v1/system/fetch-api-key-usage` is a zero-credit endpoint and powers all
  Settings diagnostics.

## Explicit WHEN model

The user always sees WHICH DAY a thermal field represents:

```
Los Angeles
August 26, 2026 · 05:00 AM–08:00 AM PDT
```

- Date + Start + End are explicit inputs; duration is derived.
- Time modes map to the verified FortyGuard filter types:
  1 = single hour, 2 = range of hours (default workflow), 3 = single day.
- DEMO mode anchors the WHEN to the fixture capture — never "Today".
- Local→UTC conversion happens at the server adapter boundary
  (`src/lib/temporal/server-conversion.ts`). AI providers never touch dates.

## Canonical Analysis AOI

One geometry (`src/lib/spatial/aoi.ts`) is both rendered on the map AND sent
to FortyGuard — polygon (square) or circle (32-gon), 60/80/100 m resolution.
There is no separate "display rectangle". Requests exceeding the documented
AOI limit are rejected with a validation error; nothing is silently shrunk.
The limit is labelled *documented* (not confirmed by the key's usage
endpoint).

## Deterministic engine + grounded AI

- The optimizer (`src/lib/decision-engine/evaluator.ts`) is deterministic and
  is the sole decision authority.
- AI providers (Gemini → Claude → Z.ai → deterministic fallback) only narrate;
  every output passes the same un-weakened grounding validator. All keys stay
  server-side; none are exposed in the UI.

## Map

MapLibre instance is created exactly once per component lifetime. Data flows
through `source.setData()`; markers via add/remove; theme flips via layout /
paint property updates. Layer hierarchy: basemap context → thermal polygons →
AOI boundary → candidate sites → recommended site.

## Settings

Provider diagnostics live inside Settings (gear icon): connection status,
plan, credit ledger (remaining / total), billing cycle, last successful
heatmap + activity id, documented AOI limit confidence. **API keys are never
displayed.**

## Note on dashboard-created heatmaps

Heatmaps created manually in the FortyGuard web dashboard are **separate
dashboard activity**. No exported/imported relationship between them and this
repository's fixture has been verified, and the app does not consume them
automatically.

## Development

```bash
pnpm install        # pnpm v11 (see pnpm-workspace.yaml)
pnpm dev            # Next.js dev server on :3000
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint .
pnpm test           # vitest run (offline unit tests)
pnpm build          # production build + standalone copy
```

Environment (server-side only, `.env.local`, never committed):

```
FORTYGUARD_API_BASE_URL=https://api.fortyguard.com
FORTYGUARD_API_KEY=...
FORTYGUARD_DATA_SOURCE=FIXTURE   # FIXTURE (demo) | LIVE
GEMINI_API_KEY=...               # optional AI narrator
```

See `worklog.md` for the full engineering history and verification evidence.
