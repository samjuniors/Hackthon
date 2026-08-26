'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { LocationSearch } from '@/components/LocationSearch';
import { SystemStatus } from '@/components/dashboard/SystemStatus';
import type { NamedLocation, ProviderStatus, FortyGuardHealthResponse, AIHealthResponse } from '@/types/provider';
import type { DataSourceMode } from '@/types/provenance';
import type { LocationPoint } from '@/types/domain';
import type { CandidateSite } from '@/hooks/use-candidate-sites';
import { useUserPreferences, AOI_SPAN_PRESETS_LOCAL } from '@/lib/user-preferences';
import { aoiSpanLabel } from '@/lib/spatial/aoi';
import { isLocationCoveredByFixture } from '@/lib/location/search';
import {
  type AnalysisTemporalInput,
  type AnalysisTimeMode,
  TIME_MODE_OPTIONS,
  deriveDurationHours,
  effectiveTimeBounds,
  formatTemporalForHeader,
  FIXTURE_TEMPORAL_METADATA,
  isValidDateStr,
  isValidTimeStr,
  todayLocalDate,
  FIXTURE_TIMEZONE,
} from '@/lib/temporal/analysis-window';
import {
  FIXTURE_DISPLAY_GRANULARITY,
  FIXTURE_DISPLAY_SNAPSHOT_COUNT,
  FIXTURE_CELL_COUNT,
  FIXTURE_CAPTURED_AT_ISO,
  FIXTURE_CAPTURED_HOUR_ISO,
} from '@/lib/fortyguard/fixture-display';

interface ControlRailProps {
  mode: DataSourceMode;
  selectedLocation: NamedLocation;
  /** Current AOI center (tracks drag movements — Section 4). */
  analysisCenter?: LocationPoint;
  /** Non-null when a state/region was selected as CONTEXT (Section 13). */
  stateLevelSelection?: NamedLocation | null;
  /** Explicit WHEN inputs — date + start + end + time mode. */
  temporalInput: AnalysisTemporalInput;
  onTemporalChange: (next: AnalysisTemporalInput) => void;
  onGenerate: () => void;
  loading: boolean;
  onSelectLocation: (loc: NamedLocation) => void;
  onSwitchToLive: () => void;
  // System status
  fortyGuardStatus: ProviderStatus;
  fortyGuardHealth: FortyGuardHealthResponse | null;
  aiStatus: ProviderStatus;
  aiHealth: AIHealthResponse | null;
  fieldReady: boolean;
  onTestFortyGuard: () => void;
  onTestAI: () => void;
  // Candidate sites (REAL user-placed sites — Section 8)
  candidateSites: CandidateSite[];
  onRemoveSite: (locationId: string) => void;
  onRenameSite: (locationId: string, name: string) => void;
  onToggleAddSiteMode: () => void;
  addSiteMode: boolean;
  onAddSiteFromSearch: (loc: NamedLocation) => void;
  /** Granularity the captured fixture was ACTUALLY recorded at (DEMO display). */
  fixtureGranularity?: number;
}

/** Format a metres value as a compact label (1000 → "1km"). */
function metresLabel(m: number): string {
  return m >= 1000 ? `${m / 1000}km` : `${m}m`;
}

/**
 * Left control rail — the operational input workspace.
 * Location → Analysis Area (span) → Thermal Cell → Candidate Sites → WHEN → Generate.
 * System status sits compactly at the bottom (advanced diagnostics live in Settings).
 */
export function ControlRail({
  mode,
  selectedLocation,
  analysisCenter,
  stateLevelSelection,
  temporalInput,
  onTemporalChange,
  onGenerate,
  loading,
  onSelectLocation,
  onSwitchToLive,
  fortyGuardStatus,
  fortyGuardHealth,
  aiStatus,
  aiHealth,
  fieldReady,
  onTestFortyGuard,
  onTestAI,
  candidateSites,
  onRemoveSite,
  onRenameSite,
  onToggleAddSiteMode,
  addSiteMode,
  onAddSiteFromSearch,
  fixtureGranularity,
}: ControlRailProps) {
  const [prefs, setters] = useUserPreferences();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showSiteSearch, setShowSiteSearch] = useState(false);
  const isFixtureMismatch = mode === 'FIXTURE' && !isLocationCoveredByFixture(selectedLocation);
  const aiProvider = aiHealth?.provider;
  // Display timezone: DEMO is UTC-anchored (the capture's request hour is a
  // UTC instant); LIVE uses the selected location's timezone.
  const tz = mode === 'FIXTURE' ? FIXTURE_TIMEZONE : selectedLocation.timezone;
  const derivedDuration = deriveDurationHours(temporalInput);
  const isFixtureAnchored = mode === 'FIXTURE';
  const centerCoords = analysisCenter ?? { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude };

  // Helper to update a single field of the temporal input.
  const update = (patch: Partial<AnalysisTemporalInput>) =>
    onTemporalChange({ ...temporalInput, ...patch });

  const handleTimeModeChange = (m: AnalysisTimeMode) => {
    setters.setAnalysisTimeMode(m);
    update({ timeMode: m });
  };

  // For Single hour, End is derived (Start + 1h) and shown read-only.
  const isSingleHour = temporalInput.timeMode === 'single-hour';
  const bounds = effectiveTimeBounds(temporalInput);

  // Validation flags — surface inline so the user fixes before Generate.
  const dateValid = isValidDateStr(temporalInput.date);
  const startValid = isValidTimeStr(temporalInput.startTime);
  const endValid = isValidTimeStr(temporalInput.endTime);
  const rangeValid =
    temporalInput.timeMode !== 'range-of-hours' ||
    (startValid && endValid && bounds.end > bounds.start);
  const allValid = dateValid && startValid && endValid && rangeValid;

  // Honest forecast note (no invented provider boundaries).
  const isFutureDate = dateValid && tz ? temporalInput.date > todayLocalDate(tz) : false;

  const outsideSiteCount = candidateSites.filter((s) => s.outsideAoi).length;

  // LIVE billing disclosure: a range evaluation sends ONE hourly provider
  // request per evaluated hour (cached results are reused at no extra cost).
  const liveHourlyRequestCount = Math.max(1, derivedDuration);

  return (
    <div className="space-y-4">
      {/* ── DEMO notice — truthful capture provenance ── */}
      {mode === 'FIXTURE' && (
        <div className="rounded-xl p-3.5 border border-border bg-accent-amber-bg" data-testid="demo-capture-notice">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm" style={{ color: 'var(--accent-amber)' }}>⬡</span>
            <span className="text-sm font-bold" style={{ color: 'var(--accent-amber)' }}>
              DEMO · Captured FortyGuard
            </span>
          </div>
          <div className="text-[10px] font-mono leading-relaxed" style={{ color: 'var(--accent-amber-text)', opacity: 0.9 }}>
            <div>{FIXTURE_DISPLAY_GRANULARITY}m cell resolution</div>
            <div>Model hour: {FIXTURE_CAPTURED_HOUR_ISO.slice(0, 10)} · {FIXTURE_CAPTURED_HOUR_ISO.slice(11, 16)} UTC</div>
            <div>Captured: {FIXTURE_CAPTURED_AT_ISO.slice(0, 10)} {FIXTURE_CAPTURED_AT_ISO.slice(11, 16)} UTC</div>
            <div>{FIXTURE_CELL_COUNT} provider cells · {FIXTURE_DISPLAY_SNAPSHOT_COUNT}-hour snapshot</div>
          </div>
          <p className="text-xs leading-relaxed mt-1.5" style={{ color: 'var(--accent-amber-text)', opacity: 0.85 }}>
            Offline demonstration replaying one genuine captured FortyGuard field (Lower Manhattan). Switch to LIVE in
            Settings to analyse any location in real time.
          </p>
        </div>
      )}

      {/* ── ANALYSIS ── */}
      <div className="rounded-xl border border-border bg-surface-card p-4 space-y-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">Analysis</div>

        <LocationSearch
          selectedLocation={selectedLocation}
          mode={mode}
          onSelectLocation={onSelectLocation}
          onSwitchToLive={onSwitchToLive}
        />

        {/* ── State-level selection context (Section 13) ── */}
        {stateLevelSelection && (
          <div
            className="rounded-lg p-3 border"
            style={{ background: 'rgba(225,29,72,0.06)', borderColor: 'rgba(225,29,72,0.35)' }}
            data-testid="state-level-selection-indicator"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#e11d48' }}>
                Geographic Region Selected
              </span>
              <span className="text-[9px] font-mono text-text-dimmed">context only</span>
            </div>
            <div className="text-xs font-bold text-text-primary">{stateLevelSelection.name}</div>
            <p className="text-[10px] text-text-muted mt-1 leading-relaxed">
              Region boundary shown for context. The analysis point did NOT move — now search a city, street, or address
              inside {stateLevelSelection.name} to place the analysis area.
            </p>
          </div>
        )}

        <div className="border-t border-border" />

        {/* ── Analysis Area (SPAN semantics — Section 3) ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">Analysis Area</span>
            <span className="text-[10px] font-mono text-text-dimmed">
              {prefs.analysisAreaShape === 'circle' ? 'diameter' : 'square span'} · draggable
            </span>
          </div>
          {/* Shape toggle */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            {(['polygon', 'circle'] as const).map((shape) => (
              <button
                key={shape}
                data-testid={`aoi-shape-${shape}`}
                onClick={() => setters.setAnalysisAreaShape(shape)}
                className={`min-h-[40px] rounded-lg text-xs font-semibold capitalize transition-all border ${
                  prefs.analysisAreaShape === shape
                    ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                }`}
              >
                {shape === 'polygon' ? 'Square' : 'Circle'}
              </button>
            ))}
          </div>
          {/* AOI span presets — the number IS the visible size:
              polygon → side length ("400m × 400m"), circle → diameter. */}
          <div className="grid grid-cols-5 gap-1.5" data-testid="aoi-size-presets">
            {AOI_SPAN_PRESETS_LOCAL.map((size) => {
              const active = prefs.analysisAoiSpanMetres === size;
              return (
                <button
                  key={size}
                  data-testid={`aoi-size-${size}`}
                  onClick={() => setters.setAnalysisAoiSpanMetres(size)}
                  className={`min-h-[36px] rounded-md text-[10px] font-mono font-bold transition-all border ${
                    active
                      ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                      : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                  }`}
                  aria-pressed={active}
                >
                  {metresLabel(size)}
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 px-2 py-1 rounded bg-surface-deep/60 border border-border/50 text-[10px] font-mono text-text-muted flex items-center justify-between">
            <span>Size:</span>
            <span className="text-accent-cyan font-bold" data-testid="aoi-span-label">
              {aoiSpanLabel(prefs.analysisAoiSpanMetres, prefs.analysisAreaShape)}
            </span>
          </div>
          <p className="text-[9px] text-text-dimmed mt-1 leading-relaxed">
            Drag the ⌖ handle on the map to move the area — the moved geometry is exactly what FortyGuard receives.
          </p>
        </div>

        {/* ── Thermal Cell resolution (Section 2 — granularity, NOT zoom) ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">Thermal Cell</span>
            <span className="text-[10px] font-mono text-text-dimmed">
              {mode === 'LIVE' ? 'FortyGuard granularity' : `fixture captured at ${fixtureGranularity ?? 100}m`}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2" data-testid="resolution-options">
            {([60, 80, 100] as const).map((r) => {
              const active = prefs.analysisResolution === r;
              const fixtureMismatch = mode === 'FIXTURE' && fixtureGranularity !== r;
              return (
                <button
                  key={r}
                  data-testid={`resolution-${r}`}
                  onClick={() => setters.setAnalysisResolution(r)}
                  title={`FortyGuard thermal-cell granularity ${r}m × ${r}m (does not change map zoom)`}
                  className={`min-h-[40px] rounded-lg text-xs font-semibold transition-all border leading-tight ${
                    active
                      ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                      : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                  }`}
                >
                  {r}m × {r}m
                </button>
              );
            })}
          </div>
          {mode === 'FIXTURE' && fixtureGranularity !== prefs.analysisResolution && (
            <p className="text-[9px] mt-1" style={{ color: 'var(--accent-amber)' }}>
              DEMO displays the fixture&apos;s actual {fixtureGranularity ?? 100}m cells — the {prefs.analysisResolution}m
              selection only affects LIVE queries.
            </p>
          )}
        </div>

        {/* ── Candidate Sites (REAL sites only — Section 8) ── */}
        <div className="border-t border-border" />
        <div data-testid="candidate-sites-section">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">Candidate Sites</span>
            <span className="text-[10px] font-mono text-text-dimmed">
              {mode === 'FIXTURE' ? 'DEMO CANDIDATES' : 'user-placed'}
            </span>
          </div>

          {mode === 'FIXTURE' ? (
            <div className="space-y-1.5">
              <p className="text-[10px] text-text-muted leading-relaxed">
                DEMO CANDIDATES — application-defined points evaluated against the captured FortyGuard field (not
                captured sites). LIVE lets you place your own sites.
              </p>
              {['Battery Park Greenway', 'City Hall Civic Center', 'Chinatown / Bowery'].map((n) => (
                <div key={n} className="flex items-center gap-2 rounded-md bg-surface-deep border border-border px-2.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--text-secondary)' }} />
                  <span className="text-xs text-text-secondary">{n}</span>
                  <span className="ml-auto text-[8px] font-mono uppercase text-text-dimmed">demo candidate</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {/* Add-site actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="add-site-map-btn"
                  onClick={onToggleAddSiteMode}
                  className={`min-h-[38px] rounded-lg text-[11px] font-bold transition-all border flex items-center justify-center gap-1.5 ${
                    addSiteMode
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                      : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                  }`}
                >
                  {addSiteMode ? '✓ Click the map…' : '+ Add on map'}
                </button>
                <button
                  type="button"
                  data-testid="add-site-search-btn"
                  onClick={() => setShowSiteSearch((v) => !v)}
                  className={`min-h-[38px] rounded-lg text-[11px] font-bold transition-all border flex items-center justify-center gap-1.5 ${
                    showSiteSearch
                      ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                      : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                  }`}
                >
                  🔍 From search
                </button>
              </div>

              {/* Site search inline */}
              {showSiteSearch && (
                <div className="rounded-lg border border-border bg-surface-deep p-2">
                  <LocationSearch
                    selectedLocation={selectedLocation}
                    mode={mode}
                    onSelectLocation={(loc) => {
                      onAddSiteFromSearch(loc);
                      setShowSiteSearch(false);
                    }}
                    onSwitchToLive={undefined}
                    compact
                  />
                  <p className="text-[9px] text-text-dimmed mt-1">
                    Only sites inside the analysis area can be added.
                  </p>
                </div>
              )}

              {/* Site list */}
              {candidateSites.length === 0 ? (
                <p className="text-[10px] text-text-muted leading-relaxed" data-testid="no-candidate-sites">
                  No candidate sites yet. LIVE never fabricates sites — add one on the map or from search, then Generate.
                </p>
              ) : (
                <ul className="space-y-1.5 max-h-40 overflow-y-auto" data-testid="candidate-sites-list">
                  {candidateSites.map((site, idx) => (
                    <li
                      key={site.locationId}
                      className={`rounded-md border px-2.5 py-1.5 ${
                        site.outsideAoi
                          ? 'border-red-400/60 bg-red-400/5'
                          : 'border-border bg-surface-deep'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold text-text-dimmed flex-shrink-0">{idx + 1}.</span>
                        {renamingId === site.locationId ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              if (renameValue.trim()) onRenameSite(site.locationId, renameValue.trim());
                              setRenamingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (renameValue.trim()) onRenameSite(site.locationId, renameValue.trim());
                                setRenamingId(null);
                              }
                            }}
                            className="flex-1 min-w-0 bg-surface-elevated border border-accent-cyan/50 rounded px-1.5 py-0.5 text-xs text-text-primary focus:outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingId(site.locationId);
                              setRenameValue(site.name);
                            }}
                            className="flex-1 min-w-0 text-left text-xs text-text-secondary hover:text-text-primary transition-colors truncate"
                            title="Click to rename"
                          >
                            {site.name}
                          </button>
                        )}
                        <span
                          className="text-[8px] font-mono uppercase text-text-dimmed flex-shrink-0"
                          title={`Added via ${site.origin}`}
                        >
                          {site.origin === 'map-click' ? 'map' : site.origin}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveSite(site.locationId)}
                          className="text-text-dimmed hover:text-red-400 transition-colors text-xs flex-shrink-0"
                          title="Remove site"
                        >
                          ✕
                        </button>
                      </div>
                      {site.outsideAoi && (
                        <div className="text-[9px] text-red-400 mt-0.5">
                          Outside the analysis area — move it inside or drag the AOI to cover it.
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {outsideSiteCount > 0 && (
                <p className="text-[9px] text-red-400" data-testid="outside-sites-warning">
                  {outsideSiteCount} site{outsideSiteCount > 1 ? 's' : ''} outside the analysis area — fix before Generate.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border" />

        {/* ── WHEN — explicit date + time window (Section 14) ── */}
        <div data-testid="when-section">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">WHEN</span>
            {isFixtureAnchored ? (
              <span
                className="px-2 py-0.5 rounded text-[9px] font-mono font-bold border"
                style={{
                  background: 'var(--accent-amber-bg)',
                  color: 'var(--accent-amber)',
                  borderColor: 'var(--accent-amber)',
                }}
                title={FIXTURE_TEMPORAL_METADATA.captureLabel}
              >
                Fixture capture
              </span>
            ) : (
              <span className="text-[10px] font-mono text-text-dimmed">{tz || 'UTC'}</span>
            )}
          </div>

          {/* EVALUATION WINDOW selector — a UI concept, NOT a provider
              filter_type. The verified wire contract: every evaluated hour is
              its own single-hour FortyGuard request (filter_type: 1). */}
          <div className="mb-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">
                Evaluation Window
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {TIME_MODE_OPTIONS.map((opt) => {
                const active = temporalInput.timeMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    data-testid={`evaluation-window-${opt.value}`}
                    onClick={() => handleTimeModeChange(opt.value)}
                    className={`min-h-[36px] rounded-md text-[10px] font-bold transition-all border leading-tight px-1 ${
                      active
                        ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                        : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                    }`}
                    aria-pressed={active}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] text-text-dimmed mt-1 leading-relaxed">
              A time range is evaluated as a sequence of hourly FortyGuard requests — one request per hour.
            </p>
          </div>

          {/* Date input (always visible) */}
          <label className="block mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">Date</span>
            <input
              type="date"
              value={temporalInput.date}
              onChange={(e) => update({ date: e.target.value })}
              disabled={isFixtureAnchored}
              className={`mt-1 w-full h-10 rounded-lg border bg-surface-elevated px-3 text-sm font-mono text-text-primary focus:outline-none focus:border-accent-cyan transition-colors ${
                dateValid ? 'border-border' : 'border-red-400'
              } ${isFixtureAnchored ? 'opacity-70 cursor-not-allowed' : ''}`}
              aria-label="Analysis date"
            />
            {/* LIVE date hint — honest about model completion, no invented
                "guaranteed valid" date, no silent retry / DEMO fallback. */}
            {mode === 'LIVE' && (
              <span className="block text-[9px] text-text-dimmed mt-1 leading-relaxed" data-testid="live-date-hint">
                Pick the date explicitly. Recently requested periods may have no completed FortyGuard model yet (the
                provider then returns an empty thermal field — reported verbatim, never retried with another date).
                Documented forecast support: up to +12h ahead.
              </span>
            )}
          </label>

          {/* Start / End time inputs */}
          <div className={`grid ${isSingleHour ? 'grid-cols-1' : 'grid-cols-2'} gap-2 mb-2`}>
            <label className="block">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">
                {isSingleHour ? 'Hour' : 'Start'}
              </span>
              <input
                type="time"
                value={temporalInput.startTime}
                onChange={(e) => update({ startTime: e.target.value })}
                disabled={isFixtureAnchored}
                className={`mt-1 w-full h-10 rounded-lg border bg-surface-elevated px-3 text-sm font-mono text-text-primary focus:outline-none focus:border-accent-cyan transition-colors ${
                  startValid ? 'border-border' : 'border-red-400'
                } ${isFixtureAnchored ? 'opacity-70 cursor-not-allowed' : ''}`}
                aria-label="Analysis start time"
              />
            </label>
            {!isSingleHour && (
              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">End</span>
                <input
                  type="time"
                  value={temporalInput.endTime}
                  onChange={(e) => update({ endTime: e.target.value })}
                  disabled={isFixtureAnchored}
                  className={`mt-1 w-full h-10 rounded-lg border bg-surface-elevated px-3 text-sm font-mono text-text-primary focus:outline-none focus:border-accent-cyan transition-colors ${
                    endValid ? 'border-border' : 'border-red-400'
                  } ${isFixtureAnchored ? 'opacity-70 cursor-not-allowed' : ''}`}
                  aria-label="Analysis end time"
                />
              </label>
            )}
          </div>

          {/* Derived duration (read-only) */}
          <div className="flex items-center justify-between rounded-lg bg-surface-deep px-3 py-2 border border-border">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">
              Duration
            </span>
            <span
              className="text-base font-black font-mono"
              style={{ color: 'var(--accent-cyan)' }}
              data-testid="duration-display"
            >
              {derivedDuration}h
            </span>
          </div>

          {/* Inline validation hint */}
          {!allValid && (
            <p className="text-[10px] text-red-400 mt-1.5">
              {!dateValid && 'Enter a valid date (YYYY-MM-DD). '}
              {!rangeValid && 'End time must be after start time.'}
            </p>
          )}

          {/* Honest future-date note */}
          {mode === 'LIVE' && isFutureDate && (
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--accent-amber)' }}>
              Future date selected — subject to FortyGuard forecast availability. The provider reports any unsupported window verbatim.
            </p>
          )}

          {/* LIVE billing disclosure — the engine sends ONE hourly provider
              request per evaluated hour; make that explicit BEFORE Generate.
              Conservative wording: no exact credit cost is claimed. */}
          {mode === 'LIVE' && allValid && (
            <div
              className="rounded-lg px-3 py-2 mt-2 border"
              style={{ background: 'rgba(5,150,105,0.08)', borderColor: 'rgba(5,150,105,0.35)' }}
              data-testid="live-request-disclosure"
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#059669' }}>
                  LIVE · {derivedDuration}-hour evaluation
                </span>
                <span className="text-[10px] font-mono font-bold" style={{ color: '#059669' }}>
                  {liveHourlyRequestCount} FortyGuard hourly request{liveHourlyRequestCount > 1 ? 's' : ''}
                </span>
              </div>
              <p className="text-[9px] text-text-muted mt-0.5 leading-relaxed">
                Each evaluated hour is submitted as its own single-hour FortyGuard /v1/heatmap request (cached results are
                reused, not re-billed). Repeat requests may consume provider credits.
              </p>
            </div>
          )}

          {/* Human-readable window preview */}
          {allValid && (
            <p className="text-[10px] font-mono text-text-muted mt-2 leading-relaxed">
              {formatTemporalForHeader(temporalInput, tz)}
            </p>
          )}
        </div>

        {/* Selected Analysis Area indicator — coordinates track AOI drag */}
        <div
          className="rounded-lg p-3 bg-surface-deep border border-border space-y-1"
          data-testid="active-analysis-location-indicator"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-text-dimmed">Selected Analysis Area</span>
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold border"
              style={mode === 'LIVE'
                ? { background: 'var(--accent-cyan-bg)', color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }
                : { background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }
              }
              data-testid="analysis-mode-badge"
            >
              {mode === 'LIVE' ? 'LIVE · FortyGuard' : 'DEMO · Captured FortyGuard'}
            </span>
          </div>
          <div className="text-sm font-bold text-text-primary leading-tight" data-testid="active-analysis-location-name">
            {selectedLocation.name}
          </div>
          <div className="text-[11px] font-mono flex items-center justify-between" style={{ color: 'var(--accent-cyan)' }} data-testid="active-analysis-location-coords">
            <span>{centerCoords.latitude.toFixed(4)}°, {centerCoords.longitude.toFixed(4)}°</span>
            <span className="text-text-muted font-sans text-[10px]">
              {selectedLocation.city ? `${selectedLocation.city}, ${selectedLocation.state || selectedLocation.country}` : selectedLocation.state || ''}
            </span>
          </div>
        </div>

        {/* Generate button */}
        <motion.button
          whileTap={{ scale: 0.99 }}
          disabled={loading}
          onClick={onGenerate}
          data-testid="recalculate-decision-btn"
          className={`w-full h-12 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            loading ? 'bg-surface-elevated text-text-dimmed cursor-not-allowed' : 'text-white hover:scale-[1.01] active:scale-[0.99]'
          }`}
          style={loading ? {} : {
            background: mode === 'LIVE'
              ? 'linear-gradient(135deg, var(--accent-emerald), #0d9488)'
              : 'linear-gradient(135deg, var(--accent-cyan), #0284c7)',
            boxShadow: mode === 'LIVE'
              ? '0 4px 16px rgba(5,150,105,0.3)'
              : '0 4px 16px rgba(14,165,233,0.3)',
          }}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-text-dimmed rounded-full animate-spin" style={{ borderTopColor: 'var(--accent-cyan)' }} />
              Generating thermal field…
            </span>
          ) : (
            `⚡ Generate Thermal Field (${mode === 'LIVE' ? 'LIVE' : 'DEMO'})`
          )}
        </motion.button>
      </div>

      {/* ── SYSTEM STATUS ── */}
      <SystemStatus
        mode={mode}
        fortyGuardStatus={fortyGuardStatus}
        aiStatus={aiStatus}
        aiProvider={aiProvider}
        fieldReady={fieldReady}
        loading={loading}
        onTestFortyGuard={onTestFortyGuard}
        onTestAI={onTestAI}
      />

      <div className="text-[10px] text-text-dimmed font-mono text-center">
        FortyGuard Hackathon&apos;26
      </div>
    </div>
  );
}

export default ControlRail;
