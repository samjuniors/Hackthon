'use client';

/**
 * HistoryDrawer — compact analysis-history drawer (Phase 7).
 *
 * Opened by ONE small Lucide History icon in the header. Lists completed
 * analyses grouped by day (TODAY / YESTERDAY / date), each row showing
 * location, time, LIVE/DEMO, granularity, cell count and the recommended
 * site. Clicking a row RESTORES the complete saved analysis — no provider
 * request is made (Phase 10).
 *
 * Provenance is obvious per record (Phase 8): LIVE → "FortyGuard", DEMO →
 * "Captured FortyGuard" with the original capture date. A DEMO replay is
 * never implied to be fresh provider data.
 */

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { History, MapPin, Trash2, Database, Server, FlaskConical, Loader2 } from 'lucide-react';
import type { HistoryRecord } from '@/lib/history/types';
import { groupHistoryByDay } from '@/lib/history/record';
import { aoiSpanLabel } from '@/lib/spatial/aoi';
import type { DataSourceMode } from '@/types/provenance';

interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: HistoryRecord[];
  ready: boolean;
  /** True when persistence is real (IndexedDB); false → session-only memory. */
  persistent: boolean;
  /** Restore a saved analysis (pure local state — never a provider call). */
  onRestore: (record: HistoryRecord) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatFullDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Provenance badge — LIVE (fresh provider) vs DEMO (captured replay). */
function SourceBadge({ mode }: { mode: DataSourceMode }) {
  const isLive = mode === 'LIVE';
  return (
    <span
      className={`inline-flex items-center gap-1 h-[18px] px-1.5 rounded text-[9.5px] font-bold tracking-wide shrink-0 ${
        isLive
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      }`}
      title={isLive ? 'Live FortyGuard request at analysis time' : 'Captured FortyGuard dataset replay'}
    >
      {isLive ? <Server className="size-2.5" aria-hidden="true" /> : <FlaskConical className="size-2.5" aria-hidden="true" />}
      {isLive ? 'LIVE' : 'DEMO'}
    </span>
  );
}

export function HistoryDrawer({
  open,
  onOpenChange,
  records,
  ready,
  persistent,
  onRestore,
  onDelete,
  onClear,
}: HistoryDrawerProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const groups = groupHistoryByDay(records);

  return (
    <Sheet open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setConfirmClear(false); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md gap-0 p-0 flex flex-col"
        data-testid="history-drawer"
      >
        <SheetHeader className="p-4 border-b border-border space-y-1">
          <SheetTitle className="text-text-primary text-base font-bold flex items-center gap-2">
            <History className="size-4" style={{ color: 'var(--accent-cyan)' }} aria-hidden="true" />
            Analysis History
          </SheetTitle>
          <SheetDescription className="text-text-muted text-xs">
            Saved completed analyses — restoring is local and never re-queries FortyGuard.
          </SheetDescription>
        </SheetHeader>

        {/* ── Body: grouped list ── */}
        <div className="flex-1 overflow-y-auto" data-testid="history-list">
          {!ready ? (
            <div className="flex items-center justify-center gap-2 py-12 text-text-muted text-xs">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading history…
            </div>
          ) : records.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <History className="size-8 mx-auto text-text-dimmed mb-3" aria-hidden="true" />
              <p className="text-text-primary text-[13px] font-semibold">No saved analyses yet</p>
              <p className="text-text-muted text-xs mt-1.5 leading-relaxed max-w-[260px] mx-auto">
                Completed analyses are saved here automatically — the full thermal field,
                recommendation and provenance, restorable offline.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <div className="sticky top-0 z-10 px-4 py-1.5 bg-surface-header/95 backdrop-blur border-b border-border">
                  <span className="text-[9.5px] font-bold uppercase tracking-widest text-text-dimmed">
                    {group.label}
                  </span>
                </div>
                <ul>
                  {group.records.map((record) => {
                    const recommended = record.jointDecision?.recommendedPlan?.location?.name;
                    const isDemo = record.dataSourceMode === 'FIXTURE';
                    return (
                      <li key={record.id} className="border-b border-border last:border-b-0">
                        <div className="group flex items-stretch">
                          {/* Restore on click — the saved record is authoritative */}
                          <button
                            type="button"
                            onClick={() => { onRestore(record); onOpenChange(false); }}
                            className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-surface-elevated transition-colors duration-100 focus-visible:bg-surface-elevated outline-none"
                            data-testid={`history-item-${record.id}`}
                            aria-label={`Restore saved analysis: ${record.location.name}, ${formatFullDate(record.createdAt)}`}
                          >
                            <div className="flex items-center gap-2">
                              <MapPin className="size-3 shrink-0 text-text-dimmed" aria-hidden="true" />
                              <span className="text-[13px] font-semibold text-text-primary truncate">
                                {record.location.name}
                              </span>
                              <span className="ml-auto text-[10.5px] text-text-dimmed tnum shrink-0">
                                {formatTime(record.createdAt)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <SourceBadge mode={record.dataSourceMode} />
                              <span className="text-[10px] text-text-muted tnum">
                                {record.granularity}m · {record.thermalCellCount} cells
                              </span>
                              {/* AOI — the recorded analysis area (span semantics:
                                  square side × side / circle diameter). */}
                              {record.aoiSpanMetres != null && (
                                <span
                                  className="text-[10px] text-text-muted tnum"
                                  title="Analysis area used for this analysis"
                                >
                                  {aoiSpanLabel(record.aoiSpanMetres, record.aoiShape)}
                                </span>
                              )}
                            </div>
                            {recommended && (
                              <div className="text-[11px] text-text-muted mt-1 truncate">
                                <span className="text-text-dimmed">Recommended: </span>
                                {recommended.split(' (')[0]}
                              </div>
                            )}
                            {/* Phase 8 — provenance line, never ambiguous */}
                            <div className="text-[9.5px] text-text-dimmed mt-1">
                              {isDemo ? (
                                <>
                                  {record.provenance.providerLabel}
                                  {record.provenance.capturedAt
                                    ? ` · captured ${new Date(record.provenance.capturedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                                    : ''}
                                </>
                              ) : (
                                <>
                                  {record.provenance.providerLabel}
                                  {record.providerActivityId ? ` · ${record.providerActivityId.slice(0, 8)}…` : ''}
                                </>
                              )}
                              {' · analyzed ' + formatFullDate(record.createdAt)}
                            </div>
                          </button>
                          {/* Delete one record */}
                          <button
                            type="button"
                            onClick={() => onDelete(record.id)}
                            className="w-11 self-stretch shrink-0 flex items-center justify-center text-text-dimmed hover:text-red-500 transition-colors"
                            aria-label={`Delete saved analysis for ${record.location.name}`}
                            data-testid={`history-delete-${record.id}`}
                          >
                            <Trash2 className="size-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        {/* ── Footer: persistence state + clear ── */}
        <div className="border-t border-border p-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-[10px] text-text-dimmed">
            <Database className="size-3" aria-hidden="true" />
            {persistent ? `Local browser storage · ${records.length}/20` : 'Session only (storage unavailable)'}
          </span>
          {records.length > 0 && (
            confirmClear ? (
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => { onClear(); setConfirmClear(false); }}
                  className="h-11 sm:h-8 px-2.5 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 text-[10.5px] font-semibold hover:bg-red-500/20 transition-colors"
                  data-testid="history-clear-confirm"
                >
                  Delete all
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="h-11 sm:h-8 px-2.5 rounded-md border border-border text-[10.5px] text-text-muted hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                className="h-11 sm:h-8 px-2.5 rounded-md border border-border text-[10.5px] text-text-muted hover:text-red-500 hover:border-red-500/40 transition-colors"
                data-testid="history-clear-btn"
              >
                Clear history
              </button>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default HistoryDrawer;
