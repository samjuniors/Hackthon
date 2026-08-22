'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
    try {
      await onTestFortyGuard();
    } finally {
      setTestingFg(false);
    }
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    try {
      await onTestAI();
    } finally {
      setTestingAi(false);
    }
  };

  const getStatusBadge = (status: ProviderStatus, isFixture = false) => {
    if (isFixture) {
      return (
        <Badge className="bg-amber-950/90 text-amber-300 border border-amber-500/50 text-[10px] font-mono flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>Demo Data Loaded</span>
        </Badge>
      );
    }

    switch (status) {
      case 'CONNECTED':
        return (
          <Badge className="bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 text-[10px] font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Connected</span>
          </Badge>
        );
      case 'CHECKING':
        return (
          <Badge className="bg-yellow-950/90 text-yellow-300 border border-yellow-500/50 text-[10px] font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" />
            <span>Checking...</span>
          </Badge>
        );
      case 'ERROR':
        return (
          <Badge className="bg-red-950/90 text-red-300 border border-red-500/50 text-[10px] font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span>Unavailable</span>
          </Badge>
        );
      case 'UNKNOWN':
      default:
        return (
          <Badge variant="outline" className="text-slate-400 border-slate-700 text-[10px] font-mono">
            Unverified
          </Badge>
        );
    }
  };

  return (
    <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
      <CardHeader className="pb-2.5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Provider Health & Connectivity
          </CardTitle>
          <span className="text-[10px] font-mono text-slate-500">Live Health Engine</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {/* FortyGuard Status Row */}
        <div className="bg-slate-950 p-2.5 rounded-md border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-200">FortyGuard Thermal API</span>
            </div>
            {getStatusBadge(fortyGuardStatus, mode === 'FIXTURE')}
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>
              {mode === 'FIXTURE'
                ? 'Capture: 12h Manhattan Surface'
                : fortyGuardHealth?.configured
                ? fortyGuardHealth.connected
                  ? `Latency: ${fortyGuardHealth.latencyMs ?? 0}ms`
                  : fortyGuardHealth.errorCode || 'Connection failed'
                : 'Not configured'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testingFg}
              onClick={handleTestFg}
              className="h-5 px-2 text-[10px] border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800"
              data-testid="test-fortyguard-btn"
            >
              {testingFg ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>

          {fortyGuardHealth?.errorMessage && !fortyGuardHealth.connected && mode === 'LIVE' && (
            <p className="text-[10px] text-red-400/90 leading-tight">
              ⚠️ {fortyGuardHealth.errorMessage}
            </p>
          )}
        </div>

        {/* AI Explainer Status Row */}
        <div className="bg-slate-950 p-2.5 rounded-md border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-200">
                AI Synthesis ({aiHealth?.provider === 'GEMINI' ? 'Gemini' : aiHealth?.provider === 'OPENAI' ? 'OpenAI' : 'Deterministic'})
              </span>
            </div>
            {getStatusBadge(aiStatus)}
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
            <span>
              {aiHealth?.configured
                ? aiHealth.connected
                  ? `Latency: ${aiHealth.latencyMs ?? 0}ms`
                  : aiHealth.errorCode || 'Fallback active'
                : 'Deterministic Fallback'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testingAi}
              onClick={handleTestAi}
              className="h-5 px-2 text-[10px] border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:bg-slate-800"
              data-testid="test-ai-btn"
            >
              {testingAi ? 'Testing...' : 'Test Connection'}
            </Button>
          </div>

          {aiHealth?.errorMessage && !aiHealth.connected && (
            <p className="text-[10px] text-amber-400/90 leading-tight">
              ℹ️ {aiHealth.errorMessage} (Using deterministic rule-based explainer)
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
