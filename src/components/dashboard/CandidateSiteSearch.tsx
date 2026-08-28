'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MapPin, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { NamedLocation } from '@/types/provider';
import type { DataSourceMode } from '@/types/provenance';
import type { CandidateSite, CandidateAddOutcome } from '@/hooks/use-candidate-sites';
import { searchLocations, getPresetLocations } from '@/lib/location/search';
import { resolveSearchKeyAction, isDuplicateCandidateResult } from '@/lib/workspace/candidate-search-model';

/**
 * CANDIDATE-SITE SEARCH — explicit and separate from the analysis-location
 * search (which selects the AOI center and never creates a candidate).
 *
 * This component searches REAL places via the SAME geocoding infrastructure
 * the operating-location search uses (curated catalog + /api/location/search —
 * Photon/Nominatim; credit-free, never FortyGuard). Selecting a result ONLY
 * creates application-defined candidate state via the parent's
 * `onSelectResult`; it never moves the AOI, never changes the analysis
 * location / date / resolution / data-source mode, and never triggers the
 * decision pipeline. Generate is the only pipeline trigger.
 *
 * Interaction contract (mouse/touch and keyboard are equivalent):
 *   click a result            → selects/adds THAT exact result
 *   ArrowUp / ArrowDown       → moves the highlighted result
 *   Enter                     → selects the highlighted result, or the FIRST
 *                               result when nothing is highlighted
 *   Escape                    → closes the results without adding
 */

/** Human label for a geocode result type. */
const RESULT_TYPE_LABEL: Record<string, string> = {
  state: 'State',
  region: 'Region',
  city: 'City',
  neighborhood: 'Neighborhood',
  street: 'Street',
  address: 'Address',
  poi: 'Place',
  zip: 'ZIP',
};

interface CandidateSiteSearchProps {
  mode: DataSourceMode;
  /** Current candidates — used for the subtle "Already added" result state. */
  existingSites: CandidateSite[];
  /** Applies a selection; returns the outcome ('added' | 'duplicate' | 'outside-aoi'). */
  onSelectResult: (loc: NamedLocation) => CandidateAddOutcome;
  /**
   * "Move analysis area here" option for an outside-AOI result: an EXPLICIT
   * user action that recenters the analysis on the chosen site.
   */
  onMoveAoiHere: (loc: NamedLocation) => void;
  /** Active geographic region or state code to filter catalog suggestions. */
  activeStateFilter?: string;
}

type InlineStatus =
  | { kind: 'added'; site: CandidateSite }
  | { kind: 'duplicate'; site: CandidateSite }
  | { kind: 'outside-aoi'; loc: NamedLocation }
  | null;

export function CandidateSiteSearch({
  mode,
  existingSites,
  onSelectResult,
  onMoveAoiHere,
  activeStateFilter,
}: CandidateSiteSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [remoteResults, setRemoteResults] = useState<NamedLocation[]>([]);
  const [status, setStatus] = useState<InlineStatus>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Catalog results — the same curated, verified locations the operating-location
  // search uses. With a query they filter by that query; without one they show
  // the state-scoped presets.
  const localResults = query.trim()
    ? searchLocations(query, 8, activeStateFilter)
    : getPresetLocations(mode === 'FIXTURE', activeStateFilter);

  // Debounced remote geocoding (same credit-free endpoint as the
  // operating-location search — never FortyGuard). Stale results for a previous
  // query are cleared immediately so they can never show for the current one.
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      setRemoteResults([]);
      return;
    }
    setRemoteResults([]);
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/location/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.success && Array.isArray(data.results)) {
            setRemoteResults(data.results as NamedLocation[]);
          }
        }
      } catch {
        // Abort/network errors keep the (filtered) catalog results — honest.
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  // Remote geocoder results take precedence once they arrive for this query.
  const results =
    query.trim().length >= 2 && remoteResults.length > 0 ? remoteResults : localResults;

  // Close the dropdown on outside click (no candidate added).
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Auto-dismiss the transient "Added" confirmation (the candidate list and map
  // pin are the durable feedback).
  useEffect(() => {
    if (status?.kind !== 'added') return;
    const t = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(t);
  }, [status]);

  /** Select a result — click, tap, or Enter all run THIS one path. */
  const selectResult = useCallback(
    (loc: NamedLocation) => {
      const outcome = onSelectResult(loc);
      if (outcome.status === 'added') {
        setStatus({ kind: 'added', site: outcome.site });
        setQuery('');
        setRemoteResults([]);
        setIsOpen(false);
        setActiveIndex(-1);
      } else if (outcome.status === 'duplicate') {
        // Subtle "Already added" state — the existing candidate is highlighted
        // in the list; nothing new is created.
        setStatus({ kind: 'duplicate', site: outcome.existing });
        setIsOpen(false);
        setActiveIndex(-1);
      } else {
        // Outside the analysis area: REJECTED (never clamped). Show the message
        // with the option to move the AOI or choose another result — the
        // results stay available for an immediate retry.
        setStatus({ kind: 'outside-aoi', loc });
        setIsOpen(true);
        setActiveIndex(-1);
      }
    },
    [onSelectResult],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const action = resolveSearchKeyAction(e.key, activeIndex, results.length);
    if (action.type === 'noop') return;
    e.preventDefault();
    if (action.type === 'highlight') {
      if (!isOpen) setIsOpen(true);
      setActiveIndex(action.index);
    } else if (action.type === 'close') {
      // Escape — close the results without adding anything.
      setIsOpen(false);
      setActiveIndex(-1);
    } else if (action.type === 'select') {
      if (!isOpen) {
        // Enter with the results closed just re-opens them (nothing selected).
        setIsOpen(true);
        setActiveIndex(action.index);
        return;
      }
      selectResult(results[action.index]);
    }
  };

  const localityLine = (loc: NamedLocation): string => {
    const line = [loc.city, loc.state].filter(Boolean).join(', ');
    if (line) return line;
    // Fall back to the display name's locality tail (remote results).
    const tail = (loc.displayName || '').split(',').map((s) => s.trim()).filter(Boolean);
    return tail.slice(1, 3).join(', ') || loc.country || '';
  };

  return (
    <div className="relative" ref={wrapperRef} data-testid="candidate-site-search">
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-dimmed pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id="candidate-site-search-input"
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls="candidate-site-results-list"
          aria-autocomplete="list"
          aria-label="Search a place or address to add as a candidate site"
          aria-activedescendant={
            isOpen && activeIndex >= 0 && results[activeIndex]
              ? `candidate-site-option-${activeIndex}`
              : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
            if (e.target.value.trim()) setStatus(null);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search a place or address…"
          className="w-full bg-surface-elevated border border-border rounded-lg pl-8 pr-8 py-2 min-h-[44px] text-xs text-text-primary placeholder:text-text-dimmed focus:outline-none focus:border-accent-cyan font-sans transition-colors"
          data-testid="candidate-site-search-input"
          autoComplete="off"
        />
        {isSearching ? (
          <span
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-border border-t-accent-cyan rounded-full animate-spin"
            role="status"
            aria-label="Searching places"
          />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setRemoteResults([]);
              setIsOpen(false);
              setActiveIndex(-1);
            }}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[32px] flex items-center justify-center text-text-dimmed hover:text-text-primary text-xs"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* Inline outcome feedback — visible in place, immediately */}
      {status?.kind === 'added' && (
        <div
          className="mt-1.5 flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[11px] border border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300"
          data-testid="candidate-added-confirmation"
          role="status"
        >
          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            Added <span className="font-bold">#{status.site.locationId.replace('SITE-', '')}</span> —{' '}
            {status.site.name}
          </span>
        </div>
      )}
      {status?.kind === 'duplicate' && (
        <div
          className="mt-1.5 flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[11px] border border-accent-cyan/30 text-accent-cyan-text"
          style={{ background: 'var(--accent-cyan-bg)' }}
          data-testid="candidate-already-added"
          role="status"
        >
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            Already added — <span className="font-bold">{status.site.name}</span> is site #
            {status.site.locationId.replace('SITE-', '')}
          </span>
        </div>
      )}
      {status?.kind === 'outside-aoi' && (
        <div
          className="mt-1.5 rounded-lg border border-destructive/40 bg-destructive/[0.06] p-2.5 space-y-2"
          data-testid="candidate-outside-aoi"
          role="alert"
        >
          <div className="flex items-start gap-1.5 text-[11.5px] font-semibold text-destructive">
            <AlertTriangle className="size-3.5 shrink-0 mt-px" aria-hidden="true" />
            <span>Site is outside the analysis area.</span>
          </div>
          <p className="text-[10.5px] text-text-muted leading-relaxed">
            “{status.loc.name.split(' (')[0]}” lies outside the current analysis boundary. The site is
            never moved or clamped into the area — move the analysis area to it, or choose another
            result.
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="candidate-outside-move-aoi-btn"
              onClick={() => {
                const loc = status.loc;
                setStatus(null);
                setQuery('');
                setRemoteResults([]);
                setIsOpen(false);
                setActiveIndex(-1);
                onMoveAoiHere(loc);
              }}
              className="min-h-[36px] px-2.5 rounded-md text-[11px] font-semibold border border-accent-cyan/50 text-accent-cyan hover:bg-accent-cyan/10 transition-colors"
            >
              Move analysis area here
            </button>
            <button
              type="button"
              data-testid="candidate-outside-choose-another-btn"
              onClick={() => {
                setStatus(null);
                setIsOpen(true);
                inputRef.current?.focus();
              }}
              className="min-h-[36px] px-2.5 rounded-md text-[11px] font-medium border border-border text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
            >
              Choose another result
            </button>
          </div>
        </div>
      )}

      {/* Search results dropdown */}
      {isOpen && (
        <div
          id="candidate-site-results-list"
          role="listbox"
          aria-label="Candidate site search results"
          className="absolute z-50 left-0 right-0 mt-1.5 max-h-64 overflow-y-auto overscroll-contain bg-surface-card border border-border rounded-xl shadow-2xl py-1 divide-y divide-border"
        >
          {results.length > 0 ? (
            results.map((loc, idx) => {
              const isFocused = activeIndex === idx;
              const isDup = isDuplicateCandidateResult(existingSites, {
                latitude: loc.latitude,
                longitude: loc.longitude,
              });
              return (
                <button
                  key={`${loc.id}-${idx}`}
                  id={`candidate-site-option-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isFocused}
                  onClick={() => selectResult(loc)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full text-left px-3 py-2.5 min-h-[44px] flex items-start justify-between gap-2 text-xs transition-colors ${
                    isFocused
                      ? 'bg-surface-elevated text-text-primary'
                      : 'text-text-primary hover:bg-surface-elevated'
                  }`}
                  data-testid={`candidate-site-result-${idx}`}
                >
                  <div className="min-w-0">
                    {/* NAME */}
                    <div className="font-bold truncate">{loc.name}</div>
                    {/* address / locality, state */}
                    <div className="text-[10px] text-text-muted truncate mt-0.5">
                      {localityLine(loc)}
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="flex items-center gap-1 justify-end">
                      {loc.resultType && RESULT_TYPE_LABEL[loc.resultType] && (
                        <span
                          className="inline-block px-1 py-px rounded font-mono text-[8px] font-bold uppercase border"
                          style={{
                            color:
                              loc.resultType === 'state' || loc.resultType === 'region'
                                ? '#e11d48'
                                : 'var(--accent-cyan)',
                            borderColor:
                              loc.resultType === 'state' || loc.resultType === 'region'
                                ? 'rgba(225,29,72,0.4)'
                                : 'var(--accent-cyan)',
                          }}
                        >
                          {RESULT_TYPE_LABEL[loc.resultType]}
                        </span>
                      )}
                      {isDup && (
                        <span
                          className="inline-block px-1 py-px rounded font-mono text-[8px] font-bold uppercase border border-accent-cyan/40 text-accent-cyan"
                          style={{ background: 'var(--accent-cyan-bg)' }}
                        >
                          Already added
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-text-dimmed block tnum">
                      {loc.latitude.toFixed(4)}°, {loc.longitude.toFixed(4)}°
                    </span>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="p-3.5 text-xs space-y-1" data-testid="candidate-search-empty-state">
              <p className="text-text-primary font-bold">No places found.</p>
              <p className="text-[11px] text-text-muted leading-relaxed">
                Try a street (“Broadway, New York”), an address (“1 Market St”), or a landmark.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
