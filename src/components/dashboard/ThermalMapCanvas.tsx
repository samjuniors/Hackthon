'use client';

import { motion } from 'framer-motion';
import type { TempUnit } from '@/lib/temperature';
import { tempUnitSuffix } from '@/lib/temperature';
import type { AnalysisTemporalInput } from '@/lib/temporal/analysis-window';
import { formatTemporalForHeader } from '@/lib/temporal/analysis-window';
import type { WorkflowStage } from '@/lib/workspace/stage';

// Re-exported for backwards compatibility (page.tsx imports from the lib now).
export type { WorkflowStage };

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
  /** Data source mode for the provenance line (LIVE · FortyGuard / DEMO · Captured). */
  mode?: 'LIVE' | 'FIXTURE';
  loading: boolean;
  /** All ranked candidate sites (drives the map pins). */
  rankedCandidates?: unknown;
  /** The recommended site's locationId. */
  recommendedLocationId?: string;
  /** The selected analysis location object. */
  selectedLocation?: { name: string; state?: string; latitude: number; longitude: number };
  /** Current AOI center (movable — the displayed coordinates track it). */
  analysisCenter?: { latitude: number; longitude: number };
  /** Explicit WHEN inputs — rendered in the header meta. */
  temporalInput?: AnalysisTemporalInput;
  /** IANA timezone of the selected location (for formatting + provenance). */
  timezone?: string;
  /** Active temperature unit (provenance meta). */
  unit?: TempUnit;
  children: React.ReactNode;
}

/**
 * FortyGuard Thermal Field — the visual HERO of the dashboard.
 *
 * The map IS the product: a slim one-line meta row above it (location · WHEN ·
 * provenance), no card chrome around the map itself, no badges/pills. The map
 * communicates; the result area below explains.
 */
export function ThermalMapCanvas({
  stage,
  locationName,
  baseTimestamp,
  thermalCellCount,
  resolution,
  mode,
  loading,
  temporalInput,
  timezone,
  unit,
  children,
}: ThermalMapCanvasProps) {
  const isFixture = mode === 'FIXTURE';
  const temporalLabel = temporalInput
    ? formatTemporalForHeader(temporalInput, timezone)
    : undefined;

  const locationLabel = locationName.split(' (')[0];
  const provenanceLabel = mode === 'LIVE' ? 'LIVE · FortyGuard' : mode === 'FIXTURE' ? 'DEMO · Captured FortyGuard' : null;

  return (
    <motion.section
      className="rounded-xl border border-border bg-surface-card overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      aria-label="FortyGuard thermal field"
    >
      {/* Slim meta row — one line, no pills */}
      <div className="px-4 pt-3 pb-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-[13px] font-semibold text-text-primary leading-none">
            Thermal Field
          </h2>
          <div className="flex items-center gap-2 text-[11px] text-text-muted min-w-0 flex-wrap">
            <span className="font-medium text-text-secondary truncate max-w-[220px]" title={locationLabel}>
              {locationLabel}
            </span>
            {temporalLabel && (
              <>
                <span className="text-text-dimmed" aria-hidden="true">·</span>
                <span className="tnum">{temporalLabel}</span>
              </>
            )}
            {typeof thermalCellCount === 'number' && thermalCellCount > 0 && (
              <>
                <span className="text-text-dimmed" aria-hidden="true">·</span>
                <span className="tnum" data-testid="thermal-cell-count">
                  {thermalCellCount} cells
                </span>
              </>
            )}
            {typeof resolution === 'number' && (
              <>
                <span className="text-text-dimmed" aria-hidden="true">·</span>
                <span className="tnum" title="FortyGuard thermal-cell granularity (not map zoom)">
                  {resolution}m cells
                </span>
              </>
            )}
            {provenanceLabel && (
              <>
                <span className="text-text-dimmed" aria-hidden="true">·</span>
                <span
                  className="font-semibold"
                  style={{ color: mode === 'LIVE' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}
                >
                  {provenanceLabel}
                </span>
              </>
            )}
          </div>
        </div>
        {isFixture && baseTimestamp && (
          <p className="text-[10.5px] text-text-dimmed mt-1.5 tnum" data-testid="map-temporal-provenance">
            Genuine capture replayed verbatim — no live provider request. Base snapshot {baseTimestamp}.
          </p>
        )}
        {!isFixture && mode === 'LIVE' && (
          <p className="text-[10.5px] text-text-dimmed mt-1.5" data-testid="map-temporal-provenance">
            Live FortyGuard request{unit ? ` · temperatures in ${tempUnitSuffix(unit)}` : ''} — provider geometry rendered verbatim.
          </p>
        )}
      </div>

      {/* Map — full-bleed inside the section (the hero) */}
      <div className="px-3 pb-3 relative">
        {children}
        {/* EMPTY workspace overlay — light invitation, not a blocking card. */}
        {stage === 'EMPTY' && (
          <div
            className="absolute inset-6 rounded-xl z-10 flex items-center justify-center pointer-events-none"
            data-testid="empty-workspace-overlay"
          >
            <div className="text-center max-w-md px-6 py-5 rounded-xl" style={{ background: 'var(--surface-bg)', opacity: 0.88 }}>
              <p className="text-[13px] font-semibold text-text-primary">Select a location to begin</p>
              <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
                Search a city, street, or address — then analyse it with the captured
                DEMO dataset or a LIVE FortyGuard request.
              </p>
              <p className="text-[9px] font-mono text-text-dimmed mt-3 leading-relaxed tracking-wide">
                LOCATION → ANALYSIS AREA → FORTYGUARD THERMAL OBSERVATIONS → CANDIDATE SITES → RECOMMENDATION
              </p>
            </div>
          </div>
        )}
        {/* Thermal field loading overlay */}
        {loading && (
          <div className="absolute inset-6 rounded-xl bg-surface-card/70 backdrop-blur-sm flex items-center justify-center pointer-events-none scan-loading">
            <div className="flex items-center gap-2 text-xs text-text-muted font-mono">
              <span className="w-4 h-4 border-2 border-border rounded-full animate-spin" style={{ borderTopColor: 'var(--accent-cyan)' }} />
              Generating thermal field…
            </div>
          </div>
        )}
      </div>
    </motion.section>
  );
}

export default ThermalMapCanvas;
