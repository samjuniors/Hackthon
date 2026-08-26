'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { Map as MapLibreMap, LngLatBounds } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection, Polygon } from 'geojson';

/**
 * GeoJSON FeatureCollection containing US State Administrative Boundaries.
 * Each feature contains a `state_code` property (e.g. "CA", "NY", "TX").
 */
export const US_STATES_GEOJSON: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { state_code: 'CA', state_name: 'California' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-124.409591, 42.009518],
            [-120.005746, 42.002207],
            [-120.005746, 39.000000],
            [-114.633058, 35.001857],
            [-114.131211, 34.258811],
            [-114.536098, 32.748128],
            [-114.719602, 32.718654],
            [-117.126442, 32.534241],
            [-117.261947, 32.542289],
            [-117.256877, 32.747048],
            [-117.378934, 33.123512],
            [-117.863770, 33.585483],
            [-118.528249, 34.020580],
            [-119.043542, 34.048386],
            [-119.462378, 34.406859],
            [-120.470461, 34.450379],
            [-120.648174, 35.158572],
            [-121.579482, 36.273031],
            [-121.907954, 36.634687],
            [-121.803875, 36.804104],
            [-122.387140, 37.108343],
            [-122.513543, 37.778842],
            [-122.996160, 38.163351],
            [-123.731771, 38.956793],
            [-123.858485, 39.362145],
            [-124.161108, 40.286988],
            [-124.414002, 40.440483],
            [-124.155799, 40.867946],
            [-124.137887, 41.710787],
            [-124.211475, 41.998425],
            [-124.409591, 42.009518],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { state_code: 'NY', state_name: 'New York' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-79.762152, 42.269860],
            [-79.762152, 42.001702],
            [-75.359871, 42.001702],
            [-74.896340, 41.365638],
            [-74.743015, 41.176466],
            [-73.970104, 40.998429],
            [-73.655814, 40.987819],
            [-72.034873, 41.261895],
            [-71.856214, 41.054378],
            [-73.254890, 40.618956],
            [-74.041890, 40.543029],
            [-74.257159, 40.495992],
            [-74.150489, 40.643872],
            [-73.541289, 41.071858],
            [-73.484920, 42.051000],
            [-73.250514, 42.745989],
            [-73.435889, 43.528461],
            [-73.342981, 44.020580],
            [-73.415014, 44.601950],
            [-73.344819, 45.011859],
            [-74.970514, 44.981859],
            [-75.401859, 44.498185],
            [-76.350185, 44.150185],
            [-76.531859, 43.601859],
            [-77.601859, 43.351859],
            [-78.901859, 43.601859],
            [-79.051859, 43.251859],
            [-78.851859, 42.801859],
            [-79.762152, 42.269860],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { state_code: 'TX', state_name: 'Texas' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-103.001859, 36.501859],
            [-100.001859, 36.501859],
            [-100.001859, 34.551859],
            [-94.618590, 33.631859],
            [-94.041859, 33.018590],
            [-93.521859, 30.251859],
            [-93.851859, 29.701859],
            [-94.751859, 29.301859],
            [-96.801859, 28.001859],
            [-97.401859, 25.901859],
            [-99.501859, 27.501859],
            [-101.501859, 29.801859],
            [-104.501859, 29.551859],
            [-106.501859, 31.751859],
            [-106.501859, 32.001859],
            [-103.001859, 32.001859],
            [-103.001859, 36.501859],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { state_code: 'FL', state_name: 'Florida' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-87.521859, 31.001859],
            [-85.001859, 31.001859],
            [-82.051859, 30.501859],
            [-81.401859, 30.701859],
            [-80.001859, 26.801859],
            [-80.121859, 25.751859],
            [-80.451859, 25.151859],
            [-81.251859, 24.551859],
            [-81.851859, 24.551859],
            [-81.751859, 25.901859],
            [-82.801859, 27.801859],
            [-83.951859, 30.001859],
            [-86.501859, 30.401859],
            [-87.521859, 30.301859],
            [-87.521859, 31.001859],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { state_code: 'IL', state_name: 'Illinois' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-90.639980, 42.510000],
            [-87.801859, 42.501859],
            [-87.521859, 41.761859],
            [-87.521859, 39.371859],
            [-87.551859, 37.951859],
            [-88.501859, 37.051859],
            [-89.151859, 37.001859],
            [-89.501859, 37.251859],
            [-91.451859, 40.351859],
            [-91.351859, 41.501859],
            [-90.151859, 42.151859],
            [-90.639980, 42.510000],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { state_code: 'AZ', state_name: 'Arizona' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-114.811859, 37.001859],
            [-109.041859, 37.001859],
            [-109.041859, 31.331859],
            [-111.081859, 31.331859],
            [-114.811859, 32.721859],
            [-114.531859, 35.001859],
            [-114.811859, 37.001859],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { state_code: 'WA', state_name: 'Washington' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-124.751859, 48.381859],
            [-123.001859, 49.001859],
            [-117.041859, 49.001859],
            [-117.041859, 46.001859],
            [-119.001859, 46.001859],
            [-124.001859, 46.251859],
            [-124.751859, 48.381859],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: { state_code: 'CO', state_name: 'Colorado' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-109.051859, 41.001859],
            [-102.051859, 41.001859],
            [-102.051859, 37.001859],
            [-109.051859, 37.001859],
            [-109.051859, 41.001859],
          ],
        ],
      },
    },
  ],
};

interface StateBoundaryMapProps {
  /**
   * Two-letter US state code to highlight (e.g. "CA", "NY", "TX", "FL").
   * When null or undefined, the state highlight is cleared.
   */
  selectedState?: string | null;
  /** Optional container height class or CSS string */
  className?: string;
  /** Optional initial center coordinates [longitude, latitude] */
  initialCenter?: [number, number];
  /** Optional initial zoom level */
  initialZoom?: number;
  /** Optional callback fired when a state polygon is clicked */
  onStateClick?: (stateCode: string, stateName: string) => void;
}

/**
 * Calculates a MapLibre LngLatBounds bounding box from a GeoJSON Polygon.
 */
function getPolygonBoundingBox(geometry: Polygon): LngLatBounds {
  const bounds = new LngLatBounds();
  for (const ring of geometry.coordinates) {
    for (const [lng, lat] of ring) {
      bounds.extend([lng, lat]);
    }
  }
  return bounds;
}

/**
 * StateBoundaryMap Component
 *
 * Renders a MapLibre GL map view with dynamic administrative state boundary
 * highlights, smooth camera animation with fitBounds, and label preservation.
 */
export function StateBoundaryMap({
  selectedState = 'CA',
  className = 'w-full h-[520px] rounded-xl overflow-hidden shadow-2xl border border-slate-700 relative',
  initialCenter = [-98.5795, 39.8283], // Center of USA
  initialZoom = 4,
  onStateClick,
}: StateBoundaryMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Helper: Filter layers & fit camera to selected state boundary
  // ───────────────────────────────────────────────────────────────────────────
  const highlightAndFrameState = useCallback((map: MapLibreMap, stateCode: string | null | undefined) => {
    if (!map.isStyleLoaded()) return;

    const normalizedCode = (stateCode || '').toUpperCase().trim();

    // 1. Update layer filter to isolate the selected state polygon
    const filterExpression: ['==', ['get', string], string] = ['==', ['get', 'state_code'], normalizedCode];

    if (map.getLayer('state-boundary-fill')) {
      map.setFilter('state-boundary-fill', filterExpression);
    }
    if (map.getLayer('state-boundary-line')) {
      map.setFilter('state-boundary-line', filterExpression);
    }

    if (!normalizedCode) return;

    // 2. Find matching GeoJSON feature and calculate bounding box
    const feature = US_STATES_GEOJSON.features.find(
      (f) => f.properties?.state_code === normalizedCode
    );

    if (feature && feature.geometry) {
      const bounds = getPolygonBoundingBox(feature.geometry);

      // 3. Smoothly animate the camera with 50px safe padding
      map.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        duration: 1000,
        essential: true,
      });
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Initialize MapLibre Instance
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Standard CartoDB Dark/Light Basemap + Labels Style
    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'carto-basemap': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '© CartoDB © OpenStreetMap',
          },
          'carto-labels': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
          },
        },
        layers: [
          // Base Cartography
          {
            id: 'carto-basemap-layer',
            type: 'raster',
            source: 'carto-basemap',
            minzoom: 0,
            maxzoom: 22,
            paint: { 'raster-opacity': 0.95 },
          },
          // Reference Labels Layer (used as anchor for `beforeId`)
          {
            id: 'carto-labels-layer',
            type: 'raster',
            source: 'carto-labels',
            minzoom: 0,
            maxzoom: 22,
            paint: { 'raster-opacity': 1.0 },
          },
        ],
      },
      center: initialCenter,
      zoom: initialZoom,
    });

    mapRef.current = map;

    map.on('load', () => {
      // 1. Register GeoJSON Data Source containing Administrative Boundaries
      if (!map.getSource('state-boundaries-src')) {
        map.addSource('state-boundaries-src', {
          type: 'geojson',
          data: US_STATES_GEOJSON,
        });
      }

      // 2. Add Fill Layer (tint interior soft off-white/pink hue)
      // Placed UNDER 'carto-labels-layer' using beforeId
      if (!map.getLayer('state-boundary-fill')) {
        map.addLayer(
          {
            id: 'state-boundary-fill',
            type: 'fill',
            source: 'state-boundaries-src',
            paint: {
              'fill-color': '#F5F5F5',
              'fill-opacity': 0.6,
            },
            filter: ['==', ['get', 'state_code'], ''], // Initially inactive
          },
          'carto-labels-layer' // beforeId: placed below labels so text is readable
        );
      }

      // 3. Add Line Layer (crisp crimson/red outer framing border)
      // Placed UNDER 'carto-labels-layer' using beforeId
      if (!map.getLayer('state-boundary-line')) {
        map.addLayer(
          {
            id: 'state-boundary-line',
            type: 'line',
            source: 'state-boundaries-src',
            paint: {
              'line-color': '#C70039',
              'line-width': 2,
              'line-opacity': 1.0,
            },
            filter: ['==', ['get', 'state_code'], ''], // Initially inactive
          },
          'carto-labels-layer' // beforeId
        );
      }

      // Interactive cursor and click events
      map.on('click', 'state-boundary-fill', (e) => {
        if (e.features && e.features.length > 0 && onStateClick) {
          const props = e.features[0].properties;
          onStateClick(props?.state_code, props?.state_name);
        }
      });

      map.on('mouseenter', 'state-boundary-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mouseleave', 'state-boundary-fill', () => {
        map.getCanvas().style.cursor = '';
      });

      // Apply initial state selection if provided
      if (selectedState) {
        highlightAndFrameState(map, selectedState);
      }
    });

    // Auto-resize on container dimension changes
    const ro = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    ro.observe(mapContainerRef.current);

    // Lifecycle cleanup
    return () => {
      ro.disconnect();
      if (mapRef.current) {
        try {
          mapRef.current.remove();
        } catch {
          /* safe */
        }
        mapRef.current = null;
      }
    };
  }, [highlightAndFrameState, initialCenter, initialZoom, onStateClick, selectedState]);

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Reactive hook: Update boundary highlight when selectedState prop changes
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      highlightAndFrameState(map, selectedState);
    } else {
      map.once('load', () => highlightAndFrameState(map, selectedState));
    }
  }, [selectedState]);

  return (
    <div className={className} role="region" aria-label="Administrative State Boundary Map View">
      {/* MapLibre WebGL Canvas Container */}
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
}

export default StateBoundaryMap;
