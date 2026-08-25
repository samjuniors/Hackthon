'use client';

import { useEffect, useRef } from 'react';
import { Map, Marker, Popup, type GeoJSONSource, type GeoJSONSourceSpecification } from 'maplibre-gl';
import type { LocationPoint, PolygonAOI, CandidateLocation } from '@/types/domain';
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

export function ThermalMap({
  location,
  spatialField,
  selectedTileId,
  candidates,
  recommendedLocationId,
  unit = DEFAULT_TEMP_UNIT,
}: ThermalMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Clean up existing markers before re-initializing
    for (const m of markersRef.current) {
      try {
        m.remove();
      } catch {
        // Safe marker removal
      }
    }
    markersRef.current = [];

    const isValidLat =
      Number.isFinite(location.latitude) &&
      location.latitude >= -90 &&
      location.latitude <= 90;
    const isValidLon =
      Number.isFinite(location.longitude) &&
      location.longitude >= -180 &&
      location.longitude <= 180;
    const centerLng = isValidLon ? location.longitude : -74.008;
    const centerLat = isValidLat ? location.latitude : 40.712;

    const map = new Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            attribution: '&copy; CartoDB &copy; OpenStreetMap',
          },
        },
        layers: [
          {
            id: 'carto-dark-layer',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 19,
            paint: {
              'raster-opacity': 0.6,
              'raster-saturation': -0.5
            }
          },
        ],
      },
      center: [centerLng, centerLat],
      zoom: 14,
    });

    mapInstance.current = map;

    map.on('load', () => {
      // Build candidate marker list
      const locsToRender: Array<{ id: string; name: string; loc: LocationPoint; isWinner: boolean }> =
        candidates && candidates.length > 0
          ? candidates.map((c) => ({
              id: c.locationId,
              name: c.name,
              loc: c.location,
              isWinner: c.locationId === recommendedLocationId,
            }))
          : [
              {
                id: 'target',
                name: 'Candidate Location',
                loc: location,
                isWinner: true,
              },
            ];

      if (spatialField && spatialField.features?.length > 0) {
        // Add thermal polygon layer BEFORE markers so markers appear on top
        map.addSource('thermal-tiles', {
          type: 'geojson',
          data: spatialField as GeoJSONSourceSpecification['data'],
        });

        // Filled thermal polygons — use expanded scale to cover fixture temps (28–34°C)
        // Internal shader interpolates in verified Celsius data from FortyGuard
        map.addLayer({
          id: 'thermal-tiles-fill',
          type: 'fill',
          source: 'thermal-tiles',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'average_temperature'],
              26, '#06b6d4',   // cyan — very cool
              28, '#10b981',   // emerald — cool
              29, '#65a30d',   // lime-green — warm-ish
              30, '#eab308',   // yellow — warm
              31, '#f97316',   // orange — hot
              32, '#ef4444',   // red — very hot
              34, '#7f1d1d',   // dark red — extreme
            ],
            'fill-opacity': 0.9,
          },
        });

        // Outline for spatial differentiation
        map.addLayer({
          id: 'thermal-tiles-outline',
          type: 'line',
          source: 'thermal-tiles',
          paint: {
            'line-color': [
              'interpolate',
              ['linear'],
              ['get', 'average_temperature'],
              26, '#67e8f9',
              30, '#fde047',
              34, '#fca5a5',
            ],
            'line-width': 1.5,
            'line-opacity': 0.9,
          },
        });
      }

      // Add markers on top of thermal field
      for (const locItem of locsToRender) {
        if (
          !Number.isFinite(locItem.loc.latitude) ||
          locItem.loc.latitude < -90 ||
          locItem.loc.latitude > 90 ||
          !Number.isFinite(locItem.loc.longitude) ||
          locItem.loc.longitude < -180 ||
          locItem.loc.longitude > 180
        ) {
          continue;
        }

        // Winner gets a large emerald pin; others get a smaller cyan pin
        const el = document.createElement('div');
        el.style.cssText = locItem.isWinner
          ? `width:32px;height:32px;background:#ec4899;border:4px solid #fff;border-radius:50%;box-shadow:0 0 16px rgba(236,72,153,1),0 0 32px rgba(236,72,153,0.5);cursor:pointer;z-index:20;`
          : `width:20px;height:20px;background:#1e293b;border:2px solid rgba(255,255,255,0.9);border-radius:50%;box-shadow:0 0 10px rgba(30,41,59,0.8);cursor:pointer;z-index:10;`;

        const marker = new Marker({ element: el })
          .setLngLat([locItem.loc.longitude, locItem.loc.latitude])
          .setPopup(
            new Popup({ offset: 18, closeButton: false }).setHTML(
              `<div style="background:#0d1422;border:1px solid rgba(30,45,69,0.9);border-radius:8px;padding:8px 10px;min-width:160px;">
                <div style="color:${locItem.isWinner ? '#ec4899' : '#94a3b8'};font-weight:700;font-size:13px;margin-bottom:2px;">
                  ${locItem.isWinner ? '★ RECOMMENDED' : '◎ Candidate'}
                </div>
                <div style="color:#e2e8f0;font-size:12px;font-weight:600;">${locItem.name}</div>
                <div style="color:#7c8fa8;font-size:10px;margin-top:3px;font-family:monospace;">${locItem.id}</div>
              </div>`
            )
          )
          .addTo(map);

        markersRef.current.push(marker);
      }
    });

    return () => {
      for (const m of markersRef.current) {
        try {
          m.remove();
        } catch {
          // ignore
        }
      }
      markersRef.current = [];
      try {
        map.remove();
      } catch {
        // ignore
      }
      mapInstance.current = null;
    };
  }, [location, spatialField, candidates, recommendedLocationId]);

  // Update GeoJSON source data when spatialField changes without remounting
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('thermal-tiles') as GeoJSONSource;
    if (source && spatialField) {
      source.setData(spatialField as unknown as GeoJSONSourceSpecification['data']);
    }
  }, [spatialField]);

  const legendTicks = getThermalLegendTicks(unit);

  return (
    <div
      role="region"
      aria-label="Hyperlocal thermal context map showing surface temperature tiles and candidate locations"
      className="relative w-full h-[320px] sm:h-[380px] lg:h-[420px] rounded-xl overflow-hidden shadow-2xl shadow-black/60 border border-[#1e2d45]"
    >
      <div ref={mapContainer} className="w-full h-full" />

      {/* Thermal Legend — bottom left */}
      <div className="absolute bottom-3 left-3 bg-[#0d1422]/95 backdrop-blur-md px-3 py-2.5 rounded-xl shadow-xl" style={{ border: '1px solid rgba(30,45,69,0.9)' }}>
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5" data-testid="map-legend-header">
          Thermal Scale ({tempUnitSuffix(unit)})
        </div>
        <div className="flex items-center gap-1.5" data-testid="map-legend-ticks">
          {legendTicks.map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block flex-shrink-0" style={{ background: color }} />
              <span className="text-slate-300" style={{ fontSize: '10px' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Selected tile badge — top right */}
      {selectedTileId && (
        <div className="absolute top-3 right-3 bg-[#0d1422]/95 backdrop-blur-md px-2.5 py-1.5 rounded-lg shadow-lg" style={{ border: '1px solid rgba(34,211,238,0.3)' }}>
          <span className="text-[10px] text-slate-400">Selected: </span>
          <span className="text-xs font-mono font-bold text-cyan-300">{selectedTileId}</span>
        </div>
      )}

      {/* No data state */}
      {!spatialField && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-[#0d1422]/90 backdrop-blur-md px-4 py-3 rounded-xl text-center" style={{ border: '1px solid rgba(30,45,69,0.8)' }}>
            <p className="text-slate-400 text-sm">Run decision to render thermal field</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThermalMap;
