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
  CandidateLocation,
  LocationPoint,
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
import { useCandidateSites } from '@/hooks/use-candidate-sites';
import {
  createAoiFromSpan,
  isPointInAoi,
  isAoiWithinLimit,
  analyzeAoiAreaMi2,
  FORTYGUARD_AOI_LIMIT_MI2,
} from '@/lib/spatial/aoi';
import { getRegionBoundaryPolygon, getInvertedMaskPolygon } from '@/lib/spatial/region-boundaries';
import { cameraForResultType, type SelectionCameraBehavior as CameraBehavior } from '@/lib/location/selection-behavior';
import {
  FIXTURE_DISPLAY_GRANULARITY,
  DEMO_CANDIDATE_SITES,
  FIXTURE_EXTENT_AOI,
  doesAoiIntersectFixtureExtent,
} from '@/lib/fortyguard/fixture-display';
import {
  type AnalysisTemporalInput,
  defaultTemporalInput,
  buildFixtureTemporalInput,
  deriveDurationHours,
  isValidDateStr,
  isValidTimeStr,
  FIXTURE_TIMEZONE,
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

  // ── Explicit WHEN inputs (Section 14) ──
  const [temporalInput, setTemporalInput] = useState<AnalysisTemporalInput>(() =>
    buildFixtureTemporalInput()
  );

  // ── Canonical AOI center (movable — Section 4) ──
  // The AOI starts at the selected location's coordinates and can be DRAGGED
  // on the map. The moved geometry is canonical: rendered == sent to FortyGuard.
  const [aoiCenter, setAoiCenter] = useState<LocationPoint>(() => ({
    latitude: METROPOLITAN_LOCATIONS[0].latitude,
    longitude: METROPOLITAN_LOCATIONS[0].longitude,
  }));

  // ── Geographic region context (Section 5 + 13) ──
  // A state/region selection sets CONTEXT ONLY — it never moves the analysis
  // point to the state's geographic center.
  const [regionName, setRegionName] = useState<string | undefined>(
    METROPOLITAN_LOCATIONS[0].state
  );
  const [stateLevelSelection, setStateLevelSelection] = useState<NamedLocation | null>(null);

  // ── Camera control (Section 12) ──
  const [cameraBehavior, setCameraBehavior] = useState<CameraBehavior>('fit-aoi');
  const [cameraNonce, setCameraNonce] = useState(0);
  const requestCamera = useCallback((behavior: CameraBehavior) => {
    setCameraBehavior(behavior);
    setCameraNonce((n) => n + 1);
  }, []);

  // ── Add-candidate-site mode (Section 8) ──
  const [addSiteMode, setAddSiteMode] = useState(false);

  // ── Candidate sites (REAL sites only — never generated) ──
  const candidateSites = useCandidateSites();

  // ── Canonical Analysis AOI (ONE geometry: rendered == sent) ──
  const analysisAoi: PolygonAOI = useMemo(
    () => createAoiFromSpan(aoiCenter, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape),
    [aoiCenter, prefs.analysisAreaShape, prefs.analysisAoiSpanMetres],
  );

  // Geographic region boundary polygon (geographic CONTEXT — never provider coverage)
  const regionBoundary: PolygonAOI | null = useMemo(
    () => getRegionBoundaryPolygon(
      regionName,
      selectedLocation.city,
      aoiCenter.latitude,
      aoiCenter.longitude,
    ),
    [regionName, selectedLocation.city, aoiCenter.latitude, aoiCenter.longitude],
  );

  // Inverted mask polygon that dims everything OUTSIDE the selected region
  const regionMask: PolygonAOI | null = useMemo(
    () => getInvertedMaskPolygon(regionBoundary),
    [regionBoundary],
  );

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
  const aoiCenterRef = useRef(aoiCenter);
  const temporalInputRef = useRef(temporalInput);
  const preferredProviderRef = useRef(prefs.preferredAIProvider);
  const selectedScenarioIdRef = useRef(selectedScenarioId);
  const jointDecisionRef = useRef<JointDecisionResult | null>(null);
  const scenarioAnalysisRef = useRef<ScenarioAnalysisResult | null>(null);
  const didMountRef = useRef(false);
  const candidateSitesRef = useRef(candidateSites.sites);

  // Sync refs whenever the source values change
  useEffect(() => {
    modeRef.current = mode;
    selectedLocationRef.current = selectedLocation;
    aoiCenterRef.current = aoiCenter;
    temporalInputRef.current = temporalInput;
    preferredProviderRef.current = prefs.preferredAIProvider;
    selectedScenarioIdRef.current = selectedScenarioId;
    jointDecisionRef.current = jointDecision;
    scenarioAnalysisRef.current = scenarioAnalysis;
    candidateSitesRef.current = candidateSites.sites;
  }, [mode, selectedLocation, aoiCenter, temporalInput, prefs.preferredAIProvider, selectedScenarioId, jointDecision, scenarioAnalysis, candidateSites.sites]);

  // ───────────────────────────────────────────────────────────────────────────
  // Clear stale results (Section 20: stale thermal cleared on location/AOI change)
  // ───────────────────────────────────────────────────────────────────────────
  const clearResults = useCallback(() => {
    setDecision(null);
    setSpatialDecision(null);
    setJointDecision(null);
    setScenarioAnalysis(null);
    setExplanation(null);
    setSpatialField(null);
    setSpatialFieldMeta(null);
    setErrorDetails(null);
  }, []);

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

  /**
   * Run the decision pipeline with an EXPLICIT canonical AOI geometry.
   * The geometry passed here is EXACTLY what is rendered on the map — the
   * rendered AOI == the API AOI, including after the user drags it.
   */
  const runDecisionPipeline = useCallback(async (
    loc: NamedLocation,
    aoi: PolygonAOI,
    temporal: AnalysisTemporalInput,
    tz: string,
    dataSourceMode: DataSourceMode,
    candidates?: CandidateLocation[],
  ) => {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    setErrorDetails(null);

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

    // Validate the explicit temporal input before sending (Section 14).
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

    // LIVE mode: candidates are REQUIRED (Section 8 — never fabricated).
    if (dataSourceMode === 'LIVE' && (!candidates || candidates.length === 0)) {
      setLoading(false);
      setErrorDetails({
        code: 'CANDIDATES_REQUIRED',
        message: 'No candidate sites provided. LIVE mode never fabricates candidate sites — add at least one candidate site inside the analysis area.',
        recoverySuggestion: 'Use "+ Site" on the map (click inside the analysis area) or add a site from search, then Generate again.',
        category: 'VALIDATION',
      });
      return;
    }

    // LIVE mode: every candidate must lie INSIDE the canonical AOI (Section 9).
    if (dataSourceMode === 'LIVE' && candidates) {
      const outside = candidates.find((c) => !isPointInAoi(c.location, aoi));
      if (outside) {
        setLoading(false);
        setErrorDetails({
          code: 'CANDIDATE_OUTSIDE_AOI',
          message: `Candidate site "${outside.name}" is outside the analysis area.`,
          recoverySuggestion: 'Move the candidate inside the analysis area (or drag the AOI to cover it), then Generate again.',
          category: 'VALIDATION',
        });
        return;
      }
    }

    // DEMO capture-extent gate (P2): DEMO replays ONE fixed captured field.
    // If the AOI was dragged outside the captured extent, no provider data can
    // exist for it — we do NOT invent thermal data and do NOT call the API.
    if (dataSourceMode === 'FIXTURE' && !doesAoiIntersectFixtureExtent(aoi)) {
      setLoading(false);
      setErrorDetails({
        code: 'AOI_OUTSIDE_DEMO_CAPTURE',
        message: 'The selected analysis area is outside the captured DEMO dataset. DEMO uses one fixed captured FortyGuard field — moving the AOI does not produce new provider data.',
        recoverySuggestion: 'Drag the analysis area back inside the captured-field boundary (dashed outline), or switch to LIVE mode to request fresh FortyGuard data.',
        category: 'COVERAGE',
      });
      return;
    }

    try {
      const body: Record<string, unknown> = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        durationHours: deriveDurationHours(temporal),
        mode: dataSourceMode,
        granularity: prefs.analysisResolution,
        analysisAreaShape: prefs.analysisAreaShape,
        // Canonical analysis AOI — the EXACT geometry rendered on the map
        // (including any drag the user performed).
        analysisAoi: aoi,
        temporalInput: temporal,
        timezone: tz,
      };

      // FIXTURE mode sends NO candidates — the server uses the actual three
      // captured Manhattan sites. LIVE sends the user's real candidates.
      if (dataSourceMode === 'LIVE' && candidates && candidates.length > 0) {
        body.candidates = candidates.map((c) => ({
          locationId: c.locationId,
          name: c.name,
          latitude: c.location.latitude,
          longitude: c.location.longitude,
        }));
      }

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
  }, [fetchExplanation, prefs.analysisResolution, prefs.analysisAreaShape]);

  /**
   * Location selection (Section 7 + 13):
   *   - STATE/REGION result → geographic context ONLY: show boundary, dim the
   *     outside, fit the region. The analysis point does NOT move.
   *   - CITY/NEIGHBORHOOD → move map + AOI to the city; region stays context.
   *   - STREET/ADDRESS/POI → zoom directly to the point; AOI recenters there.
   */
  const handleSelectLocation = useCallback((loc: NamedLocation) => {
    // ── State-level selection: context only, no analysis-point move ──
    if (loc.resultType === 'state' || loc.resultType === 'region') {
      setStateLevelSelection(loc);
      setRegionName(loc.state || loc.name);
      requestCamera('fit-region');
      return;
    }

    // ── City / neighborhood / street / address / POI selection ──
    setStateLevelSelection(null);
    setSelectedLocation(loc);
    selectedLocationRef.current = loc;

    const nextCenter = { latitude: loc.latitude, longitude: loc.longitude };
    setAoiCenter(nextCenter);
    aoiCenterRef.current = nextCenter;

    if (loc.state) setRegionName(loc.state);

    // Clear stale model state (Section 20)
    clearResults();

    // Camera: streets/addresses zoom to the point; cities fit the AOI context.
    requestCamera(cameraForResultType(loc.resultType));

    if (modeRef.current === 'FIXTURE') {
      const fixtureTemporal = buildFixtureTemporalInput();
      setTemporalInput(fixtureTemporal);
      temporalInputRef.current = fixtureTemporal;
      const aoi = createAoiFromSpan(nextCenter, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape);
      // DEMO times are UTC-anchored (the capture's request hour) — never
      // silently re-anchored to the selected location's timezone.
      runDecisionPipeline(loc, aoi, fixtureTemporal, FIXTURE_TIMEZONE, 'FIXTURE');
    } else {
      // LIVE: require explicit Generate (never silently spend credits)
      const liveDefault = defaultTemporalInput(loc.timezone);
      setTemporalInput(liveDefault);
      temporalInputRef.current = liveDefault;
    }
  }, [clearResults, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape, requestCamera, runDecisionPipeline]);

  const handleTemporalChange = useCallback((next: AnalysisTemporalInput) => {
    setTemporalInput(next);
    temporalInputRef.current = next;
  }, []);

  const handleModeChange = useCallback((newMode: DataSourceMode) => {
    prefSetters.setDataSourceMode(newMode);
    // Side effects handled by the mode-change effect below.
  }, [prefSetters]);

  /**
   * AOI moved by dragging (Section 4): the moved geometry becomes canonical.
   * Preserves size, shape, date/time, resolution — updates the center +
   * displayed coordinates, clears stale thermal data.
   */
  const handleMoveAoi = useCallback((newCenter: LocationPoint) => {
    setAoiCenter(newCenter);
    aoiCenterRef.current = newCenter;
    candidateSites.validateAgainstAoi(
      createAoiFromSpan(newCenter, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape)
    );
    clearResults();
    requestCamera('fit-aoi');
    if (modeRef.current === 'FIXTURE') {
      const aoi = createAoiFromSpan(newCenter, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape);
      runDecisionPipeline(
        selectedLocationRef.current,
        aoi,
        temporalInputRef.current,
        FIXTURE_TIMEZONE,
        'FIXTURE'
      );
    }
    // LIVE: require explicit Generate after moving the AOI.
  }, [candidateSites, clearResults, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape, requestCamera, runDecisionPipeline]);

  /** Map click while in add-site mode (Section 8 — real user-placed sites). */
  const handleAddSiteAt = useCallback((lng: number, lat: number) => {
    const aoi = createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape);
    const inside = isPointInAoi({ latitude: lat, longitude: lng }, aoi);
    if (!inside) {
      setErrorDetails({
        code: 'CANDIDATE_OUTSIDE_AOI',
        message: 'That map point is outside the analysis area.',
        recoverySuggestion: 'Click inside the analysis-area boundary (or drag the AOI to cover the point), then try again.',
        category: 'VALIDATION',
      });
      return;
    }
    setErrorDetails(null);
    candidateSites.addSiteAt(lat, lng);
  }, [candidateSites, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape]);

  const handleRemoveSite = useCallback((locationId: string) => {
    candidateSites.removeSite(locationId);
    clearResults();
  }, [candidateSites, clearResults]);

  const handleRenameSite = useCallback((locationId: string, name: string) => {
    candidateSites.renameSite(locationId, name);
  }, [candidateSites]);

  /** Add a candidate from a searched location (search result → candidate site). */
  const handleAddSiteFromSearch = useCallback((loc: NamedLocation) => {
    const aoi = createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape);
    const inside = isPointInAoi({ latitude: loc.latitude, longitude: loc.longitude }, aoi);
    if (!inside) {
      setErrorDetails({
        code: 'CANDIDATE_OUTSIDE_AOI',
        message: `"${loc.name}" is outside the analysis area.`,
        recoverySuggestion: 'Pick a site inside the analysis area (or drag the AOI to cover it).',
        category: 'VALIDATION',
      });
      return;
    }
    setErrorDetails(null);
    candidateSites.addSiteAt(loc.latitude, loc.longitude, loc.name.split(',')[0], 'search');
  }, [candidateSites, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape]);

  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  // Initial mount: trigger DEMO decision pipeline immediately + check health in parallel.
  useEffect(() => {
    let isMounted = true;

    // 1. Instantly fire the DEMO decision pipeline on initial mount (free fixture lookup)
    const fixtureTemporal = buildFixtureTemporalInput();
    setTemporalInput(fixtureTemporal);
    temporalInputRef.current = fixtureTemporal;
    const aoi = createAoiFromSpan(
      { latitude: METROPOLITAN_LOCATIONS[0].latitude, longitude: METROPOLITAN_LOCATIONS[0].longitude },
      prefs.analysisAoiSpanMetres,
      prefs.analysisAreaShape,
    );
    runDecisionPipeline(
      METROPOLITAN_LOCATIONS[0],
      aoi,
      fixtureTemporal,
      FIXTURE_TIMEZONE,
      'FIXTURE'
    );

    // 2. Run provider health checks in the background (non-blocking)
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
    }).catch(() => {});

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
    }).catch(() => {});

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
    clearResults();

    checkFortyGuardHealth(newMode);

    let loc = selectedLocationRef.current;
    if (newMode === 'FIXTURE' && !isLocationCoveredByFixture(loc)) {
      loc = METROPOLITAN_LOCATIONS[0];
      setSelectedLocation(loc);
      selectedLocationRef.current = loc;
      const nextCenter = { latitude: loc.latitude, longitude: loc.longitude };
      setAoiCenter(nextCenter);
      aoiCenterRef.current = nextCenter;
    }

    // Reset the WHEN inputs to match the new mode's data source.
    const newTemporal = newMode === 'FIXTURE'
      ? buildFixtureTemporalInput()
      : defaultTemporalInput(loc.timezone);
    setTemporalInput(newTemporal);
    temporalInputRef.current = newTemporal;

    if (newMode === 'FIXTURE') {
      // DEMO is free (captured fixture) — auto-run for instant feedback.
      const aoi = createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape);
      runDecisionPipeline(loc, aoi, newTemporal, FIXTURE_TIMEZONE, 'FIXTURE');
    }
    // LIVE: require explicit Generate — never auto-spend provider credits.
     
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

  // React to AOI shape / size / resolution changes:
  //   ALWAYS clear stale thermal data (Section 20).
  //   FIXTURE auto-reruns (free). LIVE requires explicit Generate (credit safety).
  useEffect(() => {
    if (!didMountRef.current) return;
    clearResults();
    candidateSites.validateAgainstAoi(
      createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape)
    );
    if (modeRef.current === 'FIXTURE') {
      const aoi = createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape);
      runDecisionPipeline(
        selectedLocationRef.current,
        aoi,
        temporalInputRef.current,
        FIXTURE_TIMEZONE,
        'FIXTURE'
      );
    }
     
  }, [prefs.analysisAreaShape, prefs.analysisAoiSpanMetres, prefs.analysisResolution]);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived values
  // ───────────────────────────────────────────────────────────────────────────

  const isFixtureMismatch = mode === 'FIXTURE' && !isLocationCoveredByFixture(selectedLocation);
  const activeScenario = scenarioAnalysis?.scenarios?.find((s) => s.scenarioId === selectedScenarioId) ?? scenarioAnalysis?.scenarios?.[0];
  const fieldReady = !!spatialField && !loading;
  const altLocations = METROPOLITAN_LOCATIONS.filter((l) => !l.isDemoOnly).slice(0, 4);
  const thermalCellCount = spatialField?.features?.length ?? 0;
  const aiProvider = aiHealth?.provider;

  // Candidates to display on the map + evaluate:
  //   FIXTURE → the three DEMO CANDIDATES (application-defined points
  //             evaluated against the captured field — not captured sites).
  //   LIVE    → the user's real candidate sites only.
  const displayCandidates: CandidateLocation[] = mode === 'FIXTURE'
    ? DEMO_CANDIDATE_SITES
    : candidateSites.sites.map((s) => ({
        locationId: s.locationId,
        name: s.name,
        location: s.location,
      }));

  // Resolution display (Section 2): DEMO shows the fixture's ACTUAL captured
  // granularity; LIVE shows the provider granularity that will be sent.
  const resolutionDisplay = mode === 'FIXTURE' ? FIXTURE_DISPLAY_GRANULARITY : prefs.analysisResolution;

  // Display timezone: DEMO is UTC-anchored (the capture's request hour is a
  // UTC instant) — displaying it in the selected location's timezone would
  // MISLABEL the captured wall-clock. LIVE uses the location's timezone.
  const displayTimezone = mode === 'FIXTURE' ? FIXTURE_TIMEZONE : (selectedLocation.timezone || 'UTC');

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
    setAddSiteMode(false);
    runDecisionPipeline(
      selectedLocationRef.current,
      createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape),
      temporalInputRef.current,
      selectedLocationRef.current.timezone || 'UTC',
      modeRef.current,
      modeRef.current === 'LIVE'
        ? candidateSitesRef.current.map((s) => ({
            locationId: s.locationId,
            name: s.name,
            location: s.location,
          }))
        : undefined
    );
  }, [runDecisionPipeline, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape]);

  const handleRetry = useCallback(() => {
    runDecisionPipeline(
      selectedLocationRef.current,
      createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape),
      temporalInputRef.current,
      selectedLocationRef.current.timezone || 'UTC',
      modeRef.current,
      modeRef.current === 'LIVE'
        ? candidateSitesRef.current.map((s) => ({
            locationId: s.locationId,
            name: s.name,
            location: s.location,
          }))
        : undefined
    );
  }, [runDecisionPipeline, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape]);

  // Credit safety: selecting an alternative location NEVER triggers a provider
  // request by itself. It updates the selection + WHEN defaults and clears the
  // previous results; the user explicitly presses Generate to spend credits.
  const handleSelectAltLocation = useCallback((loc: NamedLocation) => {
    setStateLevelSelection(null);
    setSelectedLocation(loc);
    selectedLocationRef.current = loc;
    const nextCenter = { latitude: loc.latitude, longitude: loc.longitude };
    setAoiCenter(nextCenter);
    aoiCenterRef.current = nextCenter;
    if (loc.state) setRegionName(loc.state);
    if (modeRef.current === 'FIXTURE' && isLocationCoveredByFixture(loc)) {
      const fixtureTemporal = buildFixtureTemporalInput();
      setTemporalInput(fixtureTemporal);
      temporalInputRef.current = fixtureTemporal;
    } else {
      const liveDefault = defaultTemporalInput(loc.timezone);
      setTemporalInput(liveDefault);
      temporalInputRef.current = liveDefault;
    }
    clearResults();
    requestCamera(cameraForResultType(loc.resultType));
  }, [clearResults, requestCamera]);

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
              analysisCenter={aoiCenter}
              stateLevelSelection={stateLevelSelection}
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
              candidateSites={candidateSites.sites}
              onRemoveSite={handleRemoveSite}
              onRenameSite={handleRenameSite}
              onToggleAddSiteMode={() => setAddSiteMode((v) => !v)}
              addSiteMode={addSiteMode}
              onAddSiteFromSearch={handleAddSiteFromSearch}
              fixtureGranularity={FIXTURE_DISPLAY_GRANULARITY}
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
              resolution={resolutionDisplay}
              mode={mode}
              loading={loading}
              selectedLocation={selectedLocation}
              analysisCenter={aoiCenter}
              temporalInput={temporalInput}
              timezone={displayTimezone}
              rankedCandidates={spatialDecision?.rankedLocations.map((r) => ({
                locationId: r.locationId,
                name: r.name,
                location: r.location,
              }))}
              recommendedLocationId={spatialDecision?.recommendedLocation.locationId}
            >
              <ThermalMap
                location={aoiCenter}
                locationState={selectedLocation.state}
                locationName={selectedLocation.name}
                regionBoundary={regionBoundary}
                regionMask={regionMask}
                regionDisplayName={regionName}
                analysisAoi={analysisAoi}
                spatialField={spatialField}
                selectedTileId={decision?.evidenceBundle.selectedTileId}
                candidates={displayCandidates}
                recommendedLocationId={spatialDecision?.recommendedLocation.locationId}
                unit={unit}
                layerVisibility={prefs.mapLayerVisibility}
                onToggleLayer={prefSetters.setMapLayerVisibility}
                areaShape={prefs.analysisAreaShape}
                onMoveAoi={handleMoveAoi}
                addSiteMode={addSiteMode}
                onAddSiteAt={handleAddSiteAt}
                onToggleAddSiteMode={() => setAddSiteMode((v) => !v)}
                cameraBehavior={cameraBehavior}
                cameraNonce={cameraNonce}
                captureExtent={mode === 'FIXTURE' ? FIXTURE_EXTENT_AOI : undefined}
              />
            </ThermalMapCanvas>

            {/* 2. RECOMMENDED OPERATION */}
            {jointDecision && !errorDetails && (
              <RecommendedOperation
                jointDecision={jointDecision}
                unit={unit}
                timezone={displayTimezone}
                mode={mode}
                temporalInput={temporalInput}
              />
            )}

            {/* 3. TOP CANDIDATES */}
            {jointDecision && !errorDetails && (
              <TopCandidates
                jointDecision={jointDecision}
                unit={unit}
                timezone={displayTimezone}
              />
            )}

            {/* 4. WHAT-IF */}
            {scenarioAnalysis && scenarioAnalysis.scenarios.length > 0 && !errorDetails && (
              <WhatIfPanel
                scenarioAnalysis={scenarioAnalysis}
                selectedScenarioId={selectedScenarioId}
                onSelectScenario={handleSelectScenario}
                unit={unit}
                timezone={displayTimezone}
              />
            )}

            {/* 5. GROUNDED AI EXPLANATION (subdued — not the hero) */}
            {explanation && !errorDetails && (
              <GroundedExplanation
                explanation={explanation}
                unit={unit}
                timezone={displayTimezone}
                explaining={explaining}
                onRefresh={handleRefreshExplanation}
              />
            )}

            {/* Empty state before first run */}
            {!jointDecision && !loading && !errorDetails && (
              <div className="rounded-xl border border-border bg-surface-card px-5 py-12 text-center">
                <div className="text-2xl mb-2">🌡</div>
                <p className="text-text-muted text-sm font-medium">Generate a thermal field to see the recommended operational plan.</p>
                <p className="text-text-dimmed text-xs mt-1">
                  {mode === 'LIVE'
                    ? 'Search a location, place candidate sites (+ Site on the map), set the WHEN date/time, then click Generate.'
                    : 'Select a location, set the WHEN date/time, then click Generate.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SETTINGS DRAWER — provider capability + diagnostics */}
      <SettingsDrawer open={settingsOpen} onOpenChange={setSettingsOpen} capability={capability} />
    </main>
  );
}
