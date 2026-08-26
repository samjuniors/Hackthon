'use client';

import { motion } from 'framer-motion';
import { LocationSearch } from '@/components/LocationSearch';
import { SystemStatus } from '@/components/dashboard/SystemStatus';
import type { NamedLocation, ProviderStatus, FortyGuardHealthResponse, AIHealthResponse } from '@/types/provider';
import type { DataSourceMode } from '@/types/provenance';
import { useUserPreferences, AOI_HALF_SIDE_PRESETS } from '@/lib/user-preferences';
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
} from '@/lib/temporal/analysis-window';

interface ControlRailProps {
  mode: DataSourceMode;
  selectedLocation: NamedLocation;
  /** Explicit WHEN inputs (Section 4) — date + start + end + time mode. */
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
}

/**
 * Left control rail — the operational input workspace.
 * Location → Analysis Area → Resolution → WHEN (date/time) → Generate.
 * System status sits compactly at the bottom (advanced diagnostics live in Settings).
 */
export function ControlRail({
  mode,
  selectedLocation,
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
}: ControlRailProps) {
  const [prefs, setters] = useUserPreferences();
  const isFixtureMismatch = mode === 'FIXTURE' && !isLocationCoveredByFixture(selectedLocation);
  const aiProvider = aiHealth?.provider;
  const tz = selectedLocation.timezone;
  const derivedDuration = deriveDurationHours(temporalInput);
  const isFixtureAnchored = mode === 'FIXTURE';

  // Helper to update a single field of the temporal input.
  const update = (patch: Partial<AnalysisTemporalInput>) =>
    onTemporalChange({ ...temporalInput, ...patch });

  const handleTimeModeChange = (m: AnalysisTimeMode) => {
    setters.setAnalysisTimeMode(m);
    update({ timeMode: m });
  };
  const handleDayWindowChange = (h: 2 | 3 | 4) => {
    setters.setAnalysisDayWindowHours(h);
    update({ dayWindowHours: h });
  };

  // For Single Hour, End is derived (Start + 1h) and shown read-only.
  const isSingleHour = temporalInput.timeMode === 'single-hour';
  const isSingleDay = temporalInput.timeMode === 'single-day';
  const bounds = effectiveTimeBounds(temporalInput);

  // Validation flags — surface inline so the user fixes before Generate.
  const dateValid = isValidDateStr(temporalInput.date);
  const startValid = isValidTimeStr(temporalInput.startTime);
  const endValid = isValidTimeStr(temporalInput.endTime);
  const rangeValid =
    temporalInput.timeMode !== 'range-of-hours' ||
    (startValid && endValid && bounds.end > bounds.start);
  const allValid = dateValid && startValid && endValid && rangeValid;

  // Honest forecast note (no invented provider boundaries): a future date is
  // surfaced explicitly so a LIVE request never silently becomes an arbitrary
  // future query. The exact forecast horizon is the provider's decision and is
  // reported verbatim in the error banner if FortyGuard rejects the window.
  const isFutureDate = dateValid && tz ? temporalInput.date > todayLocalDate(tz) : false;

  return (
    <div className="space-y-4">
      {/* ── DEMO notice ── */}
      {mode === 'FIXTURE' && (
        <div className="rounded-xl p-3.5 border border-border bg-accent-amber-bg">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm" style={{ color: 'var(--accent-amber)' }}>⬡</span>
            <span className="text-sm font-bold" style={{ color: 'var(--accent-amber)' }}>
              DEMO · Captured FortyGuard
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--accent-amber-text)', opacity: 0.85 }}>
            Offline demonstration using a 12-hour Manhattan thermal field capture. Switch to LIVE in Settings to analyse any location in real time.
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

        <div className="border-t border-border" />

        {/* Analysis Area */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">Analysis Area</span>
            <span className="text-[10px] font-mono text-text-dimmed">shape + size</span>
          </div>
          {/* Shape toggle */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            {(['polygon', 'circle'] as const).map((shape) => (
              <button
                key={shape}
                onClick={() => setters.setAnalysisAreaShape(shape)}
                className={`min-h-[40px] rounded-lg text-xs font-semibold capitalize transition-all border ${
                  prefs.analysisAreaShape === shape
                    ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                }`}
              >
                {shape}
              </button>
            ))}
          </div>
          {/* AOI size presets — distinct from Resolution (60/80/100m).
              Half-side in metres (polygon) or radius in metres (circle). */}
          <div className="grid grid-cols-5 gap-1.5">
            {AOI_HALF_SIDE_PRESETS.map((size) => {
              const label = size >= 1000 ? `${size / 1000}km` : `${size}m`;
              const active = prefs.analysisAoiHalfSideMetres === size;
              return (
                <button
                  key={size}
                  onClick={() => setters.setAnalysisAoiHalfSideMetres(size)}
                  className={`min-h-[36px] rounded-md text-[10px] font-mono font-bold transition-all border ${
                    active
                      ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                      : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                  }`}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Resolution */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">Resolution</span>
            <span className="text-[10px] font-mono text-text-dimmed">affects LIVE queries</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([60, 80, 100] as const).map((r) => (
              <button
                key={r}
                onClick={() => setters.setAnalysisResolution(r)}
                className={`min-h-[40px] rounded-lg text-xs font-semibold transition-all border ${
                  prefs.analysisResolution === r
                    ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                }`}
              >
                {r}m
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border" />

        {/* WHEN — explicit date + time window (Section 4). Replaces duration-only. */}
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

          {/* Time Mode selector (Section 5) */}
          <div className="grid grid-cols-3 gap-1.5 mb-2.5">
            {TIME_MODE_OPTIONS.map((opt) => {
              const active = temporalInput.timeMode === opt.value;
              return (
                <button
                  key={opt.value}
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

          {/* Date input (always visible — Section 7) */}
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
                disabled={isFixtureAnchored || isSingleDay}
                className={`mt-1 w-full h-10 rounded-lg border bg-surface-elevated px-3 text-sm font-mono text-text-primary focus:outline-none focus:border-accent-cyan transition-colors ${
                  startValid ? 'border-border' : 'border-red-400'
                } ${isFixtureAnchored || isSingleDay ? 'opacity-70 cursor-not-allowed' : ''}`}
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
                  disabled={isFixtureAnchored || isSingleDay}
                  className={`mt-1 w-full h-10 rounded-lg border bg-surface-elevated px-3 text-sm font-mono text-text-primary focus:outline-none focus:border-accent-cyan transition-colors ${
                    endValid ? 'border-border' : 'border-red-400'
                  } ${isFixtureAnchored || isSingleDay ? 'opacity-70 cursor-not-allowed' : ''}`}
                  aria-label="Analysis end time"
                />
              </label>
            )}
          </div>

          {/* Single Day: window-length selector (the engine finds this length within the day) */}
          {isSingleDay && (
            <div className="mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">
                Window length to find
              </span>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {([2, 3, 4] as const).map((h) => {
                  const active = (temporalInput.dayWindowHours ?? 3) === h;
                  return (
                    <button
                      key={h}
                      onClick={() => handleDayWindowChange(h)}
                      className={`min-h-[34px] rounded-md text-[11px] font-bold font-mono transition-all border ${
                        active
                          ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                          : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                      }`}
                      aria-pressed={active}
                    >
                      {h}h
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Derived duration (read-only) — Section 4: "duration should be derived from start/end" */}
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

          {/* Honest future-date note — never silently query an arbitrary future window */}
          {mode === 'LIVE' && isFutureDate && (
            <p className="text-[10px] mt-1.5" style={{ color: 'var(--accent-amber)' }}>
              Future date selected — subject to FortyGuard forecast availability. The provider reports any unsupported window verbatim.
            </p>
          )}

          {/* Human-readable window preview (what will be sent to FortyGuard) */}
          {allValid && (
            <p className="text-[10px] font-mono text-text-muted mt-2 leading-relaxed">
              {formatTemporalForHeader(temporalInput, tz)}
            </p>
          )}
        </div>

        {/* Selected Analysis Area indicator */}
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
            <span>{selectedLocation.latitude.toFixed(4)}°, {selectedLocation.longitude.toFixed(4)}°</span>
            {selectedLocation.city && (
              <span className="text-text-muted font-sans text-[10px]">
                {selectedLocation.city}, {selectedLocation.state || selectedLocation.country}
              </span>
            )}
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
