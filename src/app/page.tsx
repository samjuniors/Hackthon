'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { LocationSearch } from '@/components/LocationSearch';
import { ProviderHealthCard } from '@/components/ProviderHealthCard';
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
    const res  = await fetch(url, init);
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

function fmtTimeWindow(start: string, end: string, tz?: string) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz || 'UTC',
    });
  const endFmt = new Date(end).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz || 'UTC',
    timeZoneName: 'short',
  });
  return `${fmt(start)} – ${endFmt}`;
}

function formatIsoTimesInText(text: string, tz?: string) {
  if (!text) return text;
  const isoRegex = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;
  return text.replace(isoRegex, (match) => {
    try {
      return new Date(match).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz || 'UTC',
        timeZoneName: 'short',
      });
    } catch { return match; }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatusDot({ status, mode }: { status: ProviderStatus; mode?: DataSourceMode }) {
  if (mode === 'FIXTURE') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--status-demo)' }}>
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--status-demo)' }} />
        DEMO
      </span>
    );
  }
  const map: Record<ProviderStatus, { dot: string; label: string; pulse?: boolean }> = {
    CONNECTED: { dot: 'var(--status-live)',    label: 'LIVE',    pulse: true },
    CHECKING:  { dot: 'var(--status-demo)',    label: 'CHECKING' },
    ERROR:     { dot: 'var(--status-error)',   label: 'OFFLINE' },
    UNKNOWN:   { dot: 'var(--status-unknown)', label: 'UNKNOWN' },
  };
  const s = map[status] ?? map.UNKNOWN;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted">
      <span
        className={`w-2 h-2 rounded-full inline-block${s.pulse ? ' status-dot-live' : ''}`}
        style={{ background: s.dot }}
      />
      {s.label}
    </span>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-dimmed mb-3">
      {children}
    </h2>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-border hover:border-border bg-surface-elevated hover:bg-surface-deep transition-all text-text-muted hover:text-text-primary"
    >
      {theme === 'dark' ? (
        // Sun icon — click to go light
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <line x1="12" y1="2"  x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="2" y1="12" x2="4"  y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        // Moon icon — click to go dark
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const [mode, setMode]                   = useState<DataSourceMode>('FIXTURE');
  const [selectedLocation, setSelectedLocation] = useState<NamedLocation>(METROPOLITAN_LOCATIONS[0]);
  const [duration, setDuration]           = useState<number>(3);
  const [unit, setUnit]                   = useTempUnit();

  const [fgStatus, setFgStatus]           = useState<ProviderStatus>('UNKNOWN');
  const [fgHealth, setFgHealth]           = useState<FortyGuardHealthResponse | null>(null);
  const [aiStatus, setAiStatus]           = useState<ProviderStatus>('UNKNOWN');
  const [aiHealth, setAiHealth]           = useState<AIHealthResponse | null>(null);

  const [loading, setLoading]             = useState<boolean>(false);
  const [decision, setDecision]           = useState<DecisionResult | null>(null);
  const [spatialDecision, setSpatialDecision] = useState<SpatialDecisionResult | null>(null);
  const [jointDecision, setJointDecision] = useState<JointDecisionResult | null>(null);
  const [scenarioAnalysis, setScenarioAnalysis] = useState<ScenarioAnalysisResult | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('scenario-temporal-shift');
  const [explanation, setExplanation]     = useState<DecisionExplanation | null>(null);
  const [explaining, setExplaining]       = useState<boolean>(false);
  const [spatialField, setSpatialField]   = useState<PolygonAOI | null>(null);
  const [spatialFieldMeta, setSpatialFieldMeta] = useState<{
    baseTimestamp: string;
    coverageType: string;
    description: string;
    totalEvaluatedHours: number;
  } | null>(null);
  const [errorDetails, setErrorDetails]   = useState<ProductionErrorDetails | null>(null);
  const [showAllPlans, setShowAllPlans]   = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);

  // ──────────────────────────── Health Checks ────────────────────────────────

  const checkFortyGuardHealth = useCallback(async (checkMode: DataSourceMode = mode) => {
    setFgStatus('CHECKING');
    try {
      const { ok, data } = await safeJsonFetch<{ success?: boolean; health?: FortyGuardHealthResponse }>(
        '/api/health/fortyguard',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: checkMode }) }
      );
      if (ok && data?.success && data.health) {
        setFgHealth(data.health);
        setFgStatus(data.health.connected ? 'CONNECTED' : 'ERROR');
      } else {
        setFgStatus('ERROR');
      }
    } catch { setFgStatus('ERROR'); }
  }, [mode]);

  const checkAIHealth = useCallback(async () => {
    setAiStatus('CHECKING');
    try {
      const { ok, data } = await safeJsonFetch<{ success?: boolean; health?: AIHealthResponse }>(
        '/api/health/ai', { method: 'POST' }
      );
      if (ok && data?.success && data.health) {
        setAiHealth(data.health);
        setAiStatus(data.health.connected ? 'CONNECTED' : data.health.configured ? 'ERROR' : 'UNKNOWN');
      } else {
        setAiStatus('ERROR');
      }
    } catch { setAiStatus('ERROR'); }
  }, []);

  // ──────────────────────────── AI Explanation ───────────────────────────────

  const fetchExplanation = useCallback(async (
    jointDec: JointDecisionResult,
    activeScen?: WhatIfScenarioResult
  ) => {
    setExplaining(true);
    try {
      const { ok, data } = await safeJsonFetch<{ success?: boolean; explanation?: DecisionExplanation }>(
        '/api/explain',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jointDecision: jointDec, activeScenario: activeScen }),
        }
      );
      if (ok && data?.success && data.explanation) setExplanation(data.explanation);
    } catch { /* Non-blocking */ } finally { setExplaining(false); }
  }, []);

  const activeRequestIdRef = useRef<number>(0);
  const modeRef            = useRef<DataSourceMode>(mode);
  const selectedLocationRef = useRef<NamedLocation>(selectedLocation);
  const durationRef        = useRef<number>(duration);

  useEffect(() => {
    modeRef.current            = mode;
    selectedLocationRef.current = selectedLocation;
    durationRef.current        = duration;
  }, [mode, selectedLocation, duration]);

  // ──────────────────────────── Decision Pipeline ─────────────────────────────

  const runDecisionPipeline = useCallback(async (
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
        error?: { code?: string; message?: string; details?: ProductionErrorDetails };
      }>('/api/decision', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ latitude: loc.latitude, longitude: loc.longitude, durationHours, mode: dataSourceMode }),
      });

      if (requestId !== activeRequestIdRef.current) return;

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
          data.scenarioAnalysis?.scenarios?.find((s: WhatIfScenarioResult) => s.scenarioId === selectedScenarioId) ||
          data.scenarioAnalysis?.scenarios?.[0];
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
      if (requestId === activeRequestIdRef.current) setLoading(false);
    }
  }, [fetchExplanation, selectedScenarioId]);

  const handleSelectLocation = useCallback((loc: NamedLocation) => {
    setSelectedLocation(loc);
    selectedLocationRef.current = loc;
    setDecision(null);
    setSpatialDecision(null);
    setJointDecision(null);
    setScenarioAnalysis(null);
    setSpatialField(null);
    setSpatialFieldMeta(null);
    setExplanation(null);
    setErrorDetails(null);

    const currentMode = modeRef.current;
    if (currentMode === 'LIVE' || isLocationCoveredByFixture(loc)) {
      runDecisionPipeline(loc, durationRef.current, currentMode);
    }
  }, [runDecisionPipeline]);

  const handleModeChange = useCallback((newMode: DataSourceMode) => {
    modeRef.current = newMode;
    setMode(newMode);
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
        const defaultFixtureLoc = METROPOLITAN_LOCATIONS[0];
        setSelectedLocation(defaultFixtureLoc);
        selectedLocationRef.current = defaultFixtureLoc;
        runDecisionPipeline(defaultFixtureLoc, durationRef.current, 'FIXTURE');
      } else {
        runDecisionPipeline(currentLoc, durationRef.current, 'FIXTURE');
      }
    } else {
      runDecisionPipeline(currentLoc, durationRef.current, 'LIVE');
    }
  }, [checkFortyGuardHealth, runDecisionPipeline]);

  // ──────────────────────────── Initial Mount ─────────────────────────────────

  useEffect(() => {
    let isMounted = true;

    void safeJsonFetch<{ success?: boolean; health?: FortyGuardHealthResponse }>(
      '/api/health/fortyguard',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'FIXTURE' }) }
    ).then(({ ok, data }) => {
      if (!isMounted) return;
      if (ok && data?.success && data.health) {
        setFgHealth(data.health);
        setFgStatus(data.health.connected ? 'CONNECTED' : 'ERROR');
      }
    }).catch(() => {});

    void safeJsonFetch<{ success?: boolean; health?: AIHealthResponse }>(
      '/api/health/ai', { method: 'POST' }
    ).then(({ ok, data }) => {
      if (!isMounted) return;
      if (ok && data?.success && data.health) {
        setAiHealth(data.health);
        setAiStatus(data.health.connected ? 'CONNECTED' : data.health.configured ? 'ERROR' : 'UNKNOWN');
      }
    }).catch(() => {});

    void (async () => { if (isMounted) await runDecisionPipeline(METROPOLITAN_LOCATIONS[0], 3, 'FIXTURE'); })();

    return () => { isMounted = false; };
  }, [runDecisionPipeline]);

  // Derived state
  const isFixtureMismatch = mode === 'FIXTURE' && !isLocationCoveredByFixture(selectedLocation);
  const activeScenario =
    scenarioAnalysis?.scenarios?.find((s) => s.scenarioId === selectedScenarioId) ||
    scenarioAnalysis?.scenarios?.[0] || null;
  const top3Plans     = jointDecision?.rankedPlans.slice(0, 3) ?? [];
  const remainingPlans = jointDecision?.rankedPlans.slice(3) ?? [];

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-surface-bg text-text-primary" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ══════════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-border backdrop-blur-xl" style={{ background: 'var(--surface-header)' }}>
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">

          {/* Title */}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-text-primary leading-tight">
              Thermal Decision Engine
            </h1>
            <p className="text-[11px] text-text-muted mt-0 hidden sm:block">
              FortyGuard hyperlocal intelligence → WHERE + WHEN decisions
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">

            {/* °F / °C toggle */}
            <div
              role="group"
              aria-label="Temperature unit selection"
              className="flex items-center bg-surface-elevated p-1 rounded-full border border-border"
              data-testid="temp-unit-toggle"
            >
              {(['F', 'C'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  aria-pressed={unit === u}
                  data-testid={`temp-unit-${u.toLowerCase()}`}
                  onClick={() => setUnit(u)}
                  className={`min-h-[36px] min-w-[36px] px-3 py-1 rounded-full text-xs font-bold font-mono transition-all flex items-center justify-center ${
                    unit === u
                      ? 'bg-accent-cyan text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  °{u}
                </button>
              ))}
            </div>

            {/* Status indicators */}
            <div className="hidden sm:flex items-center gap-3">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[9px] text-text-dimmed uppercase tracking-wider font-medium">FortyGuard</span>
                <StatusDot status={fgStatus} mode={mode === 'FIXTURE' ? 'FIXTURE' : undefined} />
              </div>

              <div className="w-px h-7 bg-border" />

              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[9px] text-text-dimmed uppercase tracking-wider font-medium">AI</span>
                <StatusDot status={aiStatus} />
              </div>
            </div>

            {/* Mode badge */}
            {mode === 'FIXTURE' ? (
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-accent-amber-bg text-accent-amber border border-border">
                DEMO
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-accent-emerald-bg text-accent-emerald border border-border">
                LIVE
              </span>
            )}

            {/* Theme toggle */}
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">

          {/* ═══════════════════════════════════════════════════════════════
              LEFT PANEL — Control Workspace (4 cols on large screens)
          ═══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-4 space-y-4">

            {/* DEMO notice */}
            {mode === 'FIXTURE' && (
              <div className="rounded-xl p-3.5 border border-border bg-accent-amber-bg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm" style={{ color: 'var(--accent-amber)' }}>⬡</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--accent-amber)' }}>
                    DEMO — Captured FortyGuard Data
                  </span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--accent-amber-text)', opacity: 0.85 }}>
                  Offline demonstration using a 12-hour Manhattan thermal field capture.
                  Switch to LIVE API to analyse any location in real time.
                </p>
              </div>
            )}

            {/* ── Execution Mode ── */}
            <div className="rounded-xl border border-border bg-surface-card p-4">
              <SectionHeading>Execution Mode</SectionHeading>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleModeChange('FIXTURE')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-all border ${
                    mode === 'FIXTURE'
                      ? 'border-accent-amber bg-accent-amber-bg text-accent-amber'
                      : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                  }`}
                >
                  DEMO
                </button>
                <button
                  onClick={() => handleModeChange('LIVE')}
                  className={`min-h-[44px] rounded-lg text-sm font-semibold transition-all border ${
                    mode === 'LIVE'
                      ? 'border-accent-emerald bg-accent-emerald-bg text-accent-emerald'
                      : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                  }`}
                >
                  LIVE API
                </button>
              </div>
            </div>

            {/* ── Location + Duration + Run ── */}
            <div className="rounded-xl border border-border bg-surface-card p-4 space-y-4">
              <LocationSearch
                selectedLocation={selectedLocation}
                mode={mode}
                onSelectLocation={handleSelectLocation}
                onSwitchToLive={() => handleModeChange('LIVE')}
              />

              <div className="border-t border-border" />

              {/* Duration slider */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-secondary">Operation Duration</span>
                  <span className="text-base font-black text-accent-cyan font-mono" data-testid="duration-display">
                    {duration}h
                  </span>
                </div>
                <div className="relative h-2 bg-surface-deep rounded-full">
                  <div
                    className="absolute left-0 top-0 h-full rounded-full transition-all"
                    style={{
                      width: `${((duration - 1) / 3) * 100}%`,
                      background: 'var(--accent-cyan)',
                    }}
                  />
                  <input
                    type="range" min={1} max={4} step={1} value={duration}
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
                <div className="flex justify-between text-[10px] text-text-dimmed mt-1.5 font-mono">
                  {[1,2,3,4].map(h => (
                    <span key={h} className={duration === h ? 'font-bold' : ''} style={duration === h ? { color: 'var(--accent-cyan)' } : {}}>
                      {h}h
                    </span>
                  ))}
                </div>
              </div>

              <div className="border-t border-border" />

              {/* Active location indicator */}
              <div
                className="rounded-lg p-3 bg-surface-deep border border-border space-y-1"
                data-testid="active-analysis-location-indicator"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-text-dimmed">Analysis Location</span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold border"
                    style={mode === 'LIVE'
                      ? { background: 'var(--accent-cyan-bg)', color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }
                      : { background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }
                    }
                    data-testid="analysis-mode-badge"
                  >
                    {mode === 'LIVE' ? 'LIVE — FortyGuard' : 'DEMO — Manhattan Fixture'}
                  </span>
                </div>
                <div className="text-sm font-bold text-text-primary leading-tight" data-testid="active-analysis-location-name">
                  {selectedLocation.name}
                </div>
                <div className="text-[11px] font-mono flex items-center justify-between" style={{ color: 'var(--accent-cyan)' }} data-testid="active-analysis-location-coords">
                  <span>{selectedLocation.latitude.toFixed(4)}°, {selectedLocation.longitude.toFixed(4)}°</span>
                  {selectedLocation.city && (
                    <span className="text-text-muted font-sans text-[10px]">
                      {selectedLocation.city}, {selectedLocation.state || selectedLocation.country}
                    </span>
                  )}
                </div>
              </div>

              {/* Run button */}
              {isFixtureMismatch ? (
                <button
                  onClick={() => handleModeChange('LIVE')}
                  data-testid="recalculate-decision-btn"
                  className="w-full h-12 rounded-xl text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 text-white"
                  style={{ background: 'linear-gradient(135deg, var(--accent-emerald), #0d9488)', boxShadow: '0 4px 16px rgba(5,150,105,0.3)' }}
                >
                  ⚡ Switch to LIVE to Calculate
                </button>
              ) : (
                <button
                  disabled={loading}
                  onClick={() => runDecisionPipeline(selectedLocation, duration, mode)}
                  data-testid="recalculate-decision-btn"
                  className={`w-full h-12 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                    loading
                      ? 'bg-surface-elevated text-text-dimmed cursor-not-allowed'
                      : 'text-white hover:scale-[1.01] active:scale-[0.99]'
                  }`}
                  style={loading ? {} : {
                    background: 'linear-gradient(135deg, var(--accent-cyan), #0284c7)',
                    boxShadow: '0 4px 16px rgba(14,165,233,0.3)',
                  }}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-text-dimmed border-t-accent-cyan rounded-full animate-spin" style={{ borderTopColor: 'var(--accent-cyan)' }} />
                      Evaluating thermal field…
                    </span>
                  ) : '⚡ Calculate Decision'}
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

            <div className="text-[10px] text-text-dimmed font-mono text-center">
              FortyGuard Hackathon&apos;26
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              RIGHT PANEL — Decision Workspace (8 cols)
          ═══════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-8 space-y-5">

            {/* ── Error Banner ── */}
            {errorDetails && (
              <div
                className="rounded-xl p-4 border-2 space-y-3"
                style={{ borderColor: 'var(--accent-red)', background: 'var(--accent-red-bg)' }}
                data-testid="production-error-banner"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🔴</span>
                      <span className="font-bold text-sm" style={{ color: 'var(--accent-red-text)' }}>
                        {errorDetails.code === 'OUTSIDE_COVERAGE'
                          ? 'FortyGuard Coverage Unavailable'
                          : 'Analysis Halted'}
                      </span>
                      <code className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-surface-elevated text-text-muted">
                        {errorDetails.code}
                      </code>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--accent-red-text)' }}>{errorDetails.message}</p>
                    <p className="text-xs mt-1 text-text-muted">
                      <strong className="text-text-primary">Action:</strong> {errorDetails.recoverySuggestion}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => runDecisionPipeline(selectedLocation, duration, mode)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-border bg-surface-elevated text-text-primary hover:bg-surface-deep transition-colors"
                    >
                      Retry
                    </button>
                    {mode === 'LIVE' && (
                      <button
                        onClick={() => handleModeChange('FIXTURE')}
                        className="px-3 py-1.5 text-xs rounded-lg border text-accent-amber hover:bg-accent-amber-bg transition-colors"
                        style={{ borderColor: 'var(--accent-amber)', background: 'var(--accent-amber-bg)' }}
                      >
                        Demo Mode
                      </button>
                    )}
                  </div>
                </div>

                {/* Alternative locations */}
                <div className="pt-2 border-t border-border text-xs">
                  <span className="text-text-muted">Supported metro alternatives: </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {METROPOLITAN_LOCATIONS.filter((l) => !l.isDemoOnly).slice(0, 4).map((altLoc) => (
                      <button
                        key={altLoc.id}
                        onClick={() => { handleSelectLocation(altLoc); runDecisionPipeline(altLoc, duration, 'LIVE'); }}
                        className="px-2 py-1 rounded border border-border bg-surface-elevated text-accent-cyan hover:border-accent-cyan text-[10px] font-mono transition-colors"
                      >
                        {altLoc.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ══ THERMAL MAP ══════════════════════════════════════════════════ */}
            <div className="rounded-xl border border-border bg-surface-card overflow-hidden">
              <div className="px-4 pt-4 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-text-primary">Thermal Map</h2>
                  <p className="text-xs text-text-muted mt-0.5">
                    FortyGuard spatial temperature distribution
                    {spatialFieldMeta?.baseTimestamp && (
                      <span className="font-mono ml-1.5" style={{ color: 'var(--accent-cyan)', opacity: 0.8 }}>
                        · {new Date(spatialFieldMeta.baseTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-xs text-text-dimmed font-mono hidden sm:block">
                  {selectedLocation.name.split(' (')[0]}
                </span>
              </div>

              <div className="px-4 pb-4">
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
            </div>

            {/* ══ RECOMMENDED OPERATIONAL PLAN ════════════════════════════════ */}
            {jointDecision && !errorDetails ? (
              <div
                className="rounded-xl border bg-surface-card overflow-hidden card-enter"
                style={{ borderColor: 'var(--accent-emerald)' }}
                data-testid="decision-card"
              >
                {/* Hero row */}
                <div className="px-5 pt-5 pb-5">
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--accent-emerald)' }}>
                      ★ Recommended Operational Plan
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-mono border"
                      style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                    >
                      {jointDecision.dataSource}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {/* WHERE */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">📍 WHERE</div>
                      <div className="text-xl font-black text-text-primary leading-tight">
                        {jointDecision.recommendedPlan.location.name.split(' (')[0]}
                      </div>
                      <div className="text-[11px] font-mono text-text-muted">
                        {jointDecision.recommendedPlan.location.locationId}
                      </div>
                    </div>

                    {/* WHEN */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">⏱ WHEN</div>
                      <div className="text-xl font-black text-text-primary font-mono leading-tight">
                        {fmtTimeWindow(jointDecision.recommendedPlan.window.startTime, jointDecision.recommendedPlan.window.endTime, selectedLocation.timezone)}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        <span data-testid="recommended-duration">{jointDecision.recommendedPlan.window.durationHours}h duration</span>
                      </div>
                    </div>

                    {/* TEMP */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">
                        🌡 MODELED TEMP ({tempUnitSuffix(unit)})
                      </div>
                      <div
                        className="text-4xl font-black font-mono leading-tight thermal-glow-emerald"
                        style={{ color: 'var(--accent-emerald)' }}
                        data-testid="recommended-temp-display"
                      >
                        {fmtTemp(jointDecision.recommendedPlan.exposureScore, unit)}
                      </div>
                      <div className="text-[11px] text-text-muted">Mean across window</div>
                    </div>
                  </div>

                  {/* Advantage banner */}
                  {jointDecision.rankedPlans.length > 1 && (
                    <div
                      className="mt-5 rounded-lg px-4 py-3 text-sm"
                      style={{
                        background: 'var(--accent-emerald-bg)',
                        border: '1px solid var(--accent-emerald)',
                        color: 'var(--accent-emerald-text)',
                      }}
                    >
                      <span className="font-semibold">Best feasible plan</span> across{' '}
                      <strong className="text-text-primary">{jointDecision.searchSpace.locationCount} locations × {jointDecision.searchSpace.windowCount} windows</strong>{' '}
                      ({jointDecision.searchSpace.totalEvaluatedPlans} evaluated). Saves{' '}
                      <span className="font-black font-mono thermal-glow-amber" style={{ color: 'var(--accent-amber)' }} data-testid="advantage-delta-display">
                        {fmtTempDelta(jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1].deltaVsBest, unit)}
                      </span>{' '}
                      vs worst plan.
                    </div>
                  )}
                </div>

                {/* ── Top 3 candidate plans ── */}
                <div className="px-5 py-4 border-t border-border">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed mb-3">
                    Top Candidate Plans
                  </div>
                  <div className="space-y-2" data-testid="top-3-plans">
                    {top3Plans.map((plan) => (
                      <div
                        key={plan.planId}
                        className={`flex items-center justify-between rounded-lg px-3 py-2.5 border ${
                          plan.rank === 1 ? '' : ''
                        }`}
                        style={plan.rank === 1
                          ? { background: 'var(--accent-emerald-bg)', borderColor: 'var(--accent-emerald)' }
                          : { background: 'var(--surface-elevated)', borderColor: 'var(--border)' }
                        }
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="text-sm font-bold font-mono shrink-0"
                            style={{ color: plan.rank === 1 ? 'var(--accent-emerald)' : 'var(--text-dimmed)' }}
                          >
                            #{plan.rank}
                          </span>
                          <div className="min-w-0">
                            <div
                              className="text-sm font-semibold truncate"
                              style={{ color: plan.rank === 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            >
                              {plan.location.name.split(' (')[0]}
                            </div>
                            <div className="text-[11px] font-mono text-text-muted">
                              {fmtTimeWindow(plan.window.startTime, plan.window.endTime, selectedLocation.timezone)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <div
                            className="text-base font-black font-mono"
                            style={{ color: plan.rank === 1 ? 'var(--accent-emerald)' : 'var(--text-secondary)' }}
                          >
                            {fmtTemp(plan.exposureScore, unit)}
                          </div>
                          {plan.deltaVsBest > 0 && (
                            <div className="text-[11px] font-mono" style={{ color: 'var(--accent-amber)' }}>
                              {fmtTempDelta(plan.deltaVsBest, unit)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Show all / collapse */}
                  {remainingPlans.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowAllPlans(!showAllPlans)}
                        className="text-[11px] font-medium transition-colors flex items-center gap-1"
                        style={{ color: 'var(--accent-cyan)' }}
                      >
                        {showAllPlans ? '▲ Hide' : `▼ Show all ${jointDecision.rankedPlans.length} plans`}
                      </button>

                      {showAllPlans && (
                        <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                          <table className="w-full text-xs font-mono text-left" data-testid="candidate-plans-table">
                            <thead className="bg-surface-deep text-text-muted border-b border-border">
                              <tr>
                                <th className="py-2 px-3">Rank</th>
                                <th className="py-2 px-3">Location</th>
                                <th className="py-2 px-3">Window (UTC)</th>
                                <th className="py-2 px-3">Tile</th>
                                <th className="py-2 px-3">Exposure ({tempUnitSuffix(unit)})</th>
                                <th className="py-2 px-3">Δ Best</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {jointDecision.rankedPlans.map((plan) => (
                                <tr
                                  key={plan.planId}
                                  style={plan.rank === 1
                                    ? { background: 'var(--accent-emerald-bg)', color: 'var(--accent-emerald-text)' }
                                    : { color: 'var(--text-muted)' }
                                  }
                                >
                                  <td className="py-2 px-3 font-bold">#{plan.rank}</td>
                                  <td className="py-2 px-3">
                                    <span style={{ color: 'var(--accent-cyan)' }}>{plan.location.locationId}</span>{' '}
                                    <span className="text-[10px] text-text-dimmed">({plan.location.name.split(' (')[0]})</span>
                                  </td>
                                  <td className="py-2 px-3">{fmtTimeWindow(plan.window.startTime, plan.window.endTime, selectedLocation.timezone)}</td>
                                  <td className="py-2 px-3 text-text-dimmed">{plan.tileId}</td>
                                  <td className="py-2 px-3 font-bold">{fmtTemp(plan.exposureScore, unit)}</td>
                                  <td className="py-2 px-3">
                                    {plan.deltaVsBest === 0 ? (
                                      <span style={{ color: 'var(--accent-emerald)' }}>0.00 (Best)</span>
                                    ) : (
                                      <span style={{ color: 'var(--accent-amber)' }}>{fmtTempDelta(plan.deltaVsBest, unit)}</span>
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

                {/* Data provenance */}
                <div className="px-5 py-3 border-t border-border">
                  <button
                    onClick={() => setShowProvenance(!showProvenance)}
                    className="text-[11px] text-text-dimmed hover:text-text-muted transition-colors flex items-center gap-1"
                  >
                    {showProvenance ? '▲ Hide' : '▼ Data provenance'}
                  </button>
                  {showProvenance && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg p-3 border border-border bg-surface-elevated space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-cyan)' }} />
                          <span className="font-bold" style={{ color: 'var(--accent-cyan)' }}>DATA SOURCE</span>
                        </div>
                        <p className="font-mono text-[11px] text-text-muted">
                          Mode: <span className="text-text-primary">{jointDecision.dataSource}</span>
                        </p>
                        <p className="text-[11px] text-text-dimmed">
                          {jointDecision.searchSpace.locationCount} spatial sites × {jointDecision.searchSpace.windowCount} windows
                          = {jointDecision.searchSpace.totalEvaluatedPlans} plans evaluated.
                        </p>
                      </div>
                      <div className="rounded-lg p-3 border border-border bg-surface-elevated space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-indigo)' }} />
                          <span className="font-bold" style={{ color: 'var(--accent-indigo)' }}>DERIVED</span>
                        </div>
                        <p className="text-[11px] text-text-muted">
                          Tile average temperatures are FortyGuard spatial polygon aggregations (<span className="font-mono" style={{ color: 'var(--accent-cyan)' }}>DERIVED</span>).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : !loading && !errorDetails ? (
              <div className="rounded-xl border border-border bg-surface-card px-5 py-12 text-center">
                <div className="text-2xl mb-2">🌡</div>
                <p className="text-text-muted text-sm font-medium">Run the decision to see the recommended operational plan.</p>
                <p className="text-text-dimmed text-xs mt-1">Select a location, set a duration, then click Calculate.</p>
              </div>
            ) : null}

            {/* ══ WHAT-IF CONSTRAINT SENSITIVITY ═════════════════════════════ */}
            {scenarioAnalysis && scenarioAnalysis.scenarios.length > 0 && !errorDetails && (
              <div className="rounded-xl border border-border bg-surface-card overflow-hidden" data-testid="what-if-card">
                <div className="px-5 pt-5 pb-4 border-b border-border">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--accent-indigo)' }}>
                      ⊕ What-If Constraint Sensitivity
                    </span>
                  </div>
                  <p className="text-xs text-text-muted">
                    Modeled temperature cost when operational constraints override the unconstrained optimum P₀.
                  </p>
                </div>

                <div className="px-5 py-4">
                  {/* Scenario selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
                    {scenarioAnalysis.scenarios.map((sc) => (
                      <button
                        key={sc.scenarioId}
                        onClick={() => {
                          setSelectedScenarioId(sc.scenarioId);
                          if (jointDecision) fetchExplanation(jointDecision, sc);
                        }}
                        className="text-left rounded-lg px-3 py-2.5 text-sm transition-all border"
                        style={selectedScenarioId === sc.scenarioId
                          ? { background: 'var(--accent-indigo-bg)', borderColor: 'var(--accent-indigo)', color: 'var(--text-primary)' }
                          : { background: 'var(--surface-elevated)', borderColor: 'var(--border)', color: 'var(--text-muted)' }
                        }
                      >
                        <div className="font-semibold text-[13px] leading-tight">{sc.scenarioName}</div>
                        <div className="text-[10px] opacity-70 mt-0.5">{sc.constraintType}</div>
                      </button>
                    ))}
                  </div>

                  {/* Constraint flow */}
                  {activeScenario && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Baseline */}
                        <div className="rounded-lg p-4 border border-border bg-surface-elevated">
                          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-cyan)' }}>BASELINE P₀</div>
                          <div
                            className="text-2xl font-black font-mono mb-1"
                            style={{ color: 'var(--accent-cyan)' }}
                            data-testid="whatif-baseline-temp"
                          >
                            {fmtTemp(activeScenario.baselinePlan.exposureScore, unit)}
                          </div>
                          <div className="text-sm font-semibold text-text-primary leading-tight">
                            {activeScenario.baselinePlan.location.name.split(' (')[0]}
                          </div>
                          <div className="text-[11px] font-mono text-text-muted mt-0.5">
                            {fmtTimeWindow(activeScenario.baselinePlan.window.startTime, activeScenario.baselinePlan.window.endTime, selectedLocation.timezone)}
                          </div>
                        </div>

                        {/* Constraint */}
                        <div className="rounded-lg p-4 border flex flex-col justify-center" style={{ background: 'var(--accent-indigo-bg)', borderColor: 'var(--accent-indigo)' }}>
                          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-indigo)' }}>CONSTRAINT</div>
                          <div className="text-sm font-semibold text-text-primary leading-snug">
                            {activeScenario.constraintDescription}
                          </div>
                          <div className="text-[10px] font-mono mt-1.5 opacity-80" style={{ color: 'var(--accent-indigo)' }}>
                            {activeScenario.constraintType}
                          </div>
                        </div>

                        {/* Constrained result */}
                        <div className="rounded-lg p-4 border bg-surface-elevated" style={{ borderColor: 'var(--accent-amber)' }}>
                          <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-amber)' }}>CONSTRAINED P&apos;</div>
                          <div
                            className="text-2xl font-black font-mono mb-1"
                            style={{ color: 'var(--accent-amber)' }}
                            data-testid="whatif-constrained-temp"
                          >
                            {activeScenario.constrainedPlan
                              ? fmtTemp(activeScenario.constrainedPlan.exposureScore, unit)
                              : 'Infeasible'}
                          </div>
                          <div className="text-sm font-semibold text-text-primary leading-tight">
                            {activeScenario.constrainedPlan?.location.name.split(' (')[0] || 'No Feasible Plan'}
                          </div>
                          <div className="text-[11px] font-mono text-text-muted mt-0.5">
                            {activeScenario.constrainedPlan
                              ? fmtTimeWindow(activeScenario.constrainedPlan.window.startTime, activeScenario.constrainedPlan.window.endTime, selectedLocation.timezone)
                              : activeScenario.infeasibleReason || 'Infeasible'}
                          </div>
                        </div>
                      </div>

                      {/* Thermal cost banner */}
                      {activeScenario.status === 'FEASIBLE' && activeScenario.costOfConstraintCelsius !== null ? (
                        <div className="constraint-cost rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-baseline gap-3">
                            <span
                              className="text-4xl font-black font-mono thermal-glow-amber"
                              style={{ color: 'var(--accent-amber)' }}
                              data-testid="whatif-cost-display"
                            >
                              {fmtTempDelta(activeScenario.costOfConstraintCelsius, unit)}
                            </span>
                            <div>
                              <div className="text-sm font-bold text-text-primary">THERMAL COST</div>
                              <div className="text-xs text-text-muted">
                                Temperature increase under {activeScenario.scenarioName}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono flex-wrap">
                            {[
                              { label: 'Location', shifted: activeScenario.locationShifted },
                              { label: 'Window',   shifted: activeScenario.windowShifted },
                            ].map(({ label, shifted }) => (
                              <span
                                key={label}
                                className="px-2 py-1 rounded border"
                                style={shifted
                                  ? { background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }
                                  : { background: 'var(--surface-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
                                }
                              >
                                {label}: {shifted ? 'Shifted' : 'Same'}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg px-4 py-3 text-sm border" style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red)', color: 'var(--accent-red-text)' }}>
                          ⚠️ Infeasible Scenario: {activeScenario.infeasibleReason}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══ DECISION EXPLANATION ════════════════════════════════════════ */}
            {explanation && !errorDetails && (() => {
              const displayExplanation = translateExplanationToUnit(explanation, unit);
              const summaryText         = formatIsoTimesInText(displayExplanation.summary, selectedLocation.timezone);
              const whyThisPlanText     = formatIsoTimesInText(displayExplanation.whyThisPlan, selectedLocation.timezone);
              const constraintImpactText = displayExplanation.constraintImpact
                ? formatIsoTimesInText(displayExplanation.constraintImpact, selectedLocation.timezone)
                : '';
              return (
                <div className="rounded-xl border border-border bg-surface-card overflow-hidden">
                  <div className="px-5 pt-5 pb-4 border-b border-border">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-black uppercase tracking-widest text-text-dimmed">
                          Decision Explanation
                        </span>
                        {displayExplanation.generatedBy === 'AI_GROUNDED_EXPLAINER' ? (
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-semibold border"
                            style={{ background: 'var(--accent-indigo-bg)', color: 'var(--accent-indigo)', borderColor: 'var(--accent-indigo)' }}
                          >
                            🤖 Gemini Grounded AI
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold border border-border bg-surface-elevated text-text-muted">
                            ⚡ Deterministic Explainer
                          </span>
                        )}
                      </div>
                      <button
                        disabled={explaining}
                        onClick={() => {
                          if (jointDecision) {
                            const activeScen = scenarioAnalysis?.scenarios?.find((s) => s.scenarioId === selectedScenarioId);
                            fetchExplanation(jointDecision, activeScen);
                          }
                        }}
                        className="text-[11px] text-text-dimmed hover:text-text-muted transition-colors shrink-0"
                      >
                        {explaining ? '↻ Synthesizing…' : '↻ Refresh'}
                      </button>
                    </div>
                  </div>

                  <div className="px-5 py-4 space-y-3">
                    {/* Summary */}
                    <div className="rounded-lg bg-surface-deep border border-border p-4">
                      <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-indigo)' }}>Operational Summary</div>
                      <p className="text-text-primary leading-relaxed text-sm">{summaryText}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg bg-surface-deep border border-border p-4">
                        <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-cyan)' }}>Why This Plan Wins</div>
                        <p className="text-text-secondary leading-relaxed text-sm">{whyThisPlanText}</p>
                      </div>

                      {constraintImpactText && (
                        <div className="rounded-lg bg-surface-deep border border-border p-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-amber)' }}>What-If Impact</div>
                          <p className="text-text-secondary leading-relaxed text-sm">{constraintImpactText}</p>
                        </div>
                      )}
                    </div>

                    {/* Epistemic boundary */}
                    <div className="rounded-lg p-3 border border-border bg-surface-elevated">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs">🛡️</span>
                        <span className="text-[10px] font-semibold text-text-muted">Epistemic & Provenance Boundary</span>
                        {displayExplanation.fallbackReason && (
                          <code className="text-[9px] font-mono ml-1" style={{ color: 'var(--accent-amber)', opacity: 0.8 }}>
                            ({displayExplanation.fallbackReason})
                          </code>
                        )}
                      </div>
                      <p className="text-[11px] text-text-muted leading-relaxed">{displayExplanation.epistemicNotice}</p>
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
