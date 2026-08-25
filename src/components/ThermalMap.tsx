'use client';

import { useEffect, useRef } from 'react';
import { Map, Marker, Popup, type GeoJSONSource } from 'maplibre-gl';
import type { LocationPoint, PolygonAOI, CandidateLocation } from '@/types/domain';

// Minimal inline type for MapLibre GeoJSON source data casts.
type GeoJSONFC = { type: 'FeatureCollection'; features: unknown[] };
import {
  type TempUnit,
  DEFAULT_TEMP_UNIT,
  getThermalLegendTicks,
  tempUnitSuffix,
} from '@/lib/temperature';

interface ThermalMapProps {
  location: LocationPoint;
  spatialField: PolygonAOI | null;
  selectedTileId?: string | number;
  candidates?: CandidateLocation[];
  recommendedLocationId?: string;
  unit?: TempUnit;
}

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
 * Compute a tight bounding box covering the spatial field features AND all
 * candidate marker locations, padded by a small delta so edge markers aren't clipped.
 */
function computeBounds(
  spatialField: PolygonAOI | null,
  candidateLocs: LocationPoint[],
): [[number, number], [number, number]] | null {
  const allPts: [number, number][] = [];

  if (spatialField) {
    for (const f of spatialField.features) {
      allPts.push(...extractCoords(f.geometry as { type: string; coordinates: unknown }));
    }
  }
  for (const { longitude, latitude } of candidateLocs) {
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      allPts.push([longitude, latitude]);
    }
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

  // Small padding so markers on the edge stay fully inside the viewport
  const padLng = Math.max(0.003, (maxLng - minLng) * 0.15);
  const padLat = Math.max(0.003, (maxLat - minLat) * 0.15);

  return [
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ];
}

/** Return true if the spatial field contains at least one feature with a valid temperature. */
function hasRenderableTemperatureData(aoi: PolygonAOI): boolean {
  return aoi.features.some((f) =>
    Number.isFinite(Number(f.properties?.average_temperature))
  );
}

export function ThermalMap({
  location,
  spatialField,
  selectedTileId,
  candidates,
  recommendedLocationId,
  unit = DEFAULT_TEMP_UNIT,
}: ThermalMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance    = useRef<Map | null>(null);
  const markersRef     = useRef<Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current) return;

    // ── Clean up previous markers ────────────────────────────────────────────
    for (const m of markersRef.current) {
      try { m.remove(); } catch { /* safe */ }
    }
    markersRef.current = [];

    // ── Validate center coords ────────────────────────────────────────────────
    const isValidLat = Number.isFinite(location.latitude)  && location.latitude  >= -90  && location.latitude  <= 90;
    const isValidLon = Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
    const centerLng  = isValidLon ? location.longitude : -74.008;
    const centerLat  = isValidLat ? location.latitude  : 40.712;

    // ── Build candidate list ──────────────────────────────────────────────────
    const locsToRender: Array<{
      id: string; name: string; loc: LocationPoint; isWinner: boolean;
    }> =
      candidates && candidates.length > 0
        ? candidates.map((c) => ({
            id: c.locationId,
            name: c.name,
            loc: c.location,
            isWinner: c.locationId === recommendedLocationId,
          }))
        : [{ id: 'target', name: 'Candidate Location', loc: location, isWinner: true }];

    const validLocs = locsToRender.filter(
      (l) =>
        Number.isFinite(l.loc.latitude)  && l.loc.latitude  >= -90  && l.loc.latitude  <= 90 &&
        Number.isFinite(l.loc.longitude) && l.loc.longitude >= -180 && l.loc.longitude <= 180
    );

    // ── Determine whether the spatial field has renderable temperature data ──
    const thermalIsRenderable =
      !!spatialField &&
      spatialField.features.length > 0 &&
      hasRenderableTemperatureData(spatialField);

    // ── Compute fit bounds ────────────────────────────────────────────────────
    const fitBounds = computeBounds(
      thermalIsRenderable ? spatialField : null,
      validLocs.map((l) => l.loc),
    );

    // ── Create the map ────────────────────────────────────────────────────────
    //
    //  Layer order (bottom → top):
    //    1.  carto-voyager-base  — light gray basemap WITHOUT labels
    //    2.  thermal-tiles-fill — FortyGuard polygon temperature fill
    //    3.  thermal-tiles-outline — polygon borders
    //    4.  carto-voyager-labels — basemap labels only, rendered ABOVE thermal
    //    5.  Markers (DOM)
    //
    //  CartoDB Voyager gives the strongest contrast for thermal colours
    //  (vivid cyan → green → yellow → orange → red against light gray).
    //
    const map = new Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'carto-voyager-base': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '© CartoDB © OpenStreetMap',
          },
          'carto-voyager-labels': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: 'carto-voyager-base-layer',
            type: 'raster',
            source: 'carto-voyager-base',
            minzoom: 0,
            maxzoom: 22,
            paint: { 'raster-opacity': 0.88 },
          },
          // carto-voyager-labels-layer added AFTER thermal fill — see map.on('load')
        ],
      },
      center: [centerLng, centerLat],
      zoom: 13,
    });

    mapInstance.current = map;

    map.on('load', () => {
      // ── Thermal polygon fill (below labels) ─────────────────────────────────
      if (thermalIsRenderable && spatialField) {
        map.addSource('thermal-tiles', {
          type: 'geojson',
          data: spatialField as unknown as GeoJSONFC,
        });

        // Vivid temperature fill — bright enough to read against the Voyager basemap.
        // All source values are Celsius (FortyGuard invariant).
        // Colour stops extend from "very cool" to "extreme heat" to handle
        // both fixture (28–31°C) and realistic LIVE ranges.
        map.addLayer({
          id: 'thermal-tiles-fill',
          type: 'fill',
          source: 'thermal-tiles',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', 'average_temperature'], -999], -999],
              -998, 'transparent', // safety: feature has no temperature → skip
              18, '#00c2ff',       // bright sky-blue — very cool
              22, '#00e0a0',       // bright teal
              25, '#00e060',       // vivid green
              28, '#a8e600',       // yellow-green
              30, '#ffe000',       // bright yellow
              32, '#ff9000',       // vivid orange
              34, '#ff3300',       // bright red
              37, '#cc0055',       // crimson
              40, '#7700aa',       // purple — extreme
            ],
            'fill-opacity': 0.72,
          },
        });

        // Polygon border — 1px darker variant of the fill colour for crisp edges
        map.addLayer({
          id: 'thermal-tiles-outline',
          type: 'line',
          source: 'thermal-tiles',
          paint: {
            'line-color': [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', 'average_temperature'], -999], -999],
              -998, 'transparent',
              22, '#00b4d8',
              28, '#80b918',
              32, '#ff6000',
              37, '#880033',
            ],
            'line-width': 1.5,
            'line-opacity': 0.9,
          },
        });
      }

      // ── CartoDB labels layer ON TOP of thermal fill ──────────────────────────
      map.addSource('carto-voyager-labels', {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
      });
      map.addLayer({
        id: 'carto-voyager-labels-layer',
        type: 'raster',
        source: 'carto-voyager-labels',
        paint: { 'raster-opacity': 1 },
      });

      // ── Candidate markers (above everything) ─────────────────────────────────
      for (const locItem of validLocs) {
        const el = document.createElement('div');

        if (locItem.isWinner) {
          // Recommended marker — hot-pink with animated pulse ring
          el.style.cssText = [
            'position:relative',
            'width:36px',
            'height:36px',
            'cursor:pointer',
            'z-index:20',
          ].join(';');
          el.innerHTML = `
            <span style="
              position:absolute;inset:0;border-radius:50%;
              background:rgba(236,72,153,0.25);
              animation:map-marker-pulse 2s ease-in-out infinite;
            "></span>
            <span style="
              position:absolute;inset:4px;border-radius:50%;
              background:#ec4899;
              border:3px solid #fff;
              box-shadow:0 0 12px rgba(236,72,153,0.8),0 2px 8px rgba(0,0,0,0.5);
            "></span>
          `;
        } else {
          el.style.cssText = [
            'width:20px',
            'height:20px',
            'background:#1e293b',
            'border:2.5px solid rgba(255,255,255,0.85)',
            'border-radius:50%',
            'box-shadow:0 2px 8px rgba(0,0,0,0.6)',
            'cursor:pointer',
            'z-index:10',
          ].join(';');
        }

        const popup = new Popup({ offset: 20, closeButton: false }).setHTML(`
          <div style="
            background:#0f172a;
            border:1px solid rgba(30,45,69,0.9);
            border-radius:8px;
            padding:8px 12px;
            min-width:160px;
            font-family:system-ui,sans-serif;
          ">
            <div style="
              color:${locItem.isWinner ? '#ec4899' : '#94a3b8'};
              font-weight:700;
              font-size:11px;
              margin-bottom:3px;
              letter-spacing:0.05em;
              text-transform:uppercase;
            ">${locItem.isWinner ? '★ RECOMMENDED' : '◎ Candidate'}</div>
            <div style="color:#f1f5f9;font-size:13px;font-weight:600;">${locItem.name.split(' (')[0]}</div>
          </div>
        `);

        const marker = new Marker({ element: el })
          .setLngLat([locItem.loc.longitude, locItem.loc.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      }

      // ── Fit the map to the thermal + candidate extent ────────────────────────
      if (fitBounds) {
        map.fitBounds(fitBounds, { padding: 48, maxZoom: 15, duration: 600 });
      }
    });

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      for (const m of markersRef.current) {
        try { m.remove(); } catch { /* safe */ }
      }
      markersRef.current = [];
      try { map.remove(); } catch { /* safe */ }
      mapInstance.current = null;
    };
  }, [location, spatialField, candidates, recommendedLocationId]);

  // ── Live-update the GeoJSON source when spatialField changes (no full remount) ──
  useEffect(() => {
    const m = mapInstance.current;
    if (!m || !m.isStyleLoaded()) return;
    if (!spatialField || !hasRenderableTemperatureData(spatialField)) return;
    const src = m.getSource('thermal-tiles') as GeoJSONSource | undefined;
    if (src) {
      src.setData(spatialField as unknown as GeoJSONFC);
    }
  }, [spatialField]);

  const legendTicks = getThermalLegendTicks(unit);

  return (
    <div
      role="region"
      aria-label="Hyperlocal thermal context map showing FortyGuard surface temperature tiles and candidate locations"
      className="relative w-full h-[420px] sm:h-[480px] lg:h-[520px] rounded-xl overflow-hidden shadow-2xl shadow-black/40 border border-border"
    >
      {/* Map canvas */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* ── Marker pulse keyframe — injected once ───────────────────────────── */}
      <style>{`
        @keyframes map-marker-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>

      {/* ── Thermal legend — bottom-left overlay ───────────────────────────── */}
      <div
        className="absolute bottom-3 left-3 bg-white/95 dark:bg-[#0d1422]/95 backdrop-blur-md px-3 py-2.5 rounded-xl shadow-xl border border-slate-200 dark:border-[#1e2d45]"
        data-testid="map-legend-ticks"
      >
        <div
          className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5"
          data-testid="map-legend-header"
        >
          Thermal Scale ({tempUnitSuffix(unit)})
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {legendTicks.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-sm inline-block flex-shrink-0 shadow-sm"
                style={{ background: color }}
              />
              <span className="text-slate-700 dark:text-slate-300" style={{ fontSize: '10px' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Selected tile badge — top-right ─────────────────────────────────── */}
      {selectedTileId && (
        <div className="absolute top-3 right-3 bg-white/95 dark:bg-[#0d1422]/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg shadow-lg border border-slate-200 dark:border-cyan-500/30">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Tile: </span>
          <span className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-300">
            {selectedTileId}
          </span>
        </div>
      )}

      {/* ── Source attribution ──────────────────────────────────────────────── */}
      {spatialField && hasRenderableTemperatureData(spatialField) && (
        <div className="absolute bottom-3 right-3 bg-white/80 dark:bg-[#0d1422]/80 backdrop-blur-sm px-2 py-1 rounded-md">
          <span className="text-[9px] text-slate-500 dark:text-slate-500 font-mono uppercase tracking-wide">
            FortyGuard Thermal
          </span>
        </div>
      )}

      {/* ── Empty state overlay ──────────────────────────────────────────────── */}
      {!spatialField && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 dark:bg-[#0d1422]/90 backdrop-blur-md px-5 py-3 rounded-xl text-center border border-slate-200 dark:border-[#1e2d45] shadow-lg">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              Run decision to render thermal field
            </p>
          </div>
        </div>
      )}

      {/* ── No temperature data overlay ──────────────────────────────────────── */}
      {spatialField && !hasRenderableTemperatureData(spatialField) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-amber-50/95 dark:bg-amber-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-700/40 shadow-md">
            <p className="text-amber-700 dark:text-amber-300 text-xs font-medium">
              No spatial temperature data in current response
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThermalMap;
