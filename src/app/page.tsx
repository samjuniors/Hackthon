'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { LocationSearch } from '@/components/LocationSearch';
import { ProviderHealthCard } from '@/components/ProviderHealthCard';

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
import { METROPOLITAN_LOCATIONS, isLocationCoveredByFixture } from '@/lib/location/search';
import {
  useTempUnit,
  fmtTemp,
  fmtTempDelta,
  tempUnitSuffix,
  translateExplanationToUnit,
} from '@/lib/temperature';

// Dynamically import MapLibre map component to bypass SSR canvas requirement
const ThermalMap = dynamic(() => import('@/components/ThermalMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[320px] sm:h-[380px] lg:h-[420px] rounded-xl bg-[#0d1422] flex items-center justify-center border border-[#1e2d45]">
      <span className="text-slate-400 text-xs font-mono animate-pulse">Initializing Hyperlocal Thermal Canvas…</span>
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
      const data = JSON.parse(text) as T;
      return { ok: res.ok, data };
    } catch {
      return { ok: false, data: null };
    }
  } catch {
    return { ok: false, data: null };
  }
}

function fmtTime(iso: string, tz?: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz || 'UTC', timeZoneName: 'short' });
}

function fmtTimeWindow(start: string, end: string, tz?: string) {
  const tStart = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz || 'UTC' });
  const tEnd = new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz || 'UTC', timeZoneName: 'short' });
  return `${tStart}–${tEnd}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusDot({ status, mode }: { status: ProviderStatus; mode?: DataSourceMode }) {
  if (mode === 'FIXTURE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-300">
        <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
        DEMO
      </span>
    );
  }
  const map = {
    CONNECTED: { color: 'bg-emerald-400', text: 'text-emerald-300', label: 'LIVE', pulse: 'status-dot-live' },
    CHECKING:  { color: 'bg-yellow-400',  text: 'text-yellow-300',  label: 'CHECKING', pulse: 'animate-ping' },
    ERROR:     { color: 'bg-red-400',     text: 'text-red-300',     label: 'OFFLINE',  pulse: '' },
    UNKNOWN:   { color: 'bg-slate-500',   text: 'text-slate-400',   label: 'UNKNOWN',  pulse: '' },
  };
  const s = map[status] ?? map.UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`w-2 h-2 rounded-full ${s.color} ${s.pulse} inline-block`} />
      {s.label}
    </span>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 mt-0.5">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="border-t border-[#1e2d45] my-4" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [mode, setMode] = useState<DataSourceMode>('FIXTURE');
  const [selectedLocation, setSelectedLocation] = useState<NamedLocation>(METROPOLITAN_LOCATIONS[0]);
  const [duration, setDuration] = useState<number>(3);
  const [unit, setUnit] = useTempUnit();

  const [fgStatus, setFgStatus] = useState<ProviderStatus>('UNKNOWN');
  const [fgHealth, setFgHealth] = useState<FortyGuardHealthResponse | null>(null);
  const [aiStatus, setAiStatus] = useState<ProviderStatus>('UNKNOWN');
  const [aiHealth, setAiHealth] = useState<AIHealthResponse | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [spatialDecision, setSpatialDecision] = useState<SpatialDecisionResult | null>(null);
  const [jointDecision, setJointDecision] = useState<JointDecisionResult | null>(null);
  const [scenarioAnalysis, setScenarioAnalysis] = useState<ScenarioAnalysisResult | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('scenario-temporal-shift');
  const [explanation, setExplanation] = useState<DecisionExplanation | null>(null);
  const [explaining, setExplaining] = useState<boolean>(false);
  const [spatialField, setSpatialField] = useState<PolygonAOI | null>(null);
  const [spatialFieldMeta, setSpatialFieldMeta] = useState<{
    baseTimestamp: string;
    coverageType: string;
    description: string;
    totalEvaluatedHours: number;
  } | null>(null);
  const [errorDetails, setErrorDetails] = useState<ProductionErrorDetails | null>(null);
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);

  // ──────────────────────────── Health Checks ────────────────────────────────

  const checkFortyGuardHealth = useCallback(async (checkMode: DataSourceMode = mode) => {
    setFgStatus('CHECKING');
    try {
      const { ok, data } = await safeJsonFetch<{ success?: boolean; health?: FortyGuardHealthResponse }>(
        '/api/health/fortyguard',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: checkMode }),
        }
      );
      if (ok && data?.success && data.health) {
        setFgHealth(data.health);
        setFgStatus(data.health.connected ? 'CONNECTED' : 'ERROR');
      } else {
        setFgStatus('ERROR');
      }
    } catch {
      setFgStatus('ERROR');
    }
  }, [mode]);

  const checkAIHealth = useCallback(async () => {
    setAiStatus('CHECKING');
    try {
      const { ok, data } = await safeJsonFetch<{ success?: boolean; health?: AIHealthResponse }>(
        '/api/health/ai',
        { method: 'POST' }
      );
      if (ok && data?.success && data.health) {
        setAiHealth(data.health);
        setAiStatus(data.health.connected ? 'CONNECTED' : data.health.configured ? 'ERROR' : 'UNKNOWN');
      } else {
        setAiStatus('ERROR');
      }
    } catch {
      setAiStatus('ERROR');
    }
  }, []);

  // ──────────────────────────── AI Explanation ───────────────────────────────

  const fetchExplanation = useCallback(
    async (jointDec: JointDecisionResult, activeScen?: WhatIfScenarioResult) => {
      setExplaining(true);
      try {
        const { ok, data } = await safeJsonFetch<{ success?: boolean; explanation?: DecisionExplanation }>(
          '/api/explain',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              jointDecision: jointDec,
              activeScenario: activeScen,
            }),
          }
        );
        if (ok && data?.success && data.explanation) {
          setExplanation(data.explanation);
        }
      } catch {
        // Non-blocking: deterministic fallback handled on server
      } finally {
        setExplaining(false);
      }
    },
    []
  );

  const activeRequestIdRef = useRef<number>(0);
  const modeRef = useRef<DataSourceMode>(mode);
  const selectedLocationRef = useRef<NamedLocation>(selectedLocation);
  const durationRef = useRef<number>(duration);

  useEffect(() => {
    modeRef.current = mode;
    selectedLocationRef.current = selectedLocation;
    durationRef.current = duration;
  }, [mode, selectedLocation, duration]);

  // ──────────────────────────── Decision Pipeline ─────────────────────────────

  const runDecisionPipeline = useCallback(
    async (
      loc = selectedLocationRef.current,
      durationHours = durationRef.current,
      dataSourceMode = modeRef.current
    ) => {
      const requestId = ++activeRequestIdRef.current;
      setLoading(true);
      setErrorDetails(null);

      try {
        const { ok, data } = await safeJsonFetch<{
          success?: boolean;
          decision?: DecisionResult;
          spatialDecision?: SpatialDecisionResult;
          jointDecision?: JointDecisionResult;
          scenarioAnalysis?: ScenarioAnalysisResult;
          spatialField?: PolygonAOI;
          spatialFieldMetadata?: {
            baseTimestamp: string;
            coverageType: string;
            description: string;
            totalEvaluatedHours: number;
          };
          error?: {
            code?: string;
            message?: string;
            details?: ProductionErrorDetails;
          };
        }>('/api/decision', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            latitude: loc.latitude,
            longitude: loc.longitude,
            durationHours,
            mode: dataSourceMode,
          }),
        });

        // Guard against stale response
        if (requestId !== activeRequestIdRef.current) {
          return;
        }

        if (!ok || !data?.success) {
          if (data?.error?.details) {
            setErrorDetails(data.error.details);
          } else {
            setErrorDetails({
              code: data?.error?.code || 'PIPELINE_ERROR',
              message: data?.error?.message || 'Decision pipeline execution failed.',
              recoverySuggestion: 'Verify parameters and provider connectivity.',
              category: 'PROVIDER',
            });
          }
          throw new Error(data?.error?.message || 'Decision calculation failed');
        }

        setDecision(data.decision || null);
        setSpatialDecision(data.spatialDecision || null);
        setJointDecision(data.jointDecision || null);
        setScenarioAnalysis(data.scenarioAnalysis || null);
        setSpatialField(data.spatialField || null);
        setSpatialFieldMeta(data.spatialFieldMetadata || null);

        if (dataSourceMode === 'LIVE') setFgStatus('CONNECTED');

        if (data.jointDecision) {
          const activeScen =
            data.scenarioAnalysis?.scenarios?.find(
              (s: WhatIfScenarioResult) => s.scenarioId === selectedScenarioId
            ) || data.scenarioAnalysis?.scenarios?.[0];
          fetchExplanation(data.jointDecision, activeScen);
        }
      } catch {
        if (requestId === activeRequestIdRef.current) {
          setDecision(null);
          setSpatialDecision(null);
          setJointDecision(null);
          setScenarioAnalysis(null);
          setExplanation(null);
          if (dataSourceMode === 'LIVE') setFgStatus('ERROR');
        }
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [selectedScenarioId, fetchExplanation]
  );

  const handleSelectLocation = useCallback((loc: NamedLocation) => {
    setSelectedLocation(loc);
    selectedLocationRef.current = loc;

    // Invalidate previous decision state immediately to prevent stale recommendations
    setDecision(null);
    setSpatialDecision(null);
    setJointDecision(null);
    setScenarioAnalysis(null);
    setSpatialField(null);
    setSpatialFieldMeta(null);
    setExplanation(null);
    setErrorDetails(null);

    // If in LIVE mode or compatible fixture location, calculate for the new location
    const currentMode = modeRef.current;
    if (currentMode === 'LIVE' || isLocationCoveredByFixture(loc)) {
      runDecisionPipeline(loc, durationRef.current, currentMode);
    }
  }, [runDecisionPipeline]);

  const handleModeChange = useCallback((newMode: DataSourceMode) => {
    modeRef.current = newMode;
    setMode(newMode);

    // Invalidate previous decision state immediately
    setDecision(null);
    setSpatialDecision(null);
    setJointDecision(null);
    setScenarioAnalysis(null);
    setSpatialField(null);
    setSpatialFieldMeta(null);
    setExplanation(null);
    setErrorDetails(null);

    void checkFortyGuardHealth(newMode);

    const currentLoc = selectedLocationRef.current;
    if (newMode === 'FIXTURE') {
      if (!isLocationCoveredByFixture(currentLoc)) {
        // Reset to default fixture location if current selection is outside Manhattan
        const defaultFixtureLoc = METROPOLITAN_LOCATIONS[0];
        setSelectedLocation(defaultFixtureLoc);
        selectedLocationRef.current = defaultFixtureLoc;
        runDecisionPipeline(defaultFixtureLoc, durationRef.current, 'FIXTURE');
      } else {
        runDecisionPipeline(currentLoc, durationRef.current, 'FIXTURE');
      }
    } else {
      // LIVE mode: run decision pipeline with real API for currently selected location
      runDecisionPipeline(currentLoc, durationRef.current, 'LIVE');
    }
  }, [checkFortyGuardHealth, runDecisionPipeline]);

  // ──────────────────────────── Initial Mount ─────────────────────────────────

  useEffect(() => {
    let isMounted = true;

    // Auto-check provider connectivity on initial load
    void safeJsonFetch<{ success?: boolean; health?: FortyGuardHealthResponse }>(
      '/api/health/fortyguard',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'FIXTURE' }),
      }
    ).then(({ ok, data }) => {
      if (!isMounted) return;
      if (ok && data?.success && data.health) {
        setFgHealth(data.health);
        setFgStatus(data.health.connected ? 'CONNECTED' : 'ERROR');
      }
    }).catch(() => {});

    void safeJsonFetch<{ success?: boolean; health?: AIHealthResponse }>(
      '/api/health/ai',
      { method: 'POST' }
    ).then(({ ok, data }) => {
      if (!isMounted) return;
      if (ok && data?.success && data.health) {
        setAiHealth(data.health);
        setAiStatus(data.health.connected ? 'CONNECTED' : data.health.configured ? 'ERROR' : 'UNKNOWN');
      }
    }).catch(() => {});

    // Initialize with default demo location
    const initPipeline = async () => {
      if (isMounted) {
        await runDecisionPipeline(METROPOLITAN_LOCATIONS[0], 3, 'FIXTURE');
      }
    };
    void initPipeline();

    return () => {
      isMounted = false;
    };
  }, [runDecisionPipeline]); // Run on mount

  const isFixtureMismatch = mode === 'FIXTURE' && !isLocationCoveredByFixture(selectedLocation);

  // Derived state
  const activeScenario =
    scenarioAnalysis?.scenarios?.find((s) => s.scenarioId === selectedScenarioId) ||
    scenarioAnalysis?.scenarios?.[0] ||
    null;

  const top3Plans = jointDecision?.rankedPlans.slice(0, 3) ?? [];
  const remainingPlans = jointDecision?.rankedPlans.slice(3) ?? [];

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-[#060a12] text-slate-100" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-[#1e2d45] bg-[#060a12]/95 backdrop-blur-xl">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Title */}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white leading-tight">
              Thermal Decision Engine
            </h1>
            <p className="text-[11px] text-slate-500 mt-0 hidden sm:block">
              Hyperlocal thermal intelligence → deterministic WHERE + WHEN decisions
            </p>
          </div>

          {/* Controls & Status indicators */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Global Temperature Unit Pill-Shaped Toggle (°C / °F) */}
            <div
              role="group"
              aria-label="Temperature unit selection"
              className="flex items-center bg-[#0d1422] p-1 rounded-full border border-[#1e2d45] shadow-inner shadow-black/40"
              data-testid="temp-unit-toggle"
            >
              <button
                type="button"
                aria-pressed={unit === 'F'}
                data-testid="temp-unit-f"
                onClick={() => setUnit('F')}
                className={`min-h-[44px] min-w-[44px] px-3.5 py-1.5 rounded-full text-xs font-bold font-mono transition-all flex items-center justify-center gap-1 ${
                  unit === 'F'
                    ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 shadow-md shadow-cyan-500/25 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                °F
              </button>
              <button
                type="button"
                aria-pressed={unit === 'C'}
                data-testid="temp-unit-c"
                onClick={() => setUnit('C')}
                className={`min-h-[44px] min-w-[44px] px-3.5 py-1.5 rounded-full text-xs font-bold font-mono transition-all flex items-center justify-center gap-1 ${
                  unit === 'C'
                    ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 shadow-md shadow-cyan-500/25 font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                °C
              </button>
            </div>

            {/* FortyGuard status */}
            <div className="hidden sm:flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider font-medium">FortyGuard</span>
              <StatusDot status={fgStatus} mode={mode === 'FIXTURE' ? 'FIXTURE' : undefined} />
            </div>

            {/* Vertical divider */}
            <div className="hidden sm:block w-px h-8 bg-[#1e2d45]" />

            {/* AI status */}
            <div className="hidden sm:flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider font-medium">AI Synthesis</span>
              <StatusDot status={aiStatus} />
            </div>

            {/* Mode badge */}
            {mode === 'FIXTURE' ? (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-900/30 text-amber-300 border border-amber-700/40">
                DEMO
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-900/30 text-emerald-300 border border-emerald-700/40">
                LIVE API
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 lg:py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">

          {/* ═══════════════════════════════════════════════════════════════
              LEFT PANEL — Controls (4 cols)
          ═══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-4 space-y-4 lg:space-y-5">

            {/* ── DEMO notice ── */}
            {mode === 'FIXTURE' && (
              <div className="rounded-xl p-3.5 border border-amber-700/40 bg-amber-950/20">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-amber-400 text-sm">⬡</span>
                  <span className="text-sm font-bold text-amber-300">DEMO — Captured FortyGuard Data</span>
                </div>
                <p className="text-[12px] text-amber-200/70 leading-relaxed">
                  Offline demonstration dataset: 12-hour hyperlocal Manhattan thermal field capture.
                  Switch to LIVE to run against the real FortyGuard API.
                </p>
              </div>
            )}

            {/* ── Mode Toggle ── */}
            <div className="rounded-xl border border-[#1e2d45] bg-[#0d1422] p-4">
              <SectionLabel>Execution Mode</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleModeChange('FIXTURE')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-all ${
                    mode === 'FIXTURE'
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-950/50'
                      : 'bg-[#141f33] text-slate-400 hover:text-white border border-[#1e2d45]'
                  }`}
                >
                  DEMO
                </button>
                <button
                  onClick={() => handleModeChange('LIVE')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-all ${
                    mode === 'LIVE'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/50'
                      : 'bg-[#141f33] text-slate-400 hover:text-white border border-[#1e2d45]'
                  }`}
                >
                  LIVE API
                </button>
              </div>
            </div>

            {/* ── Location + Duration + Run ── */}
            <div className="rounded-xl border border-[#1e2d45] bg-[#0d1422] p-4 space-y-4">
              <LocationSearch
                selectedLocation={selectedLocation}
                mode={mode}
                onSelectLocation={handleSelectLocation}
                onSwitchToLive={() => handleModeChange('LIVE')}
              />

              <Divider />

              {/* Duration slider */}
              <div>
                <SectionLabel>Operation Duration</SectionLabel>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-slate-300 text-sm">Window length</span>
                  <span className="text-lg font-black text-cyan-400 font-mono" data-testid="duration-display">
                    {duration}h
                  </span>
                </div>
                <div className="relative h-2 bg-[#1e2d45] rounded-full">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400 transition-all"
                    style={{ width: `${((duration - 1) / 3) * 100}%` }}
                  />
                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={1}
                    value={duration}
                    onChange={(e) => {
                      const dur = parseInt(e.target.value);
                      setDuration(dur);
                      if (mode === 'LIVE' || isLocationCoveredByFixture(selectedLocation)) {
                        runDecisionPipeline(selectedLocation, dur, mode);
                      }
                    }}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-600 mt-1.5 font-mono">
                  {[1,2,3,4].map(h => (
                    <span key={h} className={duration === h ? 'text-cyan-400 font-bold' : ''}>{h}h</span>
                  ))}
                </div>
              </div>

              <Divider />

              {/* ── Active Analysis Location Indicator ── */}
              <div className="rounded-xl p-3 bg-[#0a1220] border border-[#1e2d45] space-y-1.5" data-testid="active-analysis-location-indicator">
                <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  <span>ANALYSIS LOCATION</span>
                  <span
                    className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                      mode === 'LIVE'
                        ? 'bg-cyan-950/60 text-cyan-300 border-cyan-600/40'
                        : 'bg-amber-950/60 text-amber-300 border-amber-600/40'
                    }`}
                    data-testid="analysis-mode-badge"
                  >
                    {mode === 'LIVE' ? 'LIVE — FortyGuard' : 'DEMO — Manhattan Fixture'}
                  </span>
                </div>
                <div className="text-sm font-bold text-white leading-tight" data-testid="active-analysis-location-name">
                  {selectedLocation.name}
                </div>
                <div className="text-[11px] font-mono text-cyan-400 flex items-center justify-between" data-testid="active-analysis-location-coords">
                  <span>{selectedLocation.latitude.toFixed(4)}°, {selectedLocation.longitude.toFixed(4)}°</span>
                  {selectedLocation.city && (
                    <span className="text-slate-400 font-sans text-[10px]">
                      {selectedLocation.city}, {selectedLocation.state || selectedLocation.country}
                    </span>
                  )}
                </div>
              </div>

              {/* Run button / Mode mismatch switch CTA */}
              {isFixtureMismatch ? (
                <button
                  onClick={() => handleModeChange('LIVE')}
                  data-testid="recalculate-decision-btn"
                  className="w-full h-12 rounded-xl text-xs sm:text-sm font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-400 shadow-lg shadow-emerald-950/60"
                >
                  <span>⚡ Switch to LIVE to Calculate</span>
                </button>
              ) : (
                <button
                  disabled={loading}
                  onClick={() => runDecisionPipeline(selectedLocation, duration, mode)}
                  data-testid="recalculate-decision-btn"
                  className={`w-full h-12 rounded-xl text-sm font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 ${
                    loading
                      ? 'bg-[#141f33] text-slate-500 cursor-not-allowed hover:scale-100 active:scale-100'
                      : 'bg-gradient-to-r from-cyan-600 to-cyan-500 text-white hover:from-cyan-500 hover:to-cyan-400 shadow-lg shadow-cyan-950/60'
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-slate-600 border-t-cyan-400 rounded-full animate-spin" />
                      <span>Evaluating thermal field…</span>
                    </span>
                  ) : (
                    <span>⚡ Calculate Decision</span>
                  )}
                </button>
              )}
            </div>

            {/* ── Provider Health ── */}
            <ProviderHealthCard
              mode={mode}
              fortyGuardStatus={fgStatus}
              fortyGuardHealth={fgHealth}
              aiStatus={aiStatus}
              aiHealth={aiHealth}
              onTestFortyGuard={() => checkFortyGuardHealth(mode)}
              onTestAI={checkAIHealth}
            />

            {/* ── Model metadata (secondary) ── */}
            <div className="text-[10px] text-slate-700 font-mono text-center">
              v1.0.0-spatial-thermal-baseline · FortyGuard Hackathon&apos;26
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              RIGHT PANEL — Results (8 cols)
          ═══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-8 space-y-4 lg:space-y-5">

            {/* ── Error Banner ── */}
            {errorDetails && (
              <div
                className="rounded-xl p-4 border-2 border-red-500/50 bg-red-950/30 space-y-3"
                data-testid="production-error-banner"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-red-400 text-base">🔴</span>
                      <span className="font-bold text-red-200 text-sm">
                        {errorDetails.code === 'OUTSIDE_COVERAGE'
                          ? 'FortyGuard Coverage Unavailable for this Location'
                          : 'Analysis Halted'}
                      </span>
                      <code className="text-[10px] bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded font-mono">
                        {errorDetails.code}
                      </code>
                    </div>
                    <p className="text-red-200/80 text-sm leading-relaxed">{errorDetails.message}</p>
                    <p className="text-red-300/70 text-xs mt-1">
                      <strong className="text-white">Action:</strong> {errorDetails.recoverySuggestion}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => runDecisionPipeline(selectedLocation, duration, mode)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-red-900/50 border border-red-500/40 text-white hover:bg-red-800/50 transition-colors"
                    >
                      Retry
                    </button>
                    {mode === 'LIVE' && (
                      <button
                        onClick={() => handleModeChange('FIXTURE')}
                        className="px-3 py-1.5 text-xs rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-300 hover:bg-amber-900/60 transition-colors"
                      >
                        Use Demo
                      </button>
                    )}
                  </div>
                </div>

                {/* Alternative locations */}
                <div className="pt-2 border-t border-red-900/40 text-xs">
                  <span className="text-slate-400">Supported Metro Alternatives: </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {METROPOLITAN_LOCATIONS.filter((l) => !l.isDemoOnly).slice(0, 4).map((altLoc) => (
                      <button
                        key={altLoc.id}
                        onClick={() => {
                          handleSelectLocation(altLoc);
                          runDecisionPipeline(altLoc, duration, 'LIVE');
                        }}
                        className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-cyan-300 hover:border-cyan-500 text-[10px] font-mono"
                      >
                        {altLoc.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Spatial Thermal Map ── */}
            <div className="rounded-xl border border-[#1e2d45] bg-[#0d1422] p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-bold text-white">Thermal Map</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    <span>Current spatial temperature distribution across sites</span>
                    {spatialFieldMeta?.baseTimestamp && (
                      <span className="font-mono text-cyan-500/80">
                        {' · '}
                        {new Date(spatialFieldMeta.baseTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-[11px] text-slate-500 font-mono hidden sm:block">
                  {selectedLocation.name.split(' (')[0]}
                </span>
              </div>

              <ThermalMap
                location={{ latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }}
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
            </div>

            {/* ── Recommended Operational Plan ── */}
            {jointDecision && !errorDetails ? (
              <div
                className="rounded-xl border border-emerald-700/30 bg-[#0d1422] overflow-hidden"
                data-testid="decision-card"
              >
                {/* Hero recommendation */}
                <div className="px-5 pt-5 pb-4 border-b border-[#1e2d45]">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                      ★ Recommended Plan
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#141f33] text-slate-400 border border-[#1e2d45]">
                      {jointDecision.dataSource}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Location */}
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">📍 Location</div>
                      <div className="text-lg font-bold text-white leading-tight">
                        {jointDecision.recommendedPlan.location.name.split(' (')[0]}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {jointDecision.recommendedPlan.location.locationId}
                      </div>
                    </div>

                    {/* Window */}
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">⏱ When</div>
                      <div className="text-lg font-bold text-white font-mono leading-tight">
                        {fmtTimeWindow(jointDecision.recommendedPlan.window.startTime, jointDecision.recommendedPlan.window.endTime, selectedLocation.timezone)}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        <span data-testid="recommended-duration">{jointDecision.recommendedPlan.window.durationHours}h duration</span>
                      </div>
                    </div>

                    {/* Temperature */}
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                        🌡 Modeled Temp ({tempUnitSuffix(unit)})
                      </div>
                      <div
                        className="text-3xl font-black text-emerald-400 font-mono leading-tight thermal-glow-emerald"
                        data-testid="recommended-temp-display"
                      >
                        {fmtTemp(jointDecision.recommendedPlan.exposureScore, unit)}
                      </div>
                      <div className="text-[11px] text-slate-400">Mean across window</div>
                    </div>
                  </div>

                  {/* Advantage summary */}
                  {jointDecision.rankedPlans.length > 1 && (
                    <div className="mt-4 rounded-lg px-3.5 py-2.5 bg-emerald-950/30 border border-emerald-700/30 text-sm text-emerald-100">
                      <span className="text-emerald-300 font-medium">Best feasible plan</span> across{' '}
                      <strong className="text-white">{jointDecision.searchSpace.locationCount} locations × {jointDecision.searchSpace.windowCount} windows</strong>{' '}
                      ({jointDecision.searchSpace.totalEvaluatedPlans} evaluated).
                      Saves{' '}
                      <span className="text-amber-300 font-bold font-mono" data-testid="advantage-delta-display">
                        {fmtTempDelta(jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1].deltaVsBest, unit)}
                      </span>{' '}
                      vs worst plan.
                    </div>
                  )}
                </div>

                {/* Top 3 candidate summary */}
                <div className="px-5 py-4 border-b border-[#1e2d45]">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                    Top 3 Plans
                  </div>
                  <div className="space-y-2" data-testid="top-3-plans">
                    {top3Plans.map((plan) => (
                      <div
                        key={plan.planId}
                        className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${
                          plan.rank === 1
                            ? 'bg-emerald-950/30 border border-emerald-700/30'
                            : 'bg-[#141f33] border border-[#1e2d45]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`text-sm font-bold font-mono shrink-0 ${plan.rank === 1 ? 'text-emerald-400' : 'text-slate-400'}`}>
                            #{plan.rank}
                          </span>
                          <div className="min-w-0">
                            <div className={`text-sm font-semibold truncate ${plan.rank === 1 ? 'text-white' : 'text-slate-300'}`}>
                              {plan.location.name.split(' (')[0]}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {fmtTimeWindow(plan.window.startTime, plan.window.endTime, selectedLocation.timezone)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <div className={`text-base font-black font-mono ${plan.rank === 1 ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {fmtTemp(plan.exposureScore, unit)}
                          </div>
                          {plan.deltaVsBest > 0 && (
                            <div className="text-[11px] font-mono text-amber-400">
                              {fmtTempDelta(plan.deltaVsBest, unit)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Show all / collapse toggle */}
                  {remainingPlans.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowAllPlans(!showAllPlans)}
                        className="text-[11px] text-cyan-500 hover:text-cyan-300 font-medium transition-colors flex items-center gap-1"
                      >
                        {showAllPlans ? '▲ Hide' : `▼ Show all ${jointDecision.rankedPlans.length} plans`}
                      </button>

                      {showAllPlans && (
                        <div className="mt-2 overflow-x-auto rounded-lg border border-[#1e2d45]">
                          <table className="w-full text-xs font-mono text-left" data-testid="candidate-plans-table">
                            <thead className="bg-[#0a1220] text-slate-400 border-b border-[#1e2d45]">
                              <tr>
                                <th className="py-2 px-3">Rank</th>
                                <th className="py-2 px-3">Location</th>
                                <th className="py-2 px-3">Window (UTC)</th>
                                <th className="py-2 px-3">Tile</th>
                                <th className="py-2 px-3">Exposure ({tempUnitSuffix(unit)})</th>
                                <th className="py-2 px-3">Δ Best</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#1e2d45]">
                              {jointDecision.rankedPlans.map((plan) => (
                                <tr
                                  key={plan.planId}
                                  className={
                                    plan.rank === 1
                                      ? 'bg-emerald-950/40 text-emerald-200'
                                      : 'text-slate-400'
                                  }
                                >
                                  <td className="py-2 px-3 font-bold">#{plan.rank}</td>
                                  <td className="py-2 px-3">
                                    <span className="text-cyan-400">{plan.location.locationId}</span>{' '}
                                    <span className="text-slate-400 text-[10px]">
                                      ({plan.location.name.split(' (')[0]})
                                    </span>
                                  </td>
                                  <td className="py-2 px-3">
                                    {fmtTimeWindow(plan.window.startTime, plan.window.endTime, selectedLocation.timezone)}
                                  </td>
                                  <td className="py-2 px-3 text-slate-400">{plan.tileId}</td>
                                  <td className="py-2 px-3 font-bold">{fmtTemp(plan.exposureScore, unit)}</td>
                                  <td className="py-2 px-3">
                                    {plan.deltaVsBest === 0 ? (
                                      <span className="text-emerald-400">0.00 (Best)</span>
                                    ) : (
                                      <span className="text-amber-400">{fmtTempDelta(plan.deltaVsBest, unit)}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Data provenance toggle */}
                <div className="px-5 py-3">
                  <button
                    onClick={() => setShowProvenance(!showProvenance)}
                    className="text-[11px] text-slate-600 hover:text-slate-400 transition-colors flex items-center gap-1"
                  >
                    {showProvenance ? '▲ Hide' : '▼ Data provenance'}
                  </button>
                  {showProvenance && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="bg-[#0a1220] rounded-lg p-3 border border-[#1e2d45] space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          <span className="font-bold text-cyan-400">DATA SOURCE</span>
                        </div>
                        <p className="text-slate-400 font-mono text-[11px]">
                          Mode: <span className="text-white">{jointDecision.dataSource}</span>
                        </p>
                        <p className="text-slate-500 text-[11px]">
                          {jointDecision.searchSpace.locationCount} spatial sites ×{' '}
                          {jointDecision.searchSpace.windowCount} windows ={' '}
                          {jointDecision.searchSpace.totalEvaluatedPlans} plans evaluated.
                        </p>
                      </div>
                      <div className="bg-[#0a1220] rounded-lg p-3 border border-[#1e2d45] space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-400" />
                          <span className="font-bold text-indigo-400">DERIVED TILE EXPOSURE</span>
                        </div>
                        <p className="text-slate-400 text-[11px]">
                          Tile average temperatures are FortyGuard spatial polygon aggregations (
                          <span className="font-mono text-cyan-300">DERIVED</span>).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : !loading && !errorDetails ? (
              <div className="rounded-xl border border-[#1e2d45] bg-[#0d1422] px-5 py-10 text-center">
                <p className="text-slate-500 text-sm">Run the decision to see the recommended operational plan.</p>
              </div>
            ) : null}

            {/* ── What-If Constraint Sensitivity ── */}
            {scenarioAnalysis && scenarioAnalysis.scenarios.length > 0 && !errorDetails && (
              <div className="rounded-xl border border-[#1e2d45] bg-[#0d1422] overflow-hidden" data-testid="what-if-card">
                <div className="px-5 pt-5 pb-4 border-b border-[#1e2d45]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                      ⊕ What-If Constraint Sensitivity
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-500">
                    Modeled temperature cost when operational constraints override the unconstrained optimum P₀.
                  </p>
                </div>

                <div className="px-5 py-4">
                  {/* Scenario buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                    {scenarioAnalysis.scenarios.map((sc) => (
                      <button
                        key={sc.scenarioId}
                        onClick={() => {
                          setSelectedScenarioId(sc.scenarioId);
                          if (jointDecision) fetchExplanation(jointDecision, sc);
                        }}
                        className={`text-left rounded-lg px-3 py-2.5 text-sm transition-all border ${
                          selectedScenarioId === sc.scenarioId
                            ? 'bg-indigo-900/40 border-indigo-600/50 text-white'
                            : 'bg-[#141f33] border-[#1e2d45] text-slate-400 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        <div className="font-semibold text-[13px] leading-tight">{sc.scenarioName}</div>
                        <div className="text-[10px] opacity-70 mt-0.5">{sc.constraintType}</div>
                      </button>
                    ))}
                  </div>

                  {/* Constraint result */}
                  {activeScenario && (
                    <div className="space-y-3">
                      {/* 3-box flow */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Baseline */}
                        <div className="rounded-lg p-3.5 bg-[#0a1220] border border-[#1e2d45]">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-500 mb-2">
                            BASELINE
                          </div>
                          <div
                            className="text-2xl font-black text-cyan-400 font-mono mb-1"
                            data-testid="whatif-baseline-temp"
                          >
                            {fmtTemp(activeScenario.baselinePlan.exposureScore, unit)}
                          </div>
                          <div className="text-sm font-semibold text-white leading-tight">
                            {activeScenario.baselinePlan.location.name.split(' (')[0]}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {fmtTimeWindow(activeScenario.baselinePlan.window.startTime, activeScenario.baselinePlan.window.endTime, selectedLocation.timezone)}
                          </div>
                          <div className="text-[9px] font-mono text-slate-500 mt-1.5 opacity-60">ID: P₀</div>
                        </div>

                        {/* Constraint arrow */}
                        <div className="rounded-lg p-3.5 bg-indigo-950/20 border border-indigo-700/30 flex flex-col justify-center">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-indigo-400 mb-2">
                            CONSTRAINT
                          </div>
                          <div className="text-sm font-semibold text-white leading-snug">
                            {activeScenario.constraintDescription}
                          </div>
                          <div className="text-[10px] font-mono text-indigo-400/80 mt-1.5">
                            {activeScenario.constraintType}
                          </div>
                        </div>

                        {/* Constrained optimum */}
                        <div className="rounded-lg p-3.5 bg-[#0a1220] border border-amber-700/30">
                          <div className="text-[9px] font-bold uppercase tracking-widest text-amber-500 mb-2">
                            CONSTRAINED RESULT
                          </div>
                          <div
                            className="text-2xl font-black text-amber-400 font-mono mb-1"
                            data-testid="whatif-constrained-temp"
                          >
                            {activeScenario.constrainedPlan
                              ? fmtTemp(activeScenario.constrainedPlan.exposureScore, unit)
                              : 'Infeasible'}
                          </div>
                          <div className="text-sm font-semibold text-white leading-tight">
                            {activeScenario.constrainedPlan?.location.name.split(' (')[0] || 'No Feasible Plan'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {activeScenario.constrainedPlan
                              ? fmtTimeWindow(activeScenario.constrainedPlan.window.startTime, activeScenario.constrainedPlan.window.endTime, selectedLocation.timezone)
                              : activeScenario.infeasibleReason || 'Infeasible'}
                          </div>
                          <div className="text-[9px] font-mono text-amber-500/60 mt-1.5 opacity-60">ID: P&apos;</div>
                        </div>
                      </div>

                      {/* Cost banner */}
                      {activeScenario.status === 'FEASIBLE' && activeScenario.costOfConstraintCelsius !== null ? (
                        <div className="constraint-cost rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-baseline gap-3">
                            <span
                              className="text-3xl font-black font-mono text-amber-400 thermal-glow-amber"
                              data-testid="whatif-cost-display"
                            >
                              {fmtTempDelta(activeScenario.costOfConstraintCelsius, unit)}
                            </span>
                            <div>
                              <div className="text-sm font-bold text-white">THERMAL COST</div>
                              <div className="text-[11px] text-slate-400">
                                Mean modeled temperature increase under {activeScenario.scenarioName}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono">
                            <span
                              className={`px-2 py-1 rounded ${
                                activeScenario.locationShifted
                                  ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
                                  : 'bg-[#141f33] text-slate-400 border border-[#1e2d45]'
                              }`}
                            >
                              Location: {activeScenario.locationShifted ? 'Shifted' : 'Same'}
                            </span>
                            <span
                              className={`px-2 py-1 rounded ${
                                activeScenario.windowShifted
                                  ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40'
                                  : 'bg-[#141f33] text-slate-400 border border-[#1e2d45]'
                              }`}
                            >
                              Window: {activeScenario.windowShifted ? 'Shifted' : 'Same'}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg px-3.5 py-3 bg-red-950/20 border border-red-700/30 text-sm text-red-300">
                          ⚠️ Infeasible Scenario: {activeScenario.infeasibleReason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Grounded AI Explanation ── */}
            {explanation && !errorDetails && (() => {
              const displayExplanation = translateExplanationToUnit(explanation, unit);
              return (
              <div className="rounded-xl border border-[#1e2d45] bg-[#0d1422] overflow-hidden">
                <div className="px-5 pt-5 pb-4 border-b border-[#1e2d45]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Decision Explanation
                      </span>
                      {displayExplanation.generatedBy === 'AI_GROUNDED_EXPLAINER' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-900/40 text-indigo-300 border border-indigo-700/40">
                          🤖 Gemini Grounded AI
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#141f33] text-slate-400 border border-[#1e2d45]">
                          ⚡ Deterministic Explainer
                        </span>
                      )}
                    </div>
                    <button
                      disabled={explaining}
                      onClick={() => {
                        if (jointDecision) {
                          const activeScen = scenarioAnalysis?.scenarios?.find(
                            (s) => s.scenarioId === selectedScenarioId
                          );
                          fetchExplanation(jointDecision, activeScen);
                        }
                      }}
                      className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                    >
                      {explaining ? '↻ Synthesizing…' : '↻ Refresh'}
                    </button>
                  </div>
                </div>

                <div className="px-5 py-4 space-y-3">
                  {/* Operational Summary */}
                  <div className="rounded-lg bg-[#0a1220] border border-[#1e2d45] p-3.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mb-2">Operational Summary</div>
                    <p className="text-slate-200 leading-relaxed text-sm">{displayExplanation.summary}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Why this plan wins */}
                    <div className="rounded-lg bg-[#0a1220] border border-[#1e2d45] p-3.5">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-500 mb-2">Why This Plan Wins</div>
                      <p className="text-slate-300 leading-relaxed text-sm">{displayExplanation.whyThisPlan}</p>
                    </div>

                    {/* Constraint impact */}
                    {displayExplanation.constraintImpact && (
                      <div className="rounded-lg bg-[#0a1220] border border-[#1e2d45] p-3.5">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-2">What-If Impact</div>
                        <p className="text-slate-300 leading-relaxed text-sm">{displayExplanation.constraintImpact}</p>
                      </div>
                    )}
                  </div>

                  {/* Epistemic boundary */}
                  <div className="rounded-lg bg-[#0a1220]/60 border border-[#1e2d45]/60 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-slate-500 text-xs">🛡️</span>
                      <span className="text-[10px] font-semibold text-slate-400">Epistemic & Provenance Boundary</span>
                      {displayExplanation.fallbackReason && (
                        <code className="text-[9px] font-mono text-amber-500/80 ml-1">
                          ({displayExplanation.fallbackReason})
                        </code>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{displayExplanation.epistemicNotice}</p>
                  </div>
                </div>
              </div>
            );
            })()}

          </div>{/* end right panel */}
        </div>
      </div>
    </main>
  );
}
