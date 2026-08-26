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
