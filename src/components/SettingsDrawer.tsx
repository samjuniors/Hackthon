'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { RotateCcw, Sun, Moon } from 'lucide-react';
import { useUserPreferences } from '@/lib/user-preferences';
import { useTempUnit } from '@/lib/temperature';
import { useTheme } from '@/components/ThemeProvider';
import type {
  PreferredAIProvider,
} from '@/types/provider';

/**
 * SettingsDrawer — self-contained, non-secret settings drawer.
 *
 * Pulls state directly from `useUserPreferences()`, `useTempUnit()`, and
 * `useTheme()`. The parent only controls open/closed. No API-key fields —
 * the design brief explicitly forbids credential entry in the UI.
 */

interface SettingsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-dimmed mb-3">
      {children}
    </h3>
  );
}

const pillGroupClass =
  'inline-flex items-center bg-surface-elevated p-1 rounded-full border border-border';

function pillButtonClass(active: boolean): string {
  return `min-h-[36px] min-w-[36px] px-3 py-1 rounded-full text-xs font-bold font-mono transition-all flex items-center justify-center ${
    active
      ? 'bg-accent-cyan text-white shadow-sm'
      : 'text-text-muted hover:text-text-primary'
  }`;
}

const borderedCardClass =
  'rounded-lg border border-border bg-surface-card p-4 space-y-3';

export function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const [prefs, set] = useUserPreferences();
  const [unit, setUnit] = useTempUnit();
  const { theme, toggleTheme } = useTheme();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md gap-0 p-0 flex flex-col"
      >
        <SheetHeader className="p-4 border-b border-border space-y-1">
          <SheetTitle className="text-text-primary text-base font-bold">
            Settings
          </SheetTitle>
          <SheetDescription className="text-text-muted text-xs">
            Customize your Thermal Decision Engine workspace.
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body — keeps the drawer usable on small screens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[90vh]">
          {/* ── 1. Display ─────────────────────────────────────────────── */}
          <section className={borderedCardClass}>
            <SectionLabel>Display</SectionLabel>

            {/* °F / °C toggle */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">
                  Temperature unit
                </span>
                <div
                  role="group"
                  aria-label="Temperature unit selection"
                  className={pillGroupClass}
                  data-testid="temp-unit-toggle"
                >
                  {(['F', 'C'] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={unit === u}
                      data-testid={`temp-unit-${u.toLowerCase()}`}
                      onClick={() => setUnit(u)}
                      className={pillButtonClass(unit === u)}
                    >
                      °{u}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Theme toggle */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-primary">
                Theme
              </span>
              <div
                role="group"
                aria-label="Color theme selection"
                className="inline-flex items-center bg-surface-elevated p-1 rounded-full border border-border"
              >
                <button
                  type="button"
                  aria-pressed={theme === 'light'}
                  onClick={() => {
                    if (theme !== 'light') toggleTheme();
                  }}
                  className={pillButtonClass(theme === 'light')}
                >
                  <Sun className="size-4 mr-1" aria-hidden="true" />
                  Light
                </button>
                <button
                  type="button"
                  aria-pressed={theme === 'dark'}
                  onClick={() => {
                    if (theme !== 'dark') toggleTheme();
                  }}
                  className={pillButtonClass(theme === 'dark')}
                >
                  <Moon className="size-4 mr-1" aria-hidden="true" />
                  Dark
                </button>
              </div>
            </div>
          </section>

          {/* ── 2. Data Source ─────────────────────────────────────────── */}
          <section className={borderedCardClass}>
            <SectionLabel>Data Source</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={prefs.dataSourceMode === 'LIVE'}
                onClick={() => set.setDataSourceMode('LIVE')}
                className={`min-h-[40px] rounded-lg text-sm font-semibold transition-all border ${
                  prefs.dataSourceMode === 'LIVE'
                    ? 'border-accent-emerald bg-accent-emerald-bg text-accent-emerald'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                }`}
              >
                LIVE
              </button>
              <button
                type="button"
                aria-pressed={prefs.dataSourceMode === 'FIXTURE'}
                onClick={() => set.setDataSourceMode('FIXTURE')}
                className={`min-h-[40px] rounded-lg text-sm font-semibold transition-all border ${
                  prefs.dataSourceMode === 'FIXTURE'
                    ? 'border-accent-amber bg-accent-amber-bg text-accent-amber'
                    : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-deep'
                }`}
              >
                DEMO
              </button>
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              {prefs.dataSourceMode === 'LIVE'
                ? 'Live FortyGuard API calls. Real-time thermal data for any location.'
                : 'Captured 12-hour Manhattan thermal field. No API calls required.'}
            </p>
          </section>

          {/* ── 3. AI Explainer — Preferred Provider ───────────────────── */}
          <section className={borderedCardClass}>
            <SectionLabel>AI Explainer — Preferred Provider</SectionLabel>
            <div className="flex flex-wrap items-center bg-surface-elevated p-1 rounded-full border border-border gap-1">
              {(
                [
                  { value: 'auto', label: 'Auto' },
                  { value: 'gemini', label: 'Gemini' },
                  { value: 'claude', label: 'Claude' },
                  { value: 'zai', label: 'Z.ai' },
                ] as { value: PreferredAIProvider; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={prefs.preferredAIProvider === opt.value}
                  onClick={() => set.setPreferredAIProvider(opt.value)}
                  className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-semibold transition-all flex items-center justify-center ${
                    prefs.preferredAIProvider === opt.value
                      ? 'bg-accent-cyan text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Providers fall back automatically: Gemini → Claude → Z.ai →
              deterministic.
            </p>
            <p className="text-[11px] text-text-dimmed leading-relaxed">
              API keys are configured server-side. Contact your administrator
              to enable a provider.
            </p>
          </section>

          {/* ── 4. Analysis ───────────────────────────────────────────── */}
          <section className={borderedCardClass}>
            <SectionLabel>Analysis</SectionLabel>

            {/* Analysis Area */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">
                  Analysis area
                </span>
                <div
                  role="group"
                  aria-label="Analysis area shape"
                  className="inline-flex items-center bg-surface-elevated p-1 rounded-full border border-border"
                >
                  {(
                    [
                      { value: 'polygon', label: 'Polygon' },
                      { value: 'circle', label: 'Circle' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={prefs.analysisAreaShape === opt.value}
                      onClick={() => set.setAnalysisAreaShape(opt.value)}
                      className={`min-h-[36px] px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                        prefs.analysisAreaShape === opt.value
                          ? 'bg-accent-cyan text-white shadow-sm'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Resolution */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-primary">
                  Resolution
                </span>
                <div
                  role="group"
                  aria-label="Analysis resolution in metres"
                  className="inline-flex items-center bg-surface-elevated p-1 rounded-full border border-border"
                >
                  {([60, 80, 100] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={prefs.analysisResolution === r}
                      onClick={() => set.setAnalysisResolution(r)}
                      className={`min-h-[36px] min-w-[44px] px-3 py-1 rounded-full text-xs font-bold font-mono transition-all ${
                        prefs.analysisResolution === r
                          ? 'bg-accent-cyan text-white shadow-sm'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {r}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── 5. Map Layers ──────────────────────────────────────────── */}
          <section className={borderedCardClass}>
            <SectionLabel>Map Layers</SectionLabel>

            <div className="space-y-1">
              {(
                [
                  {
                    key: 'thermal' as const,
                    label: 'Thermal polygons',
                    desc: 'Color-coded heat severity tiles',
                  },
                  {
                    key: 'candidates' as const,
                    label: 'Candidate sites',
                    desc: 'Recommended intervention locations',
                  },
                  {
                    key: 'labels' as const,
                    label: 'Labels',
                    desc: 'On-map text annotations',
                  },
                  {
                    key: 'aoi' as const,
                    label: 'AOI boundary',
                    desc: 'Area-of-interest outline',
                  },
                ]
              ).map(({ key, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 min-h-[40px] py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text-primary">
                      {label}
                    </div>
                    <div className="text-[11px] text-text-muted">{desc}</div>
                  </div>
                  <Switch
                    checked={prefs.mapLayerVisibility[key]}
                    onCheckedChange={(v: boolean) =>
                      set.setMapLayerVisibility({ [key]: v })
                    }
                    aria-label={`Toggle ${label}`}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Footer — Reset to defaults */}
        <div className="p-4 border-t border-border">
          <button
            type="button"
            onClick={() => set.reset()}
            className="w-full min-h-[44px] rounded-lg border border-border bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-deep transition-all text-sm font-medium flex items-center justify-center gap-2"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Reset to defaults
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default SettingsDrawer;
