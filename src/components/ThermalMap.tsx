'use client';

import { useEffect, useRef } from 'react';
import { Map, Marker, Popup, type GeoJSONSource, type GeoJSONSourceSpecification } from 'maplibre-gl';
import type { LocationPoint, PolygonAOI, CandidateLocation } from '@/types/domain';

interface ThermalMapProps {
  location: LocationPoint;
  spatialField: PolygonAOI | null;
  selectedTileId?: string | number;
  candidates?: CandidateLocation[];
  recommendedLocationId?: string;
}

export function ThermalMap({
  location,
  spatialField,
  selectedTileId,
  candidates,
  recommendedLocationId,
}: ThermalMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

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
          },
        ],
      },
      center: [location.longitude, location.latitude],
      zoom: 14,
    });

    mapInstance.current = map;

    map.on('load', () => {
      // Add candidate locations or single target location marker
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

      for (const locItem of locsToRender) {
        const markerColor = locItem.isWinner ? '#10b981' : '#38bdf8';
        new Marker({ color: markerColor })
          .setLngLat([locItem.loc.longitude, locItem.loc.latitude])
          .setPopup(
            new Popup({ offset: 25 }).setHTML(
              `<div style="color: #0f172a; font-weight: bold; font-size: 13px;">
                ${locItem.isWinner ? '★ ' : ''}${locItem.name}
              </div>
              <div style="color: #475569; font-size: 11px; margin-top: 2px;">
                ${locItem.id} | Lat: ${locItem.loc.latitude.toFixed(4)}, Lon: ${locItem.loc.longitude.toFixed(4)}
              </div>`
            )
          )
          .addTo(map);
      }


      if (spatialField && spatialField.features?.length > 0) {
        map.addSource('thermal-tiles', {
          type: 'geojson',
          data: spatialField as GeoJSONSourceSpecification['data'],
        });

        map.addLayer({
          id: 'thermal-tiles-fill',
          type: 'fill',
          source: 'thermal-tiles',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'average_temperature'],
              30, '#10b981',
              32.5, '#f59e0b',
              34.5, '#f97316',
              36.5, '#ef4444',
            ],
            'fill-opacity': 0.65,
          },
        });

        map.addLayer({
          id: 'thermal-tiles-outline',
          type: 'line',
          source: 'thermal-tiles',
          paint: {
            'line-color': '#ffffff',
            'line-width': 1.5,
            'line-opacity': 0.8,
          },
        });
      }
    });

    return () => {
      map.remove();
    };
  }, [location, spatialField, candidates, recommendedLocationId]);

  // Update GeoJSON source data when spatialField changes
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('thermal-tiles') as GeoJSONSource;
    if (source && spatialField) {
      source.setData(spatialField as unknown as GeoJSONSourceSpecification['data']);
    }
  }, [spatialField]);

  return (
    <div className="relative w-full h-[450px] rounded-xl overflow-hidden border border-white/10 shadow-2xl">
      <div ref={mapContainer} className="w-full h-full" />
      <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 text-xs flex items-center gap-3 shadow-lg">
        <span className="font-semibold text-slate-200">Thermal Scale (°C):</span>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
          <span className="text-slate-400">&lt;32</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
          <span className="text-slate-400">32-34</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-orange-500 inline-block"></span>
          <span className="text-slate-400">34-36</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
          <span className="text-slate-400">&gt;36</span>
        </div>
      </div>
      {selectedTileId && (
        <div className="absolute bottom-3 right-3 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-cyan-500/30 text-xs text-cyan-300 shadow-lg">
          Selected Tile: <span className="font-mono font-bold text-white">{selectedTileId}</span>
        </div>
      )}
    </div>
  );
}

export default ThermalMap;

