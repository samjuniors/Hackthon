'use client';

import { motion } from 'framer-motion';
import type { JointDecisionResult } from '@/types/domain';
import type { TempUnit } from '@/lib/temperature';
import {
  fmtTemp,
  fmtTempValue,
  fmtTempDelta,
  tempUnitSuffix,
  celsiusToFahrenheit,
} from '@/lib/temperature';
import { fmtTimeWindow, shortLocationName } from '@/lib/dashboard-format';
import type { AnalysisTemporalInput } from '@/lib/temporal/analysis-window';
import { formatTemporalForHeader } from '@/lib/temporal/analysis-window';

interface RecommendedOperationProps {
  jointDecision: JointDecisionResult;
  unit: TempUnit;
  timezone?: string;
  /** Data source mode for the SOURCE meta row. */
  mode?: 'LIVE' | 'FIXTURE';
  /** Explicit WHEN inputs — full date + tz in the meta row. */
  temporalInput?: AnalysisTemporalInput;
}

/**
 * RECOMMENDED SITE — the dominant decision output.
 *
 * Hierarchy: label → site name → LARGE temperature (selected unit, secondary
 * unit beside it) → rank chip → quiet meta rows (when · advantage · source).
 * No decorative metric cards; the number IS the headline.
 */
export function RecommendedOperation({ jointDecision, unit, timezone, mode, temporalInput }: RecommendedOperationProps) {
  const rec = jointDecision.recommendedPlan;
  const worst = jointDecision.rankedPlans[jointDecision.rankedPlans.length - 1];
  const sourceLabel = mode === 'LIVE' ? 'FortyGuard LIVE' : mode === 'FIXTURE' ? 'FortyGuard DEMO' : jointDecision.dataSource;
  const temporalLabel = temporalInput
    ? formatTemporalForHeader(temporalInput, timezone)
    : fmtTimeWindow(rec.window.startTime, rec.window.endTime, timezone);

  const otherUnit: TempUnit = unit === 'F' ? 'C' : 'F';
  const secondaryValue =
    otherUnit === 'F'
      ? celsiusToFahrenheit(rec.exposureScore)
      : rec.exposureScore;

  return (
    <motion.section
      data-testid="decision-card"
      className="rounded-xl border border-border bg-surface-card overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      aria-label="Recommended operational location"
    >
      <div className="px-5 pt-5 pb-4">
        {/* Heading row */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-text-dimmed">
            Recommended Operational Location
          </span>
          <span className="text-[11px] font-medium text-text-muted tnum" data-testid="recommended-rank">
            #1 of {jointDecision.searchSpace.locationCount}
          </span>
        </div>

        {/* Site name + temperature hero */}
        <div className="mt-2.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold text-text-primary leading-tight tracking-tight">
              {shortLocationName(rec.location.name)}
            </h3>
            <div className="text-[11px] font-mono text-text-dimmed mt-1">
              {rec.location.locationId}
            </div>
          </div>

          <motion.div
            className="flex items-baseline gap-2.5"
            initial={{ opacity: 0.4, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: 'easeOut', delay: 0.1 }}
          >
            <span
              className="text-[44px] leading-none font-semibold tracking-tight text-text-primary tnum"
              data-testid="recommended-temp-display"
            >
              {fmtTempValue(rec.exposureScore, unit)}
              <span className="text-2xl font-medium text-text-muted">{tempUnitSuffix(unit)}</span>
            </span>
            <span className="flex flex-col items-start">
              <span className="text-[10px] font-medium uppercase tracking-wide text-text-dimmed">modeled</span>
              <span className="text-sm text-text-muted tnum">
                {secondaryValue.toFixed(2)}
                {tempUnitSuffix(otherUnit)}
              </span>
            </span>
          </motion.div>
        </div>

        {/* Quiet meta rows */}
        <div className="mt-4 pt-3 border-t border-border/80 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] text-text-muted">
          <span className="tnum">
            {temporalLabel}
            {' · '}
            <span data-testid="recommended-duration">{rec.window.durationHours}h</span> mean
          </span>
          {jointDecision.rankedPlans.length > 1 && (
            <span className="tnum">
              Advantage{' '}
              <span className="font-semibold" style={{ color: 'var(--accent-emerald)' }} data-testid="advantage-delta-display">
                {fmtTempDelta(worst.deltaVsBest, unit)}
              </span>{' '}
              vs worst
            </span>
          )}
          <span
            className="font-semibold"
            style={{ color: mode === 'LIVE' ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}
            data-testid="recommended-source"
          >
            {sourceLabel}
          </span>
        </div>
      </div>
    </motion.section>
  );
}

export default RecommendedOperation;
