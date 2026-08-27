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
} from '@/lib/spatial/aoi';
import { validateAnalysisAoi } from '@/lib/spatial/aoi-validation';
import { getRegionBoundaryPolygon, getInvertedMaskPolygon, resolveRegionDisplayName } from '@/lib/spatial/region-boundaries';
import { deriveWorkflowStage, deriveGenerateReadiness } from '@/lib/workspace/stage';
import { cameraForResultType, type SelectionCameraBehavior as CameraBehavior } from '@/lib/location/selection-behavior';
import {
  FIXTURE_DISPLAY_GRANULARITY,
  FIXTURE_CAPTURE_REQUEST_AOI,
  FIXTURE_CAPTURE_CENTER,
  DEMO_CANDIDATE_SITES,
  fixtureCaptureSpanLabel,
  doesAoiIntersectFixtureExtent,
} from '@/lib/fortyguard/fixture-display';
import type { WorkflowStage } from '@/lib/workspace/stage';
import {
  type AnalysisTemporalInput,
  defaultTemporalInput,
  buildFixtureTemporalInput,
  deriveDurationHours,
  effectiveTimeBounds,
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

/** Neutral continental-US center for the EMPTY workspace (no implied analysis). */
const DEFAULT_EMPTY_CENTER: LocationPoint = { latitude: 39.8283, longitude: -98.5795 };

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
  // EMPTY workspace state: NO location is pre-selected. The captured DEMO
  // dataset exists as a DATA SOURCE, but the app must NOT open with the
  // Manhattan analysis already loaded — the user explicitly selects a
  // location to begin (DEMO capture for it, or LIVE).
  const [selectedLocation, setSelectedLocation] = useState<NamedLocation | null>(null);

  // ── Explicit WHEN inputs (Section 14) ──
  const [temporalInput, setTemporalInput] = useState<AnalysisTemporalInput>(() =>
    buildFixtureTemporalInput()
  );

  // ── Canonical AOI center (movable in LIVE — Section 4) ──
  // Neutral continental-US view until a location is selected. On selection the
  // AOI centers on the location (LIVE) or on the captured analysis area (DEMO).
  // In LIVE the moved geometry is canonical: rendered == sent to FortyGuard.
  const [aoiCenter, setAoiCenter] = useState<LocationPoint>(() => ({
    latitude: DEFAULT_EMPTY_CENTER.latitude,
    longitude: DEFAULT_EMPTY_CENTER.longitude,
  }));

  // ── Geographic region context (Section 5 + 13) ──
  // A state/region selection sets CONTEXT ONLY — it never moves the analysis
  // point to the state's geographic center.
  const [regionName, setRegionName] = useState<string | undefined>(undefined);
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

  // ── DEMO capture availability (DEMO is a DATA SOURCE, not a default state) ──
  // A genuine capture exists ONLY for locations inside the captured field
  // (Lower Manhattan). Everything else in DEMO is an honest no-capture state.
  const demoCaptureAvailable =
    mode === 'FIXTURE' && !!selectedLocation && isLocationCoveredByFixture(selectedLocation);

  // ── Canonical Analysis AOI (ONE geometry: rendered == sent) ──
  //   EMPTY            → none (no analysis without a location).
  //   DEMO (captured)  → the CAPTURED REQUEST AREA (fixture metadata mirror):
  //                      the exact polygon_aoi the genuine FortyGuard capture
  //                      was requested with. Fixed — never resized/dragged.
  //   DEMO (no capture)→ none (no captured analysis area for this location).
  //   LIVE             → the user's span-based AOI (draggable, canonical).
  const analysisAoi: PolygonAOI | null = useMemo(() => {
    if (!selectedLocation) return null;
    if (mode === 'FIXTURE') return demoCaptureAvailable ? FIXTURE_CAPTURE_REQUEST_AOI : null;
    return createAoiFromSpan(
      { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude },
      prefs.analysisAoiSpanMetres,
      prefs.analysisAreaShape
    );
  }, [selectedLocation, mode, demoCaptureAvailable, prefs.analysisAreaShape, prefs.analysisAoiSpanMetres]);

  // Geographic region boundary polygon (geographic CONTEXT — never provider coverage)
  const regionBoundary: PolygonAOI | null = useMemo(
    () => getRegionBoundaryPolygon(
      regionName,
      selectedLocation?.city,
      aoiCenter.latitude,
      aoiCenter.longitude,
    ),
    [regionName, selectedLocation, aoiCenter.latitude, aoiCenter.longitude],
  );

  // Human display name of the active geographic region ("New York", "California"…).
  const regionDisplayName = useMemo(() => {
    const name = (regionBoundary?.features?.[0]?.properties as { name?: string } | undefined)?.name;
    return name ? name.replace(/\s*(State|Regional)\s*Boundary$/i, '').trim() : regionName;
  }, [regionBoundary, regionName]);

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
  const regionBoundaryRef = useRef(regionBoundary);
  const regionDisplayNameRef = useRef(regionDisplayName);

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
    regionBoundaryRef.current = regionBoundary;
    regionDisplayNameRef.current = regionDisplayName;
  }, [mode, selectedLocation, aoiCenter, temporalInput, prefs.preferredAIProvider, selectedScenarioId, jointDecision, scenarioAnalysis, candidateSites.sites, regionBoundary, regionDisplayName]);

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
    // Capture the request epoch so a Reset / location change invalidates the
    // explanation response exactly like the decision response.
    const requestId = activeRequestIdRef.current;
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
      if (requestId !== activeRequestIdRef.current) return; // stale — discarded
      if (ok && data?.success && data.explanation) {
        setExplanation(data.explanation);
      }
    } catch {
      // Silently keep the previous explanation; the deterministic fallback is server-side.
    } finally {
      if (requestId === activeRequestIdRef.current) setExplaining(false);
    }
  }, []);

  /**
   * Run the decision pipeline with an EXPLICIT canonical AOI geometry.
   * The geometry passed here is EXACTLY what is rendered on the map — the
   * rendered AOI == the API AOI, including after the user drags it.
   */
  const runDecisionPipeline = useCallback(async (
    loc: NamedLocation | null,
    aoi: PolygonAOI,
    temporal: AnalysisTemporalInput,
    tz: string,
    dataSourceMode: DataSourceMode,
    candidates?: CandidateLocation[],
  ) => {
    const requestId = ++activeRequestIdRef.current;
    setLoading(true);
    setErrorDetails(null);

    // EMPTY state guard: no location selected → nothing to analyse.
    if (!loc) {
      setLoading(false);
      setErrorDetails({
        code: 'NO_LOCATION_SELECTED',
        message: 'No location selected yet.',
        recoverySuggestion: 'Search a city, street, or address (or pick a preset) to select the location to analyse, then Generate again.',
        category: 'VALIDATION',
      });
      return;
    }

    // DEMO data-source gate: a location without a genuine capture NEVER gets
    // Manhattan cells, translated cells, synthetic candidates, or any request.
    if (dataSourceMode === 'FIXTURE' && !isLocationCoveredByFixture(loc)) {
      setLoading(false);
      setErrorDetails({
        code: 'NO_DEMO_CAPTURE',
        message: 'NO DEMO CAPTURE AVAILABLE FOR THIS LOCATION',
        recoverySuggestion: `The captured FortyGuard DEMO dataset covers Lower Manhattan only — no thermal cells, candidate sites, or recommendation exist for "${loc.name}". Switch to LIVE to request genuine FortyGuard data for this location, or select a Manhattan DEMO location.`,
        category: 'COVERAGE',
      });
      return;
    }

    // Validate the AOI against every honest constraint (Section 6):
    //   documented provider limit · geographic bounds · region containment
    //   (only when a canonical region boundary is active).
    // The geometry is NEVER silently adjusted — an invalid AOI is reported
    // with a recovery action and no provider request is made.
    const aoiCheck = validateAnalysisAoi(aoi, {
      regionBoundary: regionBoundaryRef.current,
      regionDisplayName: regionDisplayNameRef.current,
    });
    if (!aoiCheck.valid) {
      setLoading(false);
      setErrorDetails({
        code: aoiCheck.code ?? 'INVALID_AOI',
        message: aoiCheck.message,
        recoverySuggestion: aoiCheck.recovery,
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
        recoverySuggestion: 'The captured analysis area is fixed to the genuine capture — switch to LIVE mode to request fresh FortyGuard data for a different area.',
        category: 'COVERAGE',
      });
      return;
    }

    // DEMO canonical AOI: the CAPTURED REQUEST AREA (the genuine polygon_aoi
    // the capture was requested with — mirrored from the fixture metadata).
    // The captured field is replayed verbatim inside it; DEMO never submits a
    // client-invented geometry for the capture. (LIVE submits the user's
    // canonical AOI exactly as rendered — including any drag.)
    const requestAoi = dataSourceMode === 'FIXTURE' ? FIXTURE_CAPTURE_REQUEST_AOI : aoi;

    try {
      const body: Record<string, unknown> = {
        latitude: loc.latitude,
        longitude: loc.longitude,
        durationHours: deriveDurationHours(temporal),
        mode: dataSourceMode,
        // DEMO sends the capture's ACTUAL granularity (100m); LIVE sends the
        // user-selected provider granularity.
        granularity: dataSourceMode === 'FIXTURE' ? FIXTURE_DISPLAY_GRANULARITY : prefs.analysisResolution,
        analysisAreaShape: prefs.analysisAreaShape,
        // Canonical analysis AOI — the EXACT geometry rendered on the map
        // (including any drag the user performed).
        analysisAoi: requestAoi,
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
   * Location selection (Section 7 + 13) — the DEMO/LIVE data-source semantics:
   *   - STATE/REGION result → geographic context ONLY: show boundary, dim the
   *     outside, fit the region. The analysis point does NOT move.
   *   - CITY/NEIGHBORHOOD/STREET/ADDRESS/POI:
   *       DEMO + genuine capture for the location → load the CAPTURED dataset
   *         (captured analysis area + 425 verbatim cells + application-defined
   *         DEMO candidates + deterministic analysis; zero provider requests).
   *       DEMO + NO capture → honest NO_DEMO_CAPTURE state: no cells, no
   *         candidates, no Manhattan data — "Switch to LIVE" offered.
   *       LIVE → configure the user's own analysis (AOI, WHEN, candidates);
   *         Generate spends credits only when explicitly pressed.
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
      if (isLocationCoveredByFixture(loc)) {
        // ── Genuine capture available: load the CAPTURED dataset ──
        // The analysis area becomes the captured request AOI (fixed); the
        // WHEN anchors to the captured hour; the pipeline replays the capture
        // (zero provider requests).
        const fixtureTemporal = buildFixtureTemporalInput();
        setTemporalInput(fixtureTemporal);
        temporalInputRef.current = fixtureTemporal;
        const captureCenter = { ...FIXTURE_CAPTURE_CENTER };
        setAoiCenter(captureCenter);
        aoiCenterRef.current = captureCenter;
        // DEMO times are UTC-anchored (the capture's request hour) — never
        // silently re-anchored to the selected location's timezone.
        runDecisionPipeline(loc, FIXTURE_CAPTURE_REQUEST_AOI, fixtureTemporal, FIXTURE_TIMEZONE, 'FIXTURE');
      } else {
        // ── No capture for this location: honest NO_DEMO_CAPTURE state ──
        // No cells, no candidates, no recommendation, zero requests.
        setErrorDetails({
          code: 'NO_DEMO_CAPTURE',
          message: 'NO DEMO CAPTURE AVAILABLE FOR THIS LOCATION',
          recoverySuggestion: `The captured FortyGuard DEMO dataset covers Lower Manhattan only — no thermal cells, candidate sites, or recommendation exist for "${loc.name}". Switch to LIVE to request genuine FortyGuard data for this location, or select a Manhattan DEMO location.`,
          category: 'COVERAGE',
        });
      }
    } else {
      // LIVE: require explicit Generate (never silently spend credits)
      const liveDefault = defaultTemporalInput(loc.timezone);
      setTemporalInput(liveDefault);
      temporalInputRef.current = liveDefault;
    }
  }, [clearResults, requestCamera, runDecisionPipeline]);

  const handleTemporalChange = useCallback((next: AnalysisTemporalInput) => {
    setTemporalInput(next);
    temporalInputRef.current = next;
  }, []);

  const handleModeChange = useCallback((newMode: DataSourceMode) => {
    prefSetters.setDataSourceMode(newMode);
    // Side effects handled by the mode-change effect below.
  }, [prefSetters]);

  /**
   * Operating-location marker DRAGGED on the map (Section 2 — LIVE control).
   *   drag marker → update canonical location coordinates → update location
   *   state → recompute AOI around the new point → invalidate old analysis.
   * NO automatic FortyGuard request — a new LIVE request requires explicit
   * Generate. The geographic region context follows the point honestly.
   */
  const handleMoveOperatingLocation = useCallback((point: LocationPoint) => {
    const loc = selectedLocationRef.current;
    if (!loc) return;

    activeRequestIdRef.current++; // Invalidate any in-flight requests

    const nextLoc: NamedLocation = {
      ...loc,
      name: `Location (${point.latitude.toFixed(4)}°, ${point.longitude.toFixed(4)}°)`,
      displayName: `Coordinates (${point.latitude.toFixed(4)}°, ${point.longitude.toFixed(4)}°)`,
      latitude: point.latitude,
      longitude: point.longitude,
    };
    setSelectedLocation(nextLoc);
    selectedLocationRef.current = nextLoc;

    const nextCenter = { latitude: point.latitude, longitude: point.longitude };
    setAoiCenter(nextCenter);
    aoiCenterRef.current = nextCenter;

    // Geographic region context follows the point
    const nextRegion = resolveRegionDisplayName(point.latitude, point.longitude);
    setRegionName(nextRegion);
    setStateLevelSelection(null);

    // Invalidate any previous analysis
    clearResults();

    // Clear candidate sites on operating location move (spatial context change)
    candidateSites.clearSites();

    // Asynchronously reverse geocode to resolve place/city/street/state dynamically
    const moveEpoch = activeRequestIdRef.current;
    fetch(`/api/location/search?lat=${point.latitude}&lon=${point.longitude}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (moveEpoch !== activeRequestIdRef.current) return; // Stale move
        if (data?.success && data.location) {
          const resolved = data.location as NamedLocation;
          setSelectedLocation((current) => {
            if (!current) return null;
            return {
              ...current,
              name: resolved.name || current.name,
              displayName: resolved.displayName || current.displayName,
              city: resolved.city || current.city,
              state: resolved.state || current.state,
              country: resolved.country || current.country,
              zipCode: resolved.zipCode || current.zipCode,
              timezone: resolved.timezone || current.timezone,
            };
          });
          if (resolved.state) {
            setRegionName(resolved.state);
          }
        }
      })
      .catch(() => {
        // Silently preserve coordinate naming on network failure
      });

    requestCamera('fit-aoi');
  }, [candidateSites, clearResults, requestCamera]);

  /**
   * Candidate site DRAGGED to a new point INSIDE the AOI.
   * Updates site position and invalidates previous analysis — no automatic provider request.
   */
  const handleMoveCandidate = useCallback((locationId: string, lat: number, lng: number) => {
    const loc = selectedLocationRef.current;
    if (!loc) return;
    const aoi = createAoiFromSpan(
      { latitude: loc.latitude, longitude: loc.longitude },
      prefs.analysisAoiSpanMetres,
      prefs.analysisAreaShape
    );
    const accepted = candidateSites.moveSite(locationId, lat, lng, aoi);
    if (accepted) {
      activeRequestIdRef.current++;
      clearResults();
    }
  }, [candidateSites, clearResults, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape]);

  /**
   * ONE compact Reset: clears the ENTIRE analysis workspace and
   * returns to EMPTY — no page reload, no navigation.
   */
  const handleResetAnalysis = useCallback(() => {
    // Invalidate any in-flight async request FIRST
    activeRequestIdRef.current++;
    setLoading(false);
    setExplaining(false);

    // Operating location → null
    setSelectedLocation(null);
    selectedLocationRef.current = null;

    // AOI → reset to neutral EMPTY view
    const emptyCenter = { latitude: DEFAULT_EMPTY_CENTER.latitude, longitude: DEFAULT_EMPTY_CENTER.longitude };
    setAoiCenter(emptyCenter);
    aoiCenterRef.current = emptyCenter;

    // Geographic region context → cleared
    setRegionName(undefined);
    setStateLevelSelection(null);

    // Candidate sites → removed
    candidateSites.clearSites();

    // Thermal field / decision / recommendation / explanation / errors → removed
    clearResults();

    // WHEN → default
    const defaultTemporal = buildFixtureTemporalInput();
    setTemporalInput(defaultTemporal);
    temporalInputRef.current = defaultTemporal;
    setSelectedScenarioId('scenario-temporal-shift');
    selectedScenarioIdRef.current = 'scenario-temporal-shift';

    // Exit add-site mode
    setAddSiteMode(false);

    // Camera → neutral continental EMPTY view
    requestCamera('fit-aoi');
  }, [candidateSites, clearResults, requestCamera]);

  /** Clearing the location returns the workspace to EMPTY. */
  const handleClearLocation = useCallback(() => {
    handleResetAnalysis();
  }, [handleResetAnalysis]);

  /** Map click while in PLACE_SITE mode. */
  const handleAddSiteAt = useCallback((lng: number, lat: number) => {
    const loc = selectedLocationRef.current;
    if (!loc) return;
    const aoi = createAoiFromSpan(
      { latitude: loc.latitude, longitude: loc.longitude },
      prefs.analysisAoiSpanMetres,
      prefs.analysisAreaShape
    );
    const inside = isPointInAoi({ latitude: lat, longitude: lng }, aoi);
    if (!inside) {
      setErrorDetails({
        code: 'CANDIDATE_OUTSIDE_AOI',
        message: 'Candidate site must be inside the analysis area.',
        recoverySuggestion: 'Click inside the analysis-area boundary to place a candidate site.',
        category: 'VALIDATION',
      });
      return;
    }
    setErrorDetails(null);
    candidateSites.addSiteAt(lat, lng);
    activeRequestIdRef.current++;
    clearResults();
    setAddSiteMode(false);
  }, [candidateSites, clearResults, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape]);

  const handleRemoveSite = useCallback((locationId: string) => {
    activeRequestIdRef.current++;
    candidateSites.removeSite(locationId);
    clearResults();
  }, [candidateSites, clearResults]);

  const handleRenameSite = useCallback((locationId: string, name: string) => {
    candidateSites.renameSite(locationId, name);
  }, [candidateSites]);

  /** Add a candidate from a searched location. */
  const handleAddSiteFromSearch = useCallback((loc: NamedLocation) => {
    const activeLoc = selectedLocationRef.current;
    if (!activeLoc) return;
    const aoi = createAoiFromSpan(
      { latitude: activeLoc.latitude, longitude: activeLoc.longitude },
      prefs.analysisAoiSpanMetres,
      prefs.analysisAreaShape
    );
    const inside = isPointInAoi({ latitude: loc.latitude, longitude: loc.longitude }, aoi);
    if (!inside) {
      setErrorDetails({
        code: 'CANDIDATE_OUTSIDE_AOI',
        message: `"${loc.name}" is outside the analysis area.`,
        recoverySuggestion: 'Pick a site inside the analysis area.',
        category: 'VALIDATION',
      });
      return;
    }
    setErrorDetails(null);
    candidateSites.addSiteAt(loc.latitude, loc.longitude, loc.name.split(',')[0], 'search');
    activeRequestIdRef.current++;
    clearResults();
    requestCamera('fit-aoi');
  }, [candidateSites, clearResults, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape, requestCamera]);


  // ───────────────────────────────────────────────────────────────────────────
  // Effects
  // ───────────────────────────────────────────────────────────────────────────

  // Initial mount: EMPTY workspace state. NO analysis is auto-loaded — the
  // DEMO capture is a DATA SOURCE the user explicitly selects a location for,
  // never the implicit opening state. Only provider health checks run here.
  useEffect(() => {
    let isMounted = true;

    // Provider health checks in the background (non-blocking)
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

  // React to data-source mode changes (Settings drawer or "Switch to LIVE").
  // DEMO and LIVE are DATA SOURCES, not separate workflows: switching never
  // invents a location and never silently spends credits.
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return; // initial mount handled above (EMPTY state, nothing loaded)
    }
    const newMode = mode;
    // Clear model state on mode switch — LIVE never reuses DEMO thermal data
    // and DEMO never reuses LIVE cells.
    clearResults();

    checkFortyGuardHealth(newMode);

    const loc = selectedLocationRef.current;

    // EMPTY stays EMPTY: the data source alone never loads data.
    if (!loc) return;

    if (newMode === 'FIXTURE') {
      if (isLocationCoveredByFixture(loc)) {
        // DEMO with a genuine capture for this location → load the captured
        // dataset (free fixture replay, zero provider requests).
        const fixtureTemporal = buildFixtureTemporalInput();
        setTemporalInput(fixtureTemporal);
        temporalInputRef.current = fixtureTemporal;
        const captureCenter = { ...FIXTURE_CAPTURE_CENTER };
        setAoiCenter(captureCenter);
        aoiCenterRef.current = captureCenter;
        runDecisionPipeline(loc, FIXTURE_CAPTURE_REQUEST_AOI, fixtureTemporal, FIXTURE_TIMEZONE, 'FIXTURE');
      } else {
        // DEMO with NO capture for this location → honest gate (never swaps
        // the user's location to Manhattan implicitly).
        setErrorDetails({
          code: 'NO_DEMO_CAPTURE',
          message: 'NO DEMO CAPTURE AVAILABLE FOR THIS LOCATION',
          recoverySuggestion: `The captured FortyGuard DEMO dataset covers Lower Manhattan only — no thermal cells, candidate sites, or recommendation exist for "${loc.name}". Switch to LIVE to request genuine FortyGuard data for this location, or select a Manhattan DEMO location.`,
          category: 'COVERAGE',
        });
      }
    } else {
      // LIVE from a DEMO location: RETAIN the location's coordinates. The AOI
      // becomes the user-configurable analysis area centered on the location;
      // the WHEN defaults to the location's timezone. A NEW FortyGuard request
      // is made only when the user presses Generate — DEMO data is never reused.
      const nextCenter = { latitude: loc.latitude, longitude: loc.longitude };
      setAoiCenter(nextCenter);
      aoiCenterRef.current = nextCenter;
      const liveDefault = defaultTemporalInput(loc.timezone);
      setTemporalInput(liveDefault);
      temporalInputRef.current = liveDefault;
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

  // React to AOI shape / size / resolution changes (LIVE analysis controls):
  //   ALWAYS clear stale thermal data (Section 20) — the LIVE geometry changes
  //   exactly. LIVE requires explicit Generate (credit safety). DEMO is
  //   unaffected: the captured analysis area is fixed and the captured dataset
  //   never pretends a different provider capture exists.
  useEffect(() => {
    if (!didMountRef.current) return;
    clearResults();
    candidateSites.validateAgainstAoi(
      createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape)
    );
     
  }, [prefs.analysisAreaShape, prefs.analysisAoiSpanMetres, prefs.analysisResolution]);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived values
  // ───────────────────────────────────────────────────────────────────────────

  const activeScenario = scenarioAnalysis?.scenarios?.find((s) => s.scenarioId === selectedScenarioId) ?? scenarioAnalysis?.scenarios?.[0];
  const fieldReady = !!spatialField && !loading;
  const altLocations = METROPOLITAN_LOCATIONS.filter((l) => !l.isDemoOnly).slice(0, 4);
  const thermalCellCount = spatialField?.features?.length ?? 0;
  const aiProvider = aiHealth?.provider;

  // ── AOI validation (Section 6 — immediate, on every geometry change) ──
  // Runs on drag-end / size / shape / location changes. An invalid geometry
  // is RETAINED visibly as invalid (red outline + map banner) and Generate is
  // disabled — never silently shrunk, clipped, or moved.
  const aoiValidation = useMemo(
    () => validateAnalysisAoi(analysisAoi, {
      regionBoundary,
      regionDisplayName,
    }),
    [analysisAoi, regionBoundary, regionDisplayName],
  );
  const aoiInvalid = !!analysisAoi && !aoiValidation.valid;

  // ── Explicit WHEN validity (Section 11 prerequisite) ──
  const temporalValid = useMemo(() => {
    const t = temporalInput;
    if (!isValidDateStr(t.date) || !isValidTimeStr(t.startTime) || !isValidTimeStr(t.endTime)) return false;
    if (t.timeMode === 'range-of-hours') {
      const bounds = effectiveTimeBounds(t);
      return bounds.end > bounds.start;
    }
    return true;
  }, [temporalInput]);

  // ── Generate readiness (Section 11 — explicit, contract-gated) ──
  const outsideCandidateCount = candidateSites.sites.filter((s) => s.outsideAoi).length;
  const generateReadiness = useMemo(
    () => deriveGenerateReadiness({
      mode,
      hasLocation: !!selectedLocation,
      aoiValidation: analysisAoi ? aoiValidation : null,
      temporalValid,
      candidateCount: candidateSites.sites.length,
      outsideCandidateCount,
      demoCaptureAvailable,
    }),
    [mode, selectedLocation, analysisAoi, aoiValidation, temporalValid, candidateSites.sites.length, outsideCandidateCount, demoCaptureAvailable],
  );

  // ── Explicit workspace state machine (Section 1) ──
  //   EMPTY → LOCATION_SELECTED → AOI_VALID → READY → GENERATING → RESULT,
  //   with AOI_INVALID (retained visibly + Generate disabled) and ERROR /
  //   NO_DEMO_CAPTURE recovery states. DEMO and LIVE are DATA SOURCES that
  //   feed the SAME workflow — never implicit workspace states.
  const workflowStage: WorkflowStage = deriveWorkflowStage({
    hasLocation: !!selectedLocation,
    hasAoi: !!analysisAoi,
    aoiValid: aoiValidation.valid,
    ready: generateReadiness.enabled,
    loading,
    hasResult: !!jointDecision,
    errorCode: errorDetails?.code ?? null,
  });

  // Candidates to display on the map + evaluate:
  //   FIXTURE + genuine capture → the three application-defined DEMO
  //             candidates (evaluated against the captured field — NOT
  //             captured sites). No capture → NO candidates (never synthetic,
  //             never Manhattan candidates for another location).
  //   LIVE    → the user's real candidate sites only.
  const displayCandidates: CandidateLocation[] = useMemo(() => {
    if (mode === 'FIXTURE') {
      return demoCaptureAvailable ? DEMO_CANDIDATE_SITES : [];
    }
    return candidateSites.sites.map((s) => ({
      locationId: s.locationId,
      name: s.name,
      location: s.location,
    }));
  }, [mode, demoCaptureAvailable, candidateSites.sites]);

  // Resolution display (Section 2): DEMO shows the fixture's ACTUAL captured
  // granularity; LIVE shows the provider granularity that will be sent.
  const resolutionDisplay = mode === 'FIXTURE' ? FIXTURE_DISPLAY_GRANULARITY : prefs.analysisResolution;

  // Display timezone: DEMO is UTC-anchored (the capture's request hour is a
  // UTC instant) — displaying it in the selected location's timezone would
  // MISLABEL the captured wall-clock. LIVE uses the location's timezone.
  const displayTimezone = mode === 'FIXTURE' ? FIXTURE_TIMEZONE : (selectedLocation?.timezone || 'UTC');

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
    const m = modeRef.current;
    const loc = selectedLocationRef.current;
    runDecisionPipeline(
      loc,
      m === 'FIXTURE' ? FIXTURE_CAPTURE_REQUEST_AOI : createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape),
      temporalInputRef.current,
      m === 'FIXTURE' ? FIXTURE_TIMEZONE : (loc?.timezone || 'UTC'),
      m,
      m === 'LIVE'
        ? candidateSitesRef.current.map((s) => ({
            locationId: s.locationId,
            name: s.name,
            location: s.location,
          }))
        : undefined
    );
  }, [runDecisionPipeline, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape]);

  const handleRetry = useCallback(() => {
    const m = modeRef.current;
    const loc = selectedLocationRef.current;
    runDecisionPipeline(
      loc,
      m === 'FIXTURE' ? FIXTURE_CAPTURE_REQUEST_AOI : createAoiFromSpan(aoiCenterRef.current, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape),
      temporalInputRef.current,
      m === 'FIXTURE' ? FIXTURE_TIMEZONE : (loc?.timezone || 'UTC'),
      m,
      m === 'LIVE'
        ? candidateSitesRef.current.map((s) => ({
            locationId: s.locationId,
            name: s.name,
            location: s.location,
          }))
        : undefined
    );
  }, [runDecisionPipeline, prefs.analysisAoiSpanMetres, prefs.analysisAreaShape]);

  // Alternative-location buttons share the FULL location-selection semantics:
  // DEMO + capture → load the captured dataset (free); DEMO without capture →
  // honest NO_DEMO_CAPTURE; LIVE → configure, Generate spends credits only
  // when explicitly pressed (credit safety).
  const handleSelectAltLocation = useCallback((loc: NamedLocation) => {
    handleSelectLocation(loc);
  }, [handleSelectLocation]);

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <main
      className="min-h-screen flex flex-col bg-surface-bg text-text-primary"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      data-workflow-stage={workflowStage}
    >
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
              analysisCenter={selectedLocation ? aoiCenter : undefined}
              demoCaptureAvailable={demoCaptureAvailable}
              stateLevelSelection={stateLevelSelection}
              temporalInput={temporalInput}
              onTemporalChange={handleTemporalChange}
              onGenerate={handleGenerate}
              loading={loading}
              generateDisabled={!generateReadiness.enabled}
              generateDisabledReason={generateReadiness.reason}
              onReset={handleResetAnalysis}
              onClearLocation={handleClearLocation}
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
              activeStateFilter={regionDisplayName || selectedLocation?.state}
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
                onSwitchToLive={() => handleModeChange('LIVE')}
                onSelectAltLocation={handleSelectAltLocation}
              />
            )}

            {/* 1. FORTYGUARD THERMAL FIELD — the visual hero */}
            <ThermalMapCanvas
              stage={workflowStage}
              locationName={selectedLocation?.name ?? 'No location selected'}
              baseTimestamp={spatialFieldMeta?.baseTimestamp}
              thermalCellCount={thermalCellCount}
              resolution={selectedLocation ? resolutionDisplay : undefined}
              mode={mode}
              loading={loading}
              selectedLocation={selectedLocation ?? undefined}
              analysisCenter={selectedLocation ? aoiCenter : undefined}
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
                location={selectedLocation ? { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude } : null}
                locationState={selectedLocation?.state}
                locationName={selectedLocation?.name}
                locationDraggable={mode === 'LIVE'}
                onMoveOperatingLocation={handleMoveOperatingLocation}
                regionBoundary={regionBoundary}
                regionMask={regionMask}
                regionDisplayName={regionDisplayName}
                analysisAoi={analysisAoi}
                aoiInvalid={aoiInvalid}
                aoiInvalidMessage={aoiValidation.valid ? undefined : aoiValidation.message}
                captureAoiLabel={mode === 'FIXTURE' && demoCaptureAvailable ? fixtureCaptureSpanLabel() : undefined}
                spatialField={spatialField}
                selectedTileId={decision?.evidenceBundle.selectedTileId}
                candidates={displayCandidates}
                candidatesDraggable={mode === 'LIVE'}
                onMoveCandidate={handleMoveCandidate}
                onRemoveCandidate={handleRemoveSite}
                recommendedLocationId={spatialDecision?.recommendedLocation.locationId}
                unit={unit}
                layerVisibility={prefs.mapLayerVisibility}
                onToggleLayer={prefSetters.setMapLayerVisibility}
                areaShape={prefs.analysisAreaShape}
                showLocationMarker={!!selectedLocation}
                emptyMapMessage={
                  workflowStage === 'NO_DEMO_CAPTURE'
                    ? 'No DEMO capture available for this location — switch to LIVE or pick a Manhattan DEMO location'
                    : 'Select a location to begin the analysis'
                }
                addSiteMode={addSiteMode}
                onAddSiteAt={handleAddSiteAt}
                onExitAddSiteMode={() => setAddSiteMode(false)}
                cameraBehavior={cameraBehavior}
                cameraNonce={cameraNonce}
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

            {/* Empty state before first run (EMPTY / LOCATION_SELECTED stages) */}
            {!jointDecision && !loading && !errorDetails && (
              <div
                className="rounded-xl border border-border bg-surface-card px-5 py-12 text-center"
                data-testid={workflowStage === 'EMPTY' ? 'empty-workspace-card' : 'pre-generate-card'}
              >
                <div className="text-2xl mb-2">🌡</div>
                {workflowStage === 'EMPTY' ? (
                  <>
                    <p className="text-text-primary text-sm font-bold">Select a location to begin</p>
                    <p className="text-text-muted text-xs mt-1.5 leading-relaxed max-w-md mx-auto">
                      Search a city, street, or address — or pick a preset in the left rail. Locations with a genuine
                      captured DEMO dataset load it explicitly; every other location runs LIVE against FortyGuard.
                    </p>
                    <p className="text-[10px] font-mono text-text-dimmed mt-3 tracking-wide">
                      LOCATION → ANALYSIS AOI → THERMAL OBSERVATIONS → CANDIDATES → RECOMMENDATION
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-text-muted text-sm font-medium">Generate a thermal field to see the recommended operational plan.</p>
                    <p className="text-text-dimmed text-xs mt-1">
                      {mode === 'LIVE'
                        ? 'Place candidate sites (+ Site on the map), set the WHEN date/time, then click Generate.'
                        : 'This location has a genuine captured dataset — Generate replays it (no provider request).'}
                    </p>
                  </>
                )}
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
