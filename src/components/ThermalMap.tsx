'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Marker, Popup, type GeoJSONSource } from 'maplibre-gl';
import type { LocationPoint, PolygonAOI, CandidateLocation } from '@/types/domain';
import { useTheme } from '@/components/ThemeProvider';
import {
  type TempUnit,
  DEFAULT_TEMP_UNIT,
  getThermalLegendTicks,
  tempUnitSuffix,
} from '@/lib/temperature';
import type { MapLayerVisibility, AnalysisAreaShape, AoiHalfSideMetres } from '@/lib/user-preferences';
import { AOI_HALF_SIDE_PRESETS } from '@/lib/user-preferences';
import { Flame, MapPin, Tag, Box, Circle as CircleIcon, Maximize2, Map as MapIcon, Check, ZoomIn, Sun, Moon } from 'lucide-react';
import type { FeatureCollection } from 'geojson';

// Minimal inline type for MapLibre GeoJSON source data casts.
type GeoJSONFC = FeatureCollection;

interface ThermalMapProps {
  /** User-selected analysis center. Used for fallback fit + marker. */
  location: LocationPoint;
  /** State or territory code/name (e.g. CA, NY) */
  locationState?: string;
  locationName?: string;
  /**
   * Geographical / State Boundary Polygon (e.g. California state polygon, New York state polygon).
   */
  regionBoundary?: PolygonAOI | null;
  /**
   * Inverted Mask Polygon covering outside the state region to dim/darken the exterior.
   */
  regionMask?: PolygonAOI | null;
  /**
   * Canonical Analysis AOI — the EXACT geometry sent to FortyGuard.
   * Rendered as the visible AOI boundary on the map.
   */
  analysisAoi: PolygonAOI | null;
  /**
   * FortyGuard thermal field — REAL feature collection.
   */
  spatialField: PolygonAOI | null;
  selectedTileId?: string | number;
  candidates?: CandidateLocation[];
  recommendedLocationId?: string;
  unit?: TempUnit;
  /** Map layer toggles synchronized with user preferences */
  layerVisibility?: MapLayerVisibility;
  onToggleLayer?: (v: Partial<MapLayerVisibility>) => void;
  /** AOI shape & dimension controls */
  areaShape?: AnalysisAreaShape;
  aoiHalfSideMetres?: AoiHalfSideMetres;
  onChangeAreaShape?: (s: AnalysisAreaShape) => void;
  onChangeAoiHalfSideMetres?: (m: AoiHalfSideMetres) => void;
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
 * Compute bounding box covering the regional boundary, AOI, thermal field, candidates,
 * and the selected location.
 */
function computeBounds(
  analysisAoi: PolygonAOI | null,
  spatialField: PolygonAOI | null,
  candidateLocs: LocationPoint[],
  targetLoc: LocationPoint,
  regionBoundary?: PolygonAOI | null,
  fitToRegionOnly = false,
): [[number, number], [number, number]] | null {
  const allPts: [number, number][] = [];

  if (fitToRegionOnly && regionBoundary && regionBoundary.features.length > 0) {
    for (const f of regionBoundary.features) {
      allPts.push(...extractCoords(f.geometry as { type: string; coordinates: unknown }));
    }
  } else {
    // Include the target location with local perimeter
    if (Number.isFinite(targetLoc.longitude) && Number.isFinite(targetLoc.latitude)) {
      allPts.push([targetLoc.longitude, targetLoc.latitude]);
    }

    // Local AOI vertices near targetLoc
    if (analysisAoi && analysisAoi.features.length > 0) {
      for (const f of analysisAoi.features) {
        const pts = extractCoords(f.geometry as { type: string; coordinates: unknown });
        for (const [lng, lat] of pts) {
          if (Math.abs(lng - targetLoc.longitude) < 0.25 && Math.abs(lat - targetLoc.latitude) < 0.25) {
            allPts.push([lng, lat]);
          }
        }
      }
    }

    // Thermal field vertices near targetLoc
    if (spatialField && spatialField.features.length > 0) {
      for (const f of spatialField.features) {
        const pts = extractCoords(f.geometry as { type: string; coordinates: unknown });
        for (const [lng, lat] of pts) {
          if (Math.abs(lng - targetLoc.longitude) < 0.25 && Math.abs(lat - targetLoc.latitude) < 0.25) {
            allPts.push([lng, lat]);
          }
        }
      }
    }

    // Candidate coordinates near targetLoc
    for (const { longitude, latitude } of candidateLocs) {
      if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
        if (Math.abs(longitude - targetLoc.longitude) < 0.25 && Math.abs(latitude - targetLoc.latitude) < 0.25) {
          allPts.push([longitude, latitude]);
        }
      }
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

  const padRatio = fitToRegionOnly ? 0.08 : 0.35;
  const padLng = Math.max(0.0008, (maxLng - minLng) * padRatio);
  const padLat = Math.max(0.0008, (maxLat - minLat) * padRatio);

  return [
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ];
}

/** Return true if the spatial field contains at least one feature with a valid temperature. */
function hasRenderableTemperatureData(aoi: PolygonAOI | null | undefined): boolean {
  return !!aoi && aoi.features.length > 0 && aoi.features.some((f) =>
    Number.isFinite(Number(f.properties?.average_temperature))
  );
}

export function ThermalMap({
  location,
  locationState,
  locationName,
  regionBoundary,
  regionMask,
  analysisAoi,
  spatialField,
  selectedTileId,
  candidates,
  recommendedLocationId,
  unit = DEFAULT_TEMP_UNIT,
  layerVisibility = { thermal: true, candidates: true, labels: true, aoi: true },
  onToggleLayer,
  areaShape = 'polygon',
  aoiHalfSideMetres = 400,
  onChangeAreaShape,
  onChangeAoiHalfSideMetres,
}: ThermalMapProps) {
  const { theme, toggleTheme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [showSizeMenu, setShowSizeMenu] = useState(false);
  const [showRegionBoundary, setShowRegionBoundary] = useState(true);

  // Function to apply theme styles to all map layers
  const applyThemeToMap = useCallback((isDark: boolean) => {
    const map = mapRef.current;
    if (!map) return;

    try {
      if (map.getLayer('carto-base-dark-layer')) {
        map.setLayoutProperty('carto-base-dark-layer', 'visibility', isDark ? 'visible' : 'none');
        map.setPaintProperty('carto-base-dark-layer', 'raster-opacity', isDark ? 0.95 : 0);
      }
      if (map.getLayer('carto-base-light-layer')) {
        map.setLayoutProperty('carto-base-light-layer', 'visibility', isDark ? 'none' : 'visible');
        map.setPaintProperty('carto-base-light-layer', 'raster-opacity', isDark ? 0 : 0.95);
      }
      if (map.getLayer('region-mask-fill')) {
        map.setPaintProperty('region-mask-fill', 'fill-color', isDark ? '#000000' : '#0f172a');
        map.setPaintProperty('region-mask-fill', 'fill-opacity', isDark ? 0.55 : 0.40);
      }
      if (map.getLayer('carto-labels-dark-layer')) {
        map.setLayoutProperty('carto-labels-dark-layer', 'visibility', isDark && (layerVisibility.labels !== false) ? 'visible' : 'none');
      }
      if (map.getLayer('carto-labels-light-layer')) {
        map.setLayoutProperty('carto-labels-light-layer', 'visibility', !isDark && (layerVisibility.labels !== false) ? 'visible' : 'none');
      }
      if (map.getLayer('aoi-outline')) {
        map.setPaintProperty('aoi-outline', 'line-color', isDark ? '#fb7185' : '#be123c');
      }
      if (map.getLayer('aoi-fill')) {
        map.setPaintProperty('aoi-fill', 'fill-color', '#f43f5e');
        map.setPaintProperty('aoi-fill', 'fill-opacity', isDark ? 0.16 : 0.10);
      }
      if (map.getLayer('region-boundary-outline')) {
        map.setPaintProperty('region-boundary-outline', 'line-color', isDark ? '#fb7185' : '#be123c');
      }
      if (map.getLayer('region-boundary-fill')) {
        map.setPaintProperty('region-boundary-fill', 'fill-color', isDark ? '#f43f5e' : '#be123c');
        map.setPaintProperty('region-boundary-fill', 'fill-opacity', isDark ? 0.16 : 0.10);
      }
      map.triggerRepaint();
    } catch {
      /* safe */
    }
  }, [layerVisibility.labels]);

  // ─────────────────────────────────────────────────────────────────────
  // Mount effect — create the MapLibre Map
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const isDark = theme === 'dark';

    const isValidLat = Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90;
    const isValidLon = Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
    const centerLng = isValidLon ? location.longitude : -74.008;
    const centerLat = isValidLat ? location.latitude : 40.712;

    const darkBaseTiles = [
      'https://a.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/rastertiles/dark_nolabels/{z}/{x}/{y}@2x.png',
    ];
    const lightBaseTiles = [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png',
    ];
    const darkLabelTiles = [
      'https://a.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}@2x.png',
    ];
    const lightLabelTiles = [
      'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
      'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
    ];

    const map = new Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
          'carto-base-dark': {
            type: 'raster',
            tiles: darkBaseTiles,
            tileSize: 256,
            attribution: '© CartoDB © OpenStreetMap',
          },
          'carto-base-light': {
            type: 'raster',
            tiles: lightBaseTiles,
            tileSize: 256,
            attribution: '© CartoDB © OpenStreetMap',
          },
          'carto-labels-dark': {
            type: 'raster',
            tiles: darkLabelTiles,
            tileSize: 256,
          },
          'carto-labels-light': {
            type: 'raster',
            tiles: lightLabelTiles,
            tileSize: 256,
          },
          'region-mask': {
            type: 'geojson',
            data: EMPTY_FC,
          },
          'region-boundary': {
            type: 'geojson',
            data: EMPTY_FC,
          },
          'thermal-tiles': {
            type: 'geojson',
            data: EMPTY_FC,
          },
          'analysis-aoi': {
            type: 'geojson',
            data: EMPTY_FC,
          },
        },
        layers: [
          // 1. Basemap (Dark & Light)
          {
            id: 'carto-base-dark-layer',
            type: 'raster',
            source: 'carto-base-dark',
            minzoom: 0,
            maxzoom: 22,
            paint: { 'raster-opacity': isDark ? 0.95 : 0 },
            layout: { visibility: isDark ? 'visible' : 'none' },
          },
          {
            id: 'carto-base-light-layer',
            type: 'raster',
            source: 'carto-base-light',
            minzoom: 0,
            maxzoom: 22,
            paint: { 'raster-opacity': isDark ? 0 : 0.95 },
            layout: { visibility: isDark ? 'none' : 'visible' },
          },
          // 2. Spotlight Mask — Dims the entire world OUTSIDE the selected state region
          {
            id: 'region-mask-fill',
            type: 'fill',
            source: 'region-mask',
            paint: {
              'fill-color': isDark ? '#000000' : '#0f172a',
              'fill-opacity': isDark ? 0.55 : 0.40,
            },
          },
          // 3. Geographical State/Region Boundary (Crimson / Ruby red highlight)
          {
            id: 'region-boundary-fill',
            type: 'fill',
            source: 'region-boundary',
            paint: {
              'fill-color': isDark ? '#f43f5e' : '#be123c',
              'fill-opacity': isDark ? 0.16 : 0.10,
            },
          },
          {
            id: 'region-boundary-glow',
            type: 'line',
            source: 'region-boundary',
            paint: {
              'line-color': isDark ? '#fb7185' : '#e11d48',
              'line-width': 8,
              'line-opacity': 0.6,
              'line-blur': 4,
            },
          },
          {
            id: 'region-boundary-outline',
            type: 'line',
            source: 'region-boundary',
            paint: {
              'line-color': isDark ? '#fb7185' : '#be123c',
              'line-width': 3.5,
              'line-opacity': 1.0,
            },
          },
          // 4. Local AOI interior tint
          {
            id: 'aoi-fill',
            type: 'fill',
            source: 'analysis-aoi',
            paint: {
              'fill-color': '#f43f5e',
              'fill-opacity': isDark ? 0.12 : 0.08,
            },
          },
          // 5. Thermal field polygons (HERO layer)
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
              'fill-opacity': isDark ? 0.88 : 0.78,
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
              'line-width': 2,
              'line-opacity': 0.95,
            },
          },
          // 6. Local AOI Region boundary outline & glow (Red/Crimson)
          {
            id: 'aoi-glow',
            type: 'line',
            source: 'analysis-aoi',
            paint: {
              'line-color': '#f43f5e',
              'line-width': 8,
              'line-opacity': 0.5,
              'line-blur': 4,
            },
          },
          {
            id: 'aoi-outline',
            type: 'line',
            source: 'analysis-aoi',
            paint: {
              'line-color': isDark ? '#fb7185' : '#be123c',
              'line-width': 3.5,
              'line-opacity': 1.0,
            },
          },
          // 6. Labels
          {
            id: 'carto-labels-dark-layer',
            type: 'raster',
            source: 'carto-labels-dark',
            paint: { 'raster-opacity': 0.92 },
            layout: { visibility: isDark ? 'visible' : 'none' },
          },
          {
            id: 'carto-labels-light-layer',
            type: 'raster',
            source: 'carto-labels-light',
            paint: { 'raster-opacity': 1.0 },
            layout: { visibility: isDark ? 'none' : 'visible' },
          },
        ],
      },
      center: [centerLng, centerLat],
      zoom: 13,
    });

    mapRef.current = map;

    if (typeof window !== 'undefined') {
      (window as unknown as { __thermalMap?: unknown }).__thermalMap = map;
    }

    const markReady = () => {
      setMapReady(true);
      map.resize();
      applyThemeToMap(theme === 'dark');
    };

    if (map.isStyleLoaded()) {
      markReady();
    } else {
      map.once('load', markReady);
      setTimeout(markReady, 400);
    }

    // Auto-resize observer on container
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        if (mapRef.current) {
          mapRef.current.resize();
        }
      });
      ro.observe(mapContainerRef.current);
    }

    return () => {
      if (ro) ro.disconnect();
      for (const m of markersRef.current) {
        try { m.remove(); } catch { /* safe */ }
      }
      markersRef.current = [];
      try { map.remove(); } catch { /* safe */ }
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Theme effect — instantaneous toggle
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    applyThemeToMap(theme === 'dark');
  }, [theme, applyThemeToMap]);

  // ─────────────────────────────────────────────────────────────────────
  // Layer visibility effect
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    try {
      const showAoi = layerVisibility.aoi !== false;
      const showThermal = layerVisibility.thermal !== false;
      const showLabels = layerVisibility.labels !== false;
      const isDark = theme === 'dark';

      if (map.getLayer('region-mask-fill')) {
        map.setLayoutProperty('region-mask-fill', 'visibility', showRegionBoundary ? 'visible' : 'none');
      }

      if (map.getLayer('region-boundary-fill')) {
        map.setLayoutProperty('region-boundary-fill', 'visibility', showRegionBoundary ? 'visible' : 'none');
        map.setLayoutProperty('region-boundary-outline', 'visibility', showRegionBoundary ? 'visible' : 'none');
        map.setLayoutProperty('region-boundary-glow', 'visibility', showRegionBoundary ? 'visible' : 'none');
      }

      if (map.getLayer('aoi-fill')) {
        map.setLayoutProperty('aoi-fill', 'visibility', showAoi ? 'visible' : 'none');
        map.setLayoutProperty('aoi-outline', 'visibility', showAoi ? 'visible' : 'none');
        map.setLayoutProperty('aoi-glow', 'visibility', showAoi ? 'visible' : 'none');
      }

      if (map.getLayer('thermal-tiles-fill')) {
        map.setLayoutProperty('thermal-tiles-fill', 'visibility', showThermal ? 'visible' : 'none');
        map.setLayoutProperty('thermal-tiles-outline', 'visibility', showThermal ? 'visible' : 'none');
      }

      if (map.getLayer('carto-labels-dark-layer')) {
        map.setLayoutProperty('carto-labels-dark-layer', 'visibility', isDark && showLabels ? 'visible' : 'none');
      }
      if (map.getLayer('carto-labels-light-layer')) {
        map.setLayoutProperty('carto-labels-light-layer', 'visibility', !isDark && showLabels ? 'visible' : 'none');
      }
      map.triggerRepaint();
    } catch {
      /* safe */
    }
  }, [mapReady, layerVisibility, showRegionBoundary, theme]);

  // ─────────────────────────────────────────────────────────────────────
  // Data effect — reliably push GeoJSON sources into MapLibre
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncSources = () => {
      try {
        const maskSource = map.getSource('region-mask') as GeoJSONSource | undefined;
        const regionSource = map.getSource('region-boundary') as GeoJSONSource | undefined;
        const thermalSource = map.getSource('thermal-tiles') as GeoJSONSource | undefined;
        const aoiSource = map.getSource('analysis-aoi') as GeoJSONSource | undefined;

        if (maskSource) {
          const maskData = (regionMask ?? EMPTY_FC) as unknown as GeoJSONFC;
          maskSource.setData(maskData);
        }

        if (regionSource) {
          const regionData = (regionBoundary ?? EMPTY_FC) as unknown as GeoJSONFC;
          regionSource.setData(regionData);
        }

        if (thermalSource) {
          const thermalData = (spatialField && hasRenderableTemperatureData(spatialField)
            ? spatialField
            : EMPTY_FC) as unknown as GeoJSONFC;
          thermalSource.setData(thermalData);
        }

        if (aoiSource) {
          const aoiData = (analysisAoi ?? EMPTY_FC) as unknown as GeoJSONFC;
          aoiSource.setData(aoiData);
        }

        map.triggerRepaint();
      } catch {
        /* safe */
      }
    };

    syncSources();
    const t1 = setTimeout(syncSources, 200);
    const t2 = setTimeout(syncSources, 600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [spatialField, analysisAoi, regionBoundary, regionMask]);

  // ─────────────────────────────────────────────────────────────────────
  // Markers effect
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markersRef.current) {
      try { m.remove(); } catch { /* safe */ }
    }
    markersRef.current = [];

    if (layerVisibility.candidates === false) {
      return;
    }

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
  }, [mapReady, candidates, recommendedLocationId, location, theme, layerVisibility.candidates]);

  // ─────────────────────────────────────────────────────────────────────
  // FitBounds effects
  // ─────────────────────────────────────────────────────────────────────
  const fitToLocalAoi = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = computeBounds(
      analysisAoi,
      spatialField,
      (candidates ?? []).map((c) => c.location),
      location,
      regionBoundary,
      false,
    );
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 600 });
      } catch {
        map.flyTo({ center: [location.longitude, location.latitude], zoom: 13.5, duration: 600 });
      }
    } else {
      map.flyTo({ center: [location.longitude, location.latitude], zoom: 13.5, duration: 600 });
    }
  }, [analysisAoi, spatialField, candidates, location, regionBoundary]);

  const fitToStateRegion = useCallback(() => {
    const map = mapRef.current;
    if (!map || !regionBoundary) return;
    const bounds = computeBounds(
      analysisAoi,
      spatialField,
      (candidates ?? []).map((c) => c.location),
      location,
      regionBoundary,
      true,
    );
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: 40, maxZoom: 7.5, duration: 800 });
      } catch { /* safe */ }
    }
  }, [analysisAoi, spatialField, candidates, location, regionBoundary]);

  useEffect(() => {
    if (!mapReady) return;
    fitToLocalAoi();
  }, [mapReady, location.latitude, location.longitude, fitToLocalAoi]);

  const legendTicks = getThermalLegendTicks(unit);

  const toggleLayer = (layer: keyof MapLayerVisibility) => {
    if (onToggleLayer) {
      onToggleLayer({ [layer]: !layerVisibility[layer] });
    }
  };

  const stateDisplayName = locationState || (locationName?.includes(',') ? locationName.split(',')[1]?.trim() : '');

  return (
    <div
      role="region"
      aria-label="Hyperlocal thermal context map showing FortyGuard surface temperature tiles, the selected analysis area, candidate sites, and the recommended site"
      className="relative w-full h-[480px] sm:h-[520px] lg:h-[560px] rounded-xl overflow-hidden shadow-2xl shadow-black/40 border border-border group"
      style={{ backgroundColor: theme === 'dark' ? '#060a12' : '#f1f5f9' }}
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

      {/* ─────────────────────────────────────────────────────────────
          TOP INTERACTIVE LAYER & REGION TOOLBAR
          ───────────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 flex-wrap pointer-events-none z-20">
        
        {/* Left Side: Region Boundary & Local AOI controls */}
        <div className="pointer-events-auto flex items-center gap-1.5 flex-wrap">
          
          {/* Geographical State/Region Boundary (Crimson highlight matching screenshot) */}
          <button
            type="button"
            onClick={() => setShowRegionBoundary((prev) => !prev)}
            title={`Toggle ${stateDisplayName || 'State'} Regional Boundary Polygon`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md shadow-lg border transition-all cursor-pointer ${
              showRegionBoundary
                ? 'bg-rose-500/25 border-rose-500 text-rose-300 shadow-rose-950/40 ring-1 ring-rose-500/50'
                : 'bg-surface-card/90 border-border text-text-muted hover:text-text-primary'
            }`}
          >
            <span
              className="inline-block flex-shrink-0 transition-all"
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '2px',
                border: `2px solid ${showRegionBoundary ? '#f43f5e' : 'currentColor'}`,
                backgroundColor: showRegionBoundary ? 'rgba(244,63,94,0.5)' : 'transparent',
              }}
            />
            <MapIcon className="size-3.5 text-rose-400" />
            <span>{stateDisplayName ? `${stateDisplayName} Region` : 'Territory Boundary'}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
              showRegionBoundary ? 'bg-rose-500/40 text-rose-100' : 'bg-surface-elevated text-text-dimmed'
            }`}>
              {showRegionBoundary ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* AOI Local Boundary Toggle Button */}
          <button
            type="button"
            onClick={() => toggleLayer('aoi')}
            title="Toggle Local Analysis Area AOI Boundary Polygon"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md shadow-lg border transition-all cursor-pointer ${
              layerVisibility.aoi !== false
                ? 'bg-rose-500/25 border-rose-500 text-rose-300 shadow-rose-950/40 ring-1 ring-rose-500/50'
                : 'bg-surface-card/90 border-border text-text-muted hover:text-text-primary'
            }`}
          >
            <span
              className="inline-block flex-shrink-0 transition-all"
              style={{
                width: '10px',
                height: '10px',
                borderRadius: areaShape === 'circle' ? '50%' : '2px',
                border: `2px ${layerVisibility.aoi !== false ? 'solid #be123c' : 'dashed currentColor'}`,
                backgroundColor: layerVisibility.aoi !== false ? 'rgba(244,63,94,0.5)' : 'transparent',
              }}
            />
            <span>Red AOI Shape</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
              layerVisibility.aoi !== false ? 'bg-rose-500/40 text-rose-100' : 'bg-surface-elevated text-text-dimmed'
            }`}>
              {layerVisibility.aoi !== false ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Quick Shape Switcher */}
          {onChangeAreaShape && (
            <div className="flex items-center bg-surface-card/95 backdrop-blur-md rounded-lg border border-border p-0.5 shadow-md">
              <button
                type="button"
                onClick={() => onChangeAreaShape('polygon')}
                title="Square Bounding Box"
                className={`p-1.5 rounded-md text-xs transition-all flex items-center gap-1 cursor-pointer ${
                  areaShape === 'polygon'
                    ? 'bg-rose-600 text-white shadow-sm font-semibold'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Box className="size-3.5" />
                <span className="hidden sm:inline text-[11px]">Square</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeAreaShape('circle')}
                title="Radial Circle"
                className={`p-1.5 rounded-md text-xs transition-all flex items-center gap-1 cursor-pointer ${
                  areaShape === 'circle'
                    ? 'bg-rose-600 text-white shadow-sm font-semibold'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <CircleIcon className="size-3.5" />
                <span className="hidden sm:inline text-[11px]">Circle</span>
              </button>
            </div>
          )}

          {/* Quick AOI Size Selector Dropdown / Pill */}
          {onChangeAoiHalfSideMetres && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSizeMenu((prev) => !prev)}
                title="Change Analysis Area Radius/Dimension"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium bg-surface-card/95 backdrop-blur-md border border-border shadow-md text-text-primary hover:border-rose-500/60 transition-all cursor-pointer"
              >
                <span className="text-text-dimmed">Span:</span>
                <span className="text-rose-400 font-bold">
                  {areaShape === 'circle' ? `r=${aoiHalfSideMetres}m` : `±${aoiHalfSideMetres}m`}
                </span>
                <span className="text-[10px] text-text-dimmed">▾</span>
              </button>

              {showSizeMenu && (
                <div className="absolute top-full left-0 mt-1 bg-surface-card/95 backdrop-blur-md rounded-xl border border-border shadow-xl py-1 z-30 min-w-[130px]">
                  <div className="px-2.5 py-1 text-[10px] font-bold text-text-dimmed uppercase tracking-wider border-b border-border mb-1">
                    {areaShape === 'circle' ? 'Radius' : 'Half-side span'}
                  </div>
                  {AOI_HALF_SIDE_PRESETS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        onChangeAoiHalfSideMetres(m);
                        setShowSizeMenu(false);
                      }}
                      className={`w-full px-2.5 py-1.5 text-xs text-left font-mono flex items-center justify-between transition-all cursor-pointer ${
                        aoiHalfSideMetres === m
                          ? 'bg-rose-500/15 text-rose-400 font-bold'
                          : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
                      }`}
                    >
                      <span>{m >= 1000 ? `${m / 1000} km` : `${m} m`}</span>
                      {aoiHalfSideMetres === m && <Check className="size-3 text-rose-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Quick Layer Toggles & View Fits & Theme Switcher */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-surface-card/95 backdrop-blur-md p-1 rounded-xl border border-border shadow-lg">
          {/* Thermal Heatmap layer toggle */}
          <button
            type="button"
            onClick={() => toggleLayer('thermal')}
            title="Toggle Thermal Heatmap Layer"
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
              layerVisibility.thermal !== false
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                : 'text-text-muted hover:text-text-primary opacity-60'
            }`}
          >
            <Flame className="size-3.5 text-amber-400" />
            <span className="hidden md:inline text-[11px]">Heatmap</span>
          </button>

          {/* Sites / Candidates layer toggle */}
          <button
            type="button"
            onClick={() => toggleLayer('candidates')}
            title="Toggle Candidate & Recommended Markers"
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
              layerVisibility.candidates !== false
                ? 'bg-pink-500/25 text-pink-300 border border-pink-500/50'
                : 'text-text-muted hover:text-text-primary opacity-60'
            }`}
          >
            <MapPin className="size-3.5 text-pink-400" />
            <span className="hidden md:inline text-[11px]">Sites</span>
          </button>

          {/* Labels layer toggle */}
          <button
            type="button"
            onClick={() => toggleLayer('labels')}
            title="Toggle Map Street & City Labels"
            className={`p-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
              layerVisibility.labels !== false
                ? 'bg-slate-500/25 text-text-primary border border-border'
                : 'text-text-muted hover:text-text-primary opacity-60'
            }`}
          >
            <Tag className="size-3.5" />
            <span className="hidden md:inline text-[11px]">Labels</span>
          </button>

          <div className="w-[1px] h-4 bg-border my-auto mx-0.5" />

          {/* Light / Dark Theme toggle directly on map */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch map to Light Mode' : 'Switch map to Dark Mode'}
            className="p-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all flex items-center cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5 text-indigo-400" />}
          </button>

          {/* Zoom to Region View Button */}
          {regionBoundary && (
            <button
              type="button"
              onClick={fitToStateRegion}
              title={`Zoom to Entire ${stateDisplayName || 'State'} Region Boundary`}
              className="px-2 py-1 rounded-lg text-xs text-rose-300 bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/40 transition-all flex items-center gap-1 cursor-pointer font-semibold"
            >
              <ZoomIn className="size-3.5 text-rose-400" />
              <span className="hidden sm:inline text-[10px]">State View</span>
            </button>
          )}

          {/* Fit / Center Local AOI View Button */}
          <button
            type="button"
            onClick={fitToLocalAoi}
            title="Zoom to Local Analysis AOI"
            className="p-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all flex items-center cursor-pointer"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>

      </div>

      {/* Thermal legend — bottom-left overlay */}
      <div
        className="absolute bottom-3 left-3 bg-surface-card/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl shadow-xl border border-border z-10"
        data-testid="map-legend-ticks"
      >
        <div
          className="text-[10px] font-bold text-text-dimmed uppercase tracking-wider mb-1.5 flex items-center justify-between gap-2"
          data-testid="map-legend-header"
        >
          <span>Thermal Scale ({tempUnitSuffix(unit)})</span>
          {selectedTileId && (
            <span className="text-[9px] text-accent-cyan font-mono font-normal">
              Tile: {selectedTileId}
            </span>
          )}
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

      {/* Source attribution — bottom-right */}
      <div className="absolute bottom-3 right-3 bg-surface-card/85 backdrop-blur-sm px-2.5 py-1 rounded-md border border-border z-10 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse" />
        <span className="text-[9px] text-text-dimmed font-mono uppercase tracking-wide">
          FortyGuard Hyperlocal Thermal
        </span>
      </div>

      {/* Empty state overlay (shown only when no spatialField AND no AOI) */}
      {!spatialField && !analysisAoi && !location && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
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
