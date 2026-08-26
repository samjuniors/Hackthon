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
 * Top Candidate Plans — ranked list of evaluated plans.
 * Shows the top 3 by default with an expandable full ranked table + provenance.
 */
export function TopCandidates({ jointDecision, unit, timezone }: TopCandidatesProps) {
  const [showAllPlans, setShowAllPlans] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);

  const ranked = jointDecision.rankedPlans;
  const top3 = ranked.slice(0, 3);
  const remaining = ranked.slice(3);

  return (
    <section className="rounded-xl border border-border bg-surface-card overflow-hidden" aria-label="Top candidate plans">
      <div className="px-5 py-4 border-b border-border">
        <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">
          Top Candidate Plans
        </div>
        <p className="text-xs text-text-muted mt-1">
          Ranked by mean modeled temperature across the operating window.
        </p>
      </div>

      <div className="px-5 py-4">
        <div className="space-y-2" data-testid="top-3-plans">
          {top3.map((plan, i) => (
            <motion.div
              key={plan.planId}
              className="flex items-center justify-between rounded-lg px-3 py-2.5 border"
              style={plan.rank === 1
                ? { background: 'var(--accent-emerald-bg)', borderColor: 'var(--accent-emerald)' }
                : { background: 'var(--surface-elevated)', borderColor: 'var(--border)' }
              }
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * i }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="text-sm font-bold font-mono shrink-0"
                  style={{ color: plan.rank === 1 ? 'var(--accent-emerald)' : 'var(--text-dimmed)' }}
                >
                  #{plan.rank}
                </span>
                <div className="min-w-0">
                  <div
                    className="text-sm font-semibold truncate"
                    style={{ color: plan.rank === 1 ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    {shortLocationName(plan.location.name)}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted">
                    {fmtTimeWindow(plan.window.startTime, plan.window.endTime, timezone)}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <div
                  className="text-base font-black font-mono"
                  style={{ color: plan.rank === 1 ? 'var(--accent-emerald)' : 'var(--text-secondary)' }}
                >
                  {fmtTemp(plan.exposureScore, unit)}
                </div>
                {plan.deltaVsBest > 0 && (
                  <div className="text-[11px] font-mono" style={{ color: 'var(--accent-amber)' }}>
                    {fmtTempDelta(plan.deltaVsBest, unit)}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Show all / collapse */}
        {remaining.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowAllPlans(!showAllPlans)}
              className="text-[11px] font-medium transition-colors flex items-center gap-1"
              style={{ color: 'var(--accent-cyan)' }}
            >
              {showAllPlans ? '▲ Hide' : `▼ Show all ${ranked.length} plans`}
            </button>

            {showAllPlans && (
              <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs font-mono text-left" data-testid="candidate-plans-table">
                  <thead className="bg-surface-deep text-text-muted border-b border-border">
                    <tr>
                      <th className="py-2 px-3">Rank</th>
                      <th className="py-2 px-3">Location</th>
                      <th className="py-2 px-3">Window (UTC)</th>
                      <th className="py-2 px-3">Tile</th>
                      <th className="py-2 px-3">Exposure ({tempUnitSuffix(unit)})</th>
                      <th className="py-2 px-3">Δ Best</th>
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
                        <td className="py-2 px-3 font-bold">#{plan.rank}</td>
                        <td className="py-2 px-3">
                          <span style={{ color: 'var(--accent-cyan)' }}>{plan.location.locationId}</span>{' '}
                          <span className="text-[10px] text-text-dimmed">({shortLocationName(plan.location.name)})</span>
                        </td>
                        <td className="py-2 px-3">{fmtTimeWindow(plan.window.startTime, plan.window.endTime, timezone)}</td>
                        <td className="py-2 px-3 text-text-dimmed">{plan.tileId}</td>
                        <td className="py-2 px-3 font-bold">{fmtTemp(plan.exposureScore, unit)}</td>
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

        {/* Data provenance */}
        <div className="mt-4 pt-3 border-t border-border">
          <button
            onClick={() => setShowProvenance(!showProvenance)}
            className="text-[11px] text-text-dimmed hover:text-text-muted transition-colors flex items-center gap-1"
          >
            {showProvenance ? '▲ Hide' : '▼ Data provenance'}
          </button>
          {showProvenance && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg p-3 border border-border bg-surface-elevated space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-cyan)' }} />
                  <span className="font-bold" style={{ color: 'var(--accent-cyan)' }}>DATA SOURCE</span>
                </div>
                <p className="font-mono text-[11px] text-text-muted">
                  Mode: <span className="text-text-primary">{jointDecision.dataSource}</span>
                </p>
                <p className="text-[11px] text-text-dimmed">
                  {jointDecision.searchSpace.locationCount} spatial sites × {jointDecision.searchSpace.windowCount} windows
                  {' = '}{jointDecision.searchSpace.totalEvaluatedPlans} plans evaluated.
                </p>
              </div>
              <div className="rounded-lg p-3 border border-border bg-surface-elevated space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-indigo)' }} />
                  <span className="font-bold" style={{ color: 'var(--accent-indigo)' }}>DERIVED</span>
                </div>
                <p className="text-[11px] text-text-muted">
                  Tile average temperatures are FortyGuard spatial polygon aggregations (<span className="font-mono" style={{ color: 'var(--accent-cyan)' }}>DERIVED</span>).
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
