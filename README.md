# Thermal Decision Engine

Operational dashboard that turns **FortyGuard hyperlocal thermal fields** into
deterministic operating decisions (WHERE to stage, WHEN to operate, WHAT-IF
exposure) with grounded, provenance-explicit AI narration.

Built for the FortyGuard Hackathon'26.

---

## Data sources — DEMO vs LIVE

| | DEMO | LIVE |
|---|---|---|
| Source | Captured FortyGuard fixture (`tests/fixtures/heatmap_captured_demo.json`) — one real `/v1/heatmap` response, 425 verbatim provider cells at 100 m granularity | Real FortyGuard `/v1/heatmap` API |
| Provider calls | **Zero** — fully offline replay | Consumes credits (empirically 4,220 per completed heatmap call — see `docs/FORTYGUARD.md`) |
| Coverage | Lower Manhattan capture only (the captured field's extent) | Anywhere the account has coverage (documented: United States) |
| Temporal label | Single captured model hour — August 14, 2026 · 12:00 UTC (fetched from FortyGuard on 2026-08-21) | The exact user-selected date/time |
| UI structure | Identical to LIVE | Identical to DEMO |

DEMO is a verbatim captured replay: the adapter looks up the captured hour by
**exact UTC timestamp** and returns the captured cells unchanged — never
subdivided, re-temperatured, or interpolated. An uncaptured hour is honestly
refused (`IncompleteTemporalCoverageError` — "DEMO never fabricates additional
hours"); a location outside the captured extent is honestly refused
(`OutsideCoverageError`). DEMO's WHEN anchors to the captured hour and is
displayed in UTC — never "Today".

Only provenance differs. There is no fake demo map. A failed LIVE request is
**never** silently replaced by DEMO data — the UI halts with an explicit
"Analysis Halted / FortyGuard provider error" banner offering
**Retry Live** or **Switch to DEMO mode**. On this environment's key LIVE is
currently **credit-exhausted**: every request returns HTTP 402 ("Insufficient
credits: this request costs 4220 credits and 0 remain"), surfaced verbatim as
`FORTYGUARD_CREDITS_EXHAUSTED` with no DEMO fallback and no history entry.

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
- The default time mode is **single-hour** (exactly one heatmap request per
  Generate). Range-of-hours remains available in Settings; on the wire every
  evaluated hour is its own single-hour request (`filter_type: 1`, UTC
  date/hour, bounded concurrency) — the verified wire contract. The provider's
  `filter_type: 2/3` modes exist in the schema but are not used by this
  app's workflow.
- DEMO mode anchors the WHEN to the single captured hour — never "Today".
- Local→UTC conversion happens at the server adapter boundary
  (`src/lib/temporal/server-conversion.ts`). AI providers never touch dates.

## Canonical Analysis AOI

One geometry (`src/lib/spatial/aoi.ts`) is both rendered on the map AND sent
to FortyGuard — square (side length) or circle (32-gon approximating the
diameter), span presets 250 / 400 / 1000 / 2000 / 5000 m, and a LIVE
resolution choice of 60 / 80 / 100 m (DEMO always replays the captured
100 m field — never a user-selected resolution the capture does not contain).
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
# Using Bun (recommended — matches bun.lock):
bun install
bun run dev         # Next.js dev server on :3000
bun run typecheck   # tsc --noEmit
bun run lint        # eslint .
bun run test        # vitest run (441 offline unit & integration tests)
bun run build       # production build + postbuild verification

# Or using npm:
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

Environment setup (server-side only, `.env.local`, never committed — template provided in `.env.example`):

```bash
cp .env.example .env.local
```

```env
FORTYGUARD_API_BASE_URL=https://api.fortyguard.com
FORTYGUARD_API_KEY=...
FORTYGUARD_DATA_SOURCE=FIXTURE   # FIXTURE (demo) | LIVE
GEMINI_API_KEY=...               # optional AI narrator
```

See `worklog.md` for the full engineering history and verification evidence.

## Deploy to Vercel

The app is Vercel-ready with **zero configuration**: `next.config.ts` detects
Vercel automatically (standalone output is only emitted for self-hosted
Docker), the post-build script no-ops on Vercel, and the DEMO fixture is
bundled at build time via a static ES import — no database, no extra services.

**Zero-env deploy (DEMO mode):** import the repo in Vercel (framework preset
*Next.js*, package manager *bun* auto-detected from `bun.lock` + the
`packageManager` field), keep every environment variable empty, and deploy.
The app boots in DEMO mode and replays the captured Lower Manhattan thermal
field with the full deterministic decision pipeline — no FortyGuard key, no
credits, no cost.

**LIVE mode (real FortyGuard data):** add these environment variables in
*Project → Settings → Environment Variables* (server-side only — nothing is
exposed to the browser):

| Variable | Required | Purpose |
| --- | --- | --- |
| `FORTYGUARD_API_KEY` | for LIVE | FortyGuard API key (LIVE requests spend credits — see *Credit-safe architecture* above) |
| `FORTYGUARD_DATA_SOURCE` | no | `FIXTURE` (default) or `LIVE` — boot-time default data source |
| `FORTYGUARD_API_BASE_URL` | no | Defaults to `https://api.fortyguard.com` |
| `GEMINI_API_KEY` | no | Optional AI narrator (falls back → Claude → Z.ai → deterministic) |
| `ANTHROPIC_API_KEY` | no | Optional secondary AI narrator |

Notes:

- **No `DATABASE_URL` needed.** Prisma/SQLite is scaffolded but inert — no
  route imports it. Analysis history is persisted client-side in IndexedDB,
  so every deployment (including Vercel's read-only filesystem) works
  unchanged.
- Users can switch DEMO ↔ LIVE at runtime from the in-app Settings drawer;
  the boot-time env var only sets the default.
- Never commit API keys. `.env` is gitignored; configure secrets in the
  Vercel dashboard (or `vercel env add FORTYGUARD_API_KEY`).
