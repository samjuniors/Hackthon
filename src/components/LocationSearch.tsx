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
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [showCoords, setShowCoords] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Derive search results directly during render
  const results = query.trim()
    ? searchLocations(query)
    : getPresetLocations(mode === 'FIXTURE');

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
    <div className="space-y-3" ref={wrapperRef}>
      <div className="flex items-center justify-between">
        <label htmlFor="location-search-input" className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <span>📍 Operating Location</span>
        </label>
        <button
          type="button"
          onClick={() => setShowCoords(!showCoords)}
          className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono underline"
        >
          {showCoords ? 'Hide Lat/Lon' : 'Coordinates'}
        </button>
      </div>

      {/* Selected Location Card */}
      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
            <span className="text-xs font-semibold text-white truncate" data-testid="selected-location-name">
              {selectedLocation.name}
            </span>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] font-mono shrink-0 border-cyan-500/40 text-cyan-300 bg-cyan-950/40"
          >
            {selectedLocation.category}
          </Badge>
        </div>

        <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between">
          <span>
            {selectedLocation.latitude.toFixed(4)}°, {selectedLocation.longitude.toFixed(4)}°
          </span>
          {selectedLocation.zipCode && (
            <span className="text-slate-500">ZIP {selectedLocation.zipCode}</span>
          )}
        </div>

        {/* Fixture Mode Limitation Warning */}
        {isSelectedNonDemoInFixture && (
          <div className="p-2 rounded bg-amber-950/60 border border-amber-500/40 text-[11px] text-amber-200 space-y-1">
            <p className="font-semibold">⚠️ Fixture Mode Notice</p>
            <p className="text-[10px] leading-tight text-amber-300/90">
              DEMO mode uses captured Manhattan thermal tiles. To evaluate {selectedLocation.name} with real hyperlocal data, switch to LIVE mode.
            </p>
            {onSwitchToLive && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onSwitchToLive}
                className="mt-1 h-6 px-2 text-[10px] bg-emerald-950 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900"
              >
                Switch to LIVE Mode
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Search Input Box */}
      <div className="relative">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <input
              id="location-search-input"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder={isFixture ? 'Search Manhattan demo sites...' : 'Search city, address, or ZIP code...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500 font-sans"
              data-testid="location-search-input"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLocating}
            onClick={handleUseCurrentLocation}
            title="Use current GPS location"
            className="px-2.5 text-xs border-slate-800 bg-slate-950 text-slate-300 hover:text-cyan-300 hover:border-cyan-500/50"
            data-testid="gps-location-button"
          >
            {isLocating ? '📡 Locating...' : '📍 GPS'}
          </Button>
        </div>

        {gpsError && (
          <p className="text-[10px] text-red-400 mt-1 font-mono">{gpsError}</p>
        )}

        {/* Search Results Dropdown */}
        {isOpen && (
          <div className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-slate-900 border border-slate-700 rounded-md shadow-2xl shadow-black/80 py-1 divide-y divide-slate-800">
            {results.length > 0 ? (
              results.map((loc) => {
                const isSelected = selectedLocation.id === loc.id;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      onSelectLocation(loc);
                      setIsOpen(false);
                      setQuery('');
                    }}
                    className={`w-full text-left px-3 py-2 hover:bg-slate-800 flex items-start justify-between gap-2 text-xs ${
                      isSelected ? 'bg-cyan-950/40 text-cyan-200' : 'text-slate-200'
                    }`}
                    data-testid={`location-option-${loc.id}`}
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{loc.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {loc.description || loc.displayName}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono text-slate-400 block">
                        {loc.latitude.toFixed(2)}°, {loc.longitude.toFixed(2)}°
                      </span>
                      {loc.isDemoOnly && (
                        <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-300">
                          Demo Only
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-xs text-slate-400 italic">
                No matching locations found. You can enter coordinates below.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Preset Location Chips */}
      <div className="space-y-1.5 pt-1">
        <span className="text-[10px] font-mono text-slate-400 block">
          {isFixture ? 'Demo Captured Sites:' : 'Quick Metropolitan Hubs:'}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {(isFixture
            ? METROPOLITAN_LOCATIONS.filter((l) => l.isDemoOnly)
            : METROPOLITAN_LOCATIONS.filter((l) => !l.isDemoOnly).slice(0, 5)
          ).map((loc) => {
            const isSelected = selectedLocation.id === loc.id;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => onSelectLocation(loc)}
                className={`px-2 py-1 rounded text-[10px] font-mono transition-colors ${
                  isSelected
                    ? 'bg-cyan-600 text-white font-bold'
                    : 'bg-slate-950 border border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
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
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
          <div>
            <label htmlFor="manual-lat-input" className="text-[10px] font-mono text-slate-400 block">Latitude</label>
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
              className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>
          <div>
            <label htmlFor="manual-lon-input" className="text-[10px] font-mono text-slate-400 block">Longitude</label>
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
              className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      )}
    </div>
  );
}
