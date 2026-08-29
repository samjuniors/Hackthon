'use client';

import type { ProductionErrorDetails, NamedLocation } from '@/types/provider';
import type { DataSourceMode } from '@/types/provenance';

interface ErrorBannerProps {
  errorDetails: ProductionErrorDetails;
  mode: DataSourceMode;
  altLocations: NamedLocation[];
  onRetry: () => void;
  onSwitchToDemo: () => void;
  /** Offered in DEMO mode (e.g. NO_DEMO_CAPTURE) — switch the DATA SOURCE to LIVE. */
  onSwitchToLive?: () => void;
  onSelectAltLocation: (loc: NamedLocation) => void;
}

/**
 * Error banner — a halted analysis with actionable recovery.
 *
 * Calm presentation: surface card with a single accent-red left rule (no giant
 * red box), the provider's message verbatim, and clearly separated recovery
 * actions. Preserves the `production-error-banner` testid.
 */
export function ErrorBanner({
  errorDetails,
  mode,
  altLocations,
  onRetry,
  onSwitchToDemo,
  onSwitchToLive,
  onSelectAltLocation,
}: ErrorBannerProps) {
  // HTTP 402 — credits exhausted: retrying CANNOT help (audit §6). The
  // actionable path is switching to the (free) captured DEMO field.
  const retryIsPointless = errorDetails.code === 'FORTYGUARD_CREDITS_EXHAUSTED';
  return (
    <div
      className="rounded-xl bg-surface-card border border-border border-l-2 p-4 space-y-3 card-enter"
      style={{ borderLeftColor: 'var(--accent-red)' }}
      data-testid="production-error-banner"
      role="alert"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--accent-red)' }}>
              Analysis Halted
            </span>
            {mode === 'LIVE' && errorDetails.category === 'PROVIDER' && (
              <span className="text-[11px] font-medium text-text-muted">FortyGuard provider error</span>
            )}
            <code className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-surface-deep text-text-dimmed">
              {errorDetails.code}
            </code>
          </div>
          <p className="text-[13px] leading-relaxed mt-1.5 text-text-primary">{errorDetails.message}</p>
          <p className="text-[11.5px] mt-1 text-text-muted leading-relaxed">
            {errorDetails.recoverySuggestion}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {!retryIsPointless && (
            <button
              onClick={onRetry}
              className="px-3 h-9 text-xs font-semibold rounded-lg border border-border bg-surface-elevated text-text-primary hover:bg-surface-deep transition-colors duration-150"
            >
              {mode === 'LIVE' ? 'Retry Live' : 'Retry'}
            </button>
          )}
          {mode === 'LIVE' && (
            <button
              onClick={onSwitchToDemo}
              className="px-3 h-9 text-xs font-semibold rounded-lg border transition-colors duration-150"
              style={{
                borderColor: 'var(--accent-amber)',
                color: 'var(--accent-amber)',
                background: 'var(--accent-amber-bg)',
              }}
              title="Switches the data source to the captured DEMO dataset (Manhattan capture only)"
            >
              Switch to DEMO mode
            </button>
          )}
          {mode === 'FIXTURE' && onSwitchToLive && (
            <button
              onClick={onSwitchToLive}
              data-testid="switch-to-live-btn"
              className="px-3 h-9 text-xs font-semibold rounded-lg border transition-colors duration-150"
              style={{
                borderColor: 'var(--accent-emerald)',
                color: 'var(--accent-emerald)',
                background: 'var(--accent-emerald-bg)',
              }}
            >
              Switch to LIVE
            </button>
          )}
        </div>
      </div>

      {/* Alternative locations */}
      {altLocations.length > 0 && (
        <div className="pt-2.5 border-t border-border text-xs">
          <span className="text-text-muted">Supported metro alternatives: </span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {altLocations.map((altLoc) => (
              <button
                key={altLoc.id}
                onClick={() => onSelectAltLocation(altLoc)}
                className="px-2.5 h-8 rounded-md border border-border bg-surface-elevated transition-colors duration-150"
                style={{ color: 'var(--accent-cyan)' }}
              >
                <span className="text-[11px] font-medium">{altLoc.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ErrorBanner;
