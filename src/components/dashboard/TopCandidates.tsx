'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import type { JointDecisionResult } from '@/types/domain';
import type { TempUnit } from '@/lib/temperature';
import { fmtTemp, fmtTempDelta, tempUnitSuffix } from '@/lib/temperature';
import { fmtTimeWindow, shortLocationName } from '@/lib/dashboard-format';

interface TopCandidatesProps {
  jointDecision: JointDecisionResult;
  unit: TempUnit;
  timezone?: string;
}

/**
 * TOP CANDIDATES — compact, scannable ranking.
 *
 * Row anatomy: rank · name (+window) · temperature right-aligned (+delta).
 * Rank #1 row is highlighted with the accent; the rest stay quiet.
 */
export function TopCandidates({ jointDecision, unit, timezone }: TopCandidatesProps) {
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);

  const ranked = jointDecision.rankedPlans;
  const recommended = jointDecision.recommendedPlan;
  const top3 = ranked.slice(0, 3);
  const remaining = ranked.slice(3);

  return (
    <section className="rounded-xl border border-border bg-surface-card overflow-hidden" aria-label="Top candidates">
      <div className="px-5 pt-4 pb-2 flex items-baseline justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-text-dimmed">
          Top Candidates
        </div>
        <span className="text-[10.5px] text-text-dimmed hidden sm:block">
          Ranked by mean modeled temperature ({tempUnitSuffix(unit)})
        </span>
      </div>

      <div className="px-2.5 pb-3">
        <div className="space-y-0.5" data-testid="top-3-plans">
          {top3.map((plan, i) => (
            <motion.div
              key={plan.planId}
              className="flex items-center justify-between rounded-lg px-2.5 py-2"
              style={plan.rank === 1
                ? { background: 'var(--accent-emerald-bg)' }
                : undefined
              }
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, delay: 0.04 * i }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="flex items-center justify-center size-5 rounded-md text-[11px] font-semibold tnum shrink-0"
                  style={
                    plan.rank === 1
                      ? { background: 'var(--accent-emerald)', color: '#ffffff' }
                      : { background: 'var(--surface-deep)', color: 'var(--text-muted)' }
                  }
                  aria-label={`Rank ${plan.rank}`}
                >
                  {plan.rank}
                </span>
                <div className="min-w-0">
                  <div
                    className="text-[13px] font-medium truncate"
                    style={{ color: plan.rank === 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {shortLocationName(plan.location.name)}
                  </div>
                  <div className="text-[10.5px] text-text-dimmed tnum">
                    {fmtTimeWindow(plan.window.startTime, plan.window.endTime, timezone)}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <span
                  className="text-[14px] font-semibold tnum"
                  style={{ color: plan.rank === 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                >
                  {fmtTemp(plan.exposureScore, unit)}
                </span>
                {plan.deltaVsBest > 0 && (
                  <span className="ml-2 text-[11px] tnum" style={{ color: 'var(--accent-amber)' }}>
                    {fmtTempDelta(plan.deltaVsBest, unit)}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Show all / collapse */}
        {remaining.length > 0 && (
          <div className="mt-1 px-2.5">
            <button
              onClick={() => setShowAllPlans(!showAllPlans)}
              className="text-[11px] font-medium transition-colors duration-150"
              style={{ color: 'var(--accent-cyan)' }}
            >
              {showAllPlans ? 'Hide all plans' : `Show all ${ranked.length} plans`}
            </button>

            {showAllPlans && (
              <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs tnum text-left" data-testid="candidate-plans-table">
                  <thead className="bg-surface-deep text-text-muted border-b border-border">
                    <tr>
                      <th className="py-2 px-3 font-medium">Rank</th>
                      <th className="py-2 px-3 font-medium">Location</th>
                      <th className="py-2 px-3 font-medium">Window</th>
                      <th className="py-2 px-3 font-medium">Tile</th>
                      <th className="py-2 px-3 font-medium">Exposure ({tempUnitSuffix(unit)})</th>
                      <th className="py-2 px-3 font-medium">Δ Best</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ranked.map((plan) => (
                      <tr
                        key={plan.planId}
                        style={plan.rank === 1
                          ? { background: 'var(--accent-emerald-bg)', color: 'var(--accent-emerald-text)' }
                          : { color: 'var(--text-muted)' }
                        }
                      >
                        <td className="py-2 px-3 font-semibold">#{plan.rank}</td>
                        <td className="py-2 px-3">
                          <span style={{ color: 'var(--accent-cyan)' }}>{plan.location.locationId}</span>{' '}
                          <span className="text-[10px] text-text-dimmed">({shortLocationName(plan.location.name)})</span>
                        </td>
                        <td className="py-2 px-3">{fmtTimeWindow(plan.window.startTime, plan.window.endTime, timezone)}</td>
                        <td className="py-2 px-3 text-text-dimmed">{plan.tileId}</td>
                        <td className="py-2 px-3 font-semibold">{fmtTemp(plan.exposureScore, unit)}</td>
                        <td className="py-2 px-3">
                          {plan.deltaVsBest === 0 ? (
                            <span style={{ color: 'var(--accent-emerald)' }}>0.00 (Best)</span>
                          ) : (
                            <span style={{ color: 'var(--accent-amber)' }}>{fmtTempDelta(plan.deltaVsBest, unit)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Data provenance — quiet disclosure */}
        <div className="mt-2 px-2.5 pt-2 border-t border-border/70">
          <button
            onClick={() => setShowProvenance(!showProvenance)}
            className="text-[10.5px] text-text-dimmed hover:text-text-muted transition-colors duration-150"
          >
            {showProvenance ? 'Hide provenance' : 'Data provenance'}
          </button>
          {showProvenance && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg p-3 border border-border bg-surface-elevated space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-cyan)' }} />
                  <span className="font-semibold" style={{ color: 'var(--accent-cyan)' }}>DATA SOURCE</span>
                </div>
                <p className="text-text-muted tnum">
                  {jointDecision.dataSource} · {jointDecision.searchSpace.locationCount} sites × {jointDecision.searchSpace.windowCount} windows
                  {' = '}{jointDecision.searchSpace.totalEvaluatedPlans} plans evaluated.
                </p>
              </div>
              <div className="rounded-lg p-3 border border-border bg-surface-elevated space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-indigo)' }} />
                  <span className="font-semibold" style={{ color: 'var(--accent-indigo)' }}>DERIVED</span>
                </div>
                <p className="text-text-muted">
                  Tile averages are FortyGuard spatial polygon aggregations (<span style={{ color: 'var(--accent-cyan)' }}>DERIVED</span>).
                </p>
              </div>
              {/* ── DECISION EVIDENCE — the inspectable deterministic chain ──
                  candidate coordinate → containing provider polygon/tile →
                  hourly provider temperature observations → window mean →
                  exposure score → deterministic ranking → recommendation.
                  Pure display of jointDecision.recommendedPlan — nothing is
                  recomputed or invented here. */}
              <div className="rounded-lg p-3 border border-border bg-surface-elevated space-y-1.5 sm:col-span-2" data-testid="decision-evidence-chain">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-emerald)' }} />
                  <span className="font-semibold" style={{ color: 'var(--accent-emerald)' }}>DECISION EVIDENCE — RECOMMENDED PLAN</span>
                </div>
                <ol className="font-mono text-[10px] leading-relaxed text-text-muted tnum space-y-0.5 list-decimal list-inside">
                  <li>
                    candidate {recommended.location.locationId} ({shortLocationName(recommended.location.name)}) at{' '}
                    {recommended.location.location.latitude.toFixed(5)}, {recommended.location.location.longitude.toFixed(5)}
                  </li>
                  <li>
                    → containing provider thermal cell (polygon rendered in the field): tile{' '}
                    <span className="font-semibold">{String(recommended.tileId)}</span>
                  </li>
                  <li>
                    → provider hourly modeled temperatures:{' '}
                    {recommended.thermalValues.length > 0
                      ? recommended.thermalValues
                          .map((tv) => `${fmtTimeWindow(tv.timestamp, tv.timestamp, timezone).split('–')[0]} ${fmtTemp(tv.temperatureCelsius, unit)}`)
                          .join(' · ')
                      : 'single-hour evaluation'}
                  </li>
                  <li>
                    → window mean E(W) = {fmtTemp(recommended.exposureScore, unit)} across{' '}
                    {recommended.thermalValues.length || recommended.window.durationHours} hourly observation
                    {recommended.thermalValues.length === 1 ? '' : 's'} (
                    {fmtTimeWindow(recommended.window.startTime, recommended.window.endTime, timezone)})
                  </li>
                  <li>
                    → deterministic ranking: rank #{recommended.rank} of {ranked.length} plans (lowest mean wins; ties break to the earlier start)
                  </li>
                  <li>→ recommendation: this plan (the engine, not the AI explainer, determines the result)</li>
                </ol>
                <p className="text-[9.5px] text-text-dimmed">
                  Model {jointDecision.modelVersion} · The deterministic decision engine determines the result. AI
                  generates only the explanation — the AI narration is grounding-validated and never alters the
                  ranking.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default TopCandidates;
