'use client';

import { motion } from 'framer-motion';
import type { JointDecisionResult } from '@/types/domain';
import type { TempUnit } from '@/lib/temperature';
import { fmtTemp, fmtTempDelta, tempUnitSuffix } from '@/lib/temperature';
import { fmtTimeWindow, shortLocationName } from '@/lib/dashboard-format';
import type { AnalysisTemporalInput } from '@/lib/temporal/analysis-window';
import { formatTemporalForHeader } from '@/lib/temporal/analysis-window';

interface RecommendedOperationProps {
  jointDecision: JointDecisionResult;
  unit: TempUnit;
  timezone?: string;
  /** Data source mode for the SOURCE row (Section 9). */
  mode?: 'LIVE' | 'FIXTURE';
  /** Explicit WHEN inputs (Section 9) — full date + tz in the WHEN block. */
  temporalInput?: AnalysisTemporalInput;
}

/**
 * Recommended Operational Plan — the visual decision hero.
 * Renders WHERE / WHEN / MODELED TEMPERATURE / ADVANTAGE.
 * Visual hierarchy: this is the SECOND-highest priority after the thermal map.
 */
export function RecommendedOperation({ jointDecision, unit, timezone, mode, temporalInput }: RecommendedOperationProps) {
  const rec = jointDecision.recommendedPlan;
  const worst = jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1];
  const sourceLabel = mode === 'LIVE' ? 'FortyGuard LIVE' : mode === 'FIXTURE' ? 'FortyGuard DEMO' : jointDecision.dataSource;
  const temporalLabel = temporalInput ? formatTemporalForHeader(temporalInput, timezone) : fmtTimeWindow(rec.window.startTime, rec.window.endTime, timezone);

  return (
    <motion.section
      data-testid="decision-card"
      className="rounded-xl border bg-surface-card overflow-hidden"
      style={{ borderColor: 'var(--accent-emerald)' }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      aria-label="Recommended operational plan"
    >
      <div className="px-5 pt-5 pb-5">
        {/* Heading row */}
        <div className="flex items-center gap-2 mb-5">
          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--accent-emerald)' }}>
            ★ Recommended Operation
          </span>
          <span
            className="px-2 py-0.5 rounded text-[10px] font-mono border"
            style={{ background: 'var(--surface-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border)' }}
          >
            {jointDecision.dataSource}
          </span>
        </div>

        {/* WHERE / WHEN / TEMP / SOURCE grid (Section 9) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* WHERE */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">📍 WHERE</div>
            <div className="text-xl font-black text-text-primary leading-tight">
              {shortLocationName(rec.location.name)}
            </div>
            <div className="text-[11px] font-mono text-text-muted">
              {rec.location.locationId}
            </div>
          </div>

          {/* WHEN */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">⏱ WHEN</div>
            <div className="text-xl font-black text-text-primary font-mono leading-tight">
              {temporalLabel}
            </div>
            <div className="text-[11px] text-text-muted">
              <span data-testid="recommended-duration">{rec.window.durationHours}h duration</span>
            </div>
          </div>

          {/* MODELED TEMPERATURE */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">
              🌡 MODELED TEMP ({tempUnitSuffix(unit)})
            </div>
            <motion.div
              className="text-4xl font-black font-mono leading-tight thermal-glow-emerald"
              style={{ color: 'var(--accent-emerald)' }}
              data-testid="recommended-temp-display"
              initial={{ scale: 0.92, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
            >
              {fmtTemp(rec.exposureScore, unit)}
            </motion.div>
            <div className="text-[11px] text-text-muted">Mean across window</div>
          </div>

          {/* SOURCE (Section 9) */}
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">🔌 SOURCE</div>
            <div
              className="text-sm font-black font-mono leading-tight"
              style={{ color: mode === 'LIVE' ? 'var(--accent-cyan)' : 'var(--accent-amber)' }}
              data-testid="recommended-source"
            >
              {sourceLabel}
            </div>
            <div className="text-[11px] text-text-muted">{timezone || 'UTC'}</div>
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
              {fmtTempDelta(worst.deltaVsBest, unit)}
            </span>{' '}
            vs worst plan.
          </div>
        )}
      </div>
    </motion.section>
  );
}

export default RecommendedOperation;
