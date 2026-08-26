'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { NamedLocation } from '@/types/provider';
import type { DataSourceMode } from '@/types/provenance';
import {
  searchLocations,
  getPresetLocations,
  resolveLocationPoint,
  METROPOLITAN_LOCATIONS,
} from '@/lib/location/search';

interface LocationSearchProps {
  selectedLocation: NamedLocation;
  mode: DataSourceMode;
  onSelectLocation: (loc: NamedLocation) => void;
  onSwitchToLive?: () => void;
}

export function LocationSearch({
  selectedLocation,
  mode,
  onSelectLocation,
  onSwitchToLive,
}: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [remoteResults, setRemoteResults] = useState<NamedLocation[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showCoords, setShowCoords] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Derive instant local results
  const localResults = query.trim()
    ? searchLocations(query)
    : getPresetLocations(mode === 'FIXTURE');

  // Debounced remote geocoding fetch for arbitrary global addresses and landmarks
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 2) {
      return;
    }

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
            setRemoteResults(data.results);
          }
        }
      } catch {
        // Ignore aborts
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  // Merge results: use remote if available and query is active, otherwise local catalog
  const results = query.trim().length >= 2 && remoteResults.length > 0 ? remoteResults : localResults;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUseCurrentLocation = () => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const resolved = resolveLocationPoint(lat, lon, 'My Current GPS Location');
        onSelectLocation(resolved);
        setIsOpen(false);
        setQuery('');
      },
      (error) => {
        setIsLocating(false);
        setGpsError(`Unable to retrieve GPS coordinates: ${error.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const isFixture = mode === 'FIXTURE';
  const isSelectedNonDemoInFixture = isFixture && !selectedLocation.isDemoOnly;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label htmlFor="location-search-input" className="text-xs font-bold text-text-primary flex items-center gap-1.5">
          <span>📍 Operating Location</span>
        </label>
        <button
          type="button"
          onClick={() => setShowCoords(!showCoords)}
          className="text-[10px] text-accent-cyan hover:underline font-mono"
        >
          {showCoords ? 'Hide Lat/Lon' : 'Coordinates'}
        </button>
      </div>

      {/* Selected Location Card */}
      <div className="bg-surface-deep p-3 rounded-xl border border-border space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-cyan shrink-0" />
            <span className="text-xs font-bold text-text-primary truncate" data-testid="selected-location-name">
              {selectedLocation.name}
            </span>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] font-mono shrink-0 border-accent-cyan/40 text-accent-cyan bg-accent-cyan-bg"
          >
            {selectedLocation.category}
          </Badge>
        </div>

        <div className="text-[11px] font-mono text-text-muted flex items-center justify-between">
          <span>
            {selectedLocation.latitude.toFixed(4)}°, {selectedLocation.longitude.toFixed(4)}°
          </span>
          {selectedLocation.zipCode && (
            <span className="text-text-dimmed">ZIP {selectedLocation.zipCode}</span>
          )}
        </div>

        {/* Fixture Mode Limitation Warning */}
        {isSelectedNonDemoInFixture && (
          <div className="p-2.5 rounded-lg bg-accent-amber-bg border border-accent-amber/40 text-[11px] text-accent-amber-text space-y-1 mt-2">
            <p className="font-bold text-accent-amber">⚠️ Fixture Mode Notice</p>
            <p className="text-[10px] leading-tight opacity-90">
              DEMO mode uses captured Manhattan thermal tiles. To evaluate {selectedLocation.name} with real FortyGuard data, switch to LIVE mode.
            </p>
            {onSwitchToLive && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onSwitchToLive}
                className="mt-1 h-6 px-2 text-[10px] bg-accent-emerald text-white border-none hover:opacity-90"
              >
                Switch to LIVE Mode
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Search Input Box with Relative Dropdown Wrapper */}
      <div className="relative" ref={wrapperRef}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              id="location-search-input"
              type="text"
              role="combobox"
              aria-expanded={isOpen}
              aria-haspopup="listbox"
              aria-controls="location-results-list"
              aria-autocomplete="list"
              aria-activedescendant={
                activeIndex >= 0 && results[activeIndex]
                  ? `location-option-${results[activeIndex].id}`
                  : undefined
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setIsOpen(false);
                  setActiveIndex(-1);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (!isOpen) {
                    setIsOpen(true);
                  }
                  if (results.length > 0) {
                    setActiveIndex((prev) => (prev + 1) % results.length);
                  }
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (results.length > 0) {
                    setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
                  }
                } else if (e.key === 'Enter') {
                  if (isOpen && activeIndex >= 0 && results[activeIndex]) {
                    e.preventDefault();
                    onSelectLocation(results[activeIndex]);
                    setIsOpen(false);
                    setQuery('');
                    setActiveIndex(-1);
                  }
                }
              }}
              placeholder={isFixture ? 'Search Manhattan demo sites…' : 'Search metro area (e.g. Los Angeles)…'}
              className="w-full bg-surface-deep border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-dimmed focus:outline-none focus:border-accent-cyan font-sans transition-colors"
              data-testid="location-search-input"
            />
            {isSearching ? (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-border border-t-accent-cyan rounded-full animate-spin" />
            ) : query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setRemoteResults([]);
                  setIsOpen(false);
                  setActiveIndex(-1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-dimmed hover:text-text-primary text-xs"
              >
                ✕
              </button>
            ) : null}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLocating}
            onClick={handleUseCurrentLocation}
            title="Use current GPS location"
            className="px-3 text-xs border-border bg-surface-elevated text-text-secondary hover:text-accent-cyan hover:border-accent-cyan min-h-[36px] rounded-lg transition-colors"
            data-testid="gps-location-button"
          >
            {isLocating ? '📡 Locating…' : '📍 GPS'}
          </Button>
        </div>

        {gpsError && (
          <p className="text-[10px] text-accent-red mt-1 font-mono">{gpsError}</p>
        )}

        {/* Search Results Dropdown */}
        {isOpen && (
          <div
            id="location-results-list"
            role="listbox"
            aria-label="Location suggestions"
            className="absolute z-50 left-0 right-0 mt-1.5 max-h-64 overflow-y-auto bg-surface-card border border-border rounded-xl shadow-2xl py-1 divide-y divide-border"
          >
            {results.length > 0 ? (
              results.map((loc, idx) => {
                const isSelected = selectedLocation.id === loc.id;
                const isFocused = activeIndex === idx;
                return (
                  <button
                    key={loc.id}
                    id={`location-option-${loc.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelectLocation(loc);
                      setIsOpen(false);
                      setQuery('');
                      setActiveIndex(-1);
                    }}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`w-full text-left px-3.5 py-2.5 flex items-start justify-between gap-2 text-xs transition-colors ${
                      isFocused
                        ? 'bg-surface-elevated text-text-primary'
                        : isSelected
                        ? 'bg-accent-cyan-bg text-accent-cyan-text'
                        : 'text-text-primary hover:bg-surface-elevated'
                    }`}
                    data-testid={`location-option-${loc.id}`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold truncate">{loc.name}</div>
                      <div className="text-[10px] text-text-muted truncate mt-0.5">
                        {loc.description || loc.displayName}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono text-text-dimmed block">
                        {loc.latitude.toFixed(2)}°, {loc.longitude.toFixed(2)}°
                      </span>
                      {loc.isDemoOnly && (
                        <Badge variant="outline" className="text-[9px] border-accent-amber/40 text-accent-amber bg-accent-amber-bg mt-0.5">
                          Demo Only
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="p-3.5 text-xs space-y-2 bg-surface-card" data-testid="location-search-empty-state">
                <p className="text-text-primary font-bold">No matching supported metro area found.</p>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Search supports curated US metropolitan operational hubs (NYC, LA, SF, San Diego, Chicago, Phoenix, Austin, Miami, etc.).
                </p>
                <div className="pt-1 flex items-center gap-2 flex-wrap">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleUseCurrentLocation}
                    disabled={isLocating}
                    className="h-7 text-xs bg-surface-elevated border-border text-accent-cyan hover:bg-surface-deep"
                  >
                    {isLocating ? '📡 Locating…' : '📍 Use My GPS Location'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCoords(true);
                      setIsOpen(false);
                    }}
                    className="text-[11px] text-text-muted hover:text-text-primary underline font-mono"
                  >
                    Enter Coordinates
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preset Location Chips */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-wider text-text-dimmed">
            Metropolitan Hubs
          </label>
          <span className="text-[10px] text-accent-cyan font-mono font-medium">1-Click Select</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {METROPOLITAN_LOCATIONS.map((loc) => {
            const isSelected = selectedLocation.id === loc.id;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onSelectLocation(loc);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-accent-cyan text-white shadow-md font-bold ring-1 ring-accent-cyan'
                    : 'bg-surface-deep border border-border text-text-secondary hover:border-accent-cyan/50 hover:text-text-primary hover:bg-surface-elevated'
                }`}
                data-testid={`preset-chip-${loc.id}`}
              >
                {loc.name.split(' (')[0].replace(', USA', '')}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expandable Manual Coordinate Inputs */}
      {showCoords && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
          <div>
            <label htmlFor="manual-lat-input" className="text-[10px] font-mono text-text-muted block">Latitude</label>
            <input
              id="manual-lat-input"
              type="number"
              step="0.0001"
              value={selectedLocation.latitude}
              onChange={(e) => {
                const lat = parseFloat(e.target.value);
                if (!isNaN(lat)) {
                  onSelectLocation(
                    resolveLocationPoint(lat, selectedLocation.longitude, 'Custom Coordinates')
                  );
                }
              }}
              className="w-full mt-0.5 bg-surface-deep border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-cyan"
            />
          </div>
          <div>
            <label htmlFor="manual-lon-input" className="text-[10px] font-mono text-text-muted block">Longitude</label>
            <input
              id="manual-lon-input"
              type="number"
              step="0.0001"
              value={selectedLocation.longitude}
              onChange={(e) => {
                const lon = parseFloat(e.target.value);
                if (!isNaN(lon)) {
                  onSelectLocation(
                    resolveLocationPoint(selectedLocation.latitude, lon, 'Custom Coordinates')
                  );
                }
              }}
              className="w-full mt-0.5 bg-surface-deep border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary font-mono focus:outline-none focus:border-accent-cyan"
            />
          </div>
        </div>
      )}
    </div>
  );
}
