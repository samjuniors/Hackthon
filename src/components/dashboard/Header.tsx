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
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2.5 shrink-0">
          {/* Mode badge — provenance-explicit */}
          {mode === 'LIVE' ? (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700 whitespace-nowrap">
              LIVE · FortyGuard
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700 whitespace-nowrap">
              DEMO · Captured FortyGuard
            </span>
          )}

          {/* °F / °C toggle */}
          <div
            role="group"
            aria-label="Temperature unit selection"
            className="flex items-center bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg border border-slate-300 dark:border-slate-700"
            data-testid="temp-unit-toggle"
          >
            {(['F', 'C'] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                data-testid={`temp-unit-${u.toLowerCase()}`}
                onClick={() => onToggleUnit(u)}
                className={`min-h-[32px] min-w-[32px] px-2.5 py-0.5 rounded-md text-xs font-bold font-mono transition-all flex items-center justify-center ${
                  unit === u
                    ? 'bg-slate-900 text-white dark:bg-cyan-400 dark:text-slate-950 shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                }`}
              >
                °{u}
              </button>
            ))}
          </div>

          {/* Status indicators — visible on sm screens */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                FortyGuard
              </span>
              <StatusDot
                status={fortyGuardStatus}
                mode={mode === 'FIXTURE' ? 'FIXTURE' : undefined}
              />
            </div>

            <div className="w-px h-7 bg-slate-200 dark:bg-slate-800" />

            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
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
            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-xs"
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
            className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-xs"
          >
            <Settings className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
