# Thermal Decision Engine — Production Layer Worklog

Shared worklog for the operational dashboard + AI provider abstraction enhancement.

---
Task ID: 1
Agent: orchestrator (main)
Task: Inspect current codebase and plan the provider-abstraction + dashboard-redesign layer.

Work Log:
- Read the full epistemic architecture: ai-provider.ts, ai-explainer.ts, deterministic-explainer.ts, grounding-validator.ts, api/explain + api/health routes, types/{provider,explanation,domain,provenance}.
- Mapped page.tsx (1264 lines): 21 useState, 6 fetches, sticky header + 12-col grid (4-col left control panel, 8-col right workspace with map / recommended plan / what-if / explanation cards). 18 data-testids to preserve.
- Read ThermalMap, LocationSearch, ProviderHealthCard, ThemeProvider, location/search, fortyguard/health, decision route.
- Loaded the LLM skill: z-ai-web-dev-sdk chat.completions.create with role:'assistant' for system prompt, thinking:{type:'disabled'}. Backend-only. No API key in code (SDK configured server-side).

Stage Summary:
- Strategy: surgical backend changes for provider abstraction (preserve deterministic authority + grounding validator); extract large inline cards into components; add Settings drawer + control rail + system status; do NOT rewrite page.tsx logic, only compose.
- Fallback chain order: Gemini → Claude → Z.ai → deterministic. All providers get the same immutable ExplainableDecisionInput; all outputs pass the SAME grounding validator (never weakened). Fallback triggers: timeout / 429 / 5xx / malformed JSON / grounding failure.
- Server-side secrets only: GEMINI_API_KEY, ANTHROPIC_API_KEY env vars; Z.ai via SDK (no key in code). No UI key fields.
- Z.ai SDK is available and pre-configured in this sandbox → Z.ai provider will be the active AI explainer out of the box (no external keys needed).

---
Task ID: 2-a
Agent: settings-and-header-builder
Task: Create 4 new files — localStorage-backed user-preferences store mirroring temperature.ts; sticky Header with provenance-explicit mode badge, °F/°C toggle, FortyGuard+AI status dots, theme + settings buttons; compact SystemStatus card (3 rows, Test buttons, no inline latency/error text); self-contained SettingsDrawer (Display / Data Source / AI Explainer / Analysis / Map Layers + Reset) using shadcn Sheet/Switch — no credentials anywhere.

Work Log:
- Read reference files: src/lib/temperature.ts (store pattern + useSyncExternalStore), src/app/globals.css (all design tokens: surface-*, text-*, accent-*, status-*), src/components/ProviderHealthCard.tsx (card styling + StatusPill pattern), src/components/ThemeProvider.tsx (Theme type + useTheme hook), src/app/page.tsx lines 1-200 and 430-550 (existing Header + StatusDot + ThemeToggle JSX), src/types/provider.ts (ProviderStatus, AIProviderName, PreferredAIProvider), src/types/provenance.ts (DataSourceMode), src/components/ui/{sheet,switch,select,button,badge}.tsx (shadcn APIs).
- Wrote src/lib/user-preferences.ts: module-level listeners Set, loadUserPreferences/saveUserPreferences with try/catch, subscribe/getSnapshot/getServerSnapshot triple, useUserPreferences() hook returning [prefs, setters]. Added snapshot-stability cache (cachedPrefs/cachedRaw keyed by raw localStorage string) so useSyncExternalStore doesn't infinite-loop on object return values. Field-by-field validation + mapLayerVisibility merge over defaults. getServerSnapshot returns DEFAULT_USER_PREFERENCES (SSR-safe).
- Wrote src/components/dashboard/Header.tsx: sticky <header> with backdrop-blur + surface-header bg + border-b. Title "Thermal Decision Engine" + subtitle "Hyperlocal thermal intelligence → operational decisions". Right controls in spec order: provenance-explicit mode badge (LIVE · FortyGuard [emerald] / DEMO · Captured FortyGuard [amber]), °F/°C toggle (preserves data-testid temp-unit-toggle / temp-unit-f / temp-unit-c, role=group, aria-pressed, min 36×36 touch), hidden sm:flex FortyGuard + AI status-dot pair (AI dot labelled "AI · Z.ai" etc), theme toggle button (Sun/Moon from lucide, aria-label), Settings button (gear icon, aria-label="Open settings", data-testid="settings-open-btn"). Inline StatusDot mirrors page.tsx exactly.
- Wrote src/components/dashboard/SystemStatus.tsx: rounded-xl border bg-surface-card p-4 card. Three rows — FortyGuard (dot + label + subtext Connected/Demo Loaded/Offline/Unknown + Test button data-testid test-fortyguard-btn), AI Explainer {provider} (dot + label + Test button data-testid test-ai-btn), Thermal Field (Ready [green] / Loading… [amber, animate-pulse via status-dot-live] / Idle [dim]). All Test buttons min-h-[36px]. NO latency numbers or error text inline (per brief — advanced diagnostics belong in Settings).
- Wrote src/components/SettingsDrawer.tsx: Sheet/SheetContent/SheetHeader/SheetTitle/SheetDescription + Switch + lucide-react RotateCcw/Sun/Moon. Self-contained: calls useUserPreferences() + useTempUnit() + useTheme() directly; receives only {open, onOpenChange}. SheetContent overridden to w-full sm:max-w-md, gap-0, p-0; body is flex-1 overflow-y-auto p-4 max-h-[90vh]. Five sections (Display / Data Source / AI Explainer — Preferred Provider / Analysis / Map Layers) + footer Reset to defaults. No credential fields — only server-side note "API keys are configured server-side. Contact your administrator to enable a provider." Helper line "Providers fall back automatically: Gemini → Claude → Z.ai → deterministic." All toggle buttons role=group + aria-pressed, ≥36px touch targets. Theme toggle uses two pill buttons (Light/Dark with Sun/Moon icons) that no-op when already on the chosen theme (since useTheme only exposes toggle).
- Ran `bun run lint` — 0 errors, 0 warnings across all 4 new files.

Stage Summary:
- 4 new files produced, no existing files modified:
  • src/lib/user-preferences.ts — exports: AnalysisResolution, AnalysisAreaShape, MapLayerVisibility, UserPreferences, DEFAULT_USER_PREFERENCES, PREFS_KEY, loadUserPreferences, saveUserPreferences, UserPreferencesSetters, useUserPreferences.
  • src/components/dashboard/Header.tsx — exports named + default Header; inline StatusDot.
  • src/components/dashboard/SystemStatus.tsx — exports named + default SystemStatus.
  • src/components/SettingsDrawer.tsx — exports named + default SettingsDrawer.
- useUserPreferences() returns [UserPreferences, { setDataSourceMode, setPreferredAIProvider, setAnalysisResolution, setAnalysisAreaShape, setMapLayerVisibility(partial), reset }]. Snapshot-stable cache prevents useSyncExternalStore re-render loops.
- All design tokens sourced from globals.css; no hardcoded colors except inline `style={{ background: 'var(--accent-x)' }}` matching the existing ProviderHealthCard/StatusDot convention.
- All required data-testids preserved: temp-unit-toggle, temp-unit-f, temp-unit-c, settings-open-btn, test-fortyguard-btn, test-ai-btn.
- Header props match spec exactly (mode, unit, onToggleUnit, theme, onToggleTheme, onOpenSettings, fortyGuardStatus, aiStatus, aiProvider). SystemStatus props match spec exactly. SettingsDrawer props: { open, onOpenChange }.
- Next agent (2-b+): compose Header + SystemStatus + SettingsDrawer into page.tsx; wire onOpenSettings to a useState boolean; pass live ProviderStatus / AIProviderName / fieldReady / loading from existing fetches.

---
Task ID: 1 + 3-13 (orchestrator)
Agent: orchestrator (main)
Task: Implement the operational dashboard + AI provider abstraction layer while preserving the epistemic architecture.

Work Log:
- Backend provider abstraction: rewrote ai-provider.ts (Gemini + Claude REST + Z.ai via z-ai-web-dev-sdk), buildProviderChain(preferred), invokeSpecificProvider, testSpecificProvider, testAIConnection with providerChain reporting. All secrets server-side (GEMINI_API_KEY / ANTHROPIC_API_KEY env; Z.ai SDK credentials). No keys in browser.
- Backend fallback chain: rewrote ai-explainer.ts — Gemini → Claude → Z.ai → deterministic. Each provider receives the SAME immutable ExplainableDecisionInput; every output passes the SAME grounding validator (±0.01°C allow-list + forbidden medical/physical-semantic claims) — NEVER weakened. Fallback triggers: timeout / 429 / 5xx / malformed JSON / grounding failure. Returns providerUsed + fallbackTrace.
- Updated types/provider.ts (AIProviderName = GEMINI|CLAUDE|ZAI|NONE; ProviderChainEntry; preferredProvider) and types/explanation.ts (providerUsed + fallbackTrace).
- Updated api/explain + api/health/ai routes to thread preferredProvider + return chain status.
- Threaded granularity (60/80/100) + analysisAreaShape (polygon/circle) through the decision route + adapter (functional RESOLUTION/AREA controls for LIVE queries; createBoundingAOI now supports circular 32-gon).
- Extracted dashboard cards from the 1264-line page.tsx into components: RecommendedOperation, TopCandidates, WhatIfPanel, GroundedExplanation, ThermalMapCanvas, ErrorBanner, ControlRail + shared dashboard-format.ts. page.tsx is now a clean orchestrator.
- Subagent (Task 2-a) built user-preferences.ts (SSR-safe localStorage store mirroring temperature.ts) + Header + SystemStatus + SettingsDrawer (no credential fields).
- Micro-interactions via framer-motion: map reveal, thermal-field loading shimmer, recommendation reveal + temperature emphasis, staggered top-candidates, what-if AnimatePresence transition, AI explanation loading state.
- Preserved all 18 data-testids (decision-card, recommended-temp-display, advantage-delta-display, top-3-plans, candidate-plans-table, what-if-card, whatif-baseline-temp, whatif-constrained-temp, whatif-cost-display, recalculate-decision-btn, production-error-banner, duration-display, active-analysis-location-*, analysis-mode-badge, temp-unit-*, test-*-btn, settings-open-btn).

Stage Summary:
- Lint: 0 errors / 0 warnings. Typecheck: 0 errors in project source.
- Dev server: Next.js 16.1.3, all API routes return 200 (/api/decision, /api/explain, /api/health/ai, /api/health/fortyguard).
- Agent Browser verified: redesigned dashboard renders (header + control rail + main canvas), LIVE/DEMO · FortyGuard wording, compact system status (● FortyGuard / ● AI Explainer Z.ai / ● Thermal Field Ready), Settings drawer (no secrets), what-if scenario switching, light/dark mode, mobile responsive (no horizontal overflow, 44px touch targets).
- Provider chain VERIFIED via /api/health/ai: provider="ZAI", connected=true, providerChain=[{ZAI, configured, connected, 438ms}]. Gemini+Claude not configured → correctly skipped.
- Fallback VERIFIED: Z.ai invoked (4-7s real LLM latency), output rejected by un-weakened grounding validator (incidental ungrounded numbers), falls back to deterministic explainer — exactly as specified. Deterministic engine remains the sole decision authority (providers only narrate; /api/decision is untouched by the AI layer).
- Known limitation: the Z.ai (glm-4.6) model does not reliably comply with the strict numeric allow-list, so its grounded-AI output is frequently rejected in favor of deterministic. The validator is intentionally NOT weakened to compensate (per spec). With GEMINI_API_KEY or ANTHROPIC_API_KEY configured server-side, those providers would be reached first.

---
Task ID: 3 (thermal-map-investigation)
Agent: orchestrator (main)
Task: Before making any changes, investigate why the production UI shows "3 thermal cells" while the map contains essentially no visible thermal polygons. Produce a 9-point final report.

Work Log:
- Read src/components/ThermalMap.tsx (527 lines): MapLibre Map is recreated on every change of [location, spatialField, candidates, recommendedLocationId, theme]. The displayed AOI uses createTargetAoiGeoJSON(centerLat, centerLng, deltaLat=0.012, deltaLon=0.016) — a HARDCODED rectangle around the user-selected center, NOT the actual FortyGuard request AOI. AOI fill-opacity = 0.04 when thermal is renderable (essentially invisible). Layer order: carto-base → target-aoi-fill → target-aoi-outline → thermal-tiles-fill → thermal-tiles-outline → carto-labels → markers.
- Read src/components/dashboard/ThermalMapCanvas.tsx (85 lines): wrapper card with title "FortyGuard Thermal Field" + subtitle "Hyperlocal spatial temperature distribution" + thermal-cell count + resolution + location name.
- Read src/lib/fortyguard/adapter.ts (535 lines): createBoundingAOI(center, halfSideMetres=400, shape) builds the ACTUAL FortyGuard request AOI (800m × 800m polygon, or 32-gon circle for shape='circle'). This is called inside getHourlyHeatmapSnapshots when no baseAoi is passed. The adapter NEVER sends the displayed AOI to FortyGuard — they are two different geometries.
- Read tests/fixtures/heatmap_hourly_fixture.json: 12 hourly snapshots. Each snapshot has 1 aoi (FeatureCollection) with EXACTLY 3 features. All 3 features are simple Polygon (5-vertex closed ring = quadrilateral tile). Properties: tile_id, average_temperature, min_temperature, max_temperature (all finite °C values). Cell 0 (tile-11): lng -74.010→-74.002, lat 40.709→40.715, avg 28.5°C. Cell 1 (tile-12): lng -74.002→-73.994, lat 40.709→40.715, avg 29.1°C. Cell 2 (tile-13): lng -73.994→-73.986, lat 40.709→40.715, avg 30.6°C.
- Read src/lib/spatial/mapper.ts (115 lines): findTileForPoint ray-casts DEMO candidates against the 3 fixture cells — all 3 DEMO candidates (Battery Park -74.008, City Hall -73.998, Chinatown -73.988, all at lat 40.712) fall cleanly inside cells 0/1/2 respectively. No containment gap.
- Read src/app/page.tsx (564 lines): runDecisionPipeline posts {latitude, longitude, durationHours, mode, granularity, analysisAreaShape} to /api/decision. The decision route builds its own AOI inside the adapter — the client never sends an explicit AOI geometry. spatialField is set from data.spatialField (the base-timestamp snapshot's FeatureCollection). ThermalMap receives location + spatialField + candidates + recommendedLocationId. No `analysisAoi` prop exists yet.
- Read src/app/api/decision/route.ts (327 lines): validates latitude/longitude/durationHours/mode/granularity/analysisAreaShape. Calls adapter.getHourlyHeatmapSnapshots(location, timestamps, undefined, {granularity, analysisAreaShape}) — passes undefined as baseAoi, so adapter builds its own 400m AOI. Returns spatialField = base-timestamp snapshot FeatureCollection (only if it has features with finite average_temperature).
- Wrote .env.local with FORTYGUARD_API_KEY=a57426b8…[REDACTED] + FORTYGUARD_API_BASE_URL=https://api.fortyguard.com + FORTYGUARD_DATA_SOURCE=FIXTURE.
- Direct LIVE API test (/tmp/fg_live_test.mjs): POST https://api.fortyguard.com/v1/heatmap with a 400m half-side polygon AOI around Los Angeles (34.0522, -118.2437), granularity 60m, today's date 12:00 UTC. Response: HTTP 402 "Insufficient credits: this request costs 4220 credits and 0 remain on your API key." The provided key is recognized by FortyGuard but the account has zero credits. No LIVE feature count can be empirically verified without credits.

Stage Summary — FINAL INVESTIGATION REPORT:

1. DEMO thermal feature count: **3 features per snapshot** (verified by reading the fixture JSON). The fixture contains 12 hourly snapshots; every snapshot's `aoi` is a FeatureCollection with exactly 3 Polygon features, each carrying finite average_temperature (28.5 / 29.1 / 30.6 °C), min_temperature, max_temperature, and tile_id. No fabrication, no interpolation.

2. LIVE thermal feature count from latest verified request: **CANNOT BE EMPIRICALLY VERIFIED.** The provided FORTYGUARD_API_KEY (`a57426b8…[REDACTED]`) is recognized by FortyGuard's API but the account returns HTTP 402 "Insufficient credits: this request costs 4220 credits and 0 remain on your API key." A real LIVE heatmap call cannot be completed with this key. The adapter's LIVE code path expects `result.map_data` (FeatureCollection) or `result` itself being a FeatureCollection, with a fallback to an empty FeatureCollection if no FC is found anywhere. Without credits, no LIVE feature count is reportable. (Task 8 will harden the LIVE result extraction with a recursive FeatureCollection search so that whenever credits are restored, whatever shape FortyGuard returns will be handled.)

3. Geometry types: All 3 DEMO features are simple `Polygon` (5-vertex closed rings = quadrilateral tiles), no MultiPolygons, no holes. Each tile is ~0.008° lng × 0.006° lat (~700m × 670m at NYC latitude). They tile contiguously east-to-west across Manhattan's Civic Center / Chinatown corridor.

4. Why polygons are/aren't visible:
   - The fixture cells have valid finite temperatures and the renderer DOES use `fill-opacity: 0.85` (dark) / `0.75` (light) — high enough to be visible IF the layer is added.
   - **Primary cause: MapLibre map lifecycle bug.** The `useEffect` dependency array is `[location, spatialField, candidates, recommendedLocationId, theme]`. On initial mount, `spatialField=null` so `thermalIsRenderable=false`, so the thermal-tiles source/layer are NEVER added in the on('load') callback. When the decision pipeline completes and `spatialField` arrives, the entire Map is torn down (map.remove()) and recreated. The new map's on('load') callback then bakes in the spatialField — but it races against the secondary `useEffect([spatialField])` that tries `src.setData()` and bails out if `isStyleLoaded()` returns false (which it does during the early load window). When candidates arrive on the next pipeline tick, the map is torn down AGAIN and rebuilt. Every decision refresh destroys and recreates the map; markers, sources, and layers all flicker / lose state.
   - **Secondary cause: AOI fill drawn at fill-opacity 0.04.** When thermal is renderable, the target AOI fill opacity drops to 0.04 (essentially invisible), so the AOI boundary itself is barely perceptible. The AOI outline (line-opacity 0.85, width 2.5) is the only visible AOI signal, and even that uses a hardcoded rectangle that does NOT correspond to the actual FortyGuard request AOI.
   - **Tertiary cause: displayed AOI ≠ requested AOI.** The displayed AOI is `createTargetAoiGeoJSON(center, 0.012, 0.016)` ≈ 2.0 km × 2.7 km. The requested AOI is `createBoundingAOI(center, 400, shape)` ≈ 800m × 800m. They are different geometries with different extents and different aspect ratios. The user sees an "analysis area" that is 3-4× larger than what FortyGuard was actually asked about.

5. Whether the issue is fixture data or renderer: **Renderer + data-contract mismatch**, NOT fixture data. The fixture data is correct (3 valid cells with finite temperatures). The renderer has a lifecycle bug (Map recreated on every prop change), and the data contract has a mismatch (displayed AOI ≠ requested AOI). The 3 fixture cells, once rendered through a stable map, will be visibly obvious.

6. Current AOI geometry behavior:
   - **Displayed AOI**: `createTargetAoiGeoJSON(centerLat, centerLng, deltaLat=0.012, deltaLon=0.016)` — a HARDCODED rectangle around the user-selected center, with NO relationship to the actual FortyGuard request AOI. For Battery Park (40.712, -74.008) it produces lng -74.024→-73.992, lat 40.700→40.724 (~2.0 km × 2.7 km).
   - **API request AOI**: `createBoundingAOI(center, 400, 'polygon'|'circle')` — built INSIDE the adapter's `getHourlyHeatmapSnapshots()` when no `baseAoi` is passed. This produces an 800m × 800m polygon (or 32-gon circle of radius 400m) around the center.
   - **These two geometries are DIFFERENT.** The displayed AOI is ~3-4× larger than the requested AOI and uses a different aspect ratio. The user cannot visually verify what was sent to FortyGuard.

7. Candidate containment behavior:
   - DEMO candidates (Battery Park -74.008, City Hall -73.998, Chinatown -73.988, all at lat 40.712) fall cleanly inside the 3 fixture cells (lng -74.010→-73.986, lat 40.709→40.715). `findTileForPoint` resolves each candidate to its containing tile. Containment is verified end-to-end.
   - LIVE candidates (SITE-N, SITE-CENTER, SITE-S at ±100m from center) are well inside the 400m half-side AOI. Containment depends on FortyGuard returning coverage for that AOI — which cannot be verified without credits.

8. Recommended UI changes:
   - **Map lifecycle**: instantiate Map ONCE on mount; update via `source.setData()` for thermal + AOI sources; update candidates/winner via `Marker#remove()` + new `Marker()`. NEVER recreate the Map instance on prop changes. Wait for `map.isStyleLoaded()` or `map.once('style.load', ...)` before manipulating sources/layers.
   - **Canonical Analysis AOI**: build ONE canonical AOI client-side (in page.tsx) from the user-selected location + shape (polygon/circle) + size (half-side metres). Pass that SAME AOI to BOTH `<ThermalMap analysisAoi={aoi}>` for rendering AND to `/api/decision { analysisAoi: aoi }` for the FortyGuard request. The adapter must accept and use this AOI rather than building its own.
   - **Polygon mode**: visible outline (line-width ≥ 2.5, line-opacity ≥ 0.85) + translucent fill (fill-opacity ~0.10–0.15), thermal field rendered BELOW the AOI so the AOI boundary is crisp on top.
   - **Circle mode**: render the actual 32-gon circle from `createBoundingAOI(shape='circle')` — NOT a rectangle. Same geometry sent to FortyGuard.
   - **150 mi² AOI limit**: validate AOI area client-side; show a concise validation message if exceeded; do NOT silently shrink. 400m half-side = 0.25 mi², far below limit. Keep 60m/80m/100m resolution distinct from AOI area.
   - **Real thermal polygons**: render the actual FortyGuard feature collection (DEMO = 3 captured cells; LIVE = whatever FortyGuard returns). NO fabrication, NO interpolation, NO decorative heatmap. The 3 DEMO cells will be visibly obvious once the lifecycle is fixed.
   - **Layer order**: basemap → thermal field → AOI boundary → candidate sites → recommended site → labels/controls. Thermal field must remain visible BELOW the AOI boundary; AOI boundary must remain visible OVER the thermal field.
   - **Semantic labels**: change "Operating Location" → "Selected Analysis Area". Make the optimization relationship explicit: SELECTED ANALYSIS AREA / CANDIDATE SITES / RECOMMENDED SITE hierarchy.
   - **Map copy**: title "FortyGuard Thermal Field"; subtitle "Observed modeled temperature across the selected analysis area". Keep thermal cell count. Keep FortyGuard provenance indicator.
   - **DEMO/LIVE parity**: same visual workflow; only provenance/source changes. NO special fake visual map for DEMO.
   - **Light/dark**: preserve dark dashboard as primary; verify light mode independently. Thermal colors, AOI boundary, candidate markers, winner marker must remain high-contrast in both themes.

9. Files that need modification:
   - `src/lib/spatial/aoi.ts` (NEW): client-safe canonical AOI builder. Exports `createBoundingAOI`, `AnalysisAreaShape`, `analyzeAoiAreaMi2`, `FORTYGUARD_AOI_LIMIT_MI2`. Pure geometry, no zod/fetch/process.env — safe for client import.
   - `src/lib/fortyguard/adapter.ts`: re-export `createBoundingAOI` + `AnalysisAreaShape` from `../spatial/aoi` for backwards compat. Harden LIVE result extraction with recursive FeatureCollection search.
   - `src/components/ThermalMap.tsx`: MAJOR rewrite. Stable Map instance (instantiate once, update via setData/Marker#remove+add). Accept `analysisAoi` prop. Render AOI from canonical geometry (not hardcoded). Correct layer order. Circle mode. High-contrast light/dark. Wait for style readiness. Update popup copy ("Selected Analysis Area" / "Candidate Site" / "★ Recommended Site").
   - `src/components/dashboard/ThermalMapCanvas.tsx`: subtitle "Observed modeled temperature across the selected analysis area"; add explicit SELECTED ANALYSIS AREA / CANDIDATE SITES / RECOMMENDED SITE semantic hierarchy (small badges above the map).
   - `src/app/page.tsx`: build canonical AOI client-side from `createBoundingAOI(selectedLocation, halfSideMetres, shape)`; pass to `<ThermalMap analysisAoi={aoi}>` AND to `/api/decision { analysisAoi: aoi }`; validate 150 mi² AOI limit; show concise validation error; do NOT silently shrink.
   - `src/app/api/decision/route.ts`: accept explicit `analysisAoi` from request body (Zod-validated PolygonAOI); pass to `adapter.getHourlyHeatmapSnapshots(location, timestamps, analysisAoi, options)` so the adapter uses the SAME geometry the client rendered.

DO NOT TOUCH: evaluator math, deterministic ranking, What-If arithmetic, grounding validator, AI decision-authority boundaries, temperature calculations. This is a map/data-contract/UI fix.

---
Task ID: 4 (temporal-provenance + capability-model)
Agent: orchestrator (main)
Task: Implement the 14-section temporal-provenance + provider-capability spec. Add explicit DATE/TIME/TIMEZONE to the UX, build a provider capability/access model that does NOT fabricate California-only access, and verify with the real FORTYGUARD_API_KEY.

Work Log:
- Read current state: map lifecycle fix (single Map instance + setData updates) and canonical AOI parity (analysisAoi prop flows to both map AND /api/decision) are ALREADY IMPLEMENTED from the prior investigation stage. Verified in src/components/ThermalMap.tsx (single `new Map()` in mount-only useEffect, `map.isStyleLoaded()`/`once('load')` readiness gate, `setData()` for thermal+AOI sources) and src/app/page.tsx (useMemo analysisAoi → passed to both <ThermalMap analysisAoi> and /api/decision {analysisAoi}).
- Ran LIVE API probe (/tmp/fg_live_probe.mjs) against the real key a57426b8…[REDACTED]:
  • GET-equivalent POST /v1/system/fetch-api-key-usage → HTTP 200. Observed plan_details.plan_type="Hackathon", cycle_type="Hackathon", subscription_id="sub_x5bf4f2saq", subscription_start_date="Aug 20, 2026", billing_period="Aug 20, 2026 – Sep 24, 2026", active=true, credits_reset_date="Sep 24, 2026". api_key_details.status="active", valid=true, expiry_date="2026-09-24T08:02:15Z", api_access_available=true. credit_summary: total_available_credits=2,000,000; cycle_credits_used=6,994,120 (349.7%); cycle_remaining_credits=-4,994,120 (NEGATIVE — exhausted). activity_breakdown: Heatmap Generation 6,988,320 credits across 1,656 calls; Environment Parameter Analysis 5,800 credits across 2 calls.
  • POST /v1/heatmap for LA, SF, SD, NYC, Chicago — ALL return identical HTTP 402 "Insufficient credits: this request costs 4220 credits and 0 remain on your API key." The credit gate fires BEFORE any geographic validation, so regional coverage CANNOT be empirically determined from this key's current exhausted state.
  • filter_type=2 (range of hours) and filter_type=3 (single day) on LA — both HTTP 402 (same credit gate).
- Confirmed: the key is a generic Hackathon plan (NOT California-only by metadata). The 150 mi² AOI limit is NOT present in plan_details — only documented in FortyGuard's public API docs. Both will be labelled "documented"/"observed" rather than "confirmed" per Section 13.

Stage Summary:
- LIVE probe complete. Honest capability metadata captured for the provider capability model: plan_type=Hackathon, 2M credit cap (exhausted), billing cycle Aug 20 – Sep 24 2026, 1656 heatmap calls already used. No regional restriction observable (credit gate precedes geographic validation). 150 mi² limit not surfaced by API — will label as "documented default".
- Next: build provider capability types + temporal model + user prefs extension, then backend (decision route + adapter), then frontend (ControlRail WHEN + ThermalMapCanvas header + RecommendedOperation SOURCE + SettingsDrawer diagnostics), then page.tsx wiring, then Agent Browser verify, then report.

---

Task ID: 5 (final pre-demo credit-safety pass)
Agent: orchestrator (main)
Task: FINAL PRE-DEMO FORTYGUARD + TEMPORAL + CREDIT-SAFETY PASS. Verify account/credits, harden credit-safe caching, keep LIVE honest on failure, single-map lifecycle, docs reconciliation, full test suite.

Work Log:
- Re-verified the live account via POST /v1/system/fetch-api-key-usage (zero-credit endpoint), Aug 26 2026: plan_type="Hackathon", total_available_credits=2,000,000, cycle_credits_used=6,994,120, cycle_remaining_credits=-4,994,120 (EXHAUSTED), key active/expiry 2026-09-24T08:02:15Z, billing cycle Aug 20 - Sep 24 2026, activity_breakdown: Heatmap Generation 6,988,320 credits / 1,656 calls.
- ONE controlled minimal /v1/heatmap probe (small AOI, filter_type=1, granularity=100): HTTP 402 "Insufficient credits: this request costs 4220 credits and 0 remain". Usage re-check proved NO activity was created (count stayed 1,656) and no credits moved. A successful LIVE run therefore CANNOT be verified with the current key - documented as UNKNOWN rather than claimed.
- adapter.ts: added buildHeatmapCacheKey() - deterministic sorted-key identity over endpoint + AOI geometry + date_time block + granularity + analytic params. submitAndPoll now uses it; cache hits and provider submissions are counted; lastSuccessfulHeatmapAt + lastHeatmapActivityId recorded on Completed.
- types/fortyguard-capability.ts + api/health/fortyguard/route.ts + SettingsDrawer.tsx: provider diagnostics now include "Last successful heatmap" timestamp + activity id (server runtime merge, zero secrets).
- page.tsx: alt-location selection NO LONGER auto-runs a LIVE pipeline (credit safety) - selects + resets WHEN only.
- ErrorBanner.tsx: Section-12 wording - "Analysis Halted" (+ "FortyGuard provider error" when LIVE/provider), buttons "Retry Live" and "Continue with Verified Demo".
- ThermalMap.tsx: Map created EXACTLY ONCE per lifetime - both dark+light basemap/label raster sources declared up-front; theme flips now use setLayoutProperty/setPaintProperty instead of map.remove()+recreate.
- ControlRail.tsx: honest future-date note in LIVE mode ("subject to FortyGuard forecast availability") without inventing a numeric horizon boundary.
- server-conversion.ts: fixed garbled double-iteration comments (logic untouched).
- package.json: added typecheck/test scripts; cross-platform build (scripts/postbuild.mjs replaces cp -r). pnpm-workspace.yaml for pnpm v11 native-build allowlist + verifyDepsBeforeRun=false. vitest added as devDependency; node_modules had to be fully reinstalled (previous tree was corrupted).
- tsconfig excludes examples/ scaffold. eslint.config.mjs scoped override for unused shadcn carousel scaffold; use-mobile.ts refactored to useSyncExternalStore (fixes new react-hooks/set-state-in-effect errors).
- NEW tests/unit/* (vitest, offline): temporal WHEN model (filter_type mapping, derived duration, PDT formatting, fixture anchoring), canonical AOI (polygon/circle geometry, limit rejection not shrinking, fixture containment), deterministic cache identity (key-order independence, sensitivity to every analytic input), adapter-boundary local-to-UTC conversion (LA/NY/Tokyo incl. DST offset) + FortyGuard date_time blocks per filter_type.
- Runtime E2E against the production build with a LOCAL mock FortyGuard (no real credits touched): LIVE path proves activity creation -> polling -> Completed -> GeoJSON extraction -> feature count -> recommendation; identical repeat Generate created ZERO new activities (mock counter heatmapPosts stayed at exactly the first-run count = cache hit). DEMO path returns the captured 3 features with honest capture label; OUTSIDE_COVERAGE surfaces as a real 404 error; LIVE without explicit WHEN is rejected; /api/explain + /api/location/search produce ZERO FortyGuard traffic. 21/21 + 6/6 checks pass.

Stage Summary:
- pnpm typecheck: PASS (0 errors). pnpm lint: PASS (0 errors, 78 pre-existing warnings in shadcn scaffold). pnpm test: 19/19. pnpm build: PASS. Mock-E2E: 27/27 across two runners.
- REAL LIVE smoke remains blocked by exhausted credits (HTTP 402). Everything downstream of a successful response (polling/extraction/render/cache) IS verified via the mock harness; authentication + credit accounting verified against the real API.
- README.md created (reality-aligned); data contract frozen for demo video.
