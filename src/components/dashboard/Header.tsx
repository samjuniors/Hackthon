'use client';

import { Settings, Sun, Moon } from 'lucide-react';
import type { DataSourceMode } from '@/types/provenance';
import type { ProviderStatus, AIProviderName } from '@/types/provider';
import type { TempUnit } from '@/lib/temperature';
import type { Theme } from '@/components/ThemeProvider';

/**
 * Header — sticky top bar for the Thermal Decision Engine.
 *
 * Replaces the inline header in `src/app/page.tsx` with a self-contained
 * component that exposes provenance-explicit wording, the existing °F/°C
 * toggle, a compact FortyGuard + AI status dot pair, a theme toggle and a
 * Settings button (opens <SettingsDrawer />).
 */

interface HeaderProps {
  mode: DataSourceMode;
  unit: TempUnit;
  onToggleUnit: (u: TempUnit) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  fortyGuardStatus: ProviderStatus;
  aiStatus: ProviderStatus;
  /** Active AI provider — labels the AI status dot, e.g. "AI · Z.ai". */
  aiProvider?: AIProviderName;
}

/**
 * Inline StatusDot — same visual language as the in-page StatusDot in
 * `src/app/page.tsx`. When `mode === 'FIXTURE'` it renders a DEMO pill
 * regardless of the underlying provider status (mirror behaviour).
 */
function StatusDot({
  status,
  mode,
}: {
  status: ProviderStatus;
  mode?: DataSourceMode;
}) {
  if (mode === 'FIXTURE') {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-xs font-semibold"
        style={{ color: 'var(--status-demo)' }}
      >
        <span
          className="w-2 h-2 rounded-full inline-block"
          style={{ background: 'var(--status-demo)' }}
        />
        DEMO
      </span>
    );
  }
  const map: Record<ProviderStatus, { dot: string; label: string; pulse?: boolean }> = {
    CONNECTED: { dot: 'var(--status-live)', label: 'LIVE', pulse: true },
    CHECKING: { dot: 'var(--status-demo)', label: 'CHECKING' },
    ERROR: { dot: 'var(--status-error)', label: 'OFFLINE' },
    UNKNOWN: { dot: 'var(--status-unknown)', label: 'UNKNOWN' },
  };
  const s = map[status] ?? map.UNKNOWN;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted">
      <span
        className={`w-2 h-2 rounded-full inline-block${s.pulse ? ' status-dot-live' : ''}`}
        style={{ background: s.dot }}
      />
      {s.label}
    </span>
  );
}

/** Map an AIProviderName enum to a short, human-friendly label. */
function aiProviderLabel(p?: AIProviderName): string {
  if (p === 'GEMINI') return 'Gemini';
  if (p === 'CLAUDE') return 'Claude';
  if (p === 'ZAI') return 'Z.ai';
  return 'Deterministic';
}

export function Header({
  mode,
  unit,
  onToggleUnit,
  theme,
  onToggleTheme,
  onOpenSettings,
  fortyGuardStatus,
  aiStatus,
  aiProvider,
}: HeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 border-b border-border backdrop-blur-xl"
      style={{ background: 'var(--surface-header)' }}
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Title */}
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-black tracking-tight text-text-primary leading-tight">
            Thermal Decision Engine
          </h1>
          <p className="text-[11px] text-text-muted mt-0 hidden sm:block">
            Hyperlocal thermal intelligence → operational decisions
          </p>
        </div>

        {/* Controls — wrap gracefully on mobile */}
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 shrink-0">
          {/* Mode badge — provenance-explicit */}
          {mode === 'LIVE' ? (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-accent-emerald-bg text-accent-emerald border border-border whitespace-nowrap">
              LIVE · FortyGuard
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-accent-amber-bg text-accent-amber whitespace-nowrap">
              DEMO · Captured FortyGuard
            </span>
          )}

          {/* °F / °C toggle */}
          <div
            role="group"
            aria-label="Temperature unit selection"
            className="flex items-center bg-surface-elevated p-1 rounded-full border border-border"
            data-testid="temp-unit-toggle"
          >
            {(['F', 'C'] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                data-testid={`temp-unit-${u.toLowerCase()}`}
                onClick={() => onToggleUnit(u)}
                className={`min-h-[36px] min-w-[36px] px-3 py-1 rounded-full text-xs font-bold font-mono transition-all flex items-center justify-center ${
                  unit === u
                    ? 'bg-accent-cyan text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                °{u}
              </button>
            ))}
          </div>

          {/* Status indicators — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-text-dimmed uppercase tracking-wider font-medium">
                FortyGuard
              </span>
              <StatusDot
                status={fortyGuardStatus}
                mode={mode === 'FIXTURE' ? 'FIXTURE' : undefined}
              />
            </div>

            <div className="w-px h-7 bg-border" />

            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-text-dimmed uppercase tracking-wider font-medium">
                AI · {aiProviderLabel(aiProvider)}
              </span>
              <StatusDot status={aiStatus} />
            </div>
          </div>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full border border-border bg-surface-elevated hover:bg-surface-deep text-text-muted hover:text-text-primary transition-all"
          >
            {theme === 'dark' ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Moon className="size-4" aria-hidden="true" />
            )}
          </button>

          {/* Settings button */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            data-testid="settings-open-btn"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-full border border-border bg-surface-elevated hover:bg-surface-deep text-text-muted hover:text-text-primary transition-all"
          >
            <Settings className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
