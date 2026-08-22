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
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-900/25 text-amber-300 border border-amber-700/35">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
        Demo Loaded
      </span>
    );
  }
  const map: Record<ProviderStatus, { bg: string; text: string; dot: string; pulse: string; label: string }> = {
    CONNECTED: { bg: 'bg-emerald-900/25', text: 'text-emerald-300', dot: 'bg-emerald-400', pulse: 'animate-pulse', label: '🟢 CONNECTED' },
    CHECKING:  { bg: 'bg-yellow-900/25',  text: 'text-yellow-300',  dot: 'bg-yellow-400',  pulse: 'animate-ping',  label: '🟠 CHECKING' },
    ERROR:     { bg: 'bg-red-900/25',     text: 'text-red-300',     dot: 'bg-red-400',     pulse: '',             label: '🔴 OFFLINE' },
    UNKNOWN:   { bg: 'bg-slate-800/50',   text: 'text-slate-400',   dot: 'bg-slate-500',   pulse: '',             label: '⚪ UNKNOWN' },
  };
  const s = map[status] ?? map.UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold ${s.bg} ${s.text} border border-current/20`}
      style={{ borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.pulse} inline-block shrink-0`} />
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
    <div className="rounded-xl border border-[#1e2d45] bg-[#0d1422] p-4 space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        Provider Connectivity
      </div>

      {/* FortyGuard row */}
      <div className="rounded-lg bg-[#0a1220] border border-[#1e2d45] px-3.5 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-200">FortyGuard Thermal API</span>
          <StatusPill status={fortyGuardStatus} isDemo={mode === 'FIXTURE'} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 font-mono">{fgSubtext}</span>
          <button
            type="button"
            disabled={testingFg}
            onClick={handleTestFg}
            data-testid="test-fortyguard-btn"
            className="px-2.5 py-1 text-[10px] rounded border border-[#1e2d45] bg-[#141f33] text-slate-400 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-50"
          >
            {testingFg ? 'Testing…' : 'Test'}
          </button>
        </div>
        {fortyGuardHealth?.errorMessage && !fortyGuardHealth.connected && mode === 'LIVE' && (
          <p className="text-[10px] text-red-400/80 leading-tight">⚠ {fortyGuardHealth.errorMessage}</p>
        )}
      </div>

      {/* AI Synthesis row */}
      <div className="rounded-lg bg-[#0a1220] border border-[#1e2d45] px-3.5 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-200">
            AI Synthesis
            <span className="text-slate-500 font-normal text-xs ml-1">({aiLabel})</span>
          </span>
          <StatusPill status={aiStatus} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-500 font-mono">{aiSubtext}</span>
          <button
            type="button"
            disabled={testingAi}
            onClick={handleTestAi}
            data-testid="test-ai-btn"
            className="px-2.5 py-1 text-[10px] rounded border border-[#1e2d45] bg-[#141f33] text-slate-400 hover:text-white hover:border-slate-600 transition-colors disabled:opacity-50"
          >
            {testingAi ? 'Testing…' : 'Test'}
          </button>
        </div>
        {aiHealth?.errorMessage && !aiHealth.connected && (
          <p className="text-[10px] text-amber-400/80 leading-tight">
            ℹ {aiHealth.errorMessage} (using deterministic explainer)
          </p>
        )}
      </div>
    </div>
  );
}
