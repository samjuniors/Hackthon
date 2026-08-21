'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

// Dynamically import MapLibre map component to bypass SSR canvas requirement
const ThermalMap = dynamic(() => import('@/components/ThermalMap'), {
  ssr: false,
});

const PRESET_LOCATIONS = [
  { name: 'LOC-A (Battery Park - Waterfront)', lat: 40.7120, lon: -74.0080 },
  { name: 'LOC-B (City Hall - Civic Center)', lat: 40.7120, lon: -73.9980 },
  { name: 'LOC-C (Chinatown - Asphalt Canyon)', lat: 40.7120, lon: -73.9880 },
];

export default function WorkspacePage() {
  const [lat, setLat] = useState<number>(40.7120);
  const [lon, setLon] = useState<number>(-74.0080);
  const [duration, setDuration] = useState<number>(2);
  const [mode, setMode] = useState<DataSourceMode>('FIXTURE');
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);



  const fetchExplanation = useCallback(
    async (jointDec: JointDecisionResult, activeScen?: WhatIfScenarioResult) => {
      setExplaining(true);
      try {
        const res = await fetch('/api/explain', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jointDecision: jointDec,
            activeScenario: activeScen,
          }),
        });
        const data = await res.json();
        if (data.success && data.explanation) {
          setExplanation(data.explanation);
        }
      } catch {
        // Non-blocking
      } finally {
        setExplaining(false);
      }
    },
    []
  );

  const runDecisionPipeline = useCallback(
    async (
      latitude = lat,
      longitude = lon,
      durationHours = duration,
      dataSourceMode = mode
    ) => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const res = await fetch('/api/decision', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            latitude,
            longitude,
            durationHours,
            mode: dataSourceMode,
          }),
        });

        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error?.message || 'Decision pipeline execution failed');
        }

        setDecision(data.decision);
        setSpatialDecision(data.spatialDecision || null);
        setJointDecision(data.jointDecision || null);
        setScenarioAnalysis(data.scenarioAnalysis || null);
        setSpatialField(data.spatialField);
        setSpatialFieldMeta(data.spatialFieldMetadata || null);

        if (data.jointDecision) {
          const activeScen = data.scenarioAnalysis?.scenarios?.find(
            (s: WhatIfScenarioResult) => s.scenarioId === selectedScenarioId
          ) || data.scenarioAnalysis?.scenarios?.[0];
          fetchExplanation(data.jointDecision, activeScen);
        }
      } catch (err) {

        setDecision(null);
        setSpatialDecision(null);
        setJointDecision(null);
        setScenarioAnalysis(null);
        setExplanation(null);
        setErrorMsg(err instanceof Error ? err.message : 'Failed to execute decision pipeline');
      } finally {
        setLoading(false);
      }
    },
    [lat, lon, duration, mode, selectedScenarioId, fetchExplanation]
  );

  useEffect(() => {
    let isMounted = true;

    fetch('/api/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        latitude: 40.7120,
        longitude: -74.0080,
        durationHours: 2,
        mode: 'FIXTURE',
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (!data.success) {
          throw new Error(data.error?.message || 'Decision pipeline execution failed');
        }
        setDecision(data.decision);
        setSpatialDecision(data.spatialDecision || null);
        setJointDecision(data.jointDecision || null);
        setScenarioAnalysis(data.scenarioAnalysis || null);
        setSpatialField(data.spatialField);
        setSpatialFieldMeta(data.spatialFieldMetadata || null);

        if (data.jointDecision) {
          const activeScen = data.scenarioAnalysis?.scenarios?.[0];
          fetchExplanation(data.jointDecision, activeScen);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setDecision(null);
          setSpatialDecision(null);
          setJointDecision(null);
          setScenarioAnalysis(null);
          setExplanation(null);
          setErrorMsg(err instanceof Error ? err.message : 'Failed to execute decision pipeline');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [fetchExplanation]);

  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 p-4 md:p-8 space-y-6">
      {/* Header Banner */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-indigo-400 to-amber-400 bg-clip-text text-transparent">
              Thermal Decision Engine
            </h1>
            <Badge variant="outline" className="border-indigo-500/40 text-indigo-400 bg-indigo-950/40 font-mono text-xs">
              Production Demo Slice
            </Badge>

          </div>
          <p className="text-sm text-slate-400 mt-1">
            Hyperlocal FortyGuard Thermal Intelligence & Deterministic Joint Optimization (WHERE + WHEN)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Prominent UI Data Source Indicator */}
          {decision?.dataSource === 'LIVE' || mode === 'LIVE' ? (
            <Badge className="bg-emerald-950/90 text-emerald-300 border-2 border-emerald-500/60 px-3.5 py-1.5 font-mono text-xs shadow-lg shadow-emerald-950/50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>LIVE — FORTYGUARD API</span>
            </Badge>
          ) : (
            <Badge className="bg-amber-950/90 text-amber-300 border-2 border-amber-500/60 px-3.5 py-1.5 font-mono text-xs shadow-lg shadow-amber-950/50 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>DEMO — CAPTURED FORTYGUARD DATA</span>
            </Badge>
          )}

          <Badge className="bg-slate-900 text-slate-300 border border-slate-700 px-3 py-1 font-mono text-xs">
            MODEL: v1.0.0-spatial-thermal-baseline
          </Badge>
        </div>
      </header>

      {/* Control Surface & Map Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Spatial & Temporal Controls */}
        <div className="lg:col-span-4 space-y-6">
          {/* Explicit Mode Selector Card */}
          <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-200">Execution Mode</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Explicitly toggle between Live FortyGuard API and Captured Fixture Data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={mode === 'FIXTURE' ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs font-semibold ${mode === 'FIXTURE' ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'text-slate-300 border-slate-700'}`}
                  onClick={() => {
                    setMode('FIXTURE');
                    runDecisionPipeline(lat, lon, duration, 'FIXTURE');
                  }}
                >
                  DEMO (Fixture)
                </Button>
                <Button
                  variant={mode === 'LIVE' ? 'default' : 'outline'}
                  size="sm"
                  className={`text-xs font-semibold ${mode === 'LIVE' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'text-slate-300 border-slate-700'}`}
                  onClick={() => {
                    setMode('LIVE');
                    runDecisionPipeline(lat, lon, duration, 'LIVE');
                  }}
                >
                  LIVE (API)
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-slate-200">Operational Candidate Set</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                {mode === 'FIXTURE'
                  ? 'DEMO mode — fixed Manhattan dataset. Candidates are pre-labeled FortyGuard capture sites.'
                  : 'LIVE mode — geo-adjacent candidates derived from your selected coordinates and evaluated against live FortyGuard tiles.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {mode === 'FIXTURE' ? (
                  <>
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-950/50 border border-amber-800/40 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-xs text-amber-300 font-mono">DEMO — Manhattan Scenario Only</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-300 block">Demo Sites (Select to Center Map)</span>
                    <div className="flex flex-col gap-2">
                      {PRESET_LOCATIONS.map((loc) => (
                        <Button
                          key={loc.name}
                          variant={lat === loc.lat && lon === loc.lon ? 'default' : 'outline'}
                          size="sm"
                          className="justify-start text-xs font-normal"
                          onClick={() => {
                            setLat(loc.lat);
                            setLon(loc.lon);
                            runDecisionPipeline(loc.lat, loc.lon, duration, mode);
                          }}
                        >
                          {loc.name}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="px-3 py-3 rounded bg-emerald-950/40 border border-emerald-800/40 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span className="text-xs text-emerald-300 font-mono font-semibold">LIVE — Geographic Analysis</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Candidates: <span className="font-mono text-slate-200">SITE-N · SITE-CENTER · SITE-S</span>
                      <br />centered at <span className="font-mono text-cyan-300">{lat.toFixed(4)}, {lon.toFixed(4)}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Switch to DEMO mode to use the named Manhattan scenario sites.
                    </p>
                  </div>
                )}
              </div>


              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label htmlFor="lat-input" className="text-xs font-semibold text-slate-400 block">Primary Latitude</label>
                  <input
                    id="lat-input"
                    type="number"
                    step="0.0001"
                    value={lat}
                    onChange={(e) => setLat(Number(e.target.value))}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="lon-input" className="text-xs font-semibold text-slate-400 block">Primary Longitude</label>
                  <input
                    id="lon-input"
                    type="number"
                    step="0.0001"
                    value={lon}
                    onChange={(e) => setLon(Number(e.target.value))}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-800">
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
                    runDecisionPipeline(lat, lon, dur, mode);
                  }}
                  className="py-2"
                />
              </div>

              <Button
                disabled={loading}
                onClick={() => runDecisionPipeline(lat, lon, duration, mode)}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs mt-2"
              >
                {loading ? 'Evaluating Spatial Field...' : 'Recalculate Decision'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Spatial Map & Decision Recommendation */}
        <div className="lg:col-span-8 space-y-6">
          {errorMsg && (
            <div className="bg-red-950/80 border border-red-500/50 text-red-200 p-4 rounded-xl text-xs font-mono">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Map Surface */}
          <Card className="bg-slate-900/80 border-slate-800 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-200">Spatial Thermal Surface</h2>
                  {spatialFieldMeta?.baseTimestamp && (
                    <Badge variant="outline" className="text-[10px] font-mono border-cyan-500/40 text-cyan-400 bg-cyan-950/30">
                      Base Snapshot: {new Date(spatialFieldMeta.baseTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC (t₀)
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Map displays spatial tile variation at initial observation timestamp (t₀) across all candidate locations.
                </p>
              </div>
              <div className="text-[11px] font-mono text-slate-400 shrink-0">
                Candidates: <span className="text-emerald-400 font-bold">★ LOC-A</span> vs <span className="text-cyan-300">LOC-B</span> vs <span className="text-cyan-300">LOC-C</span>
              </div>
            </div>

            <ThermalMap
              location={{ latitude: lat, longitude: lon }}
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

          {/* M6 Joint Spatial-Temporal Decision Card (WHERE + WHEN) */}
          {jointDecision ? (
            <Card className="bg-slate-900/90 border-slate-800">
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
              <CardContent className="pt-4 space-y-4">
                {/* FortyGuard Hyperlocal Microclimate Differentiation Note */}
                <div className="bg-slate-950/90 border border-cyan-500/30 p-2.5 rounded-lg text-xs text-slate-300 flex items-start gap-2">
                  <span className="text-cyan-400 font-bold text-xs shrink-0">ℹ️ FortyGuard Hyperlocal Intelligence:</span>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    FortyGuard provides materially different modeled thermal values across candidate locations at hyperlocal spatial resolution, enabling spatially informed operational selection.
                  </p>
                </div>

                {/* Joint Difference Banner */}
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
                      higher mean modeled temperature across the window vs worst feasible plan ({jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1].location.name} @ {new Date(jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1].window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC).
                    </div>

                    <Badge variant="outline" className="border-emerald-500/50 text-emerald-300 text-[10px] font-mono shrink-0">
                      Delta vs Worst: {jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1].deltaVsBest.toFixed(2)}°C
                    </Badge>
                  </div>
                )}

                {/* WHY THIS PLAN — Search Space & Deterministic Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">CANDIDATE SITES</span>
                    <span className="text-cyan-300 font-bold">{jointDecision.searchSpace.locationCount} Locations</span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">SLIDING WINDOWS</span>
                    <span className="text-indigo-300 font-bold">{jointDecision.searchSpace.windowCount} Windows</span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">EVALUATED SEARCH</span>
                    <span className="text-amber-300 font-bold">{jointDecision.searchSpace.totalEvaluatedPlans} Plans</span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800">
                    <span className="text-slate-400 text-[10px] block">EXPOSURE MODEL</span>
                    <span className="text-emerald-300 text-[11px] font-bold">Baseline Mean</span>
                  </div>
                </div>

                {/* Tabs for Joint Plans vs Spatial WHERE vs Temporal WHEN vs Provenance */}
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

                  {/* Tab 1: Joint WHERE + WHEN Ranked Plans Matrix */}
                  <TabsContent value="joint-ranking" className="pt-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono text-left">
                        <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                          <tr>
                            <th className="py-2 px-3">Rank</th>
                            <th className="py-2 px-3">Location</th>
                            <th className="py-2 px-3">Time Window (UTC)</th>
                            <th className="py-2 px-3">Tile ID</th>
                            <th className="py-2 px-3">Modeled Exposure</th>
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
                              <td className="py-2.5 px-3 font-bold">#{plan.rank}</td>
                              <td className="py-2.5 px-3">
                                <span className="text-cyan-300 font-bold">{plan.location.locationId}</span>{' '}
                                <span className="text-slate-400 text-[11px]">({plan.location.name.split(' (')[0]})</span>
                              </td>
                              <td className="py-2.5 px-3 font-bold">
                                {new Date(plan.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} –{' '}
                                {new Date(plan.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                              </td>
                              <td className="py-2.5 px-3 text-slate-400">{plan.tileId}</td>
                              <td className="py-2.5 px-3 font-bold">{plan.exposureScore.toFixed(2)}°C</td>
                              <td className="py-2.5 px-3">
                                {plan.deltaVsBest === 0 ? (
                                  <span className="text-emerald-400 font-bold">0.00°C (Best)</span>
                                ) : (
                                  <span className="text-amber-400 font-bold">+{plan.deltaVsBest.toFixed(2)}°C</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
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

                  {/* Tab 2: Spatial Locations */}
                  {spatialDecision && (
                    <TabsContent value="spatial-ranking" className="pt-3">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono text-left">
                          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="py-2 px-3">Rank</th>
                              <th className="py-2 px-3">Location ID</th>
                              <th className="py-2 px-3">Site Description</th>
                              <th className="py-2 px-3">Tile ID</th>
                              <th className="py-2 px-3">Modeled Exposure</th>
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
                                <td className="py-2.5 px-3 font-bold">#{loc.rank}</td>
                                <td className="py-2.5 px-3 text-cyan-300">{loc.locationId}</td>
                                <td className="py-2.5 px-3">{loc.name}</td>
                                <td className="py-2.5 px-3 text-slate-400">{loc.tileId}</td>
                                <td className="py-2.5 px-3 font-bold">{loc.exposureScore.toFixed(2)}°C</td>
                                <td className="py-2.5 px-3">
                                  {loc.deltaVsBest === 0 ? (
                                    <span className="text-emerald-400 font-bold">0.00°C (Best)</span>
                                  ) : (
                                    <span className="text-amber-400 font-bold">+{loc.deltaVsBest.toFixed(2)}°C</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
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

                  {/* Tab 3: Temporal Sliding Windows */}
                  {decision && (
                    <TabsContent value="temporal-ranking" className="pt-3">
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

                  {/* Tab 4: Data Provenance & Epistemic Boundary */}
                  <TabsContent value="provenance" className="pt-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-950 p-3 rounded border border-cyan-500/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#22d3ee]"></span>
                          <span className="font-bold text-cyan-400">DATA SOURCE</span>
                        </div>
                        <p className="text-[11px] text-slate-300 font-mono">
                          Mode: <span className="text-white font-bold">{jointDecision.dataSource}</span> ({jointDecision.evidenceBundle.sourceEndpoint})
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Evaluated across {jointDecision.searchSpace.locationCount} spatial candidate locations and {jointDecision.searchSpace.windowCount} temporal windows ({jointDecision.searchSpace.totalEvaluatedPlans} candidate plans).
                        </p>
                      </div>

                      <div className="bg-slate-950 p-3 rounded border border-indigo-500/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#818cf8]"></span>
                          <span className="font-bold text-indigo-400">DERIVED TILE EXPOSURE</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Tile average temperatures represent FortyGuard spatial polygon model aggregations (<span className="font-mono text-cyan-300">DERIVED</span>).
                        </p>
                      </div>
                    </div>

                    {/* Macro Weather Feed Comparison Note */}
                    <div className="bg-slate-950/80 p-3 rounded border border-slate-800 text-xs text-slate-400 space-y-1">
                      <div className="font-bold text-slate-300 flex items-center gap-1.5">
                        <span>ℹ️ FortyGuard Microclimate Advantage:</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        FortyGuard provides materially different modeled thermal values across candidate locations at 60m spatial resolution, enabling spatially informed location selection and joint optimization.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : null}

          {/* M7 What-If Constraint Sensitivity Section */}
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
                      Evaluate exact modeled temperature increase when operational constraints restrict the unconstrained global optimum (P₀).
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
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
                    <div className="space-y-4">
                      {/* 3-Box Flow: Baseline -> Constraint -> Constrained Optimum */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        {/* Box 1: Baseline P0 */}
                        <div className="md:col-span-4 bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-[10px] font-mono">
                              BASELINE PLAN (P₀)
                            </Badge>
                            <span className="text-lg font-black text-cyan-400 font-mono">
                              {activeScenario.baselinePlan.exposureScore.toFixed(2)}°C
                            </span>
                          </div>
                          <div className="text-xs text-white font-semibold">
                            {activeScenario.baselinePlan.location.name}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {new Date(activeScenario.baselinePlan.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} –{' '}
                            {new Date(activeScenario.baselinePlan.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC ({activeScenario.baselinePlan.window.durationHours}h)
                          </div>
                        </div>

                        {/* Box 2: Constraint Arrow */}
                        <div className="md:col-span-4 bg-indigo-950/40 border border-indigo-500/30 p-3 rounded-lg text-center space-y-1">
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
                        <div className="md:col-span-4 bg-slate-950 p-3 rounded-lg border border-amber-500/30 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] font-mono">
                              CONSTRAINED OPTIMUM (P&apos;)
                            </Badge>
                            <span className="text-lg font-black text-amber-400 font-mono">
                              {activeScenario.constrainedPlan ? `${activeScenario.constrainedPlan.exposureScore.toFixed(2)}°C` : 'N/A'}
                            </span>
                          </div>
                          <div className="text-xs text-white font-semibold">
                            {activeScenario.constrainedPlan?.location.name || 'No Feasible Plan'}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {activeScenario.constrainedPlan
                              ? `${new Date(activeScenario.constrainedPlan.window.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} – ${new Date(activeScenario.constrainedPlan.window.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC (${activeScenario.constrainedPlan.window.durationHours}h)`
                              : activeScenario.infeasibleReason || 'Infeasible'}
                          </div>
                        </div>
                      </div>

                      {/* Constraint Cost & Shift Status Banner */}
                      {activeScenario.status === 'FEASIBLE' && activeScenario.costOfConstraintCelsius !== null ? (
                        <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-3">
                            <div className="text-xl font-mono font-black text-amber-400">
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
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-mono ${
                                activeScenario.durationChanged
                                  ? 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                                  : 'bg-slate-900 text-slate-400 border-slate-700'
                              }`}
                            >
                              Duration: {activeScenario.durationChanged ? 'Expanded' : 'Same'}
                            </Badge>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-950/40 border border-red-500/40 p-3 rounded-lg text-xs text-red-200">
                          ⚠️ Infeasible Scenario: {activeScenario.infeasibleReason}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* M8 Grounded Decision Explanation Section */}
          {explanation && (
            <Card className="bg-slate-900/90 border-slate-800">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base text-slate-100 flex flex-wrap items-center gap-2">
                      <span>Decision Explanation & Evidence Synthesis</span>
                      {explanation.generatedBy === 'AI_GROUNDED_EXPLAINER' ? (
                        <Badge className="bg-indigo-950 text-indigo-300 border-indigo-500/40 text-[10px]">
                          🤖 AI Explanation of Deterministic Decision
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
                      Grounded operational synthesis translating deterministic spatial-temporal decision mathematics into plain-language narrative.
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
                      className="text-xs border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      {explaining ? 'Synthesizing...' : '🔄 Refresh Explanation'}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-xs">
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                  <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold block">
                    OPERATIONAL SUMMARY
                  </span>
                  <p className="text-slate-200 leading-relaxed font-sans text-[13px]">
                    {explanation.summary}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block">
                      WHY THIS PLAN WINS
                    </span>
                    <p className="text-slate-300 leading-relaxed">
                      {explanation.whyThisPlan}
                    </p>
                  </div>

                  {explanation.constraintImpact && (
                    <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-1.5">
                      <span className="text-[10px] font-mono uppercase text-amber-400 font-bold block">
                        WHAT-IF CONSTRAINT IMPACT
                      </span>
                      <p className="text-slate-300 leading-relaxed">
                        {explanation.constraintImpact}
                      </p>
                    </div>
                  )}
                </div>

                {/* Epistemic Boundary Notice */}
                <div className="bg-slate-950/60 p-3 rounded border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <span>🛡️ Epistemic & Provenance Boundary:</span>
                    {explanation.fallbackReason && (
                      <span className="text-amber-400 font-mono text-[10px]">({explanation.fallbackReason})</span>
                    )}
                  </div>
                  <p className="leading-relaxed">
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





