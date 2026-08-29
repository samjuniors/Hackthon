'use client';

import { useState, useRef, useEffect } from 'react';
import { Settings, Sun, Moon, MapPin, Menu, X, ChevronDown, CalendarClock, History } from 'lucide-react';
import { LocationSearch } from '@/components/LocationSearch';
import type { DataSourceMode } from '@/types/provenance';
import type { AIProviderName, NamedLocation, ProviderStatus } from '@/types/provider';
import type { TempUnit } from '@/lib/temperature';
import type { Theme } from '@/components/ThemeProvider';

/**
 * Header — restrained product header.
 *
 * Desktop:  Brand | Location | Date/time | DEMO/LIVE | °F/°C | theme | settings
 * Mobile:   Brand | settings | menu (opens the analysis bottom sheet)
 *
 * No scattered status widgets — provider health lives in the analysis panel's
 * system status; the header communicates WHERE, WHEN, and the data source.
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
  /** Selected operating location (header location selector). */
  selectedLocation: NamedLocation | null;
  /** Location selection shares the full page semantics (mode-aware). */
  onSelectLocation: (loc: NamedLocation) => void;
  /** "Switch to LIVE" affordance inside the location popover. */
  onSwitchToLive?: () => void;
  /** Clear the selected location → EMPTY workspace. */
  onClearLocation: () => void;
  /** Human-readable WHEN label (date + time window + tz). */
  temporalLabel?: string;
  /** Compact DEMO/LIVE segmented control handler. */
  onModeChange: (m: DataSourceMode) => void;
  /** Mobile only — TOGGLES the analysis bottom sheet (open ⇄ close). */
  onOpenMobileSheet?: () => void;
  /** Mobile only — current open state of the analysis bottom sheet (drives
   *  the button's icon Menu ⇄ X, aria-expanded, and aria-label). */
  mobileSheetOpen?: boolean;
  /** Opens the analysis-history drawer (desktop + mobile). */
  onOpenHistory?: () => void;
  /** Saved-analysis count — subtly badges the History icon. */
  historyCount?: number;
  /** Active geographic region/state for preset filtering in the location search. */
  activeStateFilter?: string;
}

export function Header({
  mode,
  unit,
  onToggleUnit,
  theme,
  onToggleTheme,
  onOpenSettings,
  selectedLocation,
  onSelectLocation,
  onSwitchToLive,
  onClearLocation,
  temporalLabel,
  onModeChange,
  onOpenMobileSheet,
  mobileSheetOpen = false,
  onOpenHistory,
  historyCount = 0,
  activeStateFilter,
}: HeaderProps) {
  const [locationOpen, setLocationOpen] = useState(false);
  const locationRef = useRef<HTMLDivElement>(null);

  // Close the location popover on outside click
  useEffect(() => {
    if (!locationOpen) return;
    const onDown = (e: MouseEvent) => {
      if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
        setLocationOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [locationOpen]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-border backdrop-blur-md"
      style={{ background: 'var(--surface-header)' }}
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        {/* ── Brand ── */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <span
            className="flex items-center justify-center size-7 rounded-lg shrink-0"
            style={{ background: 'var(--accent-cyan-bg)', color: 'var(--accent-cyan)' }}
            aria-hidden="true"
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5a3.4 3.4 0 0 0-3.4 3.4c0 .9.4 1.8 1 2.4v1.4h4.8V7.3c.6-.6 1-1.5 1-2.4A3.4 3.4 0 0 0 8 1.5Z" fill="currentColor"/>
              <path d="M6.2 10.1h3.6l-.6 4.4H6.8l-.6-4.4Z" fill="currentColor" opacity="0.7"/>
            </svg>
          </span>
          <div className="min-w-0">
            {/* Brand text hides below sm so the mobile header (unit toggle ·
                theme · history · settings · menu — all 44px touch targets) never
                overflows the viewport at 390/430px. */}
            <div className="hidden sm:block text-[13.5px] font-semibold tracking-tight text-text-primary leading-none">
              Thermal Decision Engine
            </div>
          </div>
        </div>

        {/* ── Center context (desktop): Location · WHEN ── */}
        <div className="hidden md:flex items-center gap-1.5 min-w-0 flex-1 justify-center">
          {/* Location selector — popover with the shared LocationSearch */}
          <div className="relative shrink-0" ref={locationRef}>
            <button
              type="button"
              onClick={() => setLocationOpen((v) => !v)}
              aria-expanded={locationOpen}
              aria-haspopup="dialog"
              data-testid="header-location-btn"
              className="header-ctl flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-lg border border-border bg-surface-card text-[12.5px] font-medium text-text-primary hover:bg-surface-elevated transition-colors duration-150 max-w-[280px]"
              title="Select operating location"
            >
              <MapPin className="size-3.5 shrink-0" style={{ color: 'var(--accent-cyan)' }} aria-hidden="true" />
              <span className="truncate">
                {selectedLocation ? selectedLocation.name : 'Select location'}
              </span>
              <ChevronDown className="size-3 shrink-0 text-text-dimmed" aria-hidden="true" />
            </button>

            {locationOpen && (
              <div
                role="dialog"
                aria-label="Select operating location"
                className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-[380px] max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-surface-card shadow-2xl p-3 z-[70]"
              >
                <LocationSearch
                  selectedLocation={selectedLocation}
                  mode={mode}
                  onSelectLocation={(loc) => {
                    onSelectLocation(loc);
                    setLocationOpen(false);
                  }}
                  onSwitchToLive={onSwitchToLive ? () => { onSwitchToLive(); setLocationOpen(false); } : undefined}
                  onClearLocation={onClearLocation}
                  compact
                  activeStateFilter={activeStateFilter}
                />
              </div>
            )}
          </div>

          {/* WHEN — non-interactive status text (controls live in the analysis panel) */}
          {temporalLabel && (
            <div
              className="hidden lg:flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] text-text-muted tnum min-w-0"
              title="Evaluation window"
            >
              <CalendarClock className="size-3.5 shrink-0 text-text-dimmed" aria-hidden="true" />
              <span className="truncate">{temporalLabel}</span>
            </div>
          )}
        </div>

        {/* ── Right controls ── */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* DEMO / LIVE segmented control */}
          <div
            role="group"
            aria-label="Data source"
            data-testid="data-source-toggle"
            className="hidden sm:flex items-center p-0.5 rounded-lg border border-border bg-surface-card"
          >
            {(['LIVE', 'FIXTURE'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                data-testid={`source-${m === 'LIVE' ? 'live' : 'demo'}`}
                onClick={() => onModeChange(m)}
                title={m === 'LIVE' ? 'Live FortyGuard requests (spends credits)' : 'Captured FortyGuard DEMO dataset (no requests)'}
                className={`header-ctl h-7 px-2.5 rounded-md text-[11px] font-semibold tracking-wide transition-colors duration-150 ${
                  mode === m
                    ? m === 'LIVE'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {m === 'LIVE' ? 'LIVE' : 'DEMO'}
              </button>
            ))}
          </div>

          {/* °F / °C toggle */}
          <div
            role="group"
            aria-label="Temperature unit selection"
            className="flex items-center p-0.5 rounded-lg border border-border bg-surface-card"
            data-testid="temp-unit-toggle"
          >
            {(['F', 'C'] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                data-testid={`temp-unit-${u.toLowerCase()}`}
                onClick={() => onToggleUnit(u)}
                className={`header-ctl h-11 min-w-[44px] sm:h-7 sm:min-w-[34px] px-1.5 sm:px-1.5 rounded-md text-[11px] font-semibold tnum transition-colors duration-150 ${
                  unit === u
                    ? 'bg-slate-900 text-white dark:bg-cyan-400 dark:text-slate-950'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                °{u}
              </button>
            ))}
          </div>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="header-ctl flex items-center justify-center size-11 sm:size-8 rounded-lg border border-border bg-surface-card text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors duration-150"
          >
            {theme === 'dark' ? (
              <Sun className="size-4" aria-hidden="true" />
            ) : (
              <Moon className="size-4" aria-hidden="true" />
            )}
          </button>

          {/* Analysis history — ONE small icon (desktop + mobile), opens the
              compact saved-analyses drawer. The count badges it subtly. */}
          {onOpenHistory ? (
            <button
              type="button"
              onClick={onOpenHistory}
              aria-label={`Analysis history${historyCount > 0 ? ` (${historyCount} saved)` : ''}`}
              title="Analysis history — saved completed analyses"
              data-testid="history-open-btn"
              className="header-ctl relative flex items-center justify-center size-11 sm:size-8 rounded-lg border border-border bg-surface-card text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors duration-150"
            >
              <History className="size-4" aria-hidden="true" />
              {historyCount > 0 && (
                <span
                  className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full text-[8.5px] font-bold leading-[15px] text-white tnum"
                  style={{ background: 'var(--accent-cyan)' }}
                  aria-hidden="true"
                >
                  {historyCount > 20 ? '20' : historyCount}
                </span>
              )}
            </button>
          ) : null}

          {/* Settings — visible at ALL breakpoints (mobile has room: 5×44px
              icon controls + brand icon fit 390px); without this, settings
              was unreachable below 640px. */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open settings"
            data-testid="settings-open-btn"
            className="header-ctl flex items-center justify-center size-11 sm:size-8 rounded-lg border border-border bg-surface-card text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors duration-150"
          >
            <Settings className="size-4" aria-hidden="true" />
          </button>

          {/* Mobile: menu → analysis bottom sheet (TRUE TOGGLE — the same
              button opens AND closes the drawer; the icon reflects state). */}
          {onOpenMobileSheet ? (
            <button
              type="button"
              onClick={onOpenMobileSheet}
              aria-expanded={mobileSheetOpen}
              aria-label={mobileSheetOpen ? 'Close analysis panel' : 'Open analysis panel'}
              data-testid="mobile-menu-btn"
              className="header-ctl md:hidden flex items-center justify-center size-11 sm:size-8 rounded-lg border border-border bg-surface-card text-text-primary hover:bg-surface-elevated transition-colors duration-150"
            >
              {mobileSheetOpen ? (
                <X className="size-4" aria-hidden="true" />
              ) : (
                <Menu className="size-4" aria-hidden="true" />
              )}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

export default Header;
