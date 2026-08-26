'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { ScenarioAnalysisResult } from '@/types/domain';
import type { TempUnit } from '@/lib/temperature';
import { fmtTemp, fmtTempDelta } from '@/lib/temperature';
import { fmtTimeWindow, shortLocationName } from '@/lib/dashboard-format';

interface WhatIfPanelProps {
  scenarioAnalysis: ScenarioAnalysisResult;
  selectedScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  unit: TempUnit;
  timezone?: string;
}

/**
 * What-If Constraint Sensitivity — modeled temperature cost when operational
 * constraints override the unconstrained optimum P₀.
 *
 * Visual hierarchy: this is the THIRD-highest priority (after thermal evidence
 * and the recommended decision). The constraint cost number is the hero here.
 */
export function WhatIfPanel({
  scenarioAnalysis,
  selectedScenarioId,
  onSelectScenario,
  unit,
  timezone,
}: WhatIfPanelProps) {
  const activeScenario =
    scenarioAnalysis.scenarios.find((s) => s.scenarioId === selectedScenarioId) ||
    scenarioAnalysis.scenarios[0];

  return (
    <section
      className="rounded-xl border border-border bg-surface-card overflow-hidden"
      data-testid="what-if-card"
      aria-label="What-if constraint sensitivity"
    >
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--accent-indigo)' }}>
            ⊕ What-If Constraint Sensitivity
          </span>
        </div>
        <p className="text-xs text-text-muted">
          Modeled temperature cost when operational constraints override the unconstrained optimum P₀.
        </p>
      </div>

      <div className="px-5 py-4">
        {/* Scenario selector */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
          {scenarioAnalysis.scenarios.map((sc) => (
            <button
              key={sc.scenarioId}
              onClick={() => onSelectScenario(sc.scenarioId)}
              className="text-left rounded-lg px-3 py-2.5 text-sm transition-all border min-h-[44px]"
              style={selectedScenarioId === sc.scenarioId
                ? { background: 'var(--accent-indigo-bg)', borderColor: 'var(--accent-indigo)', color: 'var(--text-primary)' }
                : { background: 'var(--surface-elevated)', borderColor: 'var(--border)', color: 'var(--text-muted)' }
              }
            >
              <div className="font-semibold text-[13px] leading-tight">{sc.scenarioName}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{sc.constraintType}</div>
            </button>
          ))}
        </div>

        {/* Constraint flow — animates on scenario change */}
        <AnimatePresence mode="wait">
          {activeScenario && (
            <motion.div
              key={activeScenario.scenarioId}
              className="space-y-3"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Baseline */}
                <div className="rounded-lg p-4 border border-border bg-surface-elevated">
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-cyan)' }}>BASELINE P₀</div>
                  <div
                    className="text-2xl font-black font-mono mb-1"
                    style={{ color: 'var(--accent-cyan)' }}
                    data-testid="whatif-baseline-temp"
                  >
                    {fmtTemp(activeScenario.baselinePlan.exposureScore, unit)}
                  </div>
                  <div className="text-sm font-semibold text-text-primary leading-tight">
                    {shortLocationName(activeScenario.baselinePlan.location.name)}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted mt-0.5">
                    {fmtTimeWindow(activeScenario.baselinePlan.window.startTime, activeScenario.baselinePlan.window.endTime, timezone)}
                  </div>
                </div>

                {/* Constraint */}
                <div className="rounded-lg p-4 border flex flex-col justify-center" style={{ background: 'var(--accent-indigo-bg)', borderColor: 'var(--accent-indigo)' }}>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-indigo)' }}>CONSTRAINT</div>
                  <div className="text-sm font-semibold text-text-primary leading-snug">
                    {activeScenario.constraintDescription}
                  </div>
                  <div className="text-[10px] font-mono mt-1.5 opacity-80" style={{ color: 'var(--accent-indigo)' }}>
                    {activeScenario.constraintType}
                  </div>
                </div>

                {/* Constrained result */}
                <div className="rounded-lg p-4 border bg-surface-elevated" style={{ borderColor: 'var(--accent-amber)' }}>
                  <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-amber)' }}>CONSTRAINED P&apos;</div>
                  <div
                    className="text-2xl font-black font-mono mb-1"
                    style={{ color: 'var(--accent-amber)' }}
                    data-testid="whatif-constrained-temp"
                  >
                    {activeScenario.constrainedPlan
                      ? fmtTemp(activeScenario.constrainedPlan.exposureScore, unit)
                      : 'Infeasible'}
                  </div>
                  <div className="text-sm font-semibold text-text-primary leading-tight">
                    {activeScenario.constrainedPlan?.location ? shortLocationName(activeScenario.constrainedPlan.location.name) : 'No Feasible Plan'}
                  </div>
                  <div className="text-[11px] font-mono text-text-muted mt-0.5">
                    {activeScenario.constrainedPlan
                      ? fmtTimeWindow(activeScenario.constrainedPlan.window.startTime, activeScenario.constrainedPlan.window.endTime, timezone)
                      : activeScenario.infeasibleReason || 'Infeasible'}
                  </div>
                </div>
              </div>

              {/* Thermal cost banner */}
              {activeScenario.status === 'FEASIBLE' && activeScenario.costOfConstraintCelsius !== null ? (
                <div className="constraint-cost rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <span
                      className="text-4xl font-black font-mono thermal-glow-amber"
                      style={{ color: 'var(--accent-amber)' }}
                      data-testid="whatif-cost-display"
                    >
                      {fmtTempDelta(activeScenario.costOfConstraintCelsius, unit)}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-text-primary">THERMAL COST</div>
                      <div className="text-xs text-text-muted">
                        Temperature increase under {activeScenario.scenarioName}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono flex-wrap">
                    {[
                      { label: 'Location', shifted: activeScenario.locationShifted },
                      { label: 'Window', shifted: activeScenario.windowShifted },
                    ].map(({ label, shifted }) => (
                      <span
                        key={label}
                        className="px-2 py-1 rounded border"
                        style={shifted
                          ? { background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }
                          : { background: 'var(--surface-elevated)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
                        }
                      >
                        {label}: {shifted ? 'Shifted' : 'Same'}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg px-4 py-3 text-sm border" style={{ background: 'var(--accent-red-bg)', borderColor: 'var(--accent-red)', color: 'var(--accent-red-text)' }}>
                  ⚠️ Infeasible Scenario: {activeScenario.infeasibleReason}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

export default WhatIfPanel;
