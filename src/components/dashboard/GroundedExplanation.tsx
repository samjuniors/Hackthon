'use client';

import { motion } from 'framer-motion';
import type { DecisionExplanation } from '@/types/explanation';
import type { AIProviderName } from '@/types/provider';
import type { TempUnit } from '@/lib/temperature';
import { translateExplanationToUnit } from '@/lib/temperature';
import { formatIsoTimesInText } from '@/lib/dashboard-format';

interface GroundedExplanationProps {
  explanation: DecisionExplanation;
  unit: TempUnit;
  timezone?: string;
  explaining: boolean;
  onRefresh: () => void;
}

function providerLabel(provider?: AIProviderName): string {
  switch (provider) {
    case 'GEMINI': return 'Gemini';
    case 'CLAUDE': return 'Claude';
    case 'ZAI': return 'Z.ai';
    default: return 'Deterministic';
  }
}

/**
 * Grounded AI Explanation — read-only narrative synthesis of the verified
 * decision evidence. Every provider output passes the same grounding validator
 * before reaching this component, so the text here is guaranteed grounded.
 *
 * Visual hierarchy: this is the FOURTH-highest priority — intentionally subdued
 * so the thermal evidence and recommended decision remain the visual heroes.
 */
export function GroundedExplanation({
  explanation,
  unit,
  timezone,
  explaining,
  onRefresh,
}: GroundedExplanationProps) {
  const display = translateExplanationToUnit(explanation, unit);
  const summaryText = formatIsoTimesInText(display.summary, timezone);
  const whyThisPlanText = formatIsoTimesInText(display.whyThisPlan, timezone);
  const constraintImpactText = display.constraintImpact
    ? formatIsoTimesInText(display.constraintImpact, timezone)
    : '';

  const isAI = display.generatedBy === 'AI_GROUNDED_EXPLAINER';
  const providerName = providerLabel(display.providerUsed);

  return (
    <motion.section
      className="rounded-xl border border-border bg-surface-card overflow-hidden"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      aria-label="Decision explanation"
    >
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-black uppercase tracking-widest text-text-dimmed">
              Grounded Explanation
            </span>
            {isAI ? (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-semibold border"
                style={{ background: 'var(--accent-indigo-bg)', color: 'var(--accent-indigo)', borderColor: 'var(--accent-indigo)' }}
              >
                🤖 {providerName} Grounded AI
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold border border-border bg-surface-elevated text-text-muted">
                ⚡ Deterministic Explainer
              </span>
            )}
          </div>
          <button
            disabled={explaining}
            onClick={onRefresh}
            className="text-[11px] text-text-dimmed hover:text-text-muted transition-colors shrink-0 min-h-[32px] px-2"
          >
            {explaining ? '↻ Synthesizing…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {/* Loading shimmer while synthesizing */}
      {explaining && (
        <div className="px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span className="w-3.5 h-3.5 border-2 border-border border-t-accent-indigo rounded-full animate-spin" style={{ borderTopColor: 'var(--accent-indigo)' }} />
            Synthesizing grounded explanation via {providerName}…
          </div>
        </div>
      )}

      {!explaining && (
        <div className="px-5 py-4 space-y-3">
          {/* Summary */}
          <div className="rounded-lg bg-surface-deep border border-border p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-indigo)' }}>Operational Summary</div>
            <p className="text-text-primary leading-relaxed text-sm">{summaryText}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-surface-deep border border-border p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-cyan)' }}>Why This Plan Wins</div>
              <p className="text-text-secondary leading-relaxed text-sm">{whyThisPlanText}</p>
            </div>

            {constraintImpactText && (
              <div className="rounded-lg bg-surface-deep border border-border p-4">
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--accent-amber)' }}>What-If Impact</div>
                <p className="text-text-secondary leading-relaxed text-sm">{constraintImpactText}</p>
              </div>
            )}
          </div>

          {/* Epistemic boundary + provenance trace */}
          <div className="rounded-lg p-3 border border-border bg-surface-elevated">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-xs">🛡️</span>
              <span className="text-[10px] font-semibold text-text-muted">Epistemic &amp; Provenance Boundary</span>
              {display.fallbackReason && (
                <code className="text-[9px] font-mono ml-1" style={{ color: 'var(--accent-amber)', opacity: 0.8 }}>
                  ({display.fallbackReason})
                </code>
              )}
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">{display.epistemicNotice}</p>

            {/* Subtle fallback trace — surfaces which providers were tried. */}
            {display.fallbackTrace && display.fallbackTrace.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <div className="text-[9px] font-mono text-text-dimmed uppercase tracking-wider mb-1">Provider chain trace</div>
                <code className="text-[10px] font-mono text-text-dimmed leading-relaxed block">
                  {display.fallbackTrace.join('  →  ')}
                </code>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.section>
  );
}

export default GroundedExplanation;
