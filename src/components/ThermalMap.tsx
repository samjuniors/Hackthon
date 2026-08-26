'use client';

import { useEffect, useRef, useState } from 'react';
import { Map, Marker, Popup, type GeoJSONSource } from 'maplibre-gl';
import type { LocationPoint, PolygonAOI, CandidateLocation } from '@/types/domain';
import { useTheme } from '@/components/ThemeProvider';
import {
  type TempUnit,
  DEFAULT_TEMP_UNIT,
  getThermalLegendTicks,
  tempUnitSuffix,
} from '@/lib/temperature';

import type { FeatureCollection } from 'geojson';

// Minimal inline type for MapLibre GeoJSON source data casts.
type GeoJSONFC = FeatureCollection;

interface ThermalMapProps {
  /** User-selected analysis center. Used for fallback fit + marker. */
  location: LocationPoint;
  /**
   * Canonical Analysis AOI — the EXACT geometry sent to FortyGuard.
   * Rendered as the visible AOI boundary on the map. Source of truth:
   * src/lib/spatial/aoi.ts createBoundingAOI(). Built client-side in page.tsx
   * and passed to BOTH this map AND /api/decision so visible == requested.
   */
  analysisAoi: PolygonAOI | null;
  /**
   * FortyGuard thermal field — REAL feature collection (no fabrication).
   * DEMO = captured 3 Manhattan cells. LIVE = whatever FortyGuard returns.
   * Rendered as filled polygons below the AOI boundary.
   */
  spatialField: PolygonAOI | null;
  selectedTileId?: string | number;
  candidates?: CandidateLocation[];
  recommendedLocationId?: string;
  unit?: TempUnit;
}

/** Empty FeatureCollection sentinel for source initialization / clear. */
const EMPTY_FC: GeoJSONFC = { type: 'FeatureCollection', features: [] };

/** Extract a flat [lng, lat] list from a Polygon or MultiPolygon geometry. */
function extractCoords(geometry: { type: string; coordinates: unknown }): [number, number][] {
  const pts: [number, number][] = [];
  if (geometry.type === 'Polygon') {
    for (const ring of (geometry.coordinates as number[][][])) {
      for (const [lng, lat] of ring) {
        if (Number.isFinite(lng) && Number.isFinite(lat)) pts.push([lng, lat]);
      }
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of (geometry.coordinates as number[][][][])) {
      for (const ring of poly) {
        for (const [lng, lat] of ring) {
          if (Number.isFinite(lng) && Number.isFinite(lat)) pts.push([lng, lat]);
        }
      }
    }
  }
  return pts;
}

/**
 * Compute bounding box covering the canonical AOI, thermal field, candidates,
 * and the selected location (with a small perimeter so the marker is always
 * visible even when no AOI/thermal data has arrived yet).
 */
function computeBounds(
  analysisAoi: PolygonAOI | null,
  spatialField: PolygonAOI | null,
  candidateLocs: LocationPoint[],
  targetLoc: LocationPoint,
): [[number, number], [number, number]] | null {
  const allPts: [number, number][] = [];

  // AOI vertices (highest priority — defines the analysis area)
  if (analysisAoi && analysisAoi.features.length > 0) {
    for (const f of analysisAoi.features) {
      allPts.push(...extractCoords(f.geometry as { type: string; coordinates: unknown }));
    }
  }

  // Thermal field vertices (so cells are framed even if they extend past the AOI)
  if (spatialField && spatialField.features.length > 0) {
    for (const f of spatialField.features) {
      allPts.push(...extractCoords(f.geometry as { type: string; coordinates: unknown }));
    }
  }

  // Candidate coordinates
  for (const { longitude, latitude } of candidateLocs) {
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      allPts.push([longitude, latitude]);
    }
  }

  // Always include the target location with a small perimeter so the marker
  // is visible even when no AOI/thermal data has arrived yet.
  if (Number.isFinite(targetLoc.longitude) && Number.isFinite(targetLoc.latitude)) {
    allPts.push([targetLoc.longitude - 0.004, targetLoc.latitude - 0.003]);
    allPts.push([targetLoc.longitude + 0.004, targetLoc.latitude + 0.003]);
  }

  if (allPts.length === 0) return null;

  let minLng = allPts[0][0], maxLng = allPts[0][0];
  let minLat = allPts[0][1], maxLat = allPts[0][1];
  for (const [lng, lat] of allPts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const padLng = Math.max(0.003, (maxLng - minLng) * 0.18);
  const padLat = Math.max(0.003, (maxLat - minLat) * 0.18);

  return [
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ];
}

/** Return true if the spatial field contains at least one feature with a valid temperature. */
function hasRenderableTemperatureData(aoi: PolygonAOI | null | undefined): boolean {
  return !!aoi && aoi.features.some((f) =>
    Number.isFinite(Number(f.properties?.average_temperature))
  );
}

export function ThermalMap({
  location,
  analysisAoi,
  spatialField,
  selectedTileId,
  candidates,
  recommendedLocationId,
  unit = DEFAULT_TEMP_UNIT,
}: ThermalMapProps) {
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);

  // ─────────────────────────────────────────────────────────────────────
  // Mount effect — create the MapLibre Map ONCE per theme change.
  //
  // The Map instance is NOT recreated when location / spatialField / analysisAoi
  // / candidates / recommendedLocationId change. Those updates flow through
  // source.setData() and Marker#remove() + new Marker() in the effects below.
  //
  // Theme change is the only legitimate reason to recreate the Map: the
  // basemap raster tile URL is part of the source definition and swapping it
  // mid-flight causes visual glitches. Theme change is user-initiated and
  // infrequent, so recreation is acceptable. The data effects re-apply
  // thermal/AOI/marker state after the new map reports `mapReady=true`.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const isDark = theme === 'dark';

    // Validate center coordinates (defensive — page.tsx validates too)
    const isValidLat = Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90;
    const isValidLon = Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
    const centerLng = isValidLon ? location.longitude : -74.008;
    const centerLat = isValidLat ? location.latitude : 40.712;

    const baseTiles = isDark
      ? [
          'https://a.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}@2x.png',
        ]
      : [
          'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
        ];

    const labelTiles = isDark
      ? [
          'https://a.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}@2x.png',
        ]
      : [
          'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
        ];

    // AOI outline color: white in dark mode, slate-900 in light mode.
    // Chosen because it is NOT in the thermal color ramp (cyan→emerald→yellow
    // →orange→rose→purple), so the AOI boundary stays distinguishable from any
    // thermal cell color underneath it.
    const aoiOutlineColor = isDark ? '#ffffff' : '#0f172a';
    const aoiFillColor = isDark ? '#ffffff' : '#0f172a';

    const map = new Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        // ALL sources (raster + geojson) are pre-defined in the style so
        // MapLibre establishes worker connections for the geojson sources
        // during style loading. Calling addSource() AFTER load resulted in
        // the source's worker connection never being established (dispatcher
        // and actor were undefined), so polygons never rendered.
        sources: {
          'carto-base': {
            type: 'raster',
            tiles: baseTiles,
            tileSize: 256,
            attribution: '© CartoDB © OpenStreetMap',
          },
          'carto-labels': {
            type: 'raster',
            tiles: labelTiles,
            tileSize: 256,
          },
          // Thermal field source — populated via setData() in the data effect.
          'thermal-tiles': {
            type: 'geojson',
            data: EMPTY_FC,
          },
          // Canonical AOI source — populated via setData() in the data effect.
          // Same geometry as sent to FortyGuard.
          'analysis-aoi': {
            type: 'geojson',
            data: EMPTY_FC,
          },
        },
        layers: [
          // 1. Basemap
          {
            id: 'carto-base-layer',
            type: 'raster',
            source: 'carto-base',
            minzoom: 0,
            maxzoom: 22,
            paint: { 'raster-opacity': isDark ? 0.95 : 0.92 },
          },
          // 2. Thermal field (real FortyGuard polygons — below AOI boundary)
          {
            id: 'thermal-tiles-fill',
            type: 'fill',
            source: 'thermal-tiles',
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['to-number', ['get', 'average_temperature'], 25],
                18, '#00d4ff',
                22, '#00e5a3',
                25, '#10b981',
                28, '#84cc16',
                30, '#facc15',
                32, '#fb923c',
                34, '#f43f5e',
                37, '#e11d48',
                40, '#9333ea',
              ],
              'fill-opacity': isDark ? 0.82 : 0.72,
            },
          },
          {
            id: 'thermal-tiles-outline',
            type: 'line',
            source: 'thermal-tiles',
            paint: {
              'line-color': [
                'interpolate',
                ['linear'],
                ['to-number', ['get', 'average_temperature'], 25],
                18, '#0284c7',
                25, '#047857',
                30, '#ca8a04',
                34, '#be123c',
                40, '#6b21a8',
              ],
              'line-width': 1.5,
              'line-opacity': 0.9,
            },
          },
          // 3. AOI boundary (translucent fill + crisp dashed outline)
          {
            id: 'aoi-fill',
            type: 'fill',
            source: 'analysis-aoi',
            paint: {
              'fill-color': aoiFillColor,
              'fill-opacity': 0.06,
            },
          },
          {
            id: 'aoi-outline',
            type: 'line',
            source: 'analysis-aoi',
            paint: {
              'line-color': aoiOutlineColor,
              'line-width': 2.5,
              'line-dasharray': [4, 2],
              'line-opacity': 0.9,
            },
          },
          // 4. Labels on top of all map layers (DOM markers float above by default)
          {
            id: 'carto-labels-layer',
            type: 'raster',
            source: 'carto-labels',
            paint: { 'raster-opacity': isDark ? 0.92 : 1.0 },
          },
        ],
      },
      center: [centerLng, centerLat],
      zoom: 14,
    });

    mapRef.current = map;

    // Debug: expose map instance for inspection.
    if (typeof window !== 'undefined') {
      (window as unknown as { __thermalMap?: unknown }).__thermalMap = map;
    }

    // The 'load' event fires when the map is FULLY ready — style parsed +
    // first frame rendered + worker connected to all sources. We use 'load'
    // (not 'style.load') because 'style.load' fires before the worker has
    // connected to the geojson sources, causing setData() to silently no-op.
    // Fallback to 'style.load' + delay if 'load' never fires (slow tiles).
    const markReady = () => {
      if (mapContainerRef.current) {
        mapContainerRef.current.dataset.mapLoadFired = 'true';
        mapContainerRef.current.dataset.mapLoadTime = String(Date.now());
      }
      setMapReady(true);
    };

    if (map.isStyleLoaded()) {
      markReady();
    } else {
      map.once('load', markReady);
      // Fallback: if 'load' hasn't fired after style.load + 800ms, mark ready
      // anyway so the data effect can attempt setData (the source's worker
      // connection should be established by then).
      map.once('style.load', () => {
        setTimeout(() => {
          if (!mapContainerRef.current?.dataset?.mapLoadFired) {
            markReady();
          }
        }, 800);
      });
    }

    // Debug: catch any error events.
    map.on('error', (e) => {
      if (mapContainerRef.current) {
        mapContainerRef.current.dataset.mapError = String(
          (mapContainerRef.current.dataset.mapError || '') + '|' + (e?.error?.message || String(e?.type || 'unknown'))
        ).slice(0, 500);
      }
    });
    if (mapContainerRef.current) {
      mapContainerRef.current.dataset.mapCreated = 'true';
      mapContainerRef.current.dataset.mapCreatedTime = String(Date.now());
    }

    // Cleanup: clear markers + remove map. Only runs on theme change or unmount.
    return () => {
      if (mapContainerRef.current) {
        mapContainerRef.current.dataset.mapCleanup = 'true';
        mapContainerRef.current.dataset.mapCleanupTime = String(Date.now());
      }
      for (const m of markersRef.current) {
        try { m.remove(); } catch { /* safe */ }
      }
      markersRef.current = [];
      try { map.remove(); } catch { /* safe */ }
      mapRef.current = null;
      setMapReady(false);
    };
  }, [theme]);

  // ─────────────────────────────────────────────────────────────────────
  // Data effect — update thermal + AOI GeoJSON sources via setData().
  //
  // Runs whenever mapReady transitions true, or spatialField / analysisAoi
  // change. Does NOT recreate the Map. The `mapReady` flag already gates on
  // map readiness (load / style.load fired).
  //
  // Retry mechanism: if the source's worker connection (actor/dispatcher)
  // isn't established yet when setData is called, the data is silently
  // dropped and no tiles are generated. We detect this by checking the
  // source's internal `actor` property and retry via a short setTimeout.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapContainerRef.current) {
      mapContainerRef.current.dataset.dataEffectRan = String(
        Number(mapContainerRef.current.dataset.dataEffectRan || 0) + 1
      );
      mapContainerRef.current.dataset.dataEffectMapReady = String(mapReady);
      mapContainerRef.current.dataset.dataEffectHasField = String(!!spatialField && hasRenderableTemperatureData(spatialField));
      mapContainerRef.current.dataset.dataEffectHasAoi = String(!!analysisAoi);
    }
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const applyData = (attempt: number) => {
      if (cancelled) return;
      if (attempt > 8) {
        // Give up after ~7s of retries (8 attempts × 200ms × 4 + initial)
        if (mapContainerRef.current) {
          mapContainerRef.current.dataset.dataEffectGaveUp = 'true';
        }
        return;
      }

      // Thermal field
      const thermalSource = map.getSource('thermal-tiles') as GeoJSONSource | undefined;
      const aoiSource = map.getSource('analysis-aoi') as GeoJSONSource | undefined;

      // Check if the sources have worker connections (internal `actor` property).
      // If not, the worker hasn't connected yet — retry after a short delay.
      const thermalActor = (thermalSource as unknown as { actor?: unknown })?.actor;
      const aoiActor = (aoiSource as unknown as { actor?: unknown })?.actor;

      if (mapContainerRef.current) {
        mapContainerRef.current.dataset.dataEffectAttempt = String(attempt);
        mapContainerRef.current.dataset.dataEffectThermalActor = String(!!thermalActor);
        mapContainerRef.current.dataset.dataEffectAoiActor = String(!!aoiActor);
      }

      // Set the data regardless — setData is safe to call even if the worker
      // isn't connected yet; MapLibre queues it. But we retry to ensure it
      // actually gets processed.
      if (thermalSource) {
        const thermalData = (spatialField && hasRenderableTemperatureData(spatialField)
          ? spatialField
          : EMPTY_FC) as unknown as GeoJSONFC;
        try {
          thermalSource.setData(thermalData);
          if (mapContainerRef.current) {
            mapContainerRef.current.dataset.dataEffectThermalSet = 'true';
            mapContainerRef.current.dataset.dataEffectThermalFeatures = String(
              (spatialField && hasRenderableTemperatureData(spatialField))
                ? spatialField!.features.length
                : 0
            );
          }
        } catch (e) {
          if (mapContainerRef.current) {
            mapContainerRef.current.dataset.dataEffectThermalErr = String(e);
          }
        }
      } else {
        if (mapContainerRef.current) {
          mapContainerRef.current.dataset.dataEffectThermalSourceMissing = 'true';
        }
      }

      // Canonical AOI (the EXACT geometry sent to FortyGuard)
      if (aoiSource) {
        const aoiData = (analysisAoi ?? EMPTY_FC) as unknown as GeoJSONFC;
        try {
          aoiSource.setData(aoiData);
          if (mapContainerRef.current) {
            mapContainerRef.current.dataset.dataEffectAoiSet = 'true';
          }
        } catch (e) {
          if (mapContainerRef.current) {
            mapContainerRef.current.dataset.dataEffectAoiErr = String(e);
          }
        }
      } else {
        if (mapContainerRef.current) {
          mapContainerRef.current.dataset.dataEffectAoiSourceMissing = 'true';
        }
      }

      // If either source lacks a worker connection, retry after a delay.
      if (!thermalActor || !aoiActor) {
        setTimeout(() => applyData(attempt + 1), 300 * attempt);
      }
    };

    applyData(0);

    return () => {
      cancelled = true;
    };
  }, [mapReady, spatialField, analysisAoi]);

  // ─────────────────────────────────────────────────────────────────────
  // Markers effect — clear old markers + add new ones.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Debug: surface effect entry on the container so we can verify via DOM
    if (mapContainerRef.current) {
      mapContainerRef.current.dataset.markerEffectRan = String(
        Number(mapContainerRef.current.dataset.markerEffectRan || 0) + 1
      );
      mapContainerRef.current.dataset.markerEffectMapReady = String(mapReady);
      mapContainerRef.current.dataset.markerEffectCandidateCount = String(candidates?.length ?? 0);
    }

    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    // Clear previous markers
    for (const m of markersRef.current) {
      try { m.remove(); } catch { /* safe */ }
    }
    markersRef.current = [];

    const isDark = theme === 'dark';

    const locsToRender: Array<{
      id: string; name: string; loc: LocationPoint; isWinner: boolean;
    }> = candidates && candidates.length > 0
      ? candidates.map((c) => ({
          id: c.locationId,
          name: c.name,
          loc: c.location,
          isWinner: c.locationId === recommendedLocationId,
        }))
      : [
          // No candidates yet — show a neutral marker at the selected analysis center
          // so the user sees where they are looking before generating the thermal field.
          { id: 'analysis-center', name: 'Selected Analysis Area', loc: location, isWinner: false },
        ];

    for (const item of locsToRender) {
      if (
        !Number.isFinite(item.loc.latitude) || item.loc.latitude < -90 || item.loc.latitude > 90 ||
        !Number.isFinite(item.loc.longitude) || item.loc.longitude < -180 || item.loc.longitude > 180
      ) {
        continue;
      }

      const el = document.createElement('div');

      if (item.isWinner) {
        // Recommended marker — hot-pink with animated pulse ring (high contrast in both themes)
        el.style.cssText = [
          'position:relative',
          'width:40px',
          'height:40px',
          'cursor:pointer',
          'z-index:30',
        ].join(';');
        el.innerHTML = `
          <span style="
            position:absolute;inset:0;border-radius:50%;
            background:rgba(236,72,153,0.35);
            animation:map-marker-pulse 2s ease-in-out infinite;
          "></span>
          <span style="
            position:absolute;inset:4px;border-radius:50%;
            background:#ec4899;
            border:3px solid #ffffff;
            box-shadow:0 0 16px rgba(236,72,153,0.95),0 2px 8px rgba(0,0,0,0.6);
          "></span>
        `;
      } else {
        // Candidate marker — neutral dot with theme-aware fill + dark border
        el.style.cssText = [
          'width:22px',
          'height:22px',
          'background:' + (isDark ? '#0f172a' : '#ffffff'),
          'border:2.5px solid ' + (isDark ? '#cbd5e1' : '#0f172a'),
          'border-radius:50%',
          'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
          'cursor:pointer',
          'z-index:20',
        ].join(';');
      }

      const popup = new Popup({ offset: 20, closeButton: false }).setHTML(`
        <div style="
          background:${isDark ? '#0f172a' : '#ffffff'};
          border:1px solid ${isDark ? 'rgba(30,45,69,0.9)' : 'rgba(226,232,240,0.9)'};
          border-radius:8px;
          padding:8px 12px;
          min-width:160px;
          font-family:system-ui,sans-serif;
          box-shadow:0 4px 16px rgba(0,0,0,0.25);
        ">
          <div style="
            color:${item.isWinner ? '#ec4899' : isDark ? '#94a3b8' : '#64748b'};
            font-weight:700;
            font-size:10px;
            margin-bottom:3px;
            letter-spacing:0.05em;
            text-transform:uppercase;
          ">${item.isWinner ? '★ Recommended Site' : 'Candidate Site'}</div>
          <div style="color:${isDark ? '#f1f5f9' : '#0f172a'};font-size:13px;font-weight:700;">${item.name.split(' (')[0]}</div>
        </div>
      `);

      const marker = new Marker({ element: el })
        .setLngLat([item.loc.longitude, item.loc.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    }

    // Debug: record how many markers we attempted to add
    if (mapContainerRef.current) {
      mapContainerRef.current.dataset.markerEffectAdded = String(markersRef.current.length);
    }
  }, [mapReady, candidates, recommendedLocationId, location, theme]);

  // ─────────────────────────────────────────────────────────────────────
  // FitBounds effect — re-fit the viewport when the analysis area changes.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    const bounds = computeBounds(
      analysisAoi,
      spatialField,
      (candidates ?? []).map((c) => c.location),
      location,
    );
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: 45, maxZoom: 15, duration: 600 });
      } catch { /* safe — map may be mid-transition */ }
    }
  }, [mapReady, location, analysisAoi, spatialField, candidates]);

  const legendTicks = getThermalLegendTicks(unit);

  return (
    <div
      role="region"
      aria-label="Hyperlocal thermal context map showing FortyGuard surface temperature tiles, the selected analysis area, candidate sites, and the recommended site"
      className="relative w-full h-[420px] sm:h-[480px] lg:h-[520px] rounded-xl overflow-hidden shadow-2xl shadow-black/40 border border-border"
    >
      {/* Map canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Marker pulse keyframe */}
      <style>{`
        @keyframes map-marker-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      {/* Thermal legend — bottom-left overlay */}
      <div
        className="absolute bottom-3 left-3 bg-surface-card/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-xl border border-border"
        data-testid="map-legend-ticks"
      >
        <div
          className="text-[10px] font-bold text-text-dimmed uppercase tracking-wider mb-1.5"
          data-testid="map-legend-header"
        >
          Thermal Scale ({tempUnitSuffix(unit)})
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {legendTicks.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-sm inline-block flex-shrink-0 shadow-sm"
                style={{ background: color }}
              />
              <span className="text-text-primary font-mono font-medium" style={{ fontSize: '10px' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Analysis Area indicator — top-left badge (replaces "FortyGuard Operational AOI") */}
      <div className="absolute top-3 left-3 bg-surface-card/95 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-lg border border-border flex items-center gap-2">
        <span
          className="inline-block flex-shrink-0"
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '2px',
            border: `2px dashed ${theme === 'dark' ? '#ffffff' : '#0f172a'}`,
            backgroundColor: theme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
          }}
        />
        <span className="text-[10px] font-bold text-text-primary uppercase tracking-wide">
          Selected Analysis Area
        </span>
      </div>

      {/* Selected tile badge — top-right */}
      {selectedTileId && (
        <div className="absolute top-3 right-3 bg-surface-card/95 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-lg border border-accent-cyan/30">
          <span className="text-[10px] text-text-muted">Active Tile: </span>
          <span className="text-xs font-mono font-bold text-accent-cyan">
            {selectedTileId}
          </span>
        </div>
      )}

      {/* Source attribution */}
      <div className="absolute bottom-3 right-3 bg-surface-card/85 backdrop-blur-sm px-2.5 py-1 rounded-md border border-border">
        <span className="text-[9px] text-text-dimmed font-mono uppercase tracking-wide">
          FortyGuard Hyperlocal Thermal
        </span>
      </div>

      {/* Empty state overlay (shown only when no spatialField AND no AOI) */}
      {!spatialField && !analysisAoi && !location && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-surface-card/95 backdrop-blur-md px-5 py-3 rounded-xl text-center border border-border shadow-lg">
            <p className="text-text-muted text-sm">
              Select a location to render the thermal field
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThermalMap;
