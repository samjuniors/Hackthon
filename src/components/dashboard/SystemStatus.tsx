'use client';

import type { DataSourceMode } from '@/types/provenance';
import type { ProviderStatus, AIProviderName } from '@/types/provider';

/**
 * SystemStatus — compact three-line system status block.
 *
 * Visual language mirrors ProviderHealthCard (`rounded-xl border
 * border-border bg-surface-card p-4`) and the in-page StatusDot.
 * Intentionally clean: NO latency numbers or error messages inline —
 * advanced diagnostics live in the Settings drawer per the design brief.
 */

interface SystemStatusProps {
  mode: DataSourceMode;
  fortyGuardStatus: ProviderStatus;
  aiStatus: ProviderStatus;
  aiProvider?: AIProviderName;
  fieldReady: boolean;
  loading: boolean;
  onTestFortyGuard: () => void;
  onTestAI: () => void;
}

interface DotSpec {
  color: string;
  pulse: boolean;
}

function dotForStatus(status: ProviderStatus): DotSpec {
  switch (status) {
    case 'CONNECTED':
      return { color: 'var(--status-live)', pulse: true };
    case 'CHECKING':
      return { color: 'var(--status-demo)', pulse: false };
    case 'ERROR':
      return { color: 'var(--status-error)', pulse: false };
    default:
      return { color: 'var(--status-unknown)', pulse: false };
  }
}

/** Map an AIProviderName enum to a short, human-friendly label. */
function aiProviderLabel(p?: AIProviderName): string {
  if (p === 'GEMINI') return 'Gemini';
  if (p === 'CLAUDE') return 'Claude';
  if (p === 'ZAI') return 'Z.ai';
  return 'Deterministic';
}

/** FortyGuard row subtext — provenance-explicit. */
function fortyGuardSubtext(mode: DataSourceMode, status: ProviderStatus): string {
  if (mode === 'FIXTURE') return 'Demo Loaded';
  if (status === 'CONNECTED') return 'Connected';
  if (status === 'ERROR') return 'Offline';
  return 'Unknown';
}

function Dot({ spec }: { spec: DotSpec }) {
  return (
    <span
      className={`w-2 h-2 rounded-full inline-block shrink-0${
        spec.pulse ? ' status-dot-live' : ''
      }`}
      style={{ background: spec.color }}
      aria-hidden="true"
    />
  );
}

const testButtonClass =
  'px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-lg border border-border bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-deep transition-colors touch-manipulation';

export function SystemStatus({
  mode,
  fortyGuardStatus,
  aiStatus,
  aiProvider,
  fieldReady,
  loading,
  onTestFortyGuard,
  onTestAI,
}: SystemStatusProps) {
  const fgDot =
    mode === 'FIXTURE'
      ? { color: 'var(--status-demo)', pulse: false }
      : dotForStatus(fortyGuardStatus);
  const aiDot = dotForStatus(aiStatus);

  // Thermal Field row — Ready / Loading… / Idle
  let fieldColor = 'var(--text-dimmed)';
  let fieldLabel = 'Idle';
  let fieldPulse = false;
  if (loading) {
    fieldColor = 'var(--status-demo)';
    fieldLabel = 'Loading…';
    fieldPulse = true;
  } else if (fieldReady) {
    fieldColor = 'var(--status-live)';
    fieldLabel = 'Ready';
    fieldPulse = false;
  }

  return (
    <div className="rounded-xl border border-border bg-surface-card p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">
        System Status
      </div>

      {/* FortyGuard row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Dot spec={fgDot} />
          <span className="text-sm font-semibold text-text-primary">FortyGuard</span>
          <span className="text-[11px] text-text-muted font-mono">
            {fortyGuardSubtext(mode, fortyGuardStatus)}
          </span>
        </div>
        <button
          type="button"
          onClick={onTestFortyGuard}
          data-testid="test-fortyguard-btn"
          className={testButtonClass}
        >
          Test
        </button>
      </div>

      {/* AI Explainer row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Dot spec={aiDot} />
          <span className="text-sm font-semibold text-text-primary truncate">
            AI Explainer{' '}
            <span className="text-text-muted font-normal">
              {aiProviderLabel(aiProvider)}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={onTestAI}
          data-testid="test-ai-btn"
          className={testButtonClass}
        >
          Test
        </button>
      </div>

      {/* Thermal Field row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <Dot
            spec={{
              color: fieldColor,
              pulse: fieldPulse,
            }}
          />
          <span className="text-sm font-semibold text-text-primary">
            Thermal Field
          </span>
        </div>
        <span
          className="text-[11px] font-semibold"
          style={{ color: fieldColor }}
        >
          {fieldLabel}
        </span>
      </div>
    </div>
  );
}

export default SystemStatus;
