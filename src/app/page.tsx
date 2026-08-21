'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DecisionResult, PolygonAOI } from '@/types/domain';
import type { DataSourceMode } from '@/types/provenance';

// Dynamically import MapLibre map component to bypass SSR canvas requirement
const ThermalMap = dynamic(
  () => import('@/components/ThermalMap').then((mod) => mod.ThermalMap),
  { ssr: false }
);

const PRESET_LOCATIONS = [
  { name: 'NYC Lower Manhattan', lat: 40.7128, lon: -74.006 },
  { name: 'NYC Midtown', lat: 40.7549, lon: -73.984 },
  { name: 'NYC Financial District', lat: 40.7075, lon: -74.009 },
];

export default function WorkspacePage() {
  const [lat, setLat] = useState<number>(40.7128);
  const [lon, setLon] = useState<number>(-74.006);
  const [duration, setDuration] = useState<number>(2);
  const [mode, setMode] = useState<DataSourceMode>('FIXTURE');
  const [loading, setLoading] = useState<boolean>(false);
  const [decision, setDecision] = useState<DecisionResult | null>(null);
  const [spatialField, setSpatialField] = useState<PolygonAOI | null>(null);
  const [spatialFieldMeta, setSpatialFieldMeta] = useState<{
    baseTimestamp: string;
    coverageType: string;
    description: string;
    totalEvaluatedHours: number;
  } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runDecisionPipeline = useCallback(async (
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
      setSpatialField(data.spatialField);
      setSpatialFieldMeta(data.spatialFieldMetadata || null);
    } catch (err) {
      setDecision(null);
      setErrorMsg(err instanceof Error ? err.message : 'Failed to execute decision pipeline');
    } finally {
      setLoading(false);
    }
  }, [lat, lon, duration, mode]);

  useEffect(() => {
    let isMounted = true;

    fetch('/api/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        latitude: 40.7128,
        longitude: -74.006,
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
        setSpatialField(data.spatialField);
        setSpatialFieldMeta(data.spatialFieldMetadata || null);
      })
      .catch((err) => {
        if (isMounted) {
          setDecision(null);
          setErrorMsg(err instanceof Error ? err.message : 'Failed to execute decision pipeline');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);


  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 p-4 md:p-8 space-y-6">
      {/* Header Banner */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-indigo-400 to-amber-400 bg-clip-text text-transparent">
              Thermal Decision Engine
            </h1>
            <Badge variant="outline" className="border-cyan-500/40 text-cyan-400 bg-cyan-950/40 font-mono text-xs">
              M4 Vertical Slice 1
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            FortyGuard Hyperlocal Thermal Intelligence & Deterministic Window Optimization
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
              <CardTitle className="text-base text-slate-200">Candidate Spatial Location</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Select location point to intersect FortyGuard thermal tiles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">Preset Locations</span>
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
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label htmlFor="lat-input" className="text-xs font-semibold text-slate-400 block">Latitude</label>
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
                  <label htmlFor="lon-input" className="text-xs font-semibold text-slate-400 block">Longitude</label>
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
                  <span className="font-semibold text-slate-300">Operating Duration</span>
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
                  Map displays spatial tile variation at initial observation timestamp (t₀). Candidate window optimization evaluates the full discrete hourly sequence.
                </p>
              </div>
              <div className="text-[11px] font-mono text-slate-400 shrink-0">
                Coverage: <span className="text-slate-200">Single Snapshot (t₀)</span>
              </div>
            </div>

            <ThermalMap
              location={{ latitude: lat, longitude: lon }}
              spatialField={spatialField}
              selectedTileId={decision?.evidenceBundle.selectedTileId}
            />
          </Card>


          {/* Decision Outcome Card */}
          {decision && (
            <Card className="bg-slate-900/90 border-slate-800">
              <CardHeader className="pb-3 border-b border-slate-800/80">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base text-slate-100 flex items-center gap-2">
                      <span>Optimal Operating Window</span>
                      <Badge className="bg-cyan-950 text-cyan-300 border-cyan-500/40 text-[10px]">
                        Rank #1
                      </Badge>
                      <Badge variant="outline" className="border-slate-700 text-slate-300 text-[10px] font-mono">
                        Source: {decision.dataSource}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400 mt-1">
                      Lowest modeled mean thermal exposure for target location point
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-black text-emerald-400 font-mono">
                      {decision.recommendedWindow.exposureScore.toFixed(1)}°C
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono uppercase">Mean Exposure</div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/70 p-3 rounded-lg border border-slate-800 text-xs font-mono">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Window ID</span>
                    <span className="text-cyan-300 font-bold">{decision.recommendedWindow.windowId}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">Start Time</span>
                    <span className="text-slate-200">
                      {new Date(decision.recommendedWindow.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase">End Time</span>
                    <span className="text-slate-200">
                      {new Date(decision.recommendedWindow.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC
                    </span>
                  </div>
                </div>

                {/* Candidate Windows Tabs */}
                <Tabs defaultValue="candidate-windows" className="w-full">
                  <TabsList className="bg-slate-950 border border-slate-800">
                    <TabsTrigger value="candidate-windows" className="text-xs">Candidate Windows ({decision.rankedWindows.length})</TabsTrigger>
                    <TabsTrigger value="provenance" className="text-xs">Data Provenance</TabsTrigger>
                  </TabsList>
                  <TabsContent value="candidate-windows" className="pt-3">
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
                                {new Date(rw.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} - {new Date(rw.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
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
                  <TabsContent value="provenance" className="pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-950 p-3 rounded border border-cyan-500/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#22d3ee]"></span>
                          <span className="font-bold text-cyan-400">DATA SOURCE</span>
                        </div>
                        <p className="text-[11px] text-slate-300 font-mono">
                          Mode: <span className="text-white font-bold">{decision.dataSource}</span> ({decision.evidenceBundle.sourceEndpoint})
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Tile <span className="font-mono text-white">{decision.evidenceBundle.selectedTileId}</span> baseline temperature: {decision.evidenceBundle.observedValues.averageTemperatureCelsius}°C
                        </p>
                      </div>

                      <div className="bg-slate-950 p-3 rounded border border-indigo-500/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#818cf8]"></span>
                          <span className="font-bold text-indigo-400">DERIVED EXPOSURE</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Optimal score: {decision.evidenceBundle.derivedValues.recommendedWindowScore}°C across {decision.evidenceBundle.derivedValues.candidateWindowCount} candidate windows.
                        </p>
                      </div>

                      <div className="bg-slate-950 p-3 rounded border border-amber-500/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]"></span>
                          <span className="font-bold text-amber-400">PREDICTED HORIZON</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Forecast horizon check: Window end strictly within FortyGuard +12h forecast limit.
                        </p>
                      </div>

                      <div className="bg-slate-950 p-3 rounded border border-slate-500/30 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8]"></span>
                          <span className="font-bold text-slate-400">ASSUMED CONSTRAINTS</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          Model version: <span className="font-mono text-slate-200">{decision.modelVersion}</span>
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

