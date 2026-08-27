'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Plus, Search } from 'lucide-react';
import { LocationSearch } from '@/components/LocationSearch';
import type { NamedLocation, ProviderStatus, FortyGuardHealthResponse, AIHealthResponse } from '@/types/provider';
import type { DataSourceMode } from '@/types/provenance';
import type { LocationPoint } from '@/types/domain';
import type { CandidateSite } from '@/hooks/use-candidate-sites';
import { getCandidateColor } from '@/components/ThermalMap';
import { useUserPreferences, AOI_SPAN_PRESETS_LOCAL } from '@/lib/user-preferences';
import { aoiSpanLabel } from '@/lib/spatial/aoi';
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
  fixtureCaptureSpanLabel,
} from '@/lib/fortyguard/fixture-display';
import { SystemStatus } from '@/components/dashboard/SystemStatus';

interface ControlRailProps {
  mode: DataSourceMode;
  /** NULL in the EMPTY workspace state (no location selected yet). */
  selectedLocation: NamedLocation | null;
  /** Current AOI center (tracks drag movements). */
  analysisCenter?: LocationPoint;
  /** Non-null when a state/region was selected as CONTEXT. */
  stateLevelSelection?: NamedLocation | null;
  /**
   * True when the DEMO data source has a genuine capture for the selected
   * location: the captured analysis area, cells, and application-defined
   * DEMO candidates exist ONLY then.
   */
  demoCaptureAvailable?: boolean;
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
  // Candidate sites (REAL user-placed sites)
  candidateSites: CandidateSite[];
  onRemoveSite: (locationId: string) => void;
  onRenameSite: (locationId: string, name: string) => void;
  onToggleAddSiteMode: () => void;
  addSiteMode: boolean;
  onAddSiteFromSearch: (loc: NamedLocation) => void;
  /** Granularity the captured fixture was ACTUALLY recorded at (DEMO display). */
  fixtureGranularity?: number;
  /**
   * ONE compact Reset control: clears the ENTIRE analysis workspace and
   * invalidates any in-flight request — returning to EMPTY without a reload.
   */
  onReset: () => void;
  /** Clear the selected operating location → EMPTY workspace. */
  onClearLocation: () => void;
  /** True when Generate must stay disabled (validation failure). */
  generateDisabled?: boolean;
  /** Human reason shown next to a disabled Generate. */
  generateDisabledReason?: string;
  /** Active geographic region or state code for preset filtering. */
  activeStateFilter?: string;
}

/** Format a metres value as a compact label (1000 → "1km"). */
function metresLabel(m: number): string {
  return m >= 1000 ? `${m / 1000}km` : `${m}m`;
}

/** Section label — one consistent hierarchy element. */
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-text-dimmed">
        {children}
      </span>
      {right}
    </div>
  );
}

/** Hairline separator — whitespace + one line instead of nested cards. */
function Separator() {
  return <div className="h-px bg-border/70 my-5" aria-hidden="true" />;
}

/**
 * Analysis panel — the operational input workspace.
 *
 * Flat section hierarchy (LOCATION → AREA OF INTEREST → THERMAL CELL →
 * EVALUATION WINDOW → CANDIDATE SITES → Generate) separated by hairlines and
 * whitespace. No nested bordered cards. Rendered in the desktop rail AND the
 * mobile analysis bottom sheet (same component, one source of truth).
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
  onReset,
  onClearLocation,
  generateDisabled = false,
  generateDisabledReason,
  demoCaptureAvailable = false,
  activeStateFilter,
}: ControlRailProps) {
  const [prefs, setters] = useUserPreferences();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showSiteSearch, setShowSiteSearch] = useState(false);
  const aiProvider = aiHealth?.provider;
  // Display timezone: DEMO is UTC-anchored (the capture's request hour is a
  // UTC instant); LIVE uses the selected location's timezone.
  const tz = mode === 'FIXTURE' ? FIXTURE_TIMEZONE : selectedLocation?.timezone;
  const derivedDuration = deriveDurationHours(temporalInput);
  const isFixtureAnchored = mode === 'FIXTURE';
  const centerCoords = analysisCenter
    ?? (selectedLocation
      ? { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }
      : null);

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
    <div className="space-y-0">
      {/* ── ANALYSIS header + ONE compact Reset ── */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-dimmed">
          Analysis
        </span>
        {/* ONE compact Reset control — wipes the whole analysis workspace back
            to EMPTY. Tooltip + aria-label: "Reset analysis". */}
        <button
          type="button"
          data-testid="reset-analysis-btn"
          onClick={onReset}
          title="Reset analysis"
          aria-label="Reset analysis"
          className="flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-medium text-text-muted hover:text-text-primary hover:bg-surface-deep transition-colors duration-150"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          <span className="hidden sm:inline">Reset</span>
        </button>
      </div>

      {/* ── DEMO notice — truthful capture provenance (compact note) ── */}
      {mode === 'FIXTURE' && (
        <div className="mt-3 rounded-lg px-3 py-2.5 border border-amber-500/25" style={{ background: 'var(--accent-amber-bg)' }} data-testid="demo-capture-notice">
          <div className="text-[11.5px] font-semibold" style={{ color: 'var(--accent-amber)' }}>
            DEMO · Captured FortyGuard field
          </div>
          <div className="text-[10.5px] leading-relaxed mt-1" style={{ color: 'var(--accent-amber-text)' }}>
            {FIXTURE_DISPLAY_GRANULARITY}m cell resolution · {fixtureCaptureSpanLabel()} · {FIXTURE_CELL_COUNT} provider cells ·
            model hour {FIXTURE_CAPTURED_HOUR_ISO.slice(0, 10)} {FIXTURE_CAPTURED_HOUR_ISO.slice(11, 16)} UTC ·
            captured {FIXTURE_CAPTURED_AT_ISO.slice(0, 10)}.
          </div>
          <p className="text-[10.5px] leading-relaxed mt-1.5" style={{ color: 'var(--accent-amber-text)', opacity: 0.85 }}>
            Offline replay of one genuine captured field (Lower Manhattan). Switch to LIVE for any location.
          </p>
        </div>
      )}

      {/* ── LOCATION ── */}
      <div className="mt-4">
        <SectionLabel>Location</SectionLabel>
        <LocationSearch
          selectedLocation={selectedLocation}
          mode={mode}
          onSelectLocation={onSelectLocation}
          onSwitchToLive={onSwitchToLive}
          onClearLocation={onClearLocation}
          activeStateFilter={activeStateFilter}
        />

        {/* State-level selection context */}
        {stateLevelSelection && (
          <div
            className="mt-2.5 rounded-lg p-2.5 border border-border bg-surface-elevated"
            data-testid="state-level-selection-indicator"
          >
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dimmed">
                Region selected · context only
              </span>
            </div>
            <div className="text-xs font-semibold text-text-primary">{stateLevelSelection.name}</div>
            <p className="text-[10.5px] text-text-muted mt-1 leading-relaxed">
              Boundary shown for context — the analysis point did NOT move. Search a city, street, or address inside{' '}
              {stateLevelSelection.name} to place the analysis area.
            </p>
          </div>
        )}
      </div>

      <Separator />

      {/* ── AREA OF INTEREST ── */}
      <div>
        <SectionLabel
          right={
            <span className="text-[10px] font-medium text-text-dimmed">
              {mode === 'FIXTURE' ? 'captured · fixed' : 'follows location pin'}
            </span>
          }
        >
          Area of Interest
        </SectionLabel>
        {mode === 'FIXTURE' ? (
          <div data-testid="captured-analysis-area" className="space-y-1">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-text-muted">Captured analysis area</span>
              <span className="font-semibold tnum text-text-primary">
                {fixtureCaptureSpanLabel()}
              </span>
            </div>
            <div className="text-[10px] text-text-dimmed leading-relaxed">
              The exact area the genuine FortyGuard capture was requested for. Shape and size apply to LIVE only.
            </div>
          </div>
        ) : (
          <>
            {/* Shape toggle (LIVE) */}
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {(['polygon', 'circle'] as const).map((shape) => (
                <button
                  key={shape}
                  data-testid={`aoi-shape-${shape}`}
                  onClick={() => setters.setAnalysisAreaShape(shape)}
                  aria-pressed={prefs.analysisAreaShape === shape}
                  className={`h-9 rounded-lg text-xs font-medium border transition-colors duration-150 ${
                    prefs.analysisAreaShape === shape
                      ? 'border-primary bg-primary/10 text-text-primary'
                      : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary'
                  }`}
                >
                  {shape === 'polygon' ? 'Square' : 'Circle'}
                </button>
              ))}
            </div>
            {/* AOI span presets — the number IS the visible size:
                polygon → side length, circle → diameter. */}
            <div className="grid grid-cols-5 gap-1.5" data-testid="aoi-size-presets">
              {AOI_SPAN_PRESETS_LOCAL.map((size) => {
                const active = prefs.analysisAoiSpanMetres === size;
                return (
                  <button
                    key={size}
                    data-testid={`aoi-size-${size}`}
                    onClick={() => setters.setAnalysisAoiSpanMetres(size)}
                    aria-pressed={active}
                    className={`h-9 rounded-md text-[10.5px] font-medium border tnum transition-colors duration-150 ${
                      active
                        ? 'border-primary bg-primary/10 text-text-primary'
                        : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {metresLabel(size)}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 text-[10.5px] text-text-dimmed flex items-center justify-between">
              <span>Span</span>
              <span className="tnum text-text-muted" data-testid="aoi-span-label">
                {aoiSpanLabel(prefs.analysisAoiSpanMetres, prefs.analysisAreaShape)}
              </span>
            </div>
            <p className="text-[10px] text-text-dimmed mt-1.5 leading-relaxed">
              Drag the teal operating-location pin on the map to move the area — the moved geometry is exactly what
              FortyGuard receives.
            </p>
          </>
        )}
      </div>

      <Separator />

      {/* ── THERMAL CELL (granularity — NOT zoom) ── */}
      <div>
        <SectionLabel
          right={
            <span className="text-[10px] font-medium text-text-dimmed">
              {mode === 'LIVE' ? 'FortyGuard granularity' : `captured at ${fixtureGranularity ?? 100}m`}
            </span>
          }
        >
          Thermal Cell
        </SectionLabel>
        {mode === 'FIXTURE' ? (
          <div
            className="flex items-center justify-between"
            data-testid="captured-resolution"
          >
            <span className="text-[12px] text-text-muted">Captured resolution:</span>
            <span className="text-[12px] font-semibold tnum text-text-primary">
              {fixtureGranularity ?? 100}m × {fixtureGranularity ?? 100}m
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5" data-testid="resolution-options">
            {([60, 80, 100] as const).map((r) => {
              const active = prefs.analysisResolution === r;
              return (
                <button
                  key={r}
                  data-testid={`resolution-${r}`}
                  onClick={() => setters.setAnalysisResolution(r)}
                  aria-pressed={active}
                  title={`FortyGuard thermal-cell granularity ${r}m × ${r}m (does not change map zoom)`}
                  className={`h-9 rounded-lg text-[11px] font-medium border tnum transition-colors duration-150 ${
                    active
                      ? 'border-primary bg-primary/10 text-text-primary'
                      : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary'
                  }`}
                >
                  {r}m × {r}m
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Separator />

      {/* ── EVALUATION WINDOW ── */}
      <div data-testid="when-section">
        <SectionLabel
          right={
            isFixtureAnchored ? (
              <span
                className="text-[10px] font-medium tnum"
                style={{ color: 'var(--accent-amber)' }}
                title={FIXTURE_TEMPORAL_METADATA.captureLabel}
              >
                fixture capture
              </span>
            ) : (
              <span className="text-[10px] font-medium text-text-dimmed tnum">{tz || 'UTC'}</span>
            )
          }
        >
          Evaluation Window
        </SectionLabel>

        {/* EVALUATION WINDOW selector — a UI concept, NOT a provider
            filter_type. The verified wire contract: every evaluated hour is
            its own single-hour FortyGuard request (filter_type: 1). */}
        <p className="text-[10px] text-text-dimmed mb-1.5 leading-relaxed">
          A time range is evaluated as a sequence of hourly FortyGuard requests — one request per hour.
        </p>
        <div className="grid grid-cols-2 gap-1.5 mb-2.5">
          {TIME_MODE_OPTIONS.map((opt) => {
            const active = temporalInput.timeMode === opt.value;
            return (
              <button
                key={opt.value}
                data-testid={`evaluation-window-${opt.value}`}
                onClick={() => handleTimeModeChange(opt.value)}
                aria-pressed={active}
                title={opt.description}
                className={`h-9 rounded-lg text-[11px] font-medium border transition-colors duration-150 ${
                  active
                    ? 'border-primary bg-primary/10 text-text-primary'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Date input */}
        <label className="block mb-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-dimmed">Date</span>
          <input
            type="date"
            value={temporalInput.date}
            onChange={(e) => update({ date: e.target.value })}
            disabled={isFixtureAnchored}
            className={`mt-1 w-full h-10 rounded-lg border bg-surface-card px-3 text-[13px] tnum text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors duration-150 ${
              dateValid ? 'border-input' : 'border-destructive'
            } ${isFixtureAnchored ? 'opacity-60 cursor-not-allowed' : ''}`}
            aria-label="Analysis date"
          />
          {/* LIVE date hint — honest about model completion */}
          {mode === 'LIVE' && (
            <span className="block text-[10px] text-text-dimmed mt-1 leading-relaxed" data-testid="live-date-hint">
              Pick the date explicitly. Recently requested periods may have no completed FortyGuard model yet (the
              provider returns an empty field — reported verbatim, never retried with another date). Documented
              forecast support: up to +12h ahead.
            </span>
          )}
        </label>

        {/* Start / End time inputs */}
        <div className={`grid ${isSingleHour ? 'grid-cols-1' : 'grid-cols-2'} gap-2 mb-2`}>
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-dimmed">
              {isSingleHour ? 'Hour' : 'Start'}
            </span>
            <input
              type="time"
              value={temporalInput.startTime}
              onChange={(e) => update({ startTime: e.target.value })}
              disabled={isFixtureAnchored}
              className={`mt-1 w-full h-10 rounded-lg border bg-surface-card px-3 text-[13px] tnum text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors duration-150 ${
                startValid ? 'border-input' : 'border-destructive'
              } ${isFixtureAnchored ? 'opacity-60 cursor-not-allowed' : ''}`}
              aria-label="Analysis start time"
            />
          </label>
          {!isSingleHour && (
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-dimmed">End</span>
              <input
                type="time"
                value={temporalInput.endTime}
                onChange={(e) => update({ endTime: e.target.value })}
                disabled={isFixtureAnchored}
                className={`mt-1 w-full h-10 rounded-lg border bg-surface-card px-3 text-[13px] tnum text-text-primary focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-colors duration-150 ${
                  endValid ? 'border-input' : 'border-destructive'
                } ${isFixtureAnchored ? 'opacity-60 cursor-not-allowed' : ''}`}
                aria-label="Analysis end time"
              />
            </label>
          )}
        </div>

        {/* Derived duration (read-only row) */}
        <div className="flex items-center justify-between py-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-dimmed">Duration</span>
          <span className="text-[13px] font-semibold tnum text-text-primary" data-testid="duration-display">
            {derivedDuration}h
          </span>
        </div>

        {/* Inline validation hint */}
        {!allValid && (
          <p className="text-[10.5px] text-destructive mt-1.5 font-medium">
            {!dateValid && 'Enter a valid date (YYYY-MM-DD). '}
            {!rangeValid && 'End time must be after start time.'}
          </p>
        )}

        {/* Honest future-date note */}
        {mode === 'LIVE' && isFutureDate && (
          <p className="text-[10.5px] mt-1.5 font-medium" style={{ color: 'var(--accent-amber)' }}>
            Future date selected — subject to FortyGuard forecast availability. The provider reports any unsupported
            window verbatim.
          </p>
        )}

        {/* LIVE billing disclosure */}
        {mode === 'LIVE' && allValid && (
          <div
            className="rounded-lg px-3 py-2 mt-2 border border-emerald-500/25"
            style={{ background: 'var(--accent-emerald-bg)' }}
            data-testid="live-request-disclosure"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-emerald)' }}>
                LIVE · {derivedDuration}-hour evaluation
              </span>
              <span className="text-[11px] font-semibold tnum" style={{ color: 'var(--accent-emerald)' }}>
                {liveHourlyRequestCount} FortyGuard hourly request{liveHourlyRequestCount > 1 ? 's' : ''}
              </span>
            </div>
            <p className="text-[10px] text-text-muted mt-1 leading-relaxed">
              Each evaluated hour is its own single-hour FortyGuard request (cached results reused, not re-billed).
              Repeat requests may consume provider credits.
            </p>
          </div>
        )}

        {/* Human-readable window preview */}
        {allValid && (
          <p className="text-[10.5px] text-text-dimmed tnum mt-2 leading-relaxed">
            {formatTemporalForHeader(temporalInput, tz)}
          </p>
        )}
      </div>

      <Separator />

      {/* ── CANDIDATE SITES ── */}
      <div data-testid="candidate-sites-section">
        <SectionLabel
          right={
            <span className="text-[10px] font-medium text-text-dimmed">
              {mode === 'FIXTURE' ? 'DEMO CANDIDATES · application-defined' : 'user-placed'}
            </span>
          }
        >
          Candidate Sites
        </SectionLabel>

        {mode === 'FIXTURE' ? (
          demoCaptureAvailable ? (
            <div className="space-y-1">
              <p className="text-[10.5px] text-text-muted leading-relaxed">
                Application-defined DEMO candidates — points the application wants evaluated against the captured
                FortyGuard provider data (not captured sites, not FortyGuard observations). LIVE lets you place your
                own sites.
              </p>
              {['Battery Park Greenway', 'City Hall Civic Center', 'Chinatown / Bowery'].map((n) => (
                <div key={n} className="flex items-center gap-2 rounded-md bg-surface-deep px-2.5 py-2">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--text-secondary)' }} />
                  <span className="text-[12px] text-text-secondary">{n}</span>
                  <span className="ml-auto text-[9px] font-mono uppercase text-text-dimmed">demo</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10.5px] text-text-muted leading-relaxed" data-testid="no-demo-candidates">
              No DEMO candidates — this location has no captured FortyGuard dataset. Switch to LIVE to place your own
              candidate sites, or select a Manhattan DEMO location.
            </p>
          )
        ) : (
          <div className="space-y-2">
            {/* Add-site actions */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                data-testid="add-site-map-btn"
                onClick={onToggleAddSiteMode}
                aria-pressed={addSiteMode}
                className={`h-9 rounded-lg text-[11.5px] font-medium border flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                  addSiteMode
                    ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary'
                }`}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                {addSiteMode ? 'Click the map…' : 'Add on map'}
              </button>
              <button
                type="button"
                data-testid="add-site-search-btn"
                onClick={() => setShowSiteSearch((v) => !v)}
                aria-pressed={showSiteSearch}
                className={`h-9 rounded-lg text-[11.5px] font-medium border flex items-center justify-center gap-1.5 transition-colors duration-150 ${
                  showSiteSearch
                    ? 'border-primary text-text-primary bg-primary/10'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary'
                }`}
              >
                <Search className="size-3.5" aria-hidden="true" />
                From search
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
                  activeStateFilter={activeStateFilter}
                />
                <p className="text-[9.5px] text-text-dimmed mt-1">
                  Only sites inside the analysis area can be added.
                </p>
              </div>
            )}

            {/* Site list */}
            {candidateSites.length === 0 ? (
              <p className="text-[10.5px] text-text-muted leading-relaxed" data-testid="no-candidate-sites">
                No candidate sites yet. LIVE never fabricates sites — add one on the map or from search, then Generate.
              </p>
            ) : (
              <ul className="space-y-1 max-h-40 overflow-y-auto" data-testid="candidate-sites-list">
                {candidateSites.map((site, idx) => (
                  <li
                    key={site.locationId}
                    className={`rounded-md border px-2.5 py-2 ${
                      site.outsideAoi
                        ? 'border-destructive/50 bg-destructive/5'
                        : 'border-transparent bg-surface-deep'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-mono font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: getCandidateColor(idx) }}
                        title={`Site ${idx + 1}`}
                      >
                        {idx + 1}
                      </span>
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
                          className="flex-1 min-w-0 bg-surface-elevated border border-primary/50 rounded px-1.5 py-0.5 text-xs text-text-primary focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(site.locationId);
                            setRenameValue(site.name);
                          }}
                          className="flex-1 min-w-0 text-left text-xs text-text-secondary hover:text-text-primary transition-colors duration-150 truncate"
                          title="Click to rename"
                        >
                          {site.name}
                        </button>
                      )}
                      <span
                        className="text-[9px] font-mono uppercase text-text-dimmed flex-shrink-0"
                        title={`Added via ${site.origin}`}
                      >
                        {site.origin === 'map-click' ? 'map' : site.origin}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveSite(site.locationId)}
                        className="text-text-dimmed hover:text-destructive transition-colors duration-150 text-xs flex-shrink-0"
                        title="Remove site"
                      >
                        ✕
                      </button>
                    </div>
                    {site.outsideAoi && (
                      <div className="text-[9.5px] text-destructive mt-1">
                        Outside the analysis area — move it inside before Generate.
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {outsideSiteCount > 0 && (
              <p className="text-[10px] text-destructive" data-testid="outside-sites-warning">
                {outsideSiteCount} site{outsideSiteCount > 1 ? 's' : ''} outside the analysis area — fix before Generate.
              </p>
            )}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Selected analysis summary + Generate ── */}
      <div
        className="pt-3 border-t border-border/70 space-y-1"
        data-testid="active-analysis-location-indicator"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-dimmed">Selected Analysis Area</span>
          <span
            className="text-[10px] font-semibold"
            style={{ color: mode === 'LIVE' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}
            data-testid="analysis-mode-badge"
          >
            {mode === 'LIVE' ? 'LIVE · FortyGuard' : 'DEMO · Captured FortyGuard'}
          </span>
        </div>
        <div className="text-[13px] font-semibold text-text-primary leading-tight" data-testid="active-analysis-location-name">
          {selectedLocation ? selectedLocation.name : 'No location selected'}
        </div>
        {selectedLocation && centerCoords && (
          <div className="text-[10.5px] font-mono flex items-center justify-between text-text-muted" data-testid="active-analysis-location-coords">
            <span className="tnum">{centerCoords.latitude.toFixed(4)}°, {centerCoords.longitude.toFixed(4)}°</span>
            <span className="font-sans text-[10px] text-text-dimmed">
              {selectedLocation.city ? `${selectedLocation.city}, ${selectedLocation.state || selectedLocation.country}` : selectedLocation.state || ''}
            </span>
          </div>
        )}
      </div>

      {/* Generate — the single primary action */}
      <motion.button
        whileTap={{ scale: 0.99 }}
        disabled={loading || generateDisabled}
        onClick={onGenerate}
        data-testid="recalculate-decision-btn"
        title={generateDisabled && !loading ? generateDisabledReason : undefined}
        className={`mt-3 w-full h-12 rounded-xl text-[13px] font-semibold transition-colors duration-150 flex items-center justify-center gap-2 border ${
          loading || generateDisabled
            ? 'bg-surface-deep border-border text-text-dimmed cursor-not-allowed'
            : 'bg-slate-900 hover:bg-slate-800 dark:bg-cyan-400 dark:hover:bg-cyan-300 text-white dark:text-slate-950 border-slate-900 dark:border-cyan-400 cursor-pointer'
        }`}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Generating thermal field…
          </span>
        ) : (
          `Generate Thermal Field · ${mode === 'LIVE' ? 'LIVE' : 'DEMO'}`
        )}
      </motion.button>

      {/* Inline reason when Generate is blocked */}
      {generateDisabled && !loading && generateDisabledReason && (
        <p
          className="text-[10.5px] leading-relaxed text-center mt-1.5 font-medium"
          style={{ color: 'var(--accent-amber)' }}
          data-testid="generate-blocked-reason"
        >
          {generateDisabledReason}
        </p>
      )}

      {/* ── SYSTEM STATUS (quiet, at the bottom) ── */}
      <div className="mt-6">
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
      </div>

      <div className="text-[10px] text-text-dimmed text-center mt-4">
        FortyGuard Hackathon&apos;26
      </div>
    </div>
  );
}

export default ControlRail;
