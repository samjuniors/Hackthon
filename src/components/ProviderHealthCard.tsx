'use client';

import { useState } from 'react';
import type {
  ProviderStatus,
  FortyGuardHealthResponse,
  AIHealthResponse,
} from '@/types/provider';
import type { DataSourceMode } from '@/types/provenance';

interface ProviderHealthCardProps {
  mode: DataSourceMode;
  fortyGuardStatus: ProviderStatus;
  fortyGuardHealth: FortyGuardHealthResponse | null;
  aiStatus: ProviderStatus;
  aiHealth: AIHealthResponse | null;
  onTestFortyGuard: () => Promise<void>;
  onTestAI: () => Promise<void>;
}

function StatusPill({ status, isDemo }: { status: ProviderStatus; isDemo?: boolean }) {
  if (isDemo) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-accent-amber-bg text-accent-amber border border-accent-amber/30">
        <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--accent-amber)' }} />
        Demo Loaded
      </span>
    );
  }
  const map: Record<ProviderStatus, { bg: string; text: string; dot: string; pulse: string; label: string }> = {
    CONNECTED: { bg: 'bg-accent-emerald-bg', text: 'text-accent-emerald', dot: 'var(--accent-emerald)', pulse: 'animate-pulse', label: '🟢 CONNECTED' },
    CHECKING:  { bg: 'bg-accent-amber-bg',   text: 'text-accent-amber',   dot: 'var(--accent-amber)',   pulse: 'animate-ping',  label: '🟠 CHECKING' },
    ERROR:     { bg: 'bg-accent-red-bg',     text: 'text-accent-red',     dot: 'var(--accent-red)',     pulse: '',             label: '🔴 OFFLINE' },
    UNKNOWN:   { bg: 'bg-surface-elevated',  text: 'text-text-dimmed',    dot: 'var(--text-dimmed)',    pulse: '',             label: '⚪ UNKNOWN' },
  };
  const s = map[status] ?? map.UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold ${s.bg} ${s.text} border border-border`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.pulse} inline-block shrink-0`} style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export function ProviderHealthCard({
  mode,
  fortyGuardStatus,
  fortyGuardHealth,
  aiStatus,
  aiHealth,
  onTestFortyGuard,
  onTestAI,
}: ProviderHealthCardProps) {
  const [testingFg, setTestingFg] = useState(false);
  const [testingAi, setTestingAi] = useState(false);

  const handleTestFg = async () => {
    setTestingFg(true);
    try { await onTestFortyGuard(); } finally { setTestingFg(false); }
  };
  const handleTestAi = async () => {
    setTestingAi(true);
    try { await onTestAI(); } finally { setTestingAi(false); }
  };

  const fgSubtext = mode === 'FIXTURE'
    ? 'Captured: 12h Manhattan surface dataset'
    : fortyGuardHealth?.configured
      ? fortyGuardHealth.connected
        ? `Latency: ${fortyGuardHealth.latencyMs ?? 0}ms`
        : fortyGuardHealth.errorCode || 'Connection failed'
      : 'Not configured — add FORTYGUARD_API_KEY';

  const aiLabel = aiHealth?.provider === 'GEMINI'
    ? 'Gemini'
    : aiHealth?.provider === 'OPENAI'
    ? 'OpenAI'
    : 'Deterministic';

  const aiSubtext = aiHealth?.configured
    ? aiHealth.connected
      ? `Latency: ${aiHealth.latencyMs ?? 0}ms · ${aiLabel}`
      : aiHealth.errorCode || 'Fallback active'
    : 'Deterministic fallback (no API key)';

  return (
    <div className="rounded-xl border border-border bg-surface-card p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">
        Provider Connectivity
      </div>

      {/* FortyGuard row */}
      <div className="rounded-lg bg-surface-deep border border-border px-3.5 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text-primary">FortyGuard Thermal API</span>
          <StatusPill status={fortyGuardStatus} isDemo={mode === 'FIXTURE'} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted font-mono">{fgSubtext}</span>
          <button
            type="button"
            disabled={testingFg}
            onClick={handleTestFg}
            data-testid="test-fortyguard-btn"
            className="px-3 py-1.5 min-h-[32px] sm:min-h-[28px] text-xs sm:text-[10px] font-medium rounded-lg border border-border bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-card transition-colors disabled:opacity-50 touch-manipulation"
          >
            {testingFg ? 'Testing…' : 'Test'}
          </button>
        </div>
        {fortyGuardHealth?.errorMessage && !fortyGuardHealth.connected && mode === 'LIVE' && (
          <p className="text-[10px] text-accent-red leading-tight">⚠ {fortyGuardHealth.errorMessage}</p>
        )}
      </div>

      {/* AI Synthesis row */}
      <div className="rounded-lg bg-surface-deep border border-border px-3.5 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text-primary">
            AI Synthesis
            <span className="text-text-dimmed font-normal text-xs ml-1">({aiLabel})</span>
          </span>
          <StatusPill status={aiStatus} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-text-muted font-mono">{aiSubtext}</span>
          <button
            type="button"
            disabled={testingAi}
            onClick={handleTestAi}
            data-testid="test-ai-btn"
            className="px-3 py-1.5 min-h-[32px] sm:min-h-[28px] text-xs sm:text-[10px] font-medium rounded-lg border border-border bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-card transition-colors disabled:opacity-50 touch-manipulation"
          >
            {testingAi ? 'Testing…' : 'Test'}
          </button>
        </div>
        {aiHealth?.errorMessage && !aiHealth.connected && (
          <p className="text-[10px] text-accent-amber leading-tight">
            ℹ {aiHealth.errorMessage} (using deterministic explainer)
          </p>
        )}
      </div>
    </div>
  );
}
