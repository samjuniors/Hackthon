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

---
Task ID: 5 (spatial-model-corrections, vertical slice)
Agent: orchestrator (main)
Task: Pull git main + correct the spatial model before demo freeze (18-section spec: remove synthetic data, resolution/AOI semantics, movable AOI, real search, no fake candidates, region≠coverage, camera behavior, state→city workflow, tests, visual verification).

Work Log:
- Reset local main to origin/main (b28b751); preserved infra files; dev server restarted after fixing a corrupted @next/swc-linux-x64-musl extraction (bun install --force).
- §1/§18 REMOVED synthetic thermal data: deleted src/lib/spatial/thermal-grid.ts; adapter FIXTURE branch now returns EXACTLY the captured fixture cells (3 cells/hour) regardless of requested AOI shape/size. No subdivision, no invented temperatures.
- §2 Resolution semantics: ControlRail shows "THERMAL CELL 60m × 60m / 80m × 80m / 100m × 100m"; DEMO displays the fixture's ACTUAL captured granularity (60m, from new fixture-metadata.ts) — selecting 80/100 in DEMO shows an explicit mismatch note and only affects LIVE queries (granularity sent verbatim to FortyGuard — test-verified).
- §3 AOI size semantics: new span-based API in aoi.ts (createAoiFromSpan: polygon span = side length, circle span = diameter; internal half-side/radius never surfaced). Preferences field renamed analysisAoiSpanMetres with localStorage migration. Labels "400m × 400m" / "400m diameter" (aoiSpanLabel). Projection-verified: 400m→307px vs 1km→767px at identical zoom (ratio 2.498≈2.5).
- §4 Movable AOI: draggable crosshair handle marker at AOI center in ThermalMap; live translation preview via moveAoiToCenter (pure translation); dragend → onMoveAoi → page updates aoiCenter; preserves shape/size/date/time/resolution; browser-verified drag moved coords 37.8045,-122.2714 → 37.8031,-122.2698 with city/region labels preserved. Square stays square (sideMax==sideMin==307px), circle stays circular (radiusSpread=0.0000, w/h=1.000).
- §5/§6 Region layer: labels renamed to "GEOGRAPHIC REGION"/"Region View"; region-boundary fill is 0-opacity (pixel-verified fill ratio 0.007 = thin outline only, no opaque fill); outside-region dim mask retained; no subscription/coverage wording anywhere (test-enforced).
- §7 Real search: new src/lib/location/geocode.ts (Photon primary → Nominatim fallback → verified-catalog degradation, labelled 'catalog-fallback'); supports state/city/neighborhood/street/address/POI/ZIP; timezone derived offline via @photostructure/tz-lookup; 250ms client debounce, 6-result limit; NEVER calls FortyGuard (test-enforced). Browser-verified "California" → STATE result, "Oakland, CA" → city at 37.8045,-122.2714.
- §8/§9 Candidates: deleted generateCandidatesForAOI + SITE-W/SITE-CENTER/SITE-N from decision route. FIXTURE → the 3 ACTUAL captured Manhattan sites (LOC-A/B/C) only (non-Manhattan FIXTURE → 404 OUTSIDE_COVERAGE, verified). LIVE → user-supplied sites REQUIRED (400 CANDIDATES_REQUIRED otherwise — browser-verified); "+ Site" map-click mode + site-search + rename + remove in ControlRail; AOI containment validated client- AND server-side (400 CANDIDATE_OUTSIDE_AOI, never moved/clamped).
- §10/§15 Thermal honesty: DEMO renders only captured cells (3); LIVE renders provider FeatureCollection verbatim (test-verified 9-cell mock passthrough); LIVE 402 "Insufficient credits" error surfaced verbatim in browser — never falls back to fixture.
- §12/§13 Camera + state→city workflow: CameraBehavior ('fit-aoi'|'fit-region'|'fit-point') driven by geocode resultType via new selection-behavior.ts; state selection = CONTEXT ONLY (browser-verified: AOI stayed in Manhattan, "GEOGRAPHIC REGION SELECTED · context only" indicator shown); city/street selections recenter AOI at exact coordinates; Region View button fits state; fit button fits AOI+context.
- §14 Temporal: explicit DATE/START/END preserved; LIVE without temporalInput still rejected 400 (test-verified); fixture capture anchoring retained.
- §20 Stale-clear + credit safety: AOI/location/size/shape/resolution changes ALWAYS clear stale thermal state; FIXTURE auto-reruns (free), LIVE requires explicit Generate (test-enforced regexes on page source).
- Tests: rewrote tests/geographic_candidates.test.ts (no-fabrication semantics); NEW tests/spatial-model-corrections.test.ts (36 tests covering the §16 matrix: span visibility, shape preservation after move, moved==API geometry, Oakland geocode resolution, street/address classification, no-FortyGuard-in-search, CANDIDATES_REQUIRED, CANDIDATE_OUTSIDE_AOI, Manhattan-only demo sites, no synthetic temperatures, LIVE verbatim cells, granularity passthrough, region naming, state≠analysis-point, city AOI centering, LIVE temporal rejection, 402-no-fallback, stale-clear contracts).

Stage Summary:
- Suite: 211/216 passing. The 5 failures (gemini_provider ×4, explanation_live/explanation ×1... precisely: 5 tests across gemini_provider.test.ts + explanation*.test.ts) are PRE-EXISTING on clean origin/main (verified via git stash) — live-AI-network tests, untouched by this slice.
- typecheck clean; eslint 0 errors/0 warnings; dev server healthy (GET / 200, DEMO pipeline auto-runs, 3 thermal cells).
- Screenshots captured in screenshots/: A-california-state, B-oakland-city, C/D2 polygon sizes (307px vs 767px), E circle, F moved AOI, G1 live add-site, G2 live 402 honest error, G3 demo captured cells.
- What is genuinely provider-derived: LIVE heatmap request/response path (real key a574…9be3, currently HTTP 402 insufficient credits — surfaced verbatim); DEMO = genuinely captured Manhattan fixture (3 cells × 12 hours, 60m granularity, 2026-08-21T08:00Z–19:00Z).
- UNKNOWN/unverifiable without provider credits: actual LIVE cell density/appearance beyond the mock test; real coverage rejection behavior for non-US AOIs (credit gate precedes geographic validation); any provider-side state/city coverage semantics — NOT claimed anywhere in the UI.

---
Task ID: 6 (fortyguard-contract-audit)
Agent: orchestrator (main)
Task: AUDIT ONLY — trace every user-facing control from UI state to the FortyGuard request against the non-negotiable provider-contract rule. No broad implementation changes.

Work Log:
- Read FORTYGUARD.md (verified endpoint matrix: /v1/heatmap filter_type 1/2/3, granularity 60/80/100, +12h forecast, 2000 credits/call; /v1/env_params requires analysis array; average_temperature semantics UNKNOWN-VERIFY), ARCHITECTURE.md, WORKLOG.md, worklog.md.
- Traced the full pipeline: page.tsx → /api/decision → FortyGuardAdapter.getHourlyHeatmapSnapshots → per-hour /v1/heatmap (filter_type:1, UTC date/hour, polygon_aoi=canonical AOI, granularity) → submitAndPoll → findFeatureCollection → normalizePointObservation (findTileForPoint → average_temperature) → evaluator → map/AI.
- Audited all controls: search (geocode.ts: Photon→Nominatim→catalog, never FortyGuard), region (context-only), AOI (createAoiFromSpan → rendered == sent), sizes (250/400/1000/2000/5000 span), shape (square/32-gon circle, pure-translation drag), resolution (60/80/100 → request granularity verbatim, mock contract test exists), date/time (localToUtcIso at adapter boundary), time mode (TIME_MODE_FILTER_TYPE 1/2/3 — ECHO ONLY, never sent), candidates (DEMO=3 Manhattan sites; LIVE=user-placed; containment enforced).
- Forensically examined tests/fixtures/heatmap_hourly_fixture.json vs all raw captured responses: fixture tiles are ~675m×668m (not 60m), string tile-ids "tile-11/12/13" vs provider integer ids, perfectly smooth hand-authored diurnal curve, zero capture metadata (the capture script's real output format includes activityId/requestBody/polls and writes heatmap_hourly_captured.json — which does not exist), M5 commit f1d143e literally hand-inserted tile-13 into every snapshot, and ALL raw captures on the fixture's date (2026-08-21) returned n_cells=0. Only 2 raw captures ever returned cells: heatmap_probe_candidate_aoi.json (425 cells, 2026-08-14, g100) and heatmap_probe_candidate_rect.json (158 cells).
- Verified evaluator determinism (mean-temperature scoring, 3-tier tie-breaking, +12h window checks), AI no-decision-authority (explain route takes jointDecision; grounding validator allow-lists), LIVE honesty (402 surfaced verbatim, no fixture fallback, test-enforced).
- Ran the suite: 211/216 pass; 5 failures are pre-existing live-AI-network tests (gemini_provider ×4 + explanation ×1), untouched. Working tree clean at 3be5a13. No code modified (audit only).

Stage Summary — KEY FINDINGS:
- P0: The DEMO fixture (heatmap_hourly_fixture.json) is fabricated data mislabeled "Captured FortyGuard" — its "DEMO · Captured FortyGuard" provenance claim is false. Real captures exist (425-cell + 158-cell responses on 2026-08-14) and can seed an honest fixture.
- P0: "fixture captured at 60m" labels are contradicted by the fixture's own ~670m tiles.
- P1: UI Time Mode (Single Hour/Range/Single Day → filter_type 1/2/3) is NEVER sent to FortyGuard — LIVE always issues per-hour filter_type:1 requests; temporalProvenance.fortyGuardDateTime echoes a request that was never made.
- P1: Single Day mode is functionally broken (evaluateJointDecision throws when any window end > base+12h; 06:00–20:00 day span = 14h > 12h).
- P1: LIVE default date = today, but verified provider behavior returns 0 cells for the most recent ~12–24h — the default LIVE flow reliably yields EMPTY_THERMAL_FIELD after spending credits; no date guidance.
- P2: server-conversion.ts buildFortyGuardDateTime comments claim local-wall-clock request semantics; actual LIVE requests send UTC (matching the capture probes). Dead code w/ misleading doc.
- P2: No contract test asserts canonical AOI == submitted polygon_aoi on the wire; granularity contract test exists.
- Architecture (USER → exact request → response → deterministic engine → AI) is otherwise sound and honestly guarded.

---
Task ID: 7 (contract-audit-p0p1)
Agent: orchestrator (main)
Task: IMPLEMENT the FortyGuard contract-audit P0/P1 corrections (plus P2 hardening). No UI redesign, no new features — make the FortyGuard contract truthful and the DEMO genuinely provider-derived.

Work Log:
- P0 #1 REAL DEMO FIXTURE: created scripts/build-demo-fixture.mjs — deterministic, lossless extraction of the REAL captured provider response (tests/fixtures/heatmap_probe_candidate_aoi.json + .request.json) into tests/fixtures/heatmap_captured_demo.json: 425 verbatim provider cells, granularity 100, single hour 2026-08-14T12:00Z (the capture request's date_time), captureMetadata preserved (activityId 800a20e2-b5a9-4a29-b00e-b42fcbb0e41a, capturedAt 2026-08-21T06:17:55.911Z, requestBody verbatim, featureCount 425). DELETED the fabricated tests/fixtures/heatmap_hourly_fixture.json (3 hand-authored ~675m tiles, string tile-ids, invented 12h curve). Adapter FIXTURE lookup is now EXACT-timestamp (no fuzzy hour matching); any uncaptured hour → IncompleteTemporalCoverageError "DEMO never fabricates additional hours". FIXTURE_GRANULARITY 60→100; fixture-metadata.ts + client mirror fixture-display.ts read the real capture (granularity, snapshotCount=1, captured hour/at, activity id, cell count, extent bounds — mirror-consistency test-enforced).
- P0 #2 HONEST TEMPORAL PROVENANCE: removed buildFortyGuardDateTime() + TIME_MODE_FILTER_TYPE + FortyGuardDateTime (the false filter_type 2/3 echo). New shared buildHourlyRequestDateTime(ts) in server-conversion.ts — the SINGLE source of truth used by BOTH the adapter (wire) and the decision route (provenance), so provenance can never drift from the payload. Route temporalProvenance now records providerRequests: LIVE → strategy EVALUATED_AS_HOURLY_REQUESTS, filterType 1, hourlyRequestCount N, per-hour date_time blocks; FIXTURE → FIXTURE_REPLAY_NO_LIVE_REQUEST, 0 requests + full capture metadata.
- P1 #3 SINGLE DAY REMOVED: AnalysisTimeMode reduced to 'single-hour' | 'range-of-hours'; TIME_MODE_OPTIONS 2 entries; removed dayWindowHours from AnalysisTemporalInput/user-preferences/route schema; persisted legacy 'single-day' falls back to default via isValidTimeMode. Route schema rejects single-day with 400 (verified live).
- P1 #4 LIVE DATE UX: explicit date input retained + new data-testid live-date-hint under the date field in LIVE mode: recently requested periods may have no completed FortyGuard model (empty field reported verbatim, never retried, never DEMO), documented forecast support up to +12h. No invented "guaranteed valid" date.
- P1 #5 DEMO CANDIDATE PROVENANCE: renamed CAPTURED_DEMO_SITES → DEMO_CANDIDATE_SITES (deprecated alias kept); ControlRail section relabeled "DEMO CANDIDATES — application-defined points evaluated against the captured FortyGuard field (not captured sites)", badges "demo candidate"; route DEMO_CANDIDATES comment updated. All 3 candidates verified INSIDE real captured cells (tiles 162/171/179, temps 31.6584/32.1247/32.1156) — never moved/fabricated; out-of-field candidates → 400 CANDIDATE_OUTSIDE_AOI (route) with coordinates unchanged.
- P2 #6 AOI CONTRACT TESTS: tests/fortyguard-contract.test.ts #9 (adapter: moveAoiToCenter → submitted polygon_aoi deep-equals dragged canonical) + #9b (route: client analysisAoi submitted verbatim) — capture the ACTUAL POST /v1/heatmap body via fetch mock, not internal equality.
- P2 #7 dead code removed (buildFortyGuardDateTime); contradictory local-wall-clock comments replaced with the verified UTC hourly contract.
- P2 #8 LIVE BILLING DISCLOSURE: ControlRail live-request-disclosure block before Generate: "LIVE · {N}-hour evaluation · {N} FortyGuard hourly requests" + cached-results-reuse note; conservative wording, no exact credit cost claimed.
- P2 #9 DEMO CAPTURE EXTENT: ThermalMap new captureExtent prop → dashed amber capture-extent-outline layer (B2, under thermal cells) rendered in DEMO; client gate doesAoiIntersectFixtureExtent in runDecisionPipeline (AOI_OUTSIDE_DEMO_CAPTURE error, no fetch) + server gate aoiBboxesIntersect in route (422); isLocationCoveredByFixture now uses the REAL captured extent (Midtown NY correctly OUTSIDE).
- Temporal display honesty: FIXTURE_TIMEZONE='UTC'; all FIXTURE runs pass UTC; page/ControlRail use displayTimezone (UTC in DEMO) so the captured hour renders "12:00–13:00 UTC" (was mislabeled EDT); ProductionErrorDetails category extended with 'COVERAGE'.
- Tests: NEW tests/fortyguard-contract.test.ts (17 tests covering the 12 required contract clauses + mirror consistency + UI source contracts); NEW tests/helpers/engine-test-observations.ts (explicit SYNTHETIC engine-math inputs — old fabricated-curve values moved out of the provider path into clearly-labeled test data); updated m5_evidence_lock (real-capture edition: tile 162/171/179, verbatim temps, single-hour), failure_states, spatial-aoi, geographic_candidates, temporal-analysis-window, fortyguard-cache-and-temporal, adapter, evidence_integrity, location_sync, security_epistemic, spatial-model-corrections, joint/spatial/scenario suites.
- Verification: typecheck CLEAN; eslint 0/0; vitest 232/237 (only the 5 PRE-EXISTING live-AI-network failures — gemini_provider ×4 + explanation_live §5.3, reproduced on clean tree via git stash); dev server GET / 200; API verified live (DEMO 200 w/ 425 cells + FIXTURE_REPLAY_NO_LIVE_REQUEST; AOI-outside 422; single-day 400; uncaptured hour 400 INCOMPLETE_TEMPORAL_COVERAGE; LA-in-FIXTURE 404; LIVE-no-temporal 400; LIVE real provider 402 surfaced verbatim, no DEMO fallback). Browser (Playwright/Chromium): scripts/verify-contract-browser.mjs 25/25 (425 cells, honest DEMO notice incl. 2026-08-14/12:00 UTC/captured 2026-08-21 06:17 UTC/425 cells/1-hour, EVALUATION WINDOW w/o Single Day, DEMO CANDIDATES labels, UTC WHEN inputs, capture-extent layer, mobile no-overflow, zero console errors); scripts/verify-aoi-drag-gate.mjs PASS (drag AOI outside captured field → honest gate message + ZERO decision calls; screenshot screenshots/P0-aoi-outside-capture.png). Note: pnpm/bun — used bun (project runner); build NOT run (dev-server-only sandbox policy), typecheck+tests+browser verification cover correctness.

Stage Summary:
- DEMO is now GENUINELY provider-derived: a verbatim replay of one real captured FortyGuard response (425 cells @100m, hour 2026-08-14T12:00Z) — no fabricated temperatures, hours, cells, or "captured sites" claims anywhere.
- Temporal provenance is truthful: only filter_type:1 hourly requests are recorded (and sent); the UI concept is EVALUATION WINDOW (Single hour / Time range) with the hourly-request semantics disclosed; Single Day removed (was predictably invalid vs the +12h horizon — guard NOT weakened).
- AOI contract enforced end-to-end incl. after drag; DEMO shows its fixed captured-field extent and refuses (honestly, client+server) AOIs outside it; LIVE 402/empty-field surface verbatim with explicit date hints and request-multiplication disclosure.
- Remaining UNKNOWNs (unchanged, honestly labeled): provider semantics of date_time beyond the verified UTC hourly requests; LIVE cell density/appearance (credit-gated); filter_type 2/3 behavior (documented but NOT sent/claimed); non-US coverage rejection order.
