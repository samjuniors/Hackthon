'use client';

import { useEffect, useRef } from 'react';
import { Map, Marker, Popup, type GeoJSONSource } from 'maplibre-gl';
import type { LocationPoint, PolygonAOI, CandidateLocation } from '@/types/domain';
import { useTheme } from '@/components/ThemeProvider';
import {
  type TempUnit,
  DEFAULT_TEMP_UNIT,
  getThermalLegendTicks,
  tempUnitSuffix,
} from '@/lib/temperature';

// Minimal inline type for MapLibre GeoJSON source data casts.
type GeoJSONFC = { type: 'FeatureCollection'; features: unknown[] };

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
 * Generate a standard FortyGuard-style Area of Interest (AOI) bounding polygon
 * centered at the target location when explicit tile polygons are pending or loading.
 */
function createTargetAoiGeoJSON(centerLat: number, centerLon: number, deltaLat = 0.012, deltaLon = 0.016): GeoJSONFC {
  const minLon = centerLon - deltaLon;
  const maxLon = centerLon + deltaLon;
  const minLat = centerLat - deltaLat;
  const maxLat = centerLat + deltaLat;

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Operational Area of Interest (AOI)' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [minLon, minLat],
              [maxLon, minLat],
              [maxLon, maxLat],
              [minLon, maxLat],
              [minLon, minLat],
            ],
          ],
        },
      },
    ],
  };
}

/**
 * Compute bounding box covering spatial field features, candidates, and default target AOI.
 */
function computeBounds(
  spatialField: PolygonAOI | null,
  candidateLocs: LocationPoint[],
  targetLoc: LocationPoint
): [[number, number], [number, number]] | null {
  const allPts: [number, number][] = [];

  if (spatialField && spatialField.features.length > 0) {
    for (const f of spatialField.features) {
      allPts.push(...extractCoords(f.geometry as { type: string; coordinates: unknown }));
    }
  }

  for (const { longitude, latitude } of candidateLocs) {
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      allPts.push([longitude, latitude]);
    }
  }

  // Always include the target location with a small perimeter
  if (Number.isFinite(targetLoc.longitude) && Number.isFinite(targetLoc.latitude)) {
    allPts.push([targetLoc.longitude - 0.014, targetLoc.latitude - 0.010]);
    allPts.push([targetLoc.longitude + 0.014, targetLoc.latitude + 0.010]);
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
  const { theme } = useTheme();
  const mapContainer   = useRef<HTMLDivElement>(null);
  const mapInstance    = useRef<Map | null>(null);
  const markersRef     = useRef<Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Clean up previous markers
    for (const m of markersRef.current) {
      try { m.remove(); } catch { /* safe */ }
    }
    markersRef.current = [];

    // Validate center coordinates
    const isValidLat = Number.isFinite(location.latitude)  && location.latitude  >= -90  && location.latitude  <= 90;
    const isValidLon = Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
    const centerLng  = isValidLon ? location.longitude : -74.008;
    const centerLat  = isValidLat ? location.latitude  : 40.712;

    // Candidate list
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
        : [{ id: 'target', name: 'Operational Center', loc: location, isWinner: true }];

    const validLocs = locsToRender.filter(
      (l) =>
        Number.isFinite(l.loc.latitude)  && l.loc.latitude  >= -90  && l.loc.latitude  <= 90 &&
        Number.isFinite(l.loc.longitude) && l.loc.longitude >= -180 && l.loc.longitude <= 180
    );

    const thermalIsRenderable =
      !!spatialField &&
      spatialField.features.length > 0 &&
      hasRenderableTemperatureData(spatialField);

    // Compute fit bounds
    const fitBounds = computeBounds(
      thermalIsRenderable ? spatialField : null,
      validLocs.map((l) => l.loc),
      location
    );

    // Basemap URLs tailored to active theme
    const isDark = theme === 'dark';
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

    // Create MapLibre map instance
    const map = new Map({
      container: mapContainer.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
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
        },
        layers: [
          {
            id: 'carto-base-layer',
            type: 'raster',
            source: 'carto-base',
            minzoom: 0,
            maxzoom: 22,
            paint: { 'raster-opacity': isDark ? 0.95 : 0.88 },
          },
        ],
      },
      center: [centerLng, centerLat],
      zoom: 14,
    });

    mapInstance.current = map;

    map.on('load', () => {
      // ── 1. Target AOI Boundary (FortyGuard area boundary polygon) ─────────
      const targetAoiData = createTargetAoiGeoJSON(centerLat, centerLng);
      map.addSource('target-aoi', {
        type: 'geojson',
        data: targetAoiData as unknown as GeoJSONFC,
      });

      map.addLayer({
        id: 'target-aoi-fill',
        type: 'fill',
        source: 'target-aoi',
        paint: {
          'fill-color': isDark ? '#ec4899' : '#0ea5e9',
          'fill-opacity': thermalIsRenderable ? 0.04 : 0.12,
        },
      });

      map.addLayer({
        id: 'target-aoi-outline',
        type: 'line',
        source: 'target-aoi',
        paint: {
          'line-color': isDark ? '#f43f5e' : '#0284c7',
          'line-width': 2.5,
          'line-dasharray': thermalIsRenderable ? [2, 2] : [4, 2],
          'line-opacity': 0.85,
        },
      });

      // ── 2. Thermal Polygons (FortyGuard temperature grid) ─────────────────
      if (thermalIsRenderable && spatialField) {
        map.addSource('thermal-tiles', {
          type: 'geojson',
          data: spatialField as unknown as GeoJSONFC,
        });

        // High-contrast thermal polygon fill
        map.addLayer({
          id: 'thermal-tiles-fill',
          type: 'fill',
          source: 'thermal-tiles',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['to-number', ['get', 'average_temperature'], 25],
              18, '#00d4ff', // cyan — very cool
              22, '#00e5a3', // teal
              25, '#10b981', // emerald
              28, '#84cc16', // lime
              30, '#facc15', // yellow
              32, '#fb923c', // orange
              34, '#f43f5e', // rose / hot
              37, '#e11d48', // crimson
              40, '#9333ea', // purple / extreme
            ],
            'fill-opacity': isDark ? 0.85 : 0.75,
          },
        });

        // Crisp polygon outline
        map.addLayer({
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
            'line-width': 2,
            'line-opacity': 0.95,
          },
        });
      }

      // ── 3. Labels layer (rendered above thermal fill for legibility) ──────
      map.addLayer({
        id: 'carto-labels-layer',
        type: 'raster',
        source: 'carto-labels',
        paint: { 'raster-opacity': isDark ? 0.92 : 1.0 },
      });

      // ── 4. Candidate markers (DOM overlay) ────────────────────────────────
      for (const locItem of validLocs) {
        const el = document.createElement('div');

        if (locItem.isWinner) {
          // Recommended marker — hot-pink with animated pulse ring
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
          el.style.cssText = [
            'width:22px',
            'height:22px',
            'background:' + (isDark ? '#0f172a' : '#ffffff'),
            'border:2.5px solid ' + (isDark ? '#94a3b8' : '#334155'),
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
              color:${locItem.isWinner ? '#ec4899' : isDark ? '#94a3b8' : '#64748b'};
              font-weight:700;
              font-size:10px;
              margin-bottom:3px;
              letter-spacing:0.05em;
              text-transform:uppercase;
            ">${locItem.isWinner ? '★ RECOMMENDED PLAN' : '◎ Candidate Location'}</div>
            <div style="color:${isDark ? '#f1f5f9' : '#0f172a'};font-size:13px;font-weight:700;">${locItem.name.split(' (')[0]}</div>
          </div>
        `);

        const marker = new Marker({ element: el })
          .setLngLat([locItem.loc.longitude, locItem.loc.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      }

      // ── 5. Fit the map bounds smoothly ───────────────────────────────────
      if (fitBounds) {
        map.fitBounds(fitBounds, { padding: 45, maxZoom: 15, duration: 600 });
      }
    });

    // Cleanup
    return () => {
      for (const m of markersRef.current) {
        try { m.remove(); } catch { /* safe */ }
      }
      markersRef.current = [];
      try { map.remove(); } catch { /* safe */ }
      mapInstance.current = null;
    };
  }, [location, spatialField, candidates, recommendedLocationId, theme]);

  // Live-update the GeoJSON source when spatialField changes (no full remount)
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

      {/* Target AOI Zone Indicator — top-left badge */}
      <div className="absolute top-3 left-3 bg-surface-card/95 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-lg border border-border flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block border border-white/60" />
        <span className="text-[10px] font-bold text-text-primary uppercase tracking-wide">
          FortyGuard Operational AOI
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

      {/* Empty state overlay (shown only when no spatialField AND no location) */}
      {!spatialField && !location && (
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
