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
 * Production error banner — surfaces a halted analysis with actionable recovery.
 * Preserves the `production-error-banner` testid + recovery affordances.
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
  return (
    <div
      className="rounded-xl p-4 border-2 space-y-3"
      style={{ borderColor: 'var(--accent-red)', background: 'var(--accent-red-bg)' }}
      data-testid="production-error-banner"
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">🔴</span>
            <span className="font-bold text-sm" style={{ color: 'var(--accent-red-text)' }}>
              Analysis Halted
            </span>
            {mode === 'LIVE' && errorDetails.category === 'PROVIDER' && (
              <span className="text-xs font-semibold" style={{ color: 'var(--accent-red-text)' }}>
                FortyGuard provider error
              </span>
            )}
            <code className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-surface-elevated text-text-muted">
              {errorDetails.code}
            </code>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--accent-red-text)' }}>{errorDetails.message}</p>
          <p className="text-xs mt-1 text-text-muted">
            <strong className="text-text-primary">Action:</strong> {errorDetails.recoverySuggestion}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <button
            onClick={onRetry}
            className="px-3 py-1.5 min-h-[36px] text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs"
          >
            {mode === 'LIVE' ? 'Retry Live' : 'Retry'}
          </button>
          {mode === 'LIVE' && (
            <button
              onClick={onSwitchToDemo}
              className="px-3 py-1.5 min-h-[36px] text-xs font-semibold rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 hover:bg-amber-200 transition-colors shadow-xs"
            >
              Continue with Verified Demo
            </button>
          )}
          {mode === 'FIXTURE' && onSwitchToLive && (
            <button
              onClick={onSwitchToLive}
              data-testid="switch-to-live-btn"
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold rounded-lg border border-emerald-600 dark:border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-xs"
            >
              Switch to LIVE
            </button>
          )}
        </div>
      </div>

      {/* Alternative locations */}
      {altLocations.length > 0 && (
        <div className="pt-2 border-t border-border text-xs">
          <span className="text-text-muted">Supported metro alternatives: </span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {altLocations.map((altLoc) => (
              <button
                key={altLoc.id}
                onClick={() => onSelectAltLocation(altLoc)}
                className="px-2 py-1 min-h-[28px] rounded border border-border bg-surface-elevated text-accent-cyan hover:border-accent-cyan text-[10px] font-mono transition-colors"
              >
                {altLoc.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ErrorBanner;
