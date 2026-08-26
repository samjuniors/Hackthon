'use client';

import { motion } from 'framer-motion';
import type { NamedLocation, ProviderStatus, FortyGuardHealthResponse, AIHealthResponse } from '@/types/provider';
import type { CandidateLocation, JointDecisionResult } from '@/types/domain';
import type { AnalysisTemporalInput } from '@/lib/temporal/analysis-window';
import { formatTemporalForHeader, FIXTURE_TEMPORAL_METADATA } from '@/lib/temporal/analysis-window';

interface ThermalMapCanvasProps {
  /** Selected analysis-area location (the user's chosen place). */
  locationName: string;
  /** Optional subtitle timestamp for the base observation snapshot. */
  baseTimestamp?: string;
  /** Number of FortyGuard thermal cells rendered (DEMO = 3, LIVE = whatever returns). */
  thermalCellCount?: number;
  /** Resolution in metres (60 / 80 / 100). */
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
  /** Explicit WHEN inputs (Section 4) — rendered in the header (Section 8). */
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
  locationName,
  baseTimestamp,
  thermalCellCount,
  resolution,
  mode,
  loading,
  rankedCandidates,
  recommendedLocationId,
  selectedLocation,
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
    ? `${selectedLocation.name}${selectedLocation.state ? `, ${selectedLocation.state}` : ''}`
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
              <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-border bg-surface-elevated text-text-muted">
                {resolution}m res
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
              <span className="text-text-muted">{resolution}m resolution</span>
            </>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="px-4 pb-4 relative">
        {children}
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
              {selectedLocation && (
                <div className="text-[10px] font-mono text-text-muted mt-0.5" data-testid="map-canvas-selected-coords">
                  {selectedLocation.latitude.toFixed(4)}°, {selectedLocation.longitude.toFixed(4)}°
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
