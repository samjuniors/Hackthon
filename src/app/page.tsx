'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { METROPOLITAN_LOCATIONS } from '@/lib/location/search';

// Dynamically import MapLibre map component to bypass SSR canvas requirement
const ThermalMap = dynamic(() => import('@/components/ThermalMap'), {
  ssr: false,
});

export default function WorkspacePage() {
  // Mode & Location State
  const [mode, setMode] = useState<DataSourceMode>('FIXTURE');
  const [selectedLocation, setSelectedLocation] = useState<NamedLocation>(METROPOLITAN_LOCATIONS[0]);
  const [duration, setDuration] = useState<number>(2);

  // Provider Health States
  const [fgStatus, setFgStatus] = useState<ProviderStatus>('UNKNOWN');
  const [fgHealth, setFgHealth] = useState<FortyGuardHealthResponse | null>(null);
  const [aiStatus, setAiStatus] = useState<ProviderStatus>('UNKNOWN');
  const [aiHealth, setAiHealth] = useState<AIHealthResponse | null>(null);

  // Pipeline Execution State
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

// Resilient JSON fetcher that never throws uncaught SyntaxError
async function safeJsonFetch<T = Record<string, unknown>>(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; data: T | null }> {
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    if (!text || !text.trim()) {
      return { ok: res.ok, data: null };
    }
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

  // Health Check Callbacks
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

  // AI Explanation Fetcher
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

  // Main Decision Pipeline Runner
  const runDecisionPipeline = useCallback(
    async (
      loc = selectedLocation,
      durationHours = duration,
      dataSourceMode = mode
    ) => {
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

        if (!ok || !data?.success) {
          // If server provided production error details
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

        // Success: Populate decision outcomes
        setDecision(data.decision || null);
        setSpatialDecision(data.spatialDecision || null);
        setJointDecision(data.jointDecision || null);
        setScenarioAnalysis(data.scenarioAnalysis || null);
        setSpatialField(data.spatialField || null);
        setSpatialFieldMeta(data.spatialFieldMetadata || null);

        // Update provider health to CONNECTED on real success
        if (dataSourceMode === 'LIVE') {
          setFgStatus('CONNECTED');
        }

        // Trigger grounded AI explanation
        if (data.jointDecision) {
          const activeScen = data.scenarioAnalysis?.scenarios?.find(
            (s: WhatIfScenarioResult) => s.scenarioId === selectedScenarioId
          ) || data.scenarioAnalysis?.scenarios?.[0];
          fetchExplanation(data.jointDecision, activeScen);
        }
      } catch {
        // Clear stale decision state on failure to avoid showing incorrect numbers
        setDecision(null);
        setSpatialDecision(null);
        setJointDecision(null);
        setScenarioAnalysis(null);
        setExplanation(null);
        if (dataSourceMode === 'LIVE') {
          setFgStatus('ERROR');
        }
      } finally {
        setLoading(false);
      }
    },
    [selectedLocation, duration, mode, selectedScenarioId, fetchExplanation]
  );

  // Initial mount: load fixture baseline + test initial health
  useEffect(() => {
    let isMounted = true;

    // Run baseline pipeline
    safeJsonFetch<{
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
    }>('/api/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        latitude: 40.7120,
        longitude: -74.0080,
        durationHours: 2,
        mode: 'FIXTURE',
      }),
    })
      .then(({ ok, data }) => {
        if (!isMounted) return;
        if (ok && data?.success) {
          setDecision(data.decision || null);
          setSpatialDecision(data.spatialDecision || null);
          setJointDecision(data.jointDecision || null);
          setScenarioAnalysis(data.scenarioAnalysis || null);
          setSpatialField(data.spatialField || null);
          setSpatialFieldMeta(data.spatialFieldMetadata || null);
          setFgStatus('CONNECTED');

          if (data.jointDecision) {
            const activeScen = data.scenarioAnalysis?.scenarios?.[0];
            fetchExplanation(data.jointDecision, activeScen);
          }
        }
      })
      .catch(() => {
        // Handled
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    // Run AI health check asynchronously
    safeJsonFetch<{ success?: boolean; health?: AIHealthResponse }>(
      '/api/health/ai',
      { method: 'POST' }
    )
      .then(({ ok, data }) => {
        if (!isMounted) return;
        if (ok && data?.success && data.health) {
          setAiHealth(data.health);
          setAiStatus(data.health.connected ? 'CONNECTED' : data.health.configured ? 'ERROR' : 'UNKNOWN');
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [fetchExplanation]);

  const handleModeChange = (newMode: DataSourceMode) => {
    setMode(newMode);
    if (newMode === 'FIXTURE') {
      // Pick Manhattan fixture location
      const fixtureLoc = METROPOLITAN_LOCATIONS[0];
      setSelectedLocation(fixtureLoc);
      checkFortyGuardHealth('FIXTURE');
      runDecisionPipeline(fixtureLoc, duration, 'FIXTURE');
    } else {
      checkFortyGuardHealth('LIVE');
      runDecisionPipeline(selectedLocation, duration, 'LIVE');
    }
  };

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 p-3 sm:p-6 lg:p-8 space-y-5 max-w-[1600px] mx-auto">
      {/* Header Banner */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-indigo-300 to-amber-300 bg-clip-text text-transparent">
              Thermal Decision Engine
            </h1>
            <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 bg-indigo-950/40 font-mono text-[10px]">
              Production Vertical Slice
            </Badge>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            FortyGuard Hyperlocal Thermal Intelligence & Deterministic Joint Optimization (WHERE + WHEN)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Real FortyGuard Provider Status Badge */}
          {mode === 'LIVE' ? (
            fgStatus === 'CONNECTED' ? (
              <Badge className="bg-emerald-950/90 text-emerald-300 border border-emerald-500/60 px-3 py-1 font-mono text-xs shadow-lg shadow-emerald-950/50 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>🟢 FORTYGUARD LIVE</span>
              </Badge>
            ) : fgStatus === 'CHECKING' ? (
              <Badge className="bg-yellow-950/90 text-yellow-300 border border-yellow-500/60 px-3 py-1 font-mono text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-ping" />
                <span>🟡 CHECKING FORTYGUARD…</span>
              </Badge>
            ) : (
              <Badge className="bg-red-950/90 text-red-300 border border-red-500/60 px-3 py-1 font-mono text-xs flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span>🔴 FORTYGUARD OFFLINE</span>
              </Badge>
            )
          ) : (
            <Badge className="bg-amber-950/90 text-amber-300 border border-amber-500/60 px-3 py-1 font-mono text-xs shadow-lg shadow-amber-950/50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>🟠 DEMO — CAPTURED FORTYGUARD DATA</span>
            </Badge>
          )}

          {/* AI Explanation Status Badge */}
          {aiHealth?.connected && aiHealth.provider === 'GEMINI' ? (
            <Badge className="bg-cyan-950 text-cyan-300 border border-cyan-500/50 px-2.5 py-1 font-mono text-xs">
              🤖 Gemini Connected
            </Badge>
          ) : aiHealth?.connected && aiHealth.provider === 'OPENAI' ? (
            <Badge className="bg-indigo-950 text-indigo-300 border border-indigo-500/50 px-2.5 py-1 font-mono text-xs">
              🤖 OpenAI Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-slate-900 text-slate-300 border-slate-700 px-2.5 py-1 font-mono text-xs">
              ⚡ Deterministic Explainer
            </Badge>
          )}

          <Badge className="bg-slate-900 text-slate-400 border border-slate-800 px-2.5 py-1 font-mono text-[10px]">
            MODEL: v1.0.0-spatial-thermal-baseline
          </Badge>
        </div>
      </header>

      {/* Primary Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Controls, Location Search, Health (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Mode Selector Card */}
          <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
            <CardHeader className="pb-2.5">
              <CardTitle className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Execution Mode
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Explicitly toggle between Live API and Verified Captured Dataset
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={mode === 'FIXTURE' ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs font-semibold ${
                    mode === 'FIXTURE'
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
                      : 'text-slate-300 border-slate-700'
                  }`}
                  onClick={() => handleModeChange('FIXTURE')}
                >
                  DEMO (Fixture)
                </Button>
                <Button
                  variant={mode === 'LIVE' ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs font-semibold ${
                    mode === 'LIVE'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'text-slate-300 border-slate-700'
                  }`}
                  onClick={() => handleModeChange('LIVE')}
                >
                  LIVE (API)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Location Search & Selection Card */}
          <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
            <CardContent className="pt-4">
              <LocationSearch
                selectedLocation={selectedLocation}
                mode={mode}
                onSelectLocation={(loc) => {
                  setSelectedLocation(loc);
                  runDecisionPipeline(loc, duration, mode);
                }}
                onSwitchToLive={() => handleModeChange('LIVE')}
              />

              {/* Duration Slider */}
              <div className="space-y-2 pt-4 mt-3 border-t border-slate-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-300">Operation Duration</span>
                  <span className="font-mono text-cyan-400 font-bold">{duration} Hours</span>
                </div>
                <Slider
                  min={1}
                  max={4}
                  step={1}
                  value={[duration]}
                  onValueChange={(vals) => {
                    const dur = vals[0];
                    setDuration(dur);
                    runDecisionPipeline(selectedLocation, dur, mode);
                  }}
                  className="py-1"
                />
              </div>

              {/* Recalculate Button */}
              <Button
                disabled={loading}
                onClick={() => runDecisionPipeline(selectedLocation, duration, mode)}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs mt-4 h-9 shadow-lg shadow-cyan-950/50"
                data-testid="recalculate-decision-btn"
              >
                {loading ? 'Evaluating FortyGuard Thermal Field...' : 'Recalculate Decision'}
              </Button>
            </CardContent>
          </Card>

          {/* Provider Health & Connectivity Card */}
          <ProviderHealthCard
            mode={mode}
            fortyGuardStatus={fgStatus}
            fortyGuardHealth={fgHealth}
            aiStatus={aiStatus}
            aiHealth={aiHealth}
            onTestFortyGuard={() => checkFortyGuardHealth(mode)}
            onTestAI={checkAIHealth}
          />
        </div>

        {/* Right Column: Visualization, Decision, What-If, Explanation (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Production Failure State Banner */}
          {errorDetails && (
            <div
              className="bg-red-950/90 border-2 border-red-500/70 text-red-100 p-4 rounded-xl space-y-2 shadow-2xl shadow-red-950/50 animate-in fade-in duration-200"
              data-testid="production-error-banner"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-bold text-sm text-red-200">
                  <span>🔴 Operational Analysis Halted</span>
                  <Badge variant="outline" className="border-red-400 text-red-300 font-mono text-[10px] bg-red-900/40">
                    {errorDetails.code}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runDecisionPipeline(selectedLocation, duration, mode)}
                    className="h-6 px-2.5 text-xs bg-red-900/60 border-red-400/60 text-white hover:bg-red-800"
                  >
                    🔄 Retry
                  </Button>
                  {mode === 'LIVE' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleModeChange('FIXTURE')}
                      className="h-6 px-2.5 text-xs bg-amber-950 border-amber-500/60 text-amber-300 hover:bg-amber-900"
                    >
                      Switch to DEMO
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-red-200 leading-relaxed font-mono">
                {errorDetails.message}
              </p>
              <p className="text-[11px] text-red-300/90 pt-1 border-t border-red-800/50">
                <strong className="text-white">Recommended Action:</strong> {errorDetails.recoverySuggestion}
              </p>
            </div>
          )}

          {/* Spatial Thermal Map */}
          <Card className="bg-slate-900/80 border-slate-800 p-3.5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-200">Hyperlocal Spatial Thermal Field</h2>
                  {spatialFieldMeta?.baseTimestamp && (
                    <Badge variant="outline" className="text-[10px] font-mono border-cyan-500/40 text-cyan-400 bg-cyan-950/30">
                      t₀: {new Date(spatialFieldMeta.baseTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Spatial tile variation at initial observation snapshot (t₀) across candidate locations.
                </p>
              </div>
              <div className="text-[11px] font-mono text-slate-400 shrink-0">
                Location: <span className="text-cyan-300 font-bold">{selectedLocation.name.split(' (')[0]}</span>
              </div>
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
            />
          </Card>

          {/* Recommended Operational Plan (WHERE + WHEN) */}
          {jointDecision && (
            <Card className="bg-slate-900/90 border-slate-800" data-testid="decision-card">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                      <span>Recommended Operational Plan</span>
                      <Badge className="bg-emerald-950 text-emerald-300 border-emerald-500/40 text-[10px]">
                        ★ Optimal Plan #1
                      </Badge>
                      <Badge variant="outline" className="border-slate-700 text-slate-300 text-[10px] font-mono">
                        Source: {jointDecision.dataSource}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-300 mt-1.5 space-y-1">
                      <div>
                        <span className="text-slate-400">Recommended Site:</span>{' '}
                        <strong className="text-white font-semibold">{jointDecision.recommendedPlan.location.name}</strong>{' '}
                        <span className="text-cyan-300 font-mono">({jointDecision.recommendedPlan.location.locationId})</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Optimal Operating Window:</span>{' '}
                        <strong className="text-white font-semibold font-mono">
                          {new Date(jointDecision.recommendedPlan.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} –{' '}
                          {new Date(jointDecision.recommendedPlan.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                        </strong>{' '}
                        <span className="text-amber-400 font-mono text-[11px]">({jointDecision.recommendedPlan.window.durationHours}h Duration)</span>
                      </div>
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-emerald-400 font-mono">
                      {jointDecision.recommendedPlan.exposureScore.toFixed(2)}°C
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono uppercase">
                      Mean Modeled Temperature
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono">
                      across operating window (v1.0.0-spatial-thermal-baseline)
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-3.5 space-y-3.5">
                {/* FortyGuard Microclimate Differentiation Banner */}
                <div className="bg-slate-950/90 border border-cyan-500/30 p-2.5 rounded-lg text-xs text-slate-300 flex items-start gap-2">
                  <span className="text-cyan-400 font-bold text-xs shrink-0">ℹ️ FortyGuard Hyperlocal Intelligence:</span>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    FortyGuard provides materially different modeled thermal values across candidate locations at hyperlocal spatial resolution, enabling spatially informed operational selection.
                  </p>
                </div>

                {/* Advantage Banner */}
                {jointDecision.rankedPlans.length > 1 && (
                  <div className="bg-emerald-950/40 border border-emerald-500/40 p-3 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div className="text-emerald-300">
                      <span className="font-bold">FortyGuard Joint Advantage:</span> Deploying to{' '}
                      <span className="text-white font-bold">{jointDecision.recommendedPlan.location.name}</span> during{' '}
                      <span className="text-white font-mono font-bold">
                        {new Date(jointDecision.recommendedPlan.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}–{new Date(jointDecision.recommendedPlan.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                      </span>{' '}
                      avoids{' '}
                      <span className="text-amber-300 font-mono font-bold">
                        +{jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1].deltaVsBest.toFixed(2)}°C
                      </span>{' '}
                      higher mean modeled temperature vs worst feasible plan ({jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1].location.name}).
                    </div>
                    <Badge variant="outline" className="border-emerald-500/50 text-emerald-300 text-[10px] font-mono shrink-0">
                      Delta vs Worst: {jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1].deltaVsBest.toFixed(2)}°C
                    </Badge>
                  </div>
                )}

                {/* Search Space Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">CANDIDATE SITES</span>
                    <span className="text-cyan-300 font-bold">{jointDecision.searchSpace.locationCount} Locations</span>
                  </div>
                  <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">SLIDING WINDOWS</span>
                    <span className="text-indigo-300 font-bold">{jointDecision.searchSpace.windowCount} Windows</span>
                  </div>
                  <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">EVALUATED SEARCH</span>
                    <span className="text-amber-300 font-bold">{jointDecision.searchSpace.totalEvaluatedPlans} Plans</span>
                  </div>
                  <div className="bg-slate-950/80 p-2 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">EXPOSURE MODEL</span>
                    <span className="text-emerald-300 text-[11px] font-bold">Baseline Mean</span>
                  </div>
                </div>

                {/* Ranked Plan Tabs */}
                <Tabs defaultValue="joint-ranking" className="w-full">
                  <TabsList className="bg-slate-950 border border-slate-800">
                    <TabsTrigger value="joint-ranking" className="text-xs">
                      Candidate Plans ({jointDecision.rankedPlans.length})
                    </TabsTrigger>
                    {spatialDecision && (
                      <TabsTrigger value="spatial-ranking" className="text-xs">
                        Candidate Locations ({spatialDecision.rankedLocations.length})
                      </TabsTrigger>
                    )}
                    {decision && (
                      <TabsTrigger value="temporal-ranking" className="text-xs">
                        Operating Windows ({decision.rankedWindows.length})
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="provenance" className="text-xs">Data Provenance</TabsTrigger>
                  </TabsList>

                  <TabsContent value="joint-ranking" className="pt-2.5">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono text-left">
                        <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-2 px-3">Rank</th>
                            <th className="py-2 px-3">Location</th>
                            <th className="py-2 px-3">Time Window (UTC)</th>
                            <th className="py-2 px-3">Tile ID</th>
                            <th className="py-2 px-3">Exposure</th>
                            <th className="py-2 px-3">Δ vs Best</th>
                            <th className="py-2 px-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {jointDecision.rankedPlans.map((plan) => (
                            <tr
                              key={plan.planId}
                              className={plan.rank === 1 ? 'bg-emerald-950/30 text-emerald-200 font-semibold' : 'text-slate-300'}
                            >
                              <td className="py-2 px-3 font-bold">#{plan.rank}</td>
                              <td className="py-2 px-3">
                                <span className="text-cyan-300 font-bold">{plan.location.locationId}</span>{' '}
                                <span className="text-slate-400 text-[11px]">({plan.location.name.split(' (')[0]})</span>
                              </td>
                              <td className="py-2 px-3 font-bold">
                                {new Date(plan.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} –{' '}
                                {new Date(plan.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                              </td>
                              <td className="py-2 px-3 text-slate-400">{plan.tileId}</td>
                              <td className="py-2 px-3 font-bold">{plan.exposureScore.toFixed(2)}°C</td>
                              <td className="py-2 px-3">
                                {plan.deltaVsBest === 0 ? (
                                  <span className="text-emerald-400 font-bold">0.00°C (Best)</span>
                                ) : (
                                  <span className="text-amber-400 font-bold">+{plan.deltaVsBest.toFixed(2)}°C</span>
                                )}
                              </td>
                              <td className="py-2 px-3">
                                <Badge
                                  variant="outline"
                                  className={
                                    plan.rank === 1
                                      ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 text-[10px]'
                                      : 'bg-slate-900 text-slate-400 border-slate-700 text-[10px]'
                                  }
                                >
                                  {plan.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </TabsContent>

                  {spatialDecision && (
                    <TabsContent value="spatial-ranking" className="pt-2.5">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono text-left">
                          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2 px-3">Rank</th>
                              <th className="py-2 px-3">Location ID</th>
                              <th className="py-2 px-3">Site Description</th>
                              <th className="py-2 px-3">Tile ID</th>
                              <th className="py-2 px-3">Exposure</th>
                              <th className="py-2 px-3">Δ vs Best</th>
                              <th className="py-2 px-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {spatialDecision.rankedLocations.map((loc) => (
                              <tr
                                key={loc.locationId}
                                className={loc.rank === 1 ? 'bg-emerald-950/30 text-emerald-200 font-semibold' : 'text-slate-300'}
                              >
                                <td className="py-2 px-3 font-bold">#{loc.rank}</td>
                                <td className="py-2 px-3 text-cyan-300">{loc.locationId}</td>
                                <td className="py-2 px-3">{loc.name}</td>
                                <td className="py-2 px-3 text-slate-400">{loc.tileId}</td>
                                <td className="py-2 px-3 font-bold">{loc.exposureScore.toFixed(2)}°C</td>
                                <td className="py-2 px-3">
                                  {loc.deltaVsBest === 0 ? (
                                    <span className="text-emerald-400 font-bold">0.00°C</span>
                                  ) : (
                                    <span className="text-amber-400 font-bold">+{loc.deltaVsBest.toFixed(2)}°C</span>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  <Badge
                                    variant="outline"
                                    className={
                                      loc.rank === 1
                                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/50 text-[10px]'
                                        : 'bg-slate-900 text-slate-400 border-slate-700 text-[10px]'
                                    }
                                  >
                                    {loc.rank === 1 ? 'Optimal' : 'Feasible'}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>
                  )}

                  {decision && (
                    <TabsContent value="temporal-ranking" className="pt-2.5">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono text-left">
                          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2 px-3">Rank</th>
                              <th className="py-2 px-3">Window ID</th>
                              <th className="py-2 px-3">Operating Span (UTC)</th>
                              <th className="py-2 px-3">Exposure Score</th>
                              <th className="py-2 px-3">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {decision.rankedWindows.map((rw) => (
                              <tr key={rw.windowId} className={rw.rank === 1 ? 'bg-cyan-950/30 text-cyan-200' : 'text-slate-300'}>
                                <td className="py-2 px-3 font-bold">#{rw.rank}</td>
                                <td className="py-2 px-3">{rw.windowId}</td>
                                <td className="py-2 px-3">
                                  {new Date(rw.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} – {new Date(rw.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                                </td>
                                <td className="py-2 px-3 font-bold">{rw.exposureScore.toFixed(1)}°C</td>
                                <td className="py-2 px-3">
                                  <Badge variant="outline" className="bg-emerald-950/40 text-emerald-400 border-emerald-500/30 text-[10px]">
                                    Feasible
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>
                  )}

                  <TabsContent value="provenance" className="pt-2.5 space-y-2.5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                      <div className="bg-slate-950 p-2.5 rounded border border-cyan-500/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          <span className="font-bold text-cyan-400">DATA SOURCE</span>
                        </div>
                        <p className="text-[11px] text-slate-300 font-mono">
                          Mode: <span className="text-white font-bold">{jointDecision.dataSource}</span>
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Evaluated across {jointDecision.searchSpace.locationCount} spatial candidate sites and {jointDecision.searchSpace.windowCount} sliding windows ({jointDecision.searchSpace.totalEvaluatedPlans} candidate plans).
                        </p>
                      </div>

                      <div className="bg-slate-950 p-2.5 rounded border border-indigo-500/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-indigo-400" />
                          <span className="font-bold text-indigo-400">DERIVED TILE EXPOSURE</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Tile average temperatures represent FortyGuard spatial polygon model aggregations (<span className="font-mono text-cyan-300">DERIVED</span>).
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* What-If Constraint Sensitivity Analysis */}
          {scenarioAnalysis && scenarioAnalysis.scenarios.length > 0 && (
            <Card className="bg-slate-900/90 border-slate-800">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                      <span>What-If Operational Constraint Analysis</span>
                      <Badge className="bg-indigo-950 text-indigo-300 border-indigo-500/40 text-[10px]">
                        Constraint Sensitivity
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400 mt-1">
                      Evaluate exact modeled temperature increase when operational constraints restrict unconstrained optimum (P₀).
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-3.5 space-y-3.5">
                {/* Scenario Selector Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {scenarioAnalysis.scenarios.map((sc) => (
                    <Button
                      key={sc.scenarioId}
                      variant={selectedScenarioId === sc.scenarioId ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setSelectedScenarioId(sc.scenarioId);
                        if (jointDecision) {
                          fetchExplanation(jointDecision, sc);
                        }
                      }}
                      className={`text-xs justify-start h-auto py-2 px-3 ${
                        selectedScenarioId === sc.scenarioId
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white font-semibold'
                          : 'border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="text-left">
                        <div className="font-bold">{sc.scenarioName}</div>
                        <div className="text-[10px] opacity-80">{sc.constraintType}</div>
                      </div>
                    </Button>
                  ))}
                </div>

                {/* Selected Scenario Comparison Display */}
                {(() => {
                  const activeScenario =
                    scenarioAnalysis.scenarios.find((s) => s.scenarioId === selectedScenarioId) ||
                    scenarioAnalysis.scenarios[0];
                  if (!activeScenario) return null;

                  return (
                    <div className="space-y-3">
                      {/* 3-Box Flow */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                        {/* Box 1: Baseline P0 */}
                        <div className="md:col-span-4 bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-[10px] font-mono">
                              BASELINE PLAN (P₀)
                            </Badge>
                            <span className="text-base font-black text-cyan-400 font-mono">
                              {activeScenario.baselinePlan.exposureScore.toFixed(2)}°C
                            </span>
                          </div>
                          <div className="text-xs text-white font-semibold">
                            {activeScenario.baselinePlan.location.name}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {new Date(activeScenario.baselinePlan.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} –{' '}
                            {new Date(activeScenario.baselinePlan.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                          </div>
                        </div>

                        {/* Box 2: Constraint Arrow */}
                        <div className="md:col-span-4 bg-indigo-950/40 border border-indigo-500/30 p-2.5 rounded-lg text-center space-y-1">
                          <div className="text-[10px] font-mono text-indigo-300 uppercase font-bold">
                            IMPOSED CONSTRAINT
                          </div>
                          <div className="text-xs font-semibold text-white">
                            {activeScenario.constraintDescription}
                          </div>
                          <Badge variant="outline" className="border-indigo-400/40 text-indigo-300 text-[9px] font-mono">
                            {activeScenario.constraintType}
                          </Badge>
                        </div>

                        {/* Box 3: Constrained P' */}
                        <div className="md:col-span-4 bg-slate-950 p-2.5 rounded-lg border border-amber-500/30 space-y-1">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] font-mono">
                              CONSTRAINED OPTIMUM (P&apos;)
                            </Badge>
                            <span className="text-base font-black text-amber-400 font-mono">
                              {activeScenario.constrainedPlan ? `${activeScenario.constrainedPlan.exposureScore.toFixed(2)}°C` : 'N/A'}
                            </span>
                          </div>
                          <div className="text-xs text-white font-semibold">
                            {activeScenario.constrainedPlan?.location.name || 'No Feasible Plan'}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400">
                            {activeScenario.constrainedPlan
                              ? `${new Date(activeScenario.constrainedPlan.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} – ${new Date(activeScenario.constrainedPlan.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC`
                              : activeScenario.infeasibleReason || 'Infeasible'}
                          </div>
                        </div>
                      </div>

                      {/* Constraint Cost Banner */}
                      {activeScenario.status === 'FEASIBLE' && activeScenario.costOfConstraintCelsius !== null ? (
                        <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                          <div className="flex items-center gap-2.5">
                            <div className="text-lg font-mono font-black text-amber-400">
                              +{activeScenario.costOfConstraintCelsius.toFixed(2)}°C
                            </div>
                            <div>
                              <span className="font-bold text-slate-200">Constraint Cost:</span>{' '}
                              <span className="text-slate-400">Mean Modeled Temperature Increase under {activeScenario.scenarioName}</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono ${
                                activeScenario.locationShifted
                                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                  : 'bg-slate-900 text-slate-400 border-slate-700'
                              }`}
                            >
                              Location: {activeScenario.locationShifted ? 'Shifted' : 'Same'}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono ${
                                activeScenario.windowShifted
                                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                  : 'bg-slate-900 text-slate-400 border-slate-700'
                              }`}
                            >
                              Window: {activeScenario.windowShifted ? 'Shifted' : 'Same'}
                            </Badge>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-950/40 border border-red-500/40 p-2.5 rounded-lg text-xs text-red-200">
                          ⚠️ Infeasible Scenario: {activeScenario.infeasibleReason}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Grounded Decision Explanation Section */}
          {explanation && (
            <Card className="bg-slate-900/90 border-slate-800">
              <CardHeader className="pb-2.5 border-b border-slate-800/80">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                  <div>
                    <CardTitle className="text-base text-slate-100 flex flex-wrap items-center gap-2">
                      <span>Decision Explanation & Evidence Synthesis</span>
                      {explanation.generatedBy === 'AI_GROUNDED_EXPLAINER' ? (
                        <Badge className="bg-indigo-950 text-indigo-300 border-indigo-500/40 text-[10px]">
                          🤖 AI Grounded Explanation
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-[10px]">
                          ⚡ Deterministic Rule-Based Explanation
                        </Badge>
                      )}
                      <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-[10px] font-mono">
                        Grounding: 100% Verified Evidence
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400 mt-1">
                      Grounded operational narrative synthesizing deterministic decision results into plain English.
                    </CardDescription>
                  </div>
                  <div className="shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={explaining}
                      onClick={() => {
                        if (jointDecision) {
                          const activeScen = scenarioAnalysis?.scenarios?.find(
                            (s) => s.scenarioId === selectedScenarioId
                          );
                          fetchExplanation(jointDecision, activeScen);
                        }
                      }}
                      className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800 h-7"
                    >
                      {explaining ? 'Synthesizing...' : '🔄 Refresh Explanation'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-3.5 space-y-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold block">
                    OPERATIONAL SUMMARY
                  </span>
                  <p className="text-slate-200 leading-relaxed font-sans text-xs">
                    {explanation.summary}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                    <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block">
                      WHY THIS PLAN WINS
                    </span>
                    <p className="text-slate-300 leading-relaxed text-xs">
                      {explanation.whyThisPlan}
                    </p>
                  </div>

                  {explanation.constraintImpact && (
                    <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
                      <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                        WHAT-IF CONSTRAINT IMPACT
                      </span>
                      <p className="text-slate-300 leading-relaxed text-xs">
                        {explanation.constraintImpact}
                      </p>
                    </div>
                  )}
                </div>

                {/* Epistemic Boundary Notice */}
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/80 text-[11px] text-slate-400 space-y-0.5">
                  <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>🛡️ Epistemic & Provenance Boundary:</span>
                    {explanation.fallbackReason && (
                      <span className="text-amber-400 font-mono text-[10px]">({explanation.fallbackReason})</span>
                    )}
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    {explanation.epistemicNotice}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
