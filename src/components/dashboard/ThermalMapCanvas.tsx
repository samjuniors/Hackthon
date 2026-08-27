'use client';

import { motion } from 'framer-motion';
import type { NamedLocation, ProviderStatus, FortyGuardHealthResponse, AIHealthResponse } from '@/types/provider';
import type { CandidateLocation, JointDecisionResult, LocationPoint } from '@/types/domain';
import type { AnalysisTemporalInput } from '@/lib/temporal/analysis-window';
import { formatTemporalForHeader, FIXTURE_TEMPORAL_METADATA } from '@/lib/temporal/analysis-window';

/**
 * Explicit workspace state machine (DEMO and LIVE are DATA SOURCES, not
 * workflow stages):
 *   EMPTY → LOCATION_SELECTED → (AOI_CONFIGURED → TEMPORAL_CONFIGURED →)
 *   ANALYZING → RESULTS   …or… NO_DEMO_CAPTURE (DEMO source, no capture).
 */
export type WorkflowStage =
  | 'EMPTY'
  | 'LOCATION_SELECTED'
  | 'NO_DEMO_CAPTURE'
  | 'ANALYZING'
  | 'RESULTS';

interface ThermalMapCanvasProps {
  /** Current workspace stage (drives the EMPTY overlay + status copy). */
  stage?: WorkflowStage;
  /** Selected analysis-area location (the user's chosen place). */
  locationName: string;
  /** Optional subtitle timestamp for the base observation snapshot. */
  baseTimestamp?: string;
  /** Number of FortyGuard thermal cells rendered (genuine provider/captured cells only). */
  thermalCellCount?: number;
  /** Thermal-cell resolution in metres (60/80/100) — provider granularity, NOT zoom. */
  resolution?: number;
  /** Data source mode for the provenance badge (LIVE · FortyGuard / DEMO · Captured FortyGuard). */
  mode?: 'LIVE' | 'FIXTURE';
  loading: boolean;
  /** All ranked candidate sites (for the explicit CANDIDATE SITES hierarchy). */
  rankedCandidates?: CandidateLocation[];
  /** The recommended site's locationId (matched against rankedCandidates). */
  recommendedLocationId?: string;
  /** The selected analysis location object (used for the Selected Analysis Area line). */
  selectedLocation?: NamedLocation;
  /** Current AOI center (movable — the displayed coordinates track it, Section 4). */
  analysisCenter?: LocationPoint;
  /** Explicit WHEN inputs — rendered in the header. */
  temporalInput?: AnalysisTemporalInput;
  /** IANA timezone of the selected location (for formatting + provenance). */
  timezone?: string;
  children: React.ReactNode;
}

/**
 * FortyGuard Thermal Field — the visual HERO of the dashboard.
 *
 * Title:        "FortyGuard Thermal Field"
 * Subtitle:     "Observed modeled temperature across the selected analysis area"
 *
 * Below the map: explicit optimization-relationship hierarchy
 *   SELECTED ANALYSIS AREA → CANDIDATE SITES → RECOMMENDED SITE
 * so the user can see at a glance which place was analysed, which sites were
 * compared, and which site the deterministic engine picked.
 *
 * The map itself (MapLibre) is passed in as children so the dynamic
 * ssr:false import stays in the page orchestrator.
 */
export function ThermalMapCanvas({
  stage,
  locationName,
  baseTimestamp,
  thermalCellCount,
  resolution,
  mode,
  loading,
  rankedCandidates,
  recommendedLocationId,
  selectedLocation,
  analysisCenter,
  temporalInput,
  timezone,
  children,
}: ThermalMapCanvasProps) {
  const winner = rankedCandidates?.find((c) => c.locationId === recommendedLocationId);
  const nonWinnerCandidates = rankedCandidates?.filter((c) => c.locationId !== recommendedLocationId) ?? [];

  // Temporal provenance label (Section 8): location + full date + time range + tz.
  // For DEMO, surface the fixture capture metadata honestly (never "Today").
  const isFixture = mode === 'FIXTURE';
  const temporalLabel = temporalInput
    ? formatTemporalForHeader(temporalInput, timezone)
    : isFixture
      ? FIXTURE_TEMPORAL_METADATA.captureLabel
      : undefined;
  const locationLabel = selectedLocation
    ? selectedLocation.name.endsWith(`, ${selectedLocation.state}`)
      ? selectedLocation.name
      : `${selectedLocation.name}${selectedLocation.state ? `, ${selectedLocation.state}` : ''}`
    : locationName.split(' (')[0];

  return (
    <motion.section
      className="rounded-xl border border-border bg-surface-card overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label="FortyGuard thermal field"
    >
      {/* Header: title + temporal provenance (Section 8) */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <div>
            <h2 className="text-base font-bold text-text-primary">FortyGuard Thermal Field</h2>
            <p className="text-xs text-text-muted mt-0.5">Observed modeled temperature across the selected analysis area</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {typeof thermalCellCount === 'number' && thermalCellCount > 0 && (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-mono border border-border bg-surface-elevated text-text-muted"
                data-testid="thermal-cell-count"
              >
                {thermalCellCount} thermal cells
              </span>
            )}
            {typeof resolution === 'number' && (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-mono border border-border bg-surface-elevated text-text-muted"
                title="FortyGuard thermal-cell granularity (not map zoom)"
              >
                THERMAL CELL {resolution}m × {resolution}m
              </span>
            )}
            {/* Provenance indicator — LIVE · FortyGuard / DEMO · Captured FortyGuard */}
            {mode && (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-mono border font-bold"
                style={mode === 'LIVE'
                  ? { background: 'var(--accent-cyan-bg)', color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }
                  : { background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }
                }
              >
                {mode === 'LIVE' ? 'LIVE · FortyGuard' : 'DEMO · Captured FortyGuard'}
              </span>
            )}
          </div>
        </div>
        {/* Temporal provenance line (Section 8): location + full date + time range + tz + resolution */}
        <div className="text-xs font-mono text-text-secondary leading-relaxed" data-testid="map-temporal-provenance">
          <span className="font-bold text-text-primary">{locationLabel}</span>
          {temporalLabel && (
            <>
              {' · '}
              <span style={{ color: 'var(--accent-cyan)' }}>{temporalLabel}</span>
            </>
          )}
          {typeof resolution === 'number' && (
            <>
              {' · '}
              <span className="text-text-muted">{resolution}m thermal-cell granularity{mode === 'FIXTURE' ? ' (captured fixture)' : ''}</span>
            </>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="px-4 pb-4 relative">
        {children}
        {/* EMPTY workspace overlay — clear instruction to select a location.
            pointer-events-none: the map stays fully usable underneath. */}
        {stage === 'EMPTY' && (
          <div
            className="absolute inset-4 rounded-xl z-10 flex items-center justify-center pointer-events-none"
            data-testid="empty-workspace-overlay"
          >
            <div className="bg-surface-card/95 backdrop-blur-md px-6 py-5 rounded-xl border-2 border-dashed border-border shadow-lg text-center max-w-md">
              <p className="text-sm font-bold text-text-primary">Select a location to begin</p>
              <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
                Search a city, street, or address (or pick a preset in the left rail), then analyse it with the captured
                DEMO dataset or a LIVE FortyGuard request.
              </p>
              <p className="text-[9px] font-mono text-text-dimmed mt-3 leading-relaxed tracking-wide">
                LOCATION → ANALYSIS AOI → FORTYGUARD THERMAL OBSERVATIONS → CANDIDATE SITES → RECOMMENDATION
              </p>
            </div>
          </div>
        )}
        {/* Thermal field loading overlay */}
        {loading && (
          <div className="absolute inset-4 rounded-xl bg-surface-card/70 backdrop-blur-sm flex items-center justify-center pointer-events-none scan-loading">
            <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
              <span className="w-4 h-4 border-2 border-border border-t-accent-cyan rounded-full animate-spin" style={{ borderTopColor: 'var(--accent-cyan)' }} />
              Generating thermal field…
            </div>
          </div>
        )}
      </div>

      {/* Semantic hierarchy — explicit optimization relationship.
          SELECTED ANALYSIS AREA → CANDIDATE SITES → RECOMMENDED SITE.
          Does NOT change the deterministic engine; only surfaces what it picked. */}
      {(selectedLocation || (rankedCandidates && rankedCandidates.length > 0)) && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">

            {/* SELECTED ANALYSIS AREA */}
            <div className="rounded-lg border border-border bg-surface-deep p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="inline-block flex-shrink-0"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '2px',
                    border: `1.5px dashed ${'var(--text-primary)'}`,
                    backgroundColor: 'transparent',
                  }}
                />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text-dimmed">
                  Selected Analysis Area
                </span>
              </div>
              <div className="text-sm font-bold text-text-primary leading-tight">
                {selectedLocation?.name ?? locationName.split(' (')[0]}
              </div>
              {(analysisCenter ?? (selectedLocation ? { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude } : null)) && (
                <div className="text-[10px] font-mono text-text-muted mt-0.5" data-testid="map-canvas-selected-coords">
                  {(analysisCenter ?? { latitude: selectedLocation!.latitude, longitude: selectedLocation!.longitude }).latitude.toFixed(4)}°, {(analysisCenter ?? { latitude: selectedLocation!.latitude, longitude: selectedLocation!.longitude }).longitude.toFixed(4)}°
                  <span className="text-text-dimmed font-sans"> · AOI center</span>
                </div>
              )}
            </div>

            {/* CANDIDATE SITES */}
            <div className="rounded-lg border border-border bg-surface-deep p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="inline-block flex-shrink-0 rounded-full"
                  style={{ width: '8px', height: '8px', background: 'var(--text-secondary)', opacity: 0.7 }}
                />
                <span className="text-[9px] font-bold uppercase tracking-widest text-text-dimmed">
                  Candidate Sites
                </span>
                {mode === 'FIXTURE' && (
                  <span
                    className="text-[8px] font-mono px-1 py-px rounded border"
                    style={{
                      color: 'var(--accent-amber)',
                      borderColor: 'var(--accent-amber)',
                      background: 'var(--accent-amber-bg)',
                    }}
                    title="Application-defined candidate locations — NOT captured provider sites"
                  >
                    application-defined
                  </span>
                )}
              </div>
              {nonWinnerCandidates.length > 0 ? (
                <ul className="space-y-0.5">
                  {nonWinnerCandidates.map((c) => (
                    <li key={c.locationId} className="text-xs text-text-secondary leading-snug">
                      <span className="font-mono text-text-dimmed mr-1.5">·</span>
                      {c.name.split(' (')[0]}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-text-dimmed italic">No candidates yet</div>
              )}
            </div>

            {/* RECOMMENDED SITE */}
            <div
              className="rounded-lg border p-3"
              style={{
                borderColor: 'rgba(236,72,153,0.5)',
                background: 'rgba(236,72,153,0.06)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="inline-block flex-shrink-0 rounded-full"
                  style={{ width: '8px', height: '8px', background: '#ec4899' }}
                />
                <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#ec4899' }}>
                  Recommended Site
                </span>
              </div>
              {winner ? (
                <>
                  <div className="text-sm font-bold text-text-primary leading-tight">
                    {winner.name.split(' (')[0]}
                  </div>
                  <div className="text-[10px] font-mono text-text-muted mt-0.5" data-testid="map-canvas-recommended-coords">
                    {winner.location.latitude.toFixed(4)}°, {winner.location.longitude.toFixed(4)}°
                  </div>
                </>
              ) : (
                <div className="text-xs text-text-dimmed italic">Pending generation</div>
              )}
            </div>

          </div>
        </div>
      )}
    </motion.section>
  );
}

export default ThermalMapCanvas;
