'use client';

import { motion } from 'framer-motion';
import { LocationSearch } from '@/components/LocationSearch';
import { SystemStatus } from '@/components/dashboard/SystemStatus';
import type { NamedLocation, ProviderStatus, FortyGuardHealthResponse, AIHealthResponse } from '@/types/provider';
import type { DataSourceMode } from '@/types/provenance';
import { useUserPreferences } from '@/lib/user-preferences';
import { isLocationCoveredByFixture } from '@/lib/location/search';

interface ControlRailProps {
  mode: DataSourceMode;
  selectedLocation: NamedLocation;
  duration: number;
  onDurationChange: (d: number) => void;
  onGenerate: () => void;
  loading: boolean;
  onSelectLocation: (loc: NamedLocation) => void;
  onSwitchToLive: () => void;
  // System status
  fortyGuardStatus: ProviderStatus;
  fortyGuardHealth: FortyGuardHealthResponse | null;
  aiStatus: ProviderStatus;
  aiHealth: AIHealthResponse | null;
  fieldReady: boolean;
  onTestFortyGuard: () => void;
  onTestAI: () => void;
}

/**
 * Left control rail — the operational input workspace.
 * Location → Analysis Area → Resolution → Operating Window → Generate.
 * System status sits compactly at the bottom (advanced diagnostics live in Settings).
 */
export function ControlRail({
  mode,
  selectedLocation,
  duration,
  onDurationChange,
  onGenerate,
  loading,
  onSelectLocation,
  onSwitchToLive,
  fortyGuardStatus,
  fortyGuardHealth,
  aiStatus,
  aiHealth,
  fieldReady,
  onTestFortyGuard,
  onTestAI,
}: ControlRailProps) {
  const [prefs, setters] = useUserPreferences();
  const isFixtureMismatch = mode === 'FIXTURE' && !isLocationCoveredByFixture(selectedLocation);
  const aiProvider = aiHealth?.provider;

  return (
    <div className="space-y-4">
      {/* ── DEMO notice ── */}
      {mode === 'FIXTURE' && (
        <div className="rounded-xl p-3.5 border border-border bg-accent-amber-bg">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm" style={{ color: 'var(--accent-amber)' }}>⬡</span>
            <span className="text-sm font-bold" style={{ color: 'var(--accent-amber)' }}>
              DEMO · Captured FortyGuard
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--accent-amber-text)', opacity: 0.85 }}>
            Offline demonstration using a 12-hour Manhattan thermal field capture. Switch to LIVE in Settings to analyse any location in real time.
          </p>
        </div>
      )}

      {/* ── ANALYSIS ── */}
      <div className="rounded-xl border border-border bg-surface-card p-4 space-y-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed">Analysis</div>

        <LocationSearch
          selectedLocation={selectedLocation}
          mode={mode}
          onSelectLocation={onSelectLocation}
          onSwitchToLive={onSwitchToLive}
        />

        <div className="border-t border-border" />

        {/* Analysis Area */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">Analysis Area</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['polygon', 'circle'] as const).map((shape) => (
              <button
                key={shape}
                onClick={() => setters.setAnalysisAreaShape(shape)}
                className={`min-h-[40px] rounded-lg text-xs font-semibold capitalize transition-all border ${
                  prefs.analysisAreaShape === shape
                    ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                }`}
              >
                {shape}
              </button>
            ))}
          </div>
        </div>

        {/* Resolution */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">Resolution</span>
            <span className="text-[10px] font-mono text-text-dimmed">affects LIVE queries</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([60, 80, 100] as const).map((r) => (
              <button
                key={r}
                onClick={() => setters.setAnalysisResolution(r)}
                className={`min-h-[40px] rounded-lg text-xs font-semibold transition-all border ${
                  prefs.analysisResolution === r
                    ? 'border-accent-cyan bg-accent-cyan-bg text-accent-cyan'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                }`}
              >
                {r}m
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Operating window */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-secondary">Operating Window</span>
            <span className="text-base font-black text-accent-cyan font-mono" data-testid="duration-display">
              {duration}h
            </span>
          </div>
          <div className="relative h-2 bg-surface-deep rounded-full">
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all"
              style={{ width: `${((duration - 1) / 3) * 100}%`, background: 'var(--accent-cyan)' }}
            />
            <input
              type="range" min={1} max={4} step={1} value={duration}
              onChange={(e) => onDurationChange(parseInt(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
              aria-label="Operating window duration in hours"
            />
          </div>
          <div className="flex justify-between text-[10px] text-text-dimmed mt-1.5 font-mono">
            {[1, 2, 3, 4].map((h) => (
              <span key={h} className={duration === h ? 'font-bold' : ''} style={duration === h ? { color: 'var(--accent-cyan)' } : {}}>
                {h}h
              </span>
            ))}
          </div>
        </div>

        {/* Active location indicator */}
        <div
          className="rounded-lg p-3 bg-surface-deep border border-border space-y-1"
          data-testid="active-analysis-location-indicator"
        >
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-text-dimmed">Analysis Location</span>
            <span
              className="px-2 py-0.5 rounded text-[10px] font-bold border"
              style={mode === 'LIVE'
                ? { background: 'var(--accent-cyan-bg)', color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)' }
                : { background: 'var(--accent-amber-bg)', color: 'var(--accent-amber)', borderColor: 'var(--accent-amber)' }
              }
              data-testid="analysis-mode-badge"
            >
              {mode === 'LIVE' ? 'LIVE · FortyGuard' : 'DEMO · Captured FortyGuard'}
            </span>
          </div>
          <div className="text-sm font-bold text-text-primary leading-tight" data-testid="active-analysis-location-name">
            {selectedLocation.name}
          </div>
          <div className="text-[11px] font-mono flex items-center justify-between" style={{ color: 'var(--accent-cyan)' }} data-testid="active-analysis-location-coords">
            <span>{selectedLocation.latitude.toFixed(4)}°, {selectedLocation.longitude.toFixed(4)}°</span>
            {selectedLocation.city && (
              <span className="text-text-muted font-sans text-[10px]">
                {selectedLocation.city}, {selectedLocation.state || selectedLocation.country}
              </span>
            )}
          </div>
        </div>

        {/* Generate button — preserves recalculate-decision-btn testid (both variants) */}
        {isFixtureMismatch ? (
          <button
            onClick={onSwitchToLive}
            data-testid="recalculate-decision-btn"
            className="w-full h-12 rounded-xl text-sm font-bold transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2 text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent-emerald), #0d9488)', boxShadow: '0 4px 16px rgba(5,150,105,0.3)' }}
          >
            ⚡ Switch to LIVE to Generate
          </button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.99 }}
            disabled={loading}
            onClick={onGenerate}
            data-testid="recalculate-decision-btn"
            className={`w-full h-12 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              loading ? 'bg-surface-elevated text-text-dimmed cursor-not-allowed' : 'text-white hover:scale-[1.01] active:scale-[0.99]'
            }`}
            style={loading ? {} : {
              background: 'linear-gradient(135deg, var(--accent-cyan), #0284c7)',
              boxShadow: '0 4px 16px rgba(14,165,233,0.3)',
            }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-text-dimmed rounded-full animate-spin" style={{ borderTopColor: 'var(--accent-cyan)' }} />
                Generating thermal field…
              </span>
            ) : '⚡ Generate Thermal Field'}
          </motion.button>
        )}
      </div>

      {/* ── SYSTEM STATUS ── */}
      <SystemStatus
        mode={mode}
        fortyGuardStatus={fortyGuardStatus}
        aiStatus={aiStatus}
        aiProvider={aiProvider}
        fieldReady={fieldReady}
        loading={loading}
        onTestFortyGuard={onTestFortyGuard}
        onTestAI={onTestAI}
      />

      <div className="text-[10px] text-text-dimmed font-mono text-center">
        FortyGuard Hackathon&apos;26
      </div>
    </div>
  );
}

export default ControlRail;
