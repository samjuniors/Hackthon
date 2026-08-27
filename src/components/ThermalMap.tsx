'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Marker, Popup, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LocationPoint, PolygonAOI, CandidateLocation } from '@/types/domain';
import { useTheme } from '@/components/ThemeProvider';
import {
  type TempUnit,
  DEFAULT_TEMP_UNIT,
  getThermalLegendTicks,
  tempUnitSuffix,
} from '@/lib/temperature';
import type { MapLayerVisibility, AnalysisAreaShape } from '@/lib/user-preferences';
import { moveAoiToCenter, getAoiCenter } from '@/lib/spatial/aoi';
import type { SelectionCameraBehavior as CameraBehavior } from '@/lib/location/selection-behavior';
import { Flame, MapPin, Maximize2, Map as MapIcon, ZoomIn, Sun, Moon, Crosshair } from 'lucide-react';
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
   * Geographic region boundary polygon (e.g. California state polygon).
   * GEOGRAPHIC CONTEXT ONLY — never labeled as provider plan coverage.
   */
  regionBoundary?: PolygonAOI | null;
  /** Inverted mask polygon dimming everything outside the selected region. */
  regionMask?: PolygonAOI | null;
  /** Display name of the geographic region (e.g. "California"). */
  regionDisplayName?: string;
  /**
   * Canonical Analysis AOI — the EXACT geometry sent to FortyGuard.
   * Rendered as the visible AOI boundary on the map and DRAGGABLE as one
   * object (Section 4): the moved geometry becomes canonical.
   */
  analysisAoi: PolygonAOI | null;
  /** FortyGuard thermal field — genuine provider/captured cells only. */
  spatialField: PolygonAOI | null;
  selectedTileId?: string | number;
  candidates?: CandidateLocation[];
  recommendedLocationId?: string;
  unit?: TempUnit;
  /** Map layer toggles synchronized with user preferences */
  layerVisibility?: MapLayerVisibility;
  onToggleLayer?: (v: Partial<MapLayerVisibility>) => void;
  /** AOI shape (for the toolbar shape indicator) */
  areaShape?: AnalysisAreaShape;
  /** Fired when the user finishes dragging the AOI — new canonical center. */
  onMoveAoi?: (center: LocationPoint) => void;
  /** Add-candidate-site mode: map clicks place a candidate at the clicked point. */
  addSiteMode?: boolean;
  onAddSiteAt?: (lng: number, lat: number) => void;
  onToggleAddSiteMode?: () => void;
  /** Camera behavior requested by the page; applied when cameraNonce changes. */
  cameraBehavior?: CameraBehavior;
  /** Bump to re-apply cameraBehavior (also refits on location changes). */
  cameraNonce?: number;
  /**
   * DEMO captured-field extent (dashed outline). Shown in FIXTURE mode so the
   * user can see the FIXED extent of the captured provider data — moving the
   * AOI outside it cannot produce new thermal data.
   */
  captureExtent?: PolygonAOI | null;
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
 * Compute bounding box covering the AOI, thermal field, candidates, and the
 * selected location (small geographic context around the AOI — Section 12).
 */
function computeAoiBounds(
  analysisAoi: PolygonAOI | null,
  spatialField: PolygonAOI | null,
  candidateLocs: LocationPoint[],
  targetLoc: LocationPoint,
): [[number, number], [number, number]] | null {
  const allPts: [number, number][] = [];

  if (Number.isFinite(targetLoc.longitude) && Number.isFinite(targetLoc.latitude)) {
    allPts.push([targetLoc.longitude, targetLoc.latitude]);
  }

  if (analysisAoi && analysisAoi.features.length > 0) {
    for (const f of analysisAoi.features) {
      const pts = extractCoords(f.geometry as { type: string; coordinates: unknown });
      for (const [lng, lat] of pts) {
        if (Math.abs(lng - targetLoc.longitude) < 0.35 && Math.abs(lat - targetLoc.latitude) < 0.35) {
          allPts.push([lng, lat]);
        }
      }
    }
  }

  if (spatialField && spatialField.features.length > 0) {
    for (const f of spatialField.features) {
      const pts = extractCoords(f.geometry as { type: string; coordinates: unknown });
      for (const [lng, lat] of pts) {
        if (Math.abs(lng - targetLoc.longitude) < 0.35 && Math.abs(lat - targetLoc.latitude) < 0.35) {
          allPts.push([lng, lat]);
        }
      }
    }
  }

  for (const { longitude, latitude } of candidateLocs) {
    if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
      if (Math.abs(longitude - targetLoc.longitude) < 0.35 && Math.abs(latitude - targetLoc.latitude) < 0.35) {
        allPts.push([longitude, latitude]);
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

  const padRatio = 0.25;
  const padLng = Math.max(0.001, (maxLng - minLng) * padRatio);
  const padLat = Math.max(0.001, (maxLat - minLat) * padRatio);

  return [
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ];
}

/** Bounding box of the geographic region boundary (state-level fit). */
function computeRegionBounds(
  regionBoundary: PolygonAOI | null,
): [[number, number], [number, number]] | null {
  if (!regionBoundary || regionBoundary.features.length === 0) return null;
  const allPts: [number, number][] = [];
  for (const f of regionBoundary.features) {
    allPts.push(...extractCoords(f.geometry as { type: string; coordinates: unknown }));
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
  const padRatio = 0.08;
  const padLng = Math.max(0.01, (maxLng - minLng) * padRatio);
  const padLat = Math.max(0.01, (maxLat - minLat) * padRatio);
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
  regionDisplayName,
  analysisAoi,
  spatialField,
  selectedTileId,
  candidates,
  recommendedLocationId,
  unit = DEFAULT_TEMP_UNIT,
  layerVisibility = { thermal: true, candidates: true, labels: true, aoi: true },
  onToggleLayer,
  areaShape = 'polygon',
  onMoveAoi,
  addSiteMode = false,
  onAddSiteAt,
  onToggleAddSiteMode,
  cameraBehavior = 'fit-aoi',
  cameraNonce = 0,
  captureExtent,
}: ThermalMapProps) {
  const { theme, toggleTheme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const aoiHandleRef = useRef<Marker | null>(null);
  const draggingAoiRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [showRegionBoundary, setShowRegionBoundary] = useState(true);

  // Refs for values read inside map event callbacks (avoid stale closures).
  const addSiteModeRef = useRef(addSiteMode);
  const onAddSiteAtRef = useRef(onAddSiteAt);
  useEffect(() => {
    addSiteModeRef.current = addSiteMode;
    onAddSiteAtRef.current = onAddSiteAt;
  }, [addSiteMode, onAddSiteAt]);

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
        map.setPaintProperty('region-mask-fill', 'fill-opacity', isDark ? 0.45 : 0.32);
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
        map.setPaintProperty('aoi-fill', 'fill-opacity', isDark ? 0.04 : 0.03);
      }
      if (map.getLayer('region-boundary-outline')) {
        map.setPaintProperty('region-boundary-outline', 'line-color', isDark ? '#fb7185' : '#be123c');
      }
      if (map.getLayer('region-boundary-glow')) {
        map.setPaintProperty('region-boundary-glow', 'line-color', isDark ? '#fb7185' : '#e11d48');
      }
      if (map.getLayer('region-boundary-fill')) {
        map.setPaintProperty('region-boundary-fill', 'fill-color', '#000000');
        map.setPaintProperty('region-boundary-fill', 'fill-opacity', 0.0);
      }
      map.triggerRepaint();
    } catch {
      /* safe */
    }
  }, [layerVisibility.labels]);

  // ─────────────────────────────────────────────────────────────────────
  // Mount effect — create the MapLibre Map instance ONCE
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const isDark = theme === 'dark';

    const isValidLat = Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90;
    const isValidLon = Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
    const centerLng = isValidLon ? location.longitude : -74.008;
    const centerLat = isValidLat ? location.latitude : 40.712;

    // Esri World Gray Canvas raster tiles — keyless, no watermark, production-clean.
    // (Supersedes CARTO basemaps.cartocdn.com rasters, which now bake an
    // "API KEY REQUIRED" watermark server-side for keyless anonymous use.)
    // NOTE: ArcGIS tile scheme is {z}/{y}/{x} (row/column) and maxes at zoom 16.
    const darkBaseTiles = [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    ];
    const lightBaseTiles = [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    ];
    const darkLabelTiles = [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    ];
    const lightLabelTiles = [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    ];
    const esriAttribution =
      'Basemap © Esri, HERE, Garmin, FAO, NOAA, USGS';

    const map = new Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'carto-base-dark': {
            type: 'raster',
            tiles: darkBaseTiles,
            tileSize: 256,
            maxzoom: 16,
            attribution: esriAttribution,
          },
          'carto-base-light': {
            type: 'raster',
            tiles: lightBaseTiles,
            tileSize: 256,
            maxzoom: 16,
            attribution: esriAttribution,
          },
          'carto-labels-dark': {
            type: 'raster',
            tiles: darkLabelTiles,
            tileSize: 256,
            maxzoom: 16,
          },
          'carto-labels-light': {
            type: 'raster',
            tiles: lightLabelTiles,
            tileSize: 256,
            maxzoom: 16,
          },
        },
        layers: [
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
          {
            id: 'carto-labels-dark-layer',
            type: 'raster',
            source: 'carto-labels-dark',
            paint: { 'raster-opacity': isDark ? 0.92 : 0 },
            layout: { visibility: isDark ? 'visible' : 'none' },
          },
          {
            id: 'carto-labels-light-layer',
            type: 'raster',
            source: 'carto-labels-light',
            paint: { 'raster-opacity': isDark ? 0 : 1.0 },
            layout: { visibility: isDark ? 'none' : 'visible' },
          },
        ],
      },
      center: [centerLng, centerLat],
      zoom: 14.5,
    });

    mapRef.current = map;

    if (typeof window !== 'undefined') {
      (window as unknown as { __thermalMap?: unknown }).__thermalMap = map;
    }

    const initMapLayersAndSources = () => {
      // 1. Register GeoJSON Data Sources
      if (!map.getSource('region-mask')) {
        map.addSource('region-mask', {
          type: 'geojson',
          data: (regionMask ?? EMPTY_FC) as unknown as GeoJSONFC,
        });
      }
      if (!map.getSource('region-boundary')) {
        map.addSource('region-boundary', {
          type: 'geojson',
          data: (regionBoundary ?? EMPTY_FC) as unknown as GeoJSONFC,
        });
      }
      if (!map.getSource('capture-extent')) {
        map.addSource('capture-extent', {
          type: 'geojson',
          data: (captureExtent ?? EMPTY_FC) as unknown as GeoJSONFC,
        });
      }
      if (!map.getSource('analysis-aoi')) {
        map.addSource('analysis-aoi', {
          type: 'geojson',
          data: (analysisAoi ?? EMPTY_FC) as unknown as GeoJSONFC,
        });
      }
      if (!map.getSource('thermal-tiles')) {
        map.addSource('thermal-tiles', {
          type: 'geojson',
          data: (spatialField && hasRenderableTemperatureData(spatialField)
            ? spatialField
            : EMPTY_FC) as unknown as GeoJSONFC,
        });
      }

      // 2. Register GeoJSON Layers in strict visual hierarchy (Section 11):
      //    basemap → region context → thermal cells → AOI boundary → (markers on top)
      // Layer A: Outside-region Dimming Mask (GEOGRAPHIC context, not coverage)
      if (!map.getLayer('region-mask-fill')) {
        map.addLayer({
          id: 'region-mask-fill',
          type: 'fill',
          source: 'region-mask',
          paint: {
            'fill-color': isDark ? '#000000' : '#0f172a',
            'fill-opacity': isDark ? 0.45 : 0.32,
          },
        });
      }

      // Layer B: Region interior — ZERO opacity fill (interior stays readable)
      if (!map.getLayer('region-boundary-fill')) {
        map.addLayer({
          id: 'region-boundary-fill',
          type: 'fill',
          source: 'region-boundary',
          paint: {
            'fill-color': '#000000',
            'fill-opacity': 0.0,
          },
        });
      }

      // Layer B2: DEMO captured-field extent — dashed amber outline marking the
      // FIXED extent of the captured provider data (FIXTURE mode only). The
      // boundary is context: thermal cells render on top of it.
      if (!map.getLayer('capture-extent-outline')) {
        map.addLayer({
          id: 'capture-extent-outline',
          type: 'line',
          source: 'capture-extent',
          paint: {
            'line-color': isDark ? '#fbbf24' : '#b45309',
            'line-width': 2,
            'line-opacity': 0.9,
            'line-dasharray': [2, 2],
          },
        });
      }

      // Layer C: FortyGuard Thermal Heatmap Tile Fill (Primary Hero)
      if (!map.getLayer('thermal-tiles-fill')) {
        map.addLayer({
          id: 'thermal-tiles-fill',
          type: 'fill',
          source: 'thermal-tiles',
          paint: {
            'fill-color': [
              'interpolate',
              ['linear'],
              ['get', 'average_temperature'],
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
            'fill-opacity': isDark ? 0.82 : 0.74,
          },
        });
      }

      // Layer D: Thermal Tile Border Framing (crisp cell boundaries)
      if (!map.getLayer('thermal-tiles-outline')) {
        map.addLayer({
          id: 'thermal-tiles-outline',
          type: 'line',
          source: 'thermal-tiles',
          paint: {
            'line-color': isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)',
            'line-width': 1.0,
            'line-opacity': 0.85,
          },
        });
      }

      // Layer E: Local Analysis AOI Interior Tint (very low opacity — never a solid overlay)
      if (!map.getLayer('aoi-fill')) {
        map.addLayer({
          id: 'aoi-fill',
          type: 'fill',
          source: 'analysis-aoi',
          paint: {
            'fill-color': '#f43f5e',
            'fill-opacity': isDark ? 0.04 : 0.03,
          },
        });
      }

      // Layer F: Geographic Region Boundary glow + dotted outline (contextual)
      if (!map.getLayer('region-boundary-glow')) {
        map.addLayer({
          id: 'region-boundary-glow',
          type: 'line',
          source: 'region-boundary',
          paint: {
            'line-color': isDark ? '#fb7185' : '#e11d48',
            'line-width': 8,
            'line-opacity': 0.5,
            'line-blur': 4,
          },
        });
      }
      if (!map.getLayer('region-boundary-outline')) {
        map.addLayer({
          id: 'region-boundary-outline',
          type: 'line',
          source: 'region-boundary',
          paint: {
            'line-color': isDark ? '#fb7185' : '#e11d48',
            'line-width': 3,
            'line-opacity': 1.0,
            'line-dasharray': [3, 2],
          },
        });
      }

      // Layer G: Canonical Analysis AOI outline (strong local focus)
      if (!map.getLayer('aoi-glow')) {
        map.addLayer({
          id: 'aoi-glow',
          type: 'line',
          source: 'analysis-aoi',
          paint: {
            'line-color': '#f43f5e',
            'line-width': 8,
            'line-opacity': 0.5,
            'line-blur': 4,
          },
        });
      }
      if (!map.getLayer('aoi-outline')) {
        map.addLayer({
          id: 'aoi-outline',
          type: 'line',
          source: 'analysis-aoi',
          paint: {
            'line-color': isDark ? '#fb7185' : '#be123c',
            'line-width': 3.5,
            'line-opacity': 1.0,
          },
        });
      }

      setMapReady(true);
      map.resize();
      applyThemeToMap(theme === 'dark');

      // Push latest data
      try {
        const maskSource = map.getSource('region-mask') as GeoJSONSource | undefined;
        const regionSource = map.getSource('region-boundary') as GeoJSONSource | undefined;
        const captureSource = map.getSource('capture-extent') as GeoJSONSource | undefined;
        const thermalSource = map.getSource('thermal-tiles') as GeoJSONSource | undefined;
        const aoiSource = map.getSource('analysis-aoi') as GeoJSONSource | undefined;

        if (maskSource) maskSource.setData((regionMask ?? EMPTY_FC) as unknown as GeoJSONFC);
        if (regionSource) regionSource.setData((regionBoundary ?? EMPTY_FC) as unknown as GeoJSONFC);
        if (captureSource) captureSource.setData((captureExtent ?? EMPTY_FC) as unknown as GeoJSONFC);
        if (thermalSource && spatialField && hasRenderableTemperatureData(spatialField)) {
          thermalSource.setData(spatialField as unknown as GeoJSONFC);
        }
        if (aoiSource) aoiSource.setData((analysisAoi ?? EMPTY_FC) as unknown as GeoJSONFC);
      } catch {
        /* safe */
      }
    };

    map.on('load', initMapLayersAndSources);

    // Add-candidate-site mode: map click places a candidate (Section 8).
    const handleMapClick = (e: MapMouseEvent) => {
      if (addSiteModeRef.current && onAddSiteAtRef.current) {
        onAddSiteAtRef.current(e.lngLat.lng, e.lngLat.lat);
      }
    };
    map.on('click', handleMapClick);

    // Crosshair cursor while placing a candidate site.
    const handleMouseEnter = () => {
      if (addSiteModeRef.current) map.getCanvas().style.cursor = 'crosshair';
    };
    const handleMouseLeave = () => {
      if (addSiteModeRef.current) map.getCanvas().style.cursor = 'crosshair';
    };
    map.on('mousemove', handleMouseEnter);
    map.on('drag', handleMouseLeave);

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
      if (aoiHandleRef.current) {
        try { aoiHandleRef.current.remove(); } catch { /* safe */ }
        aoiHandleRef.current = null;
      }
      try { map.remove(); } catch { /* safe */ }
      mapRef.current = null;
      setMapReady(false);
    };
     
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Cursor effect for add-site mode
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.getCanvas().style.cursor = addSiteMode ? 'crosshair' : '';
  }, [mapReady, addSiteMode]);

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
  // Data effect — push GeoJSON sources into MapLibre via setData()
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncSources = () => {
      try {
        const maskSource = map.getSource('region-mask') as GeoJSONSource | undefined;
        const regionSource = map.getSource('region-boundary') as GeoJSONSource | undefined;
        const captureSource = map.getSource('capture-extent') as GeoJSONSource | undefined;
        const thermalSource = map.getSource('thermal-tiles') as GeoJSONSource | undefined;
        const aoiSource = map.getSource('analysis-aoi') as GeoJSONSource | undefined;

        if (maskSource) {
          maskSource.setData((regionMask ?? EMPTY_FC) as unknown as GeoJSONFC);
        }

        if (regionSource) {
          regionSource.setData((regionBoundary ?? EMPTY_FC) as unknown as GeoJSONFC);
        }

        if (captureSource) {
          captureSource.setData((captureExtent ?? EMPTY_FC) as unknown as GeoJSONFC);
        }

        if (thermalSource) {
          const thermalData = (spatialField && hasRenderableTemperatureData(spatialField)
            ? spatialField
            : EMPTY_FC) as unknown as GeoJSONFC;
          thermalSource.setData(thermalData);
        }

        if (aoiSource && !draggingAoiRef.current) {
          aoiSource.setData((analysisAoi ?? EMPTY_FC) as unknown as GeoJSONFC);
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
  }, [mapReady, spatialField, analysisAoi, regionBoundary, regionMask, captureExtent]);

  // ─────────────────────────────────────────────────────────────────────
  // Draggable AOI handle (Section 4 — the AOI moves as ONE object)
  // Pure translation: square stays square, circle stays circular, size is
  // preserved. dragend → onMoveAoi(newCenter) → canonical geometry update.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const center = analysisAoi ? getAoiCenter(analysisAoi) : null;
    if (!center) {
      if (aoiHandleRef.current) {
        try { aoiHandleRef.current.remove(); } catch { /* safe */ }
        aoiHandleRef.current = null;
      }
      return;
    }

    const isDark = theme === 'dark';

    if (!aoiHandleRef.current) {
      const el = document.createElement('div');
      el.className = 'aoi-drag-handle';
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', 'Drag to move the analysis area');
      el.style.cssText = [
        'width:34px',
        'height:34px',
        'cursor:grab',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'border-radius:50%',
        `background:${isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.92)'}`,
        `border:2.5px solid #be123c`,
        'box-shadow:0 2px 10px rgba(0,0,0,0.45), 0 0 0 6px rgba(190,18,60,0.15)',
        'z-index:25',
        'transition:box-shadow 0.15s ease',
      ].join(';');
      el.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#be123c" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="3" x2="12" y2="21"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <circle cx="12" cy="12" r="1.6" fill="#be123c" stroke="none"></circle>
        </svg>
      `;

      const marker = new Marker({ element: el, draggable: true })
        .setLngLat([center.longitude, center.latitude])
        .addTo(map);

      const onDrag = () => {
        draggingAoiRef.current = true;
        const lngLat = marker.getLngLat();
        if (!analysisAoi) return;
        // Live preview: translate the canonical geometry under the handle.
        const preview = moveAoiToCenter(analysisAoi, {
          latitude: lngLat.lat,
          longitude: lngLat.lng,
        });
        const aoiSource = map.getSource('analysis-aoi') as GeoJSONSource | undefined;
        if (aoiSource) aoiSource.setData(preview as unknown as GeoJSONFC);
        el.style.cursor = 'grabbing';
      };

      const onDragEnd = () => {
        draggingAoiRef.current = false;
        el.style.cursor = 'grab';
        const lngLat = marker.getLngLat();
        onMoveAoi?.({ latitude: lngLat.lat, longitude: lngLat.lng });
      };

      marker.on('drag', onDrag);
      marker.on('dragend', onDragEnd);
      aoiHandleRef.current = marker;
    } else {
      // External geometry update (size/shape/location change) — reposition handle
      if (!draggingAoiRef.current) {
        aoiHandleRef.current.setLngLat([center.longitude, center.latitude]);
      }
    }
  }, [mapReady, analysisAoi, onMoveAoi, theme]);

  // ─────────────────────────────────────────────────────────────────────
  // Markers effect (candidate sites + selected point)
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
  // Camera behavior (Section 12)
  //   fit-aoi    → AOI + small geographic context (city/local selection)
  //   fit-region → the geographic region boundary (explicit state selection)
  //   fit-point  → zoom directly to the selected street/address point
  // ─────────────────────────────────────────────────────────────────────
  const fitToLocalAoi = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const aoiCenter = analysisAoi ? getAoiCenter(analysisAoi) : null;
    const focus = aoiCenter ?? location;
    const bounds = computeAoiBounds(
      analysisAoi,
      spatialField,
      (candidates ?? []).map((c) => c.location),
      focus,
    );
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: 50, maxZoom: 16.5, duration: 700 });
      } catch {
        map.flyTo({ center: [focus.longitude, focus.latitude], zoom: 15.5, duration: 700 });
      }
    } else {
      map.flyTo({ center: [focus.longitude, focus.latitude], zoom: 15.5, duration: 700 });
    }
  }, [analysisAoi, spatialField, candidates, location]);

  const fitToRegion = useCallback(() => {
    const map = mapRef.current;
    if (!map || !regionBoundary) return;
    const bounds = computeRegionBounds(regionBoundary);
    if (bounds) {
      try {
        map.fitBounds(bounds, { padding: 40, maxZoom: 8, duration: 900 });
      } catch { /* safe */ }
    }
  }, [regionBoundary]);

  const fitToPoint = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: [location.longitude, location.latitude], zoom: 16.5, duration: 900 });
  }, [location]);

  // Apply the requested camera behavior whenever the page bumps the nonce
  // (location selection / AOI move events).
  useEffect(() => {
    if (!mapReady) return;
    if (cameraBehavior === 'fit-region') {
      fitToRegion();
    } else if (cameraBehavior === 'fit-point') {
      fitToPoint();
    } else {
      fitToLocalAoi();
    }
     
  }, [mapReady, cameraNonce]);

  const legendTicks = getThermalLegendTicks(unit);

  const toggleLayer = (layer: keyof MapLayerVisibility) => {
    if (onToggleLayer) {
      onToggleLayer({ [layer]: !layerVisibility[layer] });
    }
  };

  const stateDisplayName = regionDisplayName
    || locationState
    || (locationName?.includes(',') ? locationName.split(',')[1]?.trim() : '');

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
          TOP PRODUCTION MAP CONTROLS TOOLBAR
          ───────────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 flex-wrap pointer-events-none z-20">

        {/* Left Side: Geographic Region + Analysis Area */}
        <div className="pointer-events-auto flex items-center gap-1.5 flex-wrap">

          {/* Geographic region context toggle (geographic context, not provider coverage) */}
          <button
            type="button"
            data-testid="region-context-toggle"
            onClick={() => {
              setShowRegionBoundary((prev) => {
                const next = !prev;
                if (next) {
                  fitToRegion();
                }
                return next;
              });
            }}
            title={`Toggle ${stateDisplayName || 'Region'} geographic boundary (geographic context)`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md shadow-lg border transition-all cursor-pointer ${
              showRegionBoundary
                ? 'bg-rose-500/25 border-rose-500 text-rose-300 shadow-rose-950/40 ring-1 ring-rose-500/50'
                : 'bg-surface-card/90 border-border text-text-muted hover:text-text-primary'
            }`}
          >
            <MapIcon className="size-3.5 text-rose-400" />
            <span>{stateDisplayName ? `${stateDisplayName} (Geographic Region)` : 'Geographic Region'}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
              showRegionBoundary ? 'bg-rose-500/40 text-rose-100' : 'bg-surface-elevated text-text-dimmed'
            }`}>
              {showRegionBoundary ? 'ON' : 'OFF'}
            </span>
          </button>

          {/* Analysis Area toggle */}
          <button
            type="button"
            data-testid="aoi-layer-toggle"
            onClick={() => toggleLayer('aoi')}
            title="Toggle Analysis Area Boundary"
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
                border: `2px solid ${layerVisibility.aoi !== false ? '#be123c' : 'currentColor'}`,
                backgroundColor: layerVisibility.aoi !== false ? 'rgba(244,63,94,0.5)' : 'transparent',
              }}
            />
            <span>Analysis Area</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
              layerVisibility.aoi !== false ? 'bg-rose-500/40 text-rose-100' : 'bg-surface-elevated text-text-dimmed'
            }`}>
              {layerVisibility.aoi !== false ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {/* Right Side: Add-site mode, Heatmap, Sites, Theme, Region View, Fit AOI */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-surface-card/95 backdrop-blur-md p-1 rounded-xl border border-border shadow-lg">

          {/* Add candidate site mode (LIVE workflow — Section 8) */}
          {onToggleAddSiteMode && (
            <button
              type="button"
              data-testid="add-site-mode-btn"
              onClick={onToggleAddSiteMode}
              title="Add candidate site: click the map to place a site inside the analysis area"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                addSiteMode
                  ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 animate-pulse'
                  : 'text-text-muted hover:text-text-primary opacity-70 border border-transparent'
              }`}
            >
              <Crosshair className="size-3.5 text-emerald-400" />
              <span className="hidden sm:inline">+ Site</span>
            </button>
          )}

          {/* Thermal Heatmap layer toggle */}
          <button
            type="button"
            data-testid="thermal-layer-toggle"
            onClick={() => toggleLayer('thermal')}
            title="Toggle FortyGuard Thermal Heatmap Layer"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              layerVisibility.thermal !== false
                ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
                : 'text-text-muted hover:text-text-primary opacity-60'
            }`}
          >
            <Flame className="size-3.5 text-amber-400" />
            <span>Heatmap</span>
          </button>

          {/* Sites / Candidates layer toggle */}
          <button
            type="button"
            data-testid="sites-layer-toggle"
            onClick={() => toggleLayer('candidates')}
            title="Toggle Candidate & Recommended Sites"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              layerVisibility.candidates !== false
                ? 'bg-pink-500/25 text-pink-300 border border-pink-500/50'
                : 'text-text-muted hover:text-text-primary opacity-60'
            }`}
          >
            <MapPin className="size-3.5 text-pink-400" />
            <span>Sites</span>
          </button>

          <div className="w-[1px] h-4 bg-border my-auto mx-0.5" />

          {/* Light / Dark Theme toggle directly on map */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch map to Light Mode' : 'Switch map to Dark Mode'}
            className="p-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all flex items-center cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="size-3.5 text-amber-400" /> : <Moon className="size-3.5 text-slate-500" />}
          </button>

          {/* Zoom to Geographic Region View Button */}
          {regionBoundary && (
            <button
              type="button"
              onClick={fitToRegion}
              title={`Zoom to the entire ${stateDisplayName || 'selected'} geographic region`}
              className="px-2.5 py-1.5 rounded-lg text-xs text-rose-300 bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/40 transition-all flex items-center gap-1 cursor-pointer font-semibold"
            >
              <ZoomIn className="size-3.5 text-rose-400" />
              <span className="hidden sm:inline text-[11px]">Region View</span>
            </button>
          )}

          {/* Fit / Center Local AOI View Button */}
          <button
            type="button"
            onClick={fitToLocalAoi}
            title="Fit Viewport to Analysis Area"
            className="p-1.5 rounded-lg text-xs text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-all flex items-center cursor-pointer"
          >
            <Maximize2 className="size-3.5" />
          </button>
        </div>

      </div>

      {/* Add-site mode hint banner */}
      {addSiteMode && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-xs font-semibold z-20 pointer-events-none"
          style={{
            background: 'rgba(5,150,105,0.92)',
            color: '#ffffff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}
          data-testid="add-site-mode-hint"
        >
          Click the map to place a candidate site · click “+ Site” to exit
        </div>
      )}

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
      {!spatialField && !analysisAoi && (
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
