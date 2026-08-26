'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';

import { Header } from '@/components/dashboard/Header';
import { ControlRail } from '@/components/dashboard/ControlRail';
import { ThermalMapCanvas } from '@/components/dashboard/ThermalMapCanvas';
import { RecommendedOperation } from '@/components/dashboard/RecommendedOperation';
import { TopCandidates } from '@/components/dashboard/TopCandidates';
import { WhatIfPanel } from '@/components/dashboard/WhatIfPanel';
import { GroundedExplanation } from '@/components/dashboard/GroundedExplanation';
import { ErrorBanner } from '@/components/dashboard/ErrorBanner';
import { SettingsDrawer } from '@/components/SettingsDrawer';
import { useTheme } from '@/components/ThemeProvider';

import type {
  DecisionResult,
  SpatialDecisionResult,
  JointDecisionResult,
  ScenarioAnalysisResult,
  WhatIfScenarioResult,
  PolygonAOI,
} from '@/types/domain';
import type { DecisionExplanation } from '@/types/explanation';
import type { DataSourceMode } from '@/types/provenance';
import type {
  ProviderStatus,
  FortyGuardHealthResponse,
  AIHealthResponse,
  NamedLocation,
  ProductionErrorDetails,
} from '@/types/provider';
import type { ProviderCapability } from '@/types/fortyguard-capability';
import { METROPOLITAN_LOCATIONS, isLocationCoveredByFixture } from '@/lib/location/search';
import { useTempUnit } from '@/lib/temperature';
import { useUserPreferences } from '@/lib/user-preferences';
import {
  createBoundingAOI,
  isAoiWithinLimit,
  analyzeAoiAreaMi2,
  FORTYGUARD_AOI_LIMIT_MI2,
} from '@/lib/spatial/aoi';
import {
  type AnalysisTemporalInput,
  defaultTemporalInput,
  buildFixtureTemporalInput,
  deriveDurationHours,
  isValidDateStr,
  isValidTimeStr,
} from '@/lib/temporal/analysis-window';

// Dynamically import MapLibre map component to bypass SSR canvas requirement
const ThermalMap = dynamic(() => import('@/components/ThermalMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[420px] sm:h-[480px] lg:h-[520px] rounded-xl bg-surface-card flex items-center justify-center border border-border">
      <span className="text-text-muted text-xs font-mono animate-pulse">
        Initializing Hyperlocal Thermal Canvas…
      </span>
    </div>
  ),
});

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

async function safeJsonFetch<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T | null }> {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    if (!text || !text.trim()) return { ok: res.ok, data: null };
    try {
      return { ok: res.ok, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, data: null };
    }
  } catch {
    return { ok: false, data: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [prefs, prefSetters] = useUserPreferences();
  const [unit, setUnit] = useTempUnit();
  const { theme, toggleTheme } = useTheme();

  const mode: DataSourceMode = prefs.dataSourceMode;

  // ── Input state ──
  const [selectedLocation, setSelectedLocation] = useState<NamedLocation>(METROPOLITAN_LOCATIONS[0]);

  // ── Explicit WHEN inputs (Section 4) — replaces duration-only ──
  // Session-level state. date/startTime/endTime reset on location/mode change;
  // timeMode + dayWindowHours are also persisted via prefs.
  // Initial default = fixture capture (DEMO mode is the initial mode).
  const [temporalInput, setTemporalInput] = useState<AnalysisTemporalInput>(() =>
    buildFixtureTemporalInput()
  );

  // ── Canonical Analysis AOI ──
  // ONE geometry, built client-side from the user-selected location + shape +
  // size. This SAME geometry is:
  //   - Rendered as the visible AOI boundary on <ThermalMap>
  //   - Sent to /api/decision as `analysisAoi` (used by the FortyGuard adapter)
  // There is no "display AOI" vs "API AOI" split — one PolygonAOI per analysis.
  const analysisAoi: PolygonAOI = useMemo(
    () => createBoundingAOI(
      { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude },
      prefs.analysisAoiHalfSideMetres,
      prefs.analysisAreaShape,
    ),
    [selectedLocation.latitude, selectedLocation.longitude, prefs.analysisAreaShape, prefs.analysisAoiHalfSideMetres],
  );

  // AOI limit validation happens inside runDecisionPipeline (isAoiWithinLimit).
  // The documented 150 mi² ceiling is labelled as "documented" — never silently shrunk.

  // ── Provider health + capability state ──
  const [fgStatus, setFgStatus] = useState<ProviderStatus>('UNKNOWN');
  const [fgHealth, setFgHealth] = useState<FortyGuardHealthResponse | null>(null);
  const [capability, setCapability] = useState<ProviderCapability | null>(null);
  const [aiStatus, setAiStatus] = useState<ProviderStatus>('UNKNOWN');
  const [aiHealth, setAiHealth] = useState<AIHealthResponse | null>(null);

  // ── Decision pipeline state ──
  const [loading, setLoading] = useState(false);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [spatialDecision, setSpatialDecision] = useState<SpatialDecisionResult | null>(null);
  const [jointDecision, setJointDecision] = useState<JointDecisionResult | null>(null);
  const [scenarioAnalysis, setScenarioAnalysis] = useState<ScenarioAnalysisResult | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState('scenario-temporal-shift');
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [spatialField, setSpatialField] = useState<PolygonAOI | null>(null);
  const [spatialFieldMeta, setSpatialFieldMeta] = useState<{
    baseTimestamp: string;
    coverageType: string;
    description: string;
    totalEvaluatedHours: number;
  } | null>(null);
  const [errorDetails, setErrorDetails] = useState<ProductionErrorDetails | null>(null);

  // ── UI state ──
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ── Refs (stable values read inside async callbacks) ──
  const activeRequestIdRef = useRef(0);
  const modeRef = useRef(mode);
  const selectedLocationRef = useRef(selectedLocation);
  const temporalInputRef = useRef(temporalInput);
  const preferredProviderRef = useRef(prefs.preferredAIProvider);
  const selectedScenarioIdRef = useRef(selectedScenarioId);
  const jointDecisionRef = useRef<JointDecisionResult | null>(null);
  const scenarioAnalysisRef = useRef<ScenarioAnalysisResult | null>(null);
  const didMountRef = useRef(false);

  // Sync refs whenever the source values change
  useEffect(() => {
    modeRef.current = mode;
    selectedLocationRef.current = selectedLocation;
    temporalInputRef.current = temporalInput;
    preferredProviderRef.current = prefs.preferredAIProvider;
    selectedScenarioIdRef.current = selectedScenarioId;
    jointDecisionRef.current = jointDecision;
    scenarioAnalysisRef.current = scenarioAnalysis;
  }, [mode, selectedLocation, temporalInput, prefs.preferredAIProvider, selectedScenarioId, jointDecision, scenarioAnalysis]);

  // ───────────────────────────────────────────────────────────────────────────
  // Data-fetching handlers (stable; read fresh values via refs)
  // ───────────────────────────────────────────────────────────────────────────

  const checkFortyGuardHealth = useCallback(async (checkMode?: DataSourceMode) => {
    const m = checkMode ?? modeRef.current;
    setFgStatus('CHECKING');
    const { ok, data } = await safeJsonFetch<{
      success: boolean;
      health: FortyGuardHealthResponse;
      capability?: ProviderCapability | null;
    }>('/api/health/fortyguard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: m }),
    });
    if (ok && data?.success && data.health) {
      setFgHealth(data.health);
      setFgStatus(data.health.connected ? 'CONNECTED' : 'ERROR');
      if (data.capability) setCapability(data.capability);
    } else {
      setFgStatus('ERROR');
    }
  }, []);

  const checkAIHealth = useCallback(async () => {
    setAiStatus('CHECKING');
    const { ok, data } = await safeJsonFetch<{ success: boolean; health: AIHealthResponse }>('/api/health/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ preferredProvider: preferredProviderRef.current }),
    });
    if (ok && data?.success && data.health) {
      setAiHealth(data.health);
      setAiStatus(data.health.connected ? 'CONNECTED' : (data.health.configured ? 'ERROR' : 'UNKNOWN'));
    } else {
      setAiStatus('ERROR');
    }
  }, []);

  const fetchExplanation = useCallback(async (jointDec: JointDecisionResult, activeScen?: WhatIfScenarioResult) => {
    setExplaining(true);
    try {
      const { ok, data } = await safeJsonFetch<{ success: boolean; explanation: DecisionExplanation }>('/api/explain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jointDecision: jointDec,
          activeScenario: activeScen,
          preferredProvider: preferredProviderRef.current,
        }),
      });
      if (ok && data?.success && data.explanation) {
        setExplanation(data.explanation);
      }
    } catch {
      // Silently keep the previous explanation; the deterministic fallback is server-side.
    } finally {
      setExplaining(false);
    }
  }, []);

  const runDecisionPipeline = useCallback(async (
    loc: NamedLocation,
    temporal: AnalysisTemporalInput,
    tz: string,
    dataSourceMode: DataSourceMode,
  ) => {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    setErrorDetails(null);

    // Build the canonical AOI for THIS location + the user's current shape/size
    // preference. The SAME geometry is rendered on the map AND sent to FortyGuard.
    const aoi = createBoundingAOI(
      { latitude: loc.latitude, longitude: loc.longitude },
      prefs.analysisAoiHalfSideMetres,
      prefs.analysisAreaShape,
    );

    // Validate the AOI against the documented FortyGuard limit.
    if (!isAoiWithinLimit(aoi)) {
      const area = analyzeAoiAreaMi2(aoi);
      setLoading(false);
      setErrorDetails({
        code: 'AOI_EXCEEDS_PROVIDER_LIMIT',
        message: `Analysis area (${area.areaMi2.toFixed(1)} mi²) exceeds the documented FortyGuard ${FORTYGUARD_AOI_LIMIT_MI2} mi² AOI limit.`,
        recoverySuggestion: 'Pick a smaller AOI size in the Analysis Area control, then generate again.',
        category: 'VALIDATION',
      });
      return;
    }

    // Validate the explicit temporal input before sending (Section 7).
    if (!isValidDateStr(temporal.date) || !isValidTimeStr(temporal.startTime) || !isValidTimeStr(temporal.endTime)) {
      setLoading(false);
      setErrorDetails({
        code: 'TEMPORAL_INPUT_INVALID',
        message: 'The WHEN inputs are incomplete or invalid. Set a valid date and HH:MM times.',
        recoverySuggestion: 'Set the Date, Start, and End fields in the WHEN section.',
        category: 'VALIDATION',
      });
      return;
    }

    try {
      const body: Record<string, unknown> = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        // durationHours is now DERIVED from the explicit temporal input
        // (Section 4). Sent for backward-compat; the route also derives it.
        durationHours: deriveDurationHours(temporal),
        mode: dataSourceMode,
        granularity: prefs.analysisResolution,
        analysisAreaShape: prefs.analysisAreaShape,
        // Canonical analysis AOI — the EXACT geometry rendered on the map.
        analysisAoi: aoi,
        // Explicit WHEN inputs (Section 4) — the server converts local→UTC
        // at the adapter boundary (Section 6). The AI never does time conversion.
        temporalInput: temporal,
        timezone: tz,
      };

      const { ok, data } = await safeJsonFetch<{
        success: boolean;
        decision?: DecisionResult;
        spatialDecision?: SpatialDecisionResult;
        jointDecision?: JointDecisionResult;
        scenarioAnalysis?: ScenarioAnalysisResult;
        spatialField?: PolygonAOI | null;
        spatialFieldMetadata?: typeof spatialFieldMeta;
        error?: ProductionErrorDetails;
      }>('/api/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Discard stale responses
      if (requestId !== activeRequestIdRef.current) return;

      if (!ok || !data || !data.success || data.error) {
        setDecision(null);
        setSpatialDecision(null);
        setJointDecision(null);
        setScenarioAnalysis(null);
        setExplanation(null);
        setSpatialField(null);
        setSpatialFieldMeta(null);
        if (data?.error) {
          setErrorDetails(data.error);
        }
        if (dataSourceMode === 'LIVE') setFgStatus('ERROR');
        return;
      }

      setDecision(data.decision ?? null);
      setSpatialDecision(data.spatialDecision ?? null);
      setJointDecision(data.jointDecision ?? null);
      setScenarioAnalysis(data.scenarioAnalysis ?? null);
      setSpatialField(data.spatialField ?? null);
      setSpatialFieldMeta(data.spatialFieldMetadata ?? null);
      setErrorDetails(null);

      if (data.jointDecision) {
        const activeScen = data.scenarioAnalysis?.scenarios?.find(
          (s) => s.scenarioId === selectedScenarioIdRef.current
        ) ?? data.scenarioAnalysis?.scenarios?.[0];
        fetchExplanation(data.jointDecision, activeScen);
      }
    } catch {
      if (requestId !== activeRequestIdRef.current) return;
      setDecision(null);
      setSpatialDecision(null);
      setJointDecision(null);
      setScenarioAnalysis(null);
      setExplanation(null);
      setSpatialField(null);
      setSpatialFieldMeta(null);
      setErrorDetails({
        code: 'PIPELINE_NETWORK_ERROR',
        message: 'Could not reach the decision engine. Please retry.',
        recoverySuggestion: 'Check your connection and try again, or switch to DEMO mode.',
        category: 'PROVIDER',
      });
    } finally {
      if (requestId === activeRequestIdRef.current) setLoading(false);
    }
  }, [fetchExplanation, prefs.analysisResolution, prefs.analysisAreaShape, prefs.analysisAoiHalfSideMetres]);

  const handleSelectLocation = useCallback((loc: NamedLocation) => {
    setSelectedLocation(loc);
    selectedLocationRef.current = loc;
    // When switching to a fixture-covered location in DEMO mode, reset the
    // WHEN inputs to the fixture capture window so the displayed date/time
    // matches the fixture data (Section 10 — never "Today" for a capture).
    if (modeRef.current === 'FIXTURE' && isLocationCoveredByFixture(loc)) {
      const fixtureTemporal = buildFixtureTemporalInput();
      setTemporalInput(fixtureTemporal);
      temporalInputRef.current = fixtureTemporal;
    } else if (modeRef.current === 'LIVE') {
      // LIVE: default to today's date in the new location's timezone.
      const liveDefault = defaultTemporalInput(loc.timezone);
      setTemporalInput(liveDefault);
      temporalInputRef.current = liveDefault;
    }
    // Clear model state
    setDecision(null);
    setSpatialDecision(null);
    setJointDecision(null);
    setScenarioAnalysis(null);
    setExplanation(null);
    setSpatialField(null);
    setSpatialFieldMeta(null);
    setErrorDetails(null);
  }, []);

  const handleTemporalChange = useCallback((next: AnalysisTemporalInput) => {
    setTemporalInput(next);
    temporalInputRef.current = next;
  }, []);

  const handleModeChange = useCallback((newMode: DataSourceMode) => {
    prefSetters.setDataSourceMode(newMode);
    // Side effects (clear + re-check + re-run) handled by the mode-change effect below.
  }, [prefSetters]);

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  // Initial mount: check health + run the initial DEMO pipeline.
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      safeJsonFetch<{
        success: boolean;
        health: FortyGuardHealthResponse;
        capability?: ProviderCapability | null;
      }>('/api/health/fortyguard', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'FIXTURE' }),
      }).then(({ ok, data }) => {
        if (isMounted && ok && data?.success && data.health) {
          setFgHealth(data.health);
          setFgStatus(data.health.connected ? 'CONNECTED' : 'ERROR');
          if (data.capability) setCapability(data.capability);
        }
      }).catch(() => {}),
      safeJsonFetch('/api/health/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferredProvider: preferredProviderRef.current }),
      }).then(({ ok, data }) => {
        if (isMounted && ok && data?.success && (data as { health: AIHealthResponse }).health) {
          const h = (data as { health: AIHealthResponse }).health;
          setAiHealth(h);
          setAiStatus(h.connected ? 'CONNECTED' : (h.configured ? 'ERROR' : 'UNKNOWN'));
        }
      }).catch(() => {}),
    ]).then(() => {
      if (isMounted) {
        // Initial DEMO pipeline with the fixture capture temporal input.
        const fixtureTemporal = buildFixtureTemporalInput();
        setTemporalInput(fixtureTemporal);
        temporalInputRef.current = fixtureTemporal;
        runDecisionPipeline(
          METROPOLITAN_LOCATIONS[0],
          fixtureTemporal,
          METROPOLITAN_LOCATIONS[0].timezone || 'America/New_York',
          'FIXTURE'
        );
      }
    });
    return () => { isMounted = false; };
  }, []);

  // React to mode changes (from Settings drawer or "Switch to LIVE" button).
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return; // initial mount handled above
    }
    const newMode = mode;
    // Clear model state on mode switch
    setDecision(null);
    setSpatialDecision(null);
    setJointDecision(null);
    setScenarioAnalysis(null);
    setExplanation(null);
    setSpatialField(null);
    setSpatialFieldMeta(null);
    setErrorDetails(null);

    checkFortyGuardHealth(newMode);

    // Reset the WHEN inputs to match the new mode's data source.
    // DEMO → fixture capture (Section 10). LIVE → today in the location's tz (Section 7).
    let loc = selectedLocationRef.current;
    if (newMode === 'FIXTURE' && !isLocationCoveredByFixture(loc)) {
      loc = METROPOLITAN_LOCATIONS[0];
      setSelectedLocation(loc);
      selectedLocationRef.current = loc;
    }

    const newTemporal = newMode === 'FIXTURE'
      ? buildFixtureTemporalInput()
      : defaultTemporalInput(loc.timezone);
    setTemporalInput(newTemporal);
    temporalInputRef.current = newTemporal;

    if (newMode === 'LIVE' || isLocationCoveredByFixture(loc)) {
      runDecisionPipeline(loc, newTemporal, loc.timezone || 'UTC', newMode);
    }
  }, [mode]);

  // React to preferred-AI-provider changes (from Settings drawer).
  useEffect(() => {
    if (!didMountRef.current) return;
    checkAIHealth();
    if (jointDecisionRef.current) {
      const activeScen = scenarioAnalysisRef.current?.scenarios?.find(
        (s) => s.scenarioId === selectedScenarioIdRef.current
      ) ?? scenarioAnalysisRef.current?.scenarios?.[0];
      fetchExplanation(jointDecisionRef.current, activeScen);
    }
  }, [prefs.preferredAIProvider]);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived values
  // ───────────────────────────────────────────────────────────────────────────

  const isFixtureMismatch = mode === 'FIXTURE' && !isLocationCoveredByFixture(selectedLocation);
  const activeScenario = scenarioAnalysis?.scenarios?.find((s) => s.scenarioId === selectedScenarioId) ?? scenarioAnalysis?.scenarios?.[0];
  const fieldReady = !!spatialField && !loading;
  const altLocations = METROPOLITAN_LOCATIONS.filter((l) => !l.isDemoOnly).slice(0, 4);
  const thermalCellCount = spatialField?.features?.length ?? 0;
  const aiProvider = aiHealth?.provider;

  const handleSelectScenario = useCallback((scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    selectedScenarioIdRef.current = scenarioId;
    if (jointDecisionRef.current) {
      const sc = scenarioAnalysisRef.current?.scenarios?.find((s) => s.scenarioId === scenarioId);
      fetchExplanation(jointDecisionRef.current, sc);
    }
  }, [fetchExplanation]);

  const handleRefreshExplanation = useCallback(() => {
    if (jointDecisionRef.current) {
      const activeScen = scenarioAnalysisRef.current?.scenarios?.find(
        (s) => s.scenarioId === selectedScenarioIdRef.current
      ) ?? scenarioAnalysisRef.current?.scenarios?.[0];
      fetchExplanation(jointDecisionRef.current, activeScen);
    }
  }, [fetchExplanation]);

  const handleGenerate = useCallback(() => {
    runDecisionPipeline(
      selectedLocationRef.current,
      temporalInputRef.current,
      selectedLocationRef.current.timezone || 'UTC',
      modeRef.current
    );
  }, [runDecisionPipeline]);

  const handleRetry = useCallback(() => {
    runDecisionPipeline(
      selectedLocationRef.current,
      temporalInputRef.current,
      selectedLocationRef.current.timezone || 'UTC',
      modeRef.current
    );
  }, [runDecisionPipeline]);

  const handleSelectAltLocation = useCallback((loc: NamedLocation) => {
    setSelectedLocation(loc);
    selectedLocationRef.current = loc;
    const liveDefault = defaultTemporalInput(loc.timezone);
    setTemporalInput(liveDefault);
    temporalInputRef.current = liveDefault;
    runDecisionPipeline(loc, liveDefault, loc.timezone || 'UTC', 'LIVE');
  }, [runDecisionPipeline]);

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen flex flex-col bg-surface-bg text-text-primary" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Header
        mode={mode}
        unit={unit}
        onToggleUnit={setUnit}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        fortyGuardStatus={fgStatus}
        aiStatus={aiStatus}
        aiProvider={aiProvider}
      />

      <div className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-5 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
          {/* LEFT CONTROL RAIL */}
          <div className="lg:col-span-4 xl:col-span-3">
            <ControlRail
              mode={mode}
              selectedLocation={selectedLocation}
              temporalInput={temporalInput}
              onTemporalChange={handleTemporalChange}
              onGenerate={handleGenerate}
              loading={loading}
              onSelectLocation={handleSelectLocation}
              onSwitchToLive={() => handleModeChange('LIVE')}
              fortyGuardStatus={fgStatus}
              fortyGuardHealth={fgHealth}
              aiStatus={aiStatus}
              aiHealth={aiHealth}
              fieldReady={fieldReady}
              onTestFortyGuard={() => checkFortyGuardHealth(mode)}
              onTestAI={checkAIHealth}
            />
          </div>

          {/* MAIN CANVAS */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-5">
            {/* Error banner (highest priority in main canvas when present) */}
            {errorDetails && (
              <ErrorBanner
                errorDetails={errorDetails}
                mode={mode}
                altLocations={altLocations}
                onRetry={handleRetry}
                onSwitchToDemo={() => handleModeChange('FIXTURE')}
                onSelectAltLocation={handleSelectAltLocation}
              />
            )}

            {/* 1. FORTYGUARD THERMAL FIELD — the visual hero */}
            <ThermalMapCanvas
              locationName={selectedLocation.name}
              baseTimestamp={spatialFieldMeta?.baseTimestamp}
              thermalCellCount={thermalCellCount}
              resolution={prefs.analysisResolution}
              mode={mode}
              loading={loading}
              selectedLocation={selectedLocation}
              temporalInput={temporalInput}
              timezone={selectedLocation.timezone}
              rankedCandidates={spatialDecision?.rankedLocations.map((r) => ({
                locationId: r.locationId,
                name: r.name,
                location: r.location,
              }))}
              recommendedLocationId={spatialDecision?.recommendedLocation.locationId}
            >
              <ThermalMap
                location={{ latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }}
                analysisAoi={analysisAoi}
                spatialField={spatialField}
                selectedTileId={decision?.evidenceBundle.selectedTileId}
                candidates={spatialDecision?.rankedLocations.map((r) => ({
                  locationId: r.locationId,
                  name: r.name,
                  location: r.location,
                }))}
                recommendedLocationId={spatialDecision?.recommendedLocation.locationId}
                unit={unit}
              />
            </ThermalMapCanvas>

            {/* 2. RECOMMENDED OPERATION */}
            {jointDecision && !errorDetails && (
              <RecommendedOperation
                jointDecision={jointDecision}
                unit={unit}
                timezone={selectedLocation.timezone}
                mode={mode}
                temporalInput={temporalInput}
              />
            )}

            {/* 3. TOP CANDIDATES */}
            {jointDecision && !errorDetails && (
              <TopCandidates
                jointDecision={jointDecision}
                unit={unit}
                timezone={selectedLocation.timezone}
              />
            )}

            {/* 4. WHAT-IF */}
            {scenarioAnalysis && scenarioAnalysis.scenarios.length > 0 && !errorDetails && (
              <WhatIfPanel
                scenarioAnalysis={scenarioAnalysis}
                selectedScenarioId={selectedScenarioId}
                onSelectScenario={handleSelectScenario}
                unit={unit}
                timezone={selectedLocation.timezone}
              />
            )}

            {/* 5. GROUNDED AI EXPLANATION (subdued — not the hero) */}
            {explanation && !errorDetails && (
              <GroundedExplanation
                explanation={explanation}
                unit={unit}
                timezone={selectedLocation.timezone}
                explaining={explaining}
                onRefresh={handleRefreshExplanation}
              />
            )}

            {/* Empty state before first run */}
            {!jointDecision && !loading && !errorDetails && (
              <div className="rounded-xl border border-border bg-surface-card px-5 py-12 text-center">
                <div className="text-2xl mb-2">🌡</div>
                <p className="text-text-muted text-sm font-medium">Generate a thermal field to see the recommended operational plan.</p>
                <p className="text-text-dimmed text-xs mt-1">Select a location, set the WHEN date/time, then click Generate.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SETTINGS DRAWER — now surfaces provider capability (Section 1) */}
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} capability={capability} />
    </main>
  );
}
