'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Marker, Popup, NavigationControl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
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
import { getAoiCenter, isPointInAoi, moveAoiToCenter } from '@/lib/spatial/aoi';
import type { SelectionCameraBehavior as CameraBehavior } from '@/lib/location/selection-behavior';
import { Flame, MapPin, Maximize2, Map as MapIcon, X } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';

// Minimal inline type for MapLibre GeoJSON source data casts.
type GeoJSONFC = FeatureCollection;

export const CANDIDATE_COLOR_PALETTE = [
  '#3b82f6', // Blue
  '#8b5cf6', // Purple/Violet
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f97316', // Orange
];

export function getCandidateColor(index: number, isWinner?: boolean): string {
  if (isWinner) return '#ec4899';
  return CANDIDATE_COLOR_PALETTE[index % CANDIDATE_COLOR_PALETTE.length];
}

interface ThermalMapProps {
  /**
   * User-selected analysis center (operating location).
   * NULL in the EMPTY workspace state — the map opens on a neutral continental view.
   */
  location: LocationPoint | null;
  /** State or territory code/name (e.g. CA, NY) */
  locationState?: string;
  locationName?: string;
  /** Geographic region boundary polygon (GEOGRAPHIC CONTEXT ONLY — never provider coverage). */
  regionBoundary?: PolygonAOI | null;
  /** Inverted mask polygon dimming everything outside the selected region. */
  regionMask?: PolygonAOI | null;
  /** Display name of the geographic region (e.g. "California"). */
  regionDisplayName?: string;
  /**
   * Canonical Analysis AOI — the EXACT geometry sent to FortyGuard.
   * Derived strictly from the operating location coordinate in LIVE, or the captured fixture AOI in DEMO.
   */
  analysisAoi: PolygonAOI | null;
  /** True when the canonical AOI fails validation. */
  aoiInvalid?: boolean;
  /** Reason shown in the invalid-AOI map banner. */
  aoiInvalidMessage?: string;
  /** DEMO only: span label for the captured analysis area. */
  captureAoiLabel?: string;
  /** Whether the OPERATING LOCATION marker is draggable (LIVE only). */
  locationDraggable?: boolean;
  /** Fired when the user finishes dragging the operating-location marker. */
  onMoveOperatingLocation?: (point: LocationPoint) => void;
  /** Whether candidate markers are draggable (LIVE only). */
  candidatesDraggable?: boolean;
  /** Fired when a candidate is dragged to a point INSIDE the AOI. */
  onMoveCandidate?: (locationId: string, lat: number, lng: number) => void;
  /** Fired when a candidate is removed via the marker popup. */
  onRemoveCandidate?: (locationId: string) => void;
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
  /** Whether to render the operating location marker. */
  showLocationMarker?: boolean;
  /** Message shown by the empty-map overlay (no field AND no AOI). */
  emptyMapMessage?: string;
  /** Add-candidate-site mode (PLACE_SITE): map clicks place a candidate at the clicked point. */
  addSiteMode?: boolean;
  onAddSiteAt?: (lng: number, lat: number) => void;
  onExitAddSiteMode?: () => void;
  /** Camera behavior requested by the page; applied when cameraNonce changes. */
  cameraBehavior?: CameraBehavior;
  /** Bump to re-apply cameraBehavior. */
  cameraNonce?: number;
}

/** Empty FeatureCollection sentinel for source initialization / clear. */
const EMPTY_FC: GeoJSONFC = { type: 'FeatureCollection', features: [] };

/** Neutral continental-US view for the EMPTY workspace state. */
const DEFAULT_EMPTY_VIEW: { center: [number, number]; zoom: number } = {
  center: [-98.5795, 39.8283],
  zoom: 3.7,
};

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

/** Compute bounding box covering the AOI, thermal field, candidates, and operating location. */
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

/** Bounding box of the geographic region boundary. */
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
  return (
    !!aoi &&
    aoi.features.length > 0 &&
    aoi.features.some((f) => {
      const p = f.properties;
      const v = p?.average_temperature ?? p?.temperature ?? p?.temp ?? p?.value;
      return Number.isFinite(Number(v));
    })
  );
}

/** Apply valid/invalid paint to the canonical AOI layers. */
function applyAoiValidityPaint(map: MapLibreMap, invalid: boolean, isDark: boolean): void {
  try {
    if (map.getLayer('aoi-outline')) {
      map.setPaintProperty('aoi-outline', 'line-color', invalid ? '#ef4444' : (isDark ? '#fb7185' : '#be123c'));
      map.setPaintProperty('aoi-outline', 'line-width', invalid ? 3.5 : 2.0);
    }
    if (map.getLayer('aoi-fill')) {
      map.setPaintProperty('aoi-fill', 'fill-color', invalid ? '#ef4444' : '#f43f5e');
      map.setPaintProperty('aoi-fill', 'fill-opacity', invalid ? 0.08 : 0.02);
    }
  } catch {
    /* safe */
  }
}

export function ThermalMap({
  location,
  locationState,
  locationName,
  regionBoundary,
  regionMask,
  regionDisplayName,
  analysisAoi,
  aoiInvalid = false,
  aoiInvalidMessage,
  captureAoiLabel,
  locationDraggable = false,
  onMoveOperatingLocation,
  candidatesDraggable = false,
  onMoveCandidate,
  onRemoveCandidate,
  spatialField,
  selectedTileId,
  candidates,
  recommendedLocationId,
  unit = DEFAULT_TEMP_UNIT,
  layerVisibility = { thermal: true, candidates: true, labels: true, aoi: true },
  onToggleLayer,
  areaShape = 'polygon',
  showLocationMarker = true,
  emptyMapMessage = 'Select a location to render the thermal field',
  addSiteMode = false,
  onAddSiteAt,
  onExitAddSiteMode,
  cameraBehavior = 'fit-aoi',
  cameraNonce = 0,
}: ThermalMapProps) {
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  
  // Dedicated Marker references with stable identity
  const operatingMarkerRef = useRef<Marker | null>(null);
  const candidateMarkersRef = useRef<globalThis.Map<string, { marker: Marker; lastValid: [number, number] }>>(new globalThis.Map());
  
  const aoiGeometryRef = useRef<{ aoi: PolygonAOI; center: LocationPoint } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [showRegionBoundary, setShowRegionBoundary] = useState(true);
  const [candidateToast, setCandidateToast] = useState<{ message: string; type: 'warning' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronized refs for callbacks (prevents stale closures in map event handlers)
  const addSiteModeRef = useRef(addSiteMode);
  const onAddSiteAtRef = useRef(onAddSiteAt);
  const onExitAddSiteModeRef = useRef(onExitAddSiteMode);
  const onMoveOperatingLocationRef = useRef(onMoveOperatingLocation);
  const onMoveCandidateRef = useRef(onMoveCandidate);
  const onRemoveCandidateRef = useRef(onRemoveCandidate);
  const regionBoundaryRef = useRef(regionBoundary);
  const regionDisplayNameRef = useRef(regionDisplayName);
  const themeRef = useRef(theme);

  useEffect(() => {
    addSiteModeRef.current = addSiteMode;
    onAddSiteAtRef.current = onAddSiteAt;
    onExitAddSiteModeRef.current = onExitAddSiteMode;
    onMoveOperatingLocationRef.current = onMoveOperatingLocation;
    onMoveCandidateRef.current = onMoveCandidate;
    onRemoveCandidateRef.current = onRemoveCandidate;
    regionBoundaryRef.current = regionBoundary;
    regionDisplayNameRef.current = regionDisplayName;
    themeRef.current = theme;
  }, [addSiteMode, onAddSiteAt, onExitAddSiteMode, onMoveOperatingLocation, onMoveCandidate, onRemoveCandidate, regionBoundary, regionDisplayName, theme]);

  // Toast timer cleanup
  const showToast = useCallback((message: string, type: 'warning' | 'info' = 'warning') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setCandidateToast({ message, type });
    toastTimerRef.current = setTimeout(() => setCandidateToast(null), 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Track canonical AOI geometry in ref for immediate containment validation
  useEffect(() => {
    const center = analysisAoi ? getAoiCenter(analysisAoi) : null;
    aoiGeometryRef.current = analysisAoi && center ? { aoi: analysisAoi, center } : null;
  }, [analysisAoi]);

  // Apply theme styles to map layers
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
        map.setPaintProperty('aoi-outline', 'line-width', 2.0);
      }
      if (map.getLayer('aoi-fill')) {
        map.setPaintProperty('aoi-fill', 'fill-color', '#f43f5e');
        map.setPaintProperty('aoi-fill', 'fill-opacity', isDark ? 0.03 : 0.02);
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
  // Mount effect — create MapLibre instance ONCE
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const isDark = theme === 'dark';

    const hasLocation =
      location !== null &&
      Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90 &&
      Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
    const centerLng = hasLocation && location ? location.longitude : DEFAULT_EMPTY_VIEW.center[0];
    const centerLat = hasLocation && location ? location.latitude : DEFAULT_EMPTY_VIEW.center[1];
    const initialZoom = hasLocation ? 14.5 : DEFAULT_EMPTY_VIEW.zoom;

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
    const esriAttribution = 'Basemap © Esri, HERE, Garmin, FAO, NOAA, USGS';

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
      zoom: initialZoom,
    });

    mapRef.current = map;

    if (typeof window !== 'undefined') {
      (window as unknown as { __thermalMap?: unknown }).__thermalMap = map;
    }

    const initMapLayersAndSources = () => {
      // 1. Sources
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

      // 2. Strict Visual Hierarchy:
      // Basemap -> Region Context -> Thermal Cells -> AOI Outline -> Markers
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

      // Thermal Cells
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

      // Subtle AOI fill & outline
      if (!map.getLayer('aoi-fill')) {
        map.addLayer({
          id: 'aoi-fill',
          type: 'fill',
          source: 'analysis-aoi',
          paint: {
            'fill-color': '#f43f5e',
            'fill-opacity': isDark ? 0.03 : 0.02,
          },
        });
      }

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

      // ONE subtle canonical AOI boundary
      if (!map.getLayer('aoi-outline')) {
        map.addLayer({
          id: 'aoi-outline',
          type: 'line',
          source: 'analysis-aoi',
          paint: {
            'line-color': isDark ? '#fb7185' : '#be123c',
            'line-width': 2.0,
            'line-opacity': 1.0,
          },
        });
      }

      setMapReady(true);
      map.resize();
      applyThemeToMap(theme === 'dark');

      try {
        const maskSource = map.getSource('region-mask') as GeoJSONSource | undefined;
        const regionSource = map.getSource('region-boundary') as GeoJSONSource | undefined;
        const thermalSource = map.getSource('thermal-tiles') as GeoJSONSource | undefined;
        const aoiSource = map.getSource('analysis-aoi') as GeoJSONSource | undefined;

        if (maskSource) maskSource.setData((regionMask ?? EMPTY_FC) as unknown as GeoJSONFC);
        if (regionSource) regionSource.setData((regionBoundary ?? EMPTY_FC) as unknown as GeoJSONFC);
        if (thermalSource && spatialField && hasRenderableTemperatureData(spatialField)) {
          thermalSource.setData(spatialField as unknown as GeoJSONFC);
        }
        if (aoiSource) aoiSource.setData((analysisAoi ?? EMPTY_FC) as unknown as GeoJSONFC);
      } catch {
        /* safe */
      }
    };

    map.on('load', initMapLayersAndSources);
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    // PLACE_SITE click handler
    const handleMapClick = (e: MapMouseEvent) => {
      if (addSiteModeRef.current) {
        const aoi = aoiGeometryRef.current?.aoi;
        if (!aoi) {
          showToast('Select an operating location before placing candidate sites.', 'warning');
          return;
        }
        const inside = isPointInAoi({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }, aoi);
        if (inside) {
          onAddSiteAtRef.current?.(e.lngLat.lng, e.lngLat.lat);
        } else {
          showToast('Candidate site must be inside the analysis area.', 'warning');
        }
      }
    };
    map.on('click', handleMapClick);

    // Dynamic resize observer
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        if (mapRef.current) mapRef.current.resize();
      });
      ro.observe(mapContainerRef.current);
    }

    return () => {
      if (ro) ro.disconnect();
      if (operatingMarkerRef.current) {
        try { operatingMarkerRef.current.remove(); } catch { /* safe */ }
        operatingMarkerRef.current = null;
      }
      for (const entry of candidateMarkersRef.current.values()) {
        try { entry.marker.remove(); } catch { /* safe */ }
      }
      candidateMarkersRef.current.clear();
      try { map.remove(); } catch { /* safe */ }
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Interaction Mode Cursor effect
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.getCanvas().style.cursor = addSiteMode ? 'crosshair' : '';
  }, [mapReady, addSiteMode]);

  // ─────────────────────────────────────────────────────────────────────
  // Theme effect
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

/** Visual edge fill helper so thermal tiles visually reach the AOI boundary with 0 gap */
function alignThermalCellsToAoi(spatialField: PolygonAOI, aoi: PolygonAOI | null | undefined): PolygonAOI {
  if (!spatialField || !spatialField.features || spatialField.features.length === 0) return spatialField;
  if (!aoi || !aoi.features || aoi.features.length === 0) return spatialField;

  const aoiRing = (aoi.features[0]?.geometry as { coordinates?: number[][][] })?.coordinates?.[0];
  if (!aoiRing || aoiRing.length === 0) return spatialField;

  let aoiMinLng = Infinity, aoiMaxLng = -Infinity, aoiMinLat = Infinity, aoiMaxLat = -Infinity;
  for (const [lng, lat] of aoiRing) {
    if (lng < aoiMinLng) aoiMinLng = lng;
    if (lng > aoiMaxLng) aoiMaxLng = lng;
    if (lat < aoiMinLat) aoiMinLat = lat;
    if (lat > aoiMaxLat) aoiMaxLat = lat;
  }

  let cellMinLng = Infinity, cellMaxLng = -Infinity, cellMinLat = Infinity, cellMaxLat = -Infinity;
  for (const f of spatialField.features) {
    const ring = (f.geometry as { coordinates?: number[][][] })?.coordinates?.[0];
    if (ring) {
      for (const [lng, lat] of ring) {
        if (lng < cellMinLng) cellMinLng = lng;
        if (lng > cellMaxLng) cellMaxLng = lng;
        if (lat < cellMinLat) cellMinLat = lat;
        if (lat > cellMaxLat) cellMaxLat = lat;
      }
    }
  }

  const epsLng = Math.max(0.0001, (cellMaxLng - cellMinLng) / 35);
  const epsLat = Math.max(0.0001, (cellMaxLat - cellMinLat) / 35);

  return {
    type: 'FeatureCollection',
    features: spatialField.features.map((f) => {
      const geom = f.geometry as { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] };
      if (!geom || !geom.coordinates || !geom.coordinates[0]) return f;
      const newRing = geom.coordinates[0].map(([lng, lat]) => {
        let adjLng = lng;
        let adjLat = lat;
        if (Math.abs(lng - cellMinLng) <= epsLng) adjLng = aoiMinLng;
        else if (Math.abs(lng - cellMaxLng) <= epsLng) adjLng = aoiMaxLng;
        if (Math.abs(lat - cellMinLat) <= epsLat) adjLat = aoiMinLat;
        else if (Math.abs(lat - cellMaxLat) <= epsLat) adjLat = aoiMaxLat;
        return [adjLng, adjLat];
      });
      return {
        ...f,
        geometry: {
          ...geom,
          coordinates: [newRing],
        },
      };
    }),
  };
}

  // ─────────────────────────────────────────────────────────────────────
  // GeoJSON data sync effect
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

        if (maskSource) maskSource.setData((regionMask ?? EMPTY_FC) as unknown as GeoJSONFC);
        if (regionSource) regionSource.setData((regionBoundary ?? EMPTY_FC) as unknown as GeoJSONFC);
        if (thermalSource) {
          const thermalData = (spatialField && hasRenderableTemperatureData(spatialField)
            ? alignThermalCellsToAoi(spatialField, analysisAoi)
            : EMPTY_FC) as unknown as GeoJSONFC;
          thermalSource.setData(thermalData);
        }
        if (aoiSource) aoiSource.setData((analysisAoi ?? EMPTY_FC) as unknown as GeoJSONFC);
        map.triggerRepaint();
      } catch {
        /* safe */
      }
    };

    syncSources();
  }, [mapReady, spatialField, analysisAoi, regionBoundary, regionMask]);

  // ─────────────────────────────────────────────────────────────────────
  // Committed AOI validity paint
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyAoiValidityPaint(map, aoiInvalid, theme === 'dark');
  }, [mapReady, aoiInvalid, theme]);

  // ─────────────────────────────────────────────────────────────────────
  // 1. OPERATING LOCATION MARKER (Dedicated identity)
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const isValidCoord =
      showLocationMarker &&
      location &&
      Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90 &&
      Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;

    if (!isValidCoord) {
      if (operatingMarkerRef.current) {
        try { operatingMarkerRef.current.remove(); } catch { /* safe */ }
        operatingMarkerRef.current = null;
      }
      return;
    }

    const isDark = theme === 'dark';
    const locName = (locationName || 'Operating Location').split(' (')[0];

    if (!operatingMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'operating-location-marker';
      el.setAttribute('data-testid', 'operating-location-marker');
      el.style.cssText = [
        'position:relative',
        'width:28px',
        'height:28px',
        `cursor:${locationDraggable ? 'grab' : 'default'}`,
        'z-index:24',
      ].join(';');
      el.innerHTML = `
        <span style="
          position:absolute;inset:0;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          background:#14b8a6;
          border:3px solid #ffffff;
          box-shadow:0 2px 10px rgba(0,0,0,0.5);
        "></span>
        <span style="
          position:absolute;inset:7px;border-radius:50%;
          background:#ffffff;
        "></span>
      `;
      el.title = locationDraggable ? 'Operating location (drag to move)' : 'Operating location';

      const popup = new Popup({ offset: 22, closeButton: false }).setHTML(`
        <div style="
          background:${isDark ? '#0f172a' : '#ffffff'};
          border:1px solid ${isDark ? 'rgba(30,45,69,0.9)' : 'rgba(226,232,240,0.9)'};
          border-radius:8px;
          padding:8px 12px;
          min-width:160px;
          font-family:system-ui,sans-serif;
          box-shadow:0 4px 16px rgba(0,0,0,0.25);
        ">
          <div style="color:#14b8a6;font-weight:700;font-size:10px;margin-bottom:3px;letter-spacing:0.05em;text-transform:uppercase;">Operating Location</div>
          <div style="color:${isDark ? '#f1f5f9' : '#0f172a'};font-size:13px;font-weight:700;">${locName}</div>
          <div style="color:${isDark ? '#94a3b8' : '#64748b'};font-size:10px;margin-top:3px;font-family:monospace;">${location!.latitude.toFixed(4)}°, ${location!.longitude.toFixed(4)}°</div>
          ${locationDraggable ? `<div style="color:${isDark ? '#0ea5e9' : '#0284c7'};font-size:10px;margin-top:4px;">Drag to move · Generate required</div>` : ''}
        </div>
      `);

      const marker = new Marker({ element: el, anchor: 'center', offset: [0, 0], draggable: !!locationDraggable })
        .setLngLat([location!.longitude, location!.latitude])
        .setPopup(popup)
        .addTo(map);

      marker.on('dragstart', () => {
        el.style.cursor = 'grabbing';
      });

      // Synchronous real-time AOI position tracking with zero lag during drag
      marker.on('drag', () => {
        const ll = marker.getLngLat();
        const aoi = aoiGeometryRef.current?.aoi;
        if (aoi && mapRef.current) {
          const movedAoi = moveAoiToCenter(aoi, { latitude: ll.lat, longitude: ll.lng });
          const aoiSource = mapRef.current.getSource('analysis-aoi') as GeoJSONSource | undefined;
          if (aoiSource) {
            aoiSource.setData(movedAoi as unknown as GeoJSONFC);
          }
        }
      });

      marker.on('dragend', () => {
        el.style.cursor = 'grab';
        const ll = marker.getLngLat();
        onMoveOperatingLocationRef.current?.({ latitude: ll.lat, longitude: ll.lng });
      });

      operatingMarkerRef.current = marker;
    } else {
      // Direct position update
      operatingMarkerRef.current.setLngLat([location!.longitude, location!.latitude]);
      operatingMarkerRef.current.setDraggable(!!locationDraggable);
      const el = operatingMarkerRef.current.getElement();
      el.style.cursor = locationDraggable ? 'grab' : 'default';
      
      const popup = operatingMarkerRef.current.getPopup();
      if (popup) {
        popup.setHTML(`
          <div style="
            background:${isDark ? '#0f172a' : '#ffffff'};
            border:1px solid ${isDark ? 'rgba(30,45,69,0.9)' : 'rgba(226,232,240,0.9)'};
            border-radius:8px;
            padding:8px 12px;
            min-width:160px;
            font-family:system-ui,sans-serif;
            box-shadow:0 4px 16px rgba(0,0,0,0.25);
          ">
            <div style="color:#14b8a6;font-weight:700;font-size:10px;margin-bottom:3px;letter-spacing:0.05em;text-transform:uppercase;">Operating Location</div>
            <div style="color:${isDark ? '#f1f5f9' : '#0f172a'};font-size:13px;font-weight:700;">${locName}</div>
            <div style="color:${isDark ? '#94a3b8' : '#64748b'};font-size:10px;margin-top:3px;font-family:monospace;">${location!.latitude.toFixed(4)}°, ${location!.longitude.toFixed(4)}°</div>
            ${locationDraggable ? `<div style="color:${isDark ? '#0ea5e9' : '#0284c7'};font-size:10px;margin-top:4px;">Drag to move · Generate required</div>` : ''}
          </div>
        `);
      }
    }
  }, [mapReady, location, locationName, locationDraggable, showLocationMarker, theme]);

  // ─────────────────────────────────────────────────────────────────────
  // 2. CANDIDATE MARKERS (Identity Map<string, Marker>)
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (layerVisibility.candidates === false) {
      for (const entry of candidateMarkersRef.current.values()) {
        try { entry.marker.remove(); } catch { /* safe */ }
      }
      candidateMarkersRef.current.clear();
      return;
    }

    const isDark = theme === 'dark';
    const activeCandidates = candidates ?? [];
    const activeIds = new Set(activeCandidates.map((c) => c.locationId));

    // Remove deleted markers
    for (const [id, entry] of Array.from(candidateMarkersRef.current.entries())) {
      if (!activeIds.has(id)) {
        try { entry.marker.remove(); } catch { /* safe */ }
        candidateMarkersRef.current.delete(id);
      }
    }

    // Add or update candidate markers
    activeCandidates.forEach((item, index) => {
      if (
        !Number.isFinite(item.location.latitude) || item.location.latitude < -90 || item.location.latitude > 90 ||
        !Number.isFinite(item.location.longitude) || item.location.longitude < -180 || item.location.longitude > 180
      ) {
        return;
      }

      const isWinner = item.locationId === recommendedLocationId;
      const cleanName = item.name.split(' (')[0];
      const existing = candidateMarkersRef.current.get(item.locationId);

      const popupHtml = `
        <div style="
          background:${isDark ? '#0f172a' : '#ffffff'};
          border:1px solid ${isDark ? 'rgba(30,45,69,0.9)' : 'rgba(226,232,240,0.9)'};
          border-radius:8px;
          padding:8px 12px;
          min-width:170px;
          font-family:system-ui,sans-serif;
          box-shadow:0 4px 16px rgba(0,0,0,0.25);
        ">
          <div style="color:${isWinner ? '#ec4899' : isDark ? '#94a3b8' : '#64748b'};font-weight:700;font-size:10px;margin-bottom:3px;letter-spacing:0.05em;text-transform:uppercase;">
            ${isWinner ? '★ Recommended Site' : 'Candidate Site'}
          </div>
          <div style="color:${isDark ? '#f1f5f9' : '#0f172a'};font-size:13px;font-weight:700;">${cleanName}</div>
          <div style="color:${isDark ? '#94a3b8' : '#64748b'};font-size:10px;margin-top:2px;font-family:monospace;">
            ${item.location.latitude.toFixed(4)}°, ${item.location.longitude.toFixed(4)}°
          </div>
          ${candidatesDraggable ? `<div style="color:${isDark ? '#94a3b8' : '#64748b'};font-size:10px;margin-top:3px;">Drag to move inside analysis area</div>` : ''}
          <button
            type="button"
            id="remove-site-btn-${item.locationId}"
            data-site-id="${item.locationId}"
            style="
              margin-top:8px;
              width:100%;
              padding:4px 8px;
              font-size:11px;
              font-weight:700;
              color:#ef4444;
              background:rgba(239,68,68,0.1);
              border:1px solid rgba(239,68,68,0.3);
              border-radius:4px;
              cursor:pointer;
              display:flex;
              align-items:center;
              justify-content:center;
              gap:4px;
            "
          >
            Remove Site
          </button>
        </div>
      `;

      const siteColor = getCandidateColor(index, isWinner);

      const markerInnerHtml = isWinner
        ? `
          <span style="
            position:absolute;inset:-5px;border-radius:50%;
            background:rgba(236,72,153,0.35);
            animation:map-marker-pulse 2s ease-in-out infinite;
          "></span>
          <span style="
            position:absolute;inset:0;border-radius:50%;
            background:#ec4899;
            border:2.5px solid #ffffff;
            box-shadow:0 0 12px rgba(236,72,153,0.85),0 2px 8px rgba(0,0,0,0.5);
            display:flex;align-items:center;justify-content:center;
            color:#ffffff;font-size:13px;font-weight:900;line-height:1;
          ">★</span>
        `
        : `
          <span style="
            position:absolute;inset:0;border-radius:50%;
            background:${siteColor};
            border:2.5px solid #ffffff;
            box-shadow:0 2px 8px rgba(0,0,0,0.45);
            display:flex;align-items:center;justify-content:center;
            color:#ffffff;font-size:11px;font-weight:800;line-height:1;
          ">${index + 1}</span>
        `;

      if (existing) {
        existing.marker.setLngLat([item.location.longitude, item.location.latitude]);
        existing.marker.setDraggable(!!candidatesDraggable);
        existing.lastValid = [item.location.longitude, item.location.latitude];
        
        const popup = existing.marker.getPopup();
        if (popup) popup.setHTML(popupHtml);

        const el = existing.marker.getElement();
        el.className = 'candidate-marker';
        el.setAttribute('data-testid', isWinner ? 'recommended-site-marker' : 'candidate-site-marker');
        el.setAttribute('data-location-id', item.locationId);
        el.style.zIndex = isWinner ? '30' : '20';
        el.style.cursor = candidatesDraggable ? 'grab' : 'pointer';

        // Only update innerHTML if winner state or site index changed, preventing DOM destruction during drag
        const prevWinner = el.getAttribute('data-is-winner') === 'true';
        const prevIndex = el.getAttribute('data-site-index');
        if (prevWinner !== isWinner || prevIndex !== String(index)) {
          el.setAttribute('data-is-winner', String(isWinner));
          el.setAttribute('data-site-index', String(index));
          el.innerHTML = markerInnerHtml;
        }
      } else {
        const el = document.createElement('div');
        el.className = 'candidate-marker';
        el.setAttribute('data-testid', isWinner ? 'recommended-site-marker' : 'candidate-site-marker');
        el.setAttribute('data-location-id', item.locationId);
        el.setAttribute('data-is-winner', String(isWinner));
        el.setAttribute('data-site-index', String(index));
        el.style.cssText = [
          'position:relative',
          'width:28px',
          'height:28px',
          `cursor:${candidatesDraggable ? 'grab' : 'pointer'}`,
          `z-index:${isWinner ? 30 : 20}`,
        ].join(';');
        el.innerHTML = markerInnerHtml;

        const popup = new Popup({ offset: 20, closeButton: false }).setHTML(popupHtml);

        popup.on('open', () => {
          const btn = document.getElementById(`remove-site-btn-${item.locationId}`);
          if (btn) {
            btn.onclick = () => {
              popup.remove();
              onRemoveCandidateRef.current?.(item.locationId);
            };
          }
        });

        const marker = new Marker({ element: el, anchor: 'center', offset: [0, 0], draggable: !!candidatesDraggable })
          .setLngLat([item.location.longitude, item.location.latitude])
          .setPopup(popup)
          .addTo(map);

        const entry = {
          marker,
          lastValid: [item.location.longitude, item.location.latitude] as [number, number],
        };

        if (candidatesDraggable) {
          marker.on('dragstart', () => {
            el.style.cursor = 'grabbing';
          });

          marker.on('dragend', () => {
            el.style.cursor = 'grab';
            const ll = marker.getLngLat();
            const aoi = aoiGeometryRef.current?.aoi;
            const inside = !aoi || isPointInAoi({ latitude: ll.lat, longitude: ll.lng }, aoi);

            if (!inside) {
              marker.setLngLat(entry.lastValid);
              showToast('Candidate site must remain inside the analysis area.', 'warning');
              return;
            }

            const moved =
              Math.abs(ll.lng - entry.lastValid[0]) > 1e-9 ||
              Math.abs(ll.lat - entry.lastValid[1]) > 1e-9;
            if (moved) {
              entry.lastValid = [ll.lng, ll.lat];
              onMoveCandidateRef.current?.(item.locationId, ll.lat, ll.lng);
            }
          });
        }

        candidateMarkersRef.current.set(item.locationId, entry);
      }
    });
  }, [mapReady, candidates, recommendedLocationId, candidatesDraggable, layerVisibility.candidates, theme, showToast]);

  // ─────────────────────────────────────────────────────────────────────
  // Camera behavior
  // ─────────────────────────────────────────────────────────────────────
  const fitToLocalAoi = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const aoiCenter = analysisAoi ? getAoiCenter(analysisAoi) : null;
    const focus = aoiCenter ?? location;
    if (!focus) {
      map.flyTo({ center: DEFAULT_EMPTY_VIEW.center, zoom: DEFAULT_EMPTY_VIEW.zoom, duration: 700 });
      return;
    }
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
    if (!location) {
      map.flyTo({ center: DEFAULT_EMPTY_VIEW.center, zoom: DEFAULT_EMPTY_VIEW.zoom, duration: 900 });
      return;
    }
    map.flyTo({ center: [location.longitude, location.latitude], zoom: 16.5, duration: 900 });
  }, [location]);

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

      {/* ── TOP MAP CONTROLS TOOLBAR ── */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 flex-wrap pointer-events-none z-20">
        <div className="pointer-events-auto flex items-center gap-1.5 flex-wrap">
          {/* Geographic region context toggle */}
          <button
            type="button"
            data-testid="region-context-toggle"
            onClick={() => {
              setShowRegionBoundary((prev) => {
                const next = !prev;
                if (next) fitToRegion();
                return next;
              });
            }}
            title={`Toggle ${stateDisplayName || 'Region'} geographic boundary`}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-md shadow-lg border transition-all cursor-pointer ${
              showRegionBoundary
                ? 'bg-rose-500/25 border-rose-500 text-rose-300 shadow-rose-950/40 ring-1 ring-rose-500/50'
                : 'bg-surface-card/90 border-border text-text-muted hover:text-text-primary'
            }`}
          >
            <MapIcon className="size-3.5 text-rose-400" />
            <span>{stateDisplayName ? `${stateDisplayName} (Region)` : 'Geographic Region'}</span>
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

        {/* Right: Thermal / Sites layer toggles + Fit camera */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-surface-card/95 backdrop-blur-md p-1 rounded-xl border border-border shadow-lg">
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

      {/* ── PLACE_SITE Top Interactive Banner with Cancel ── */}
      {addSiteMode && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-xs font-semibold z-30 pointer-events-auto flex items-center gap-3 shadow-xl backdrop-blur-md border border-emerald-400/40"
          style={{
            background: 'rgba(5,150,105,0.95)',
            color: '#ffffff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.45)',
          }}
          data-testid="add-site-mode-hint"
        >
          <span>Click inside the analysis area to place a candidate site.</span>
          <button
            type="button"
            onClick={() => onExitAddSiteModeRef.current?.()}
            className="px-2 py-0.5 rounded bg-black/25 hover:bg-black/40 text-white font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
            title="Cancel candidate placement"
          >
            <X className="size-3" />
            Cancel
          </button>
        </div>
      )}

      {/* ── Invalid-AOI banner ── */}
      {aoiInvalid && !addSiteMode && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-xs font-semibold z-20 pointer-events-none max-w-md text-center shadow-lg"
          style={{
            background: 'rgba(190,18,60,0.95)',
            color: '#ffffff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
          role="alert"
          data-testid="aoi-invalid-banner"
        >
          ⚠ {aoiInvalidMessage || 'Analysis area invalid'} · Generate disabled
        </div>
      )}

      {/* ── Dynamic Candidate Toast / Validation Feedback ── */}
      {candidateToast && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-xs font-semibold z-30 pointer-events-none max-w-md text-center shadow-lg"
          style={{
            background: candidateToast.type === 'warning' ? 'rgba(190,18,60,0.95)' : 'rgba(15,23,42,0.95)',
            color: '#ffffff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
          role="alert"
          data-testid="candidate-toast-feedback"
        >
          {candidateToast.message}
        </div>
      )}

      {/* ── Thermal legend (bottom-left) ── */}
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
        <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-border/60">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse flex-shrink-0" />
          <span className="text-[9px] text-text-dimmed font-mono uppercase tracking-wide">
            FortyGuard Hyperlocal Thermal
          </span>
        </div>
      </div>

      {/* DEMO captured analysis-area label */}
      {captureAoiLabel && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold z-10 pointer-events-none flex items-center gap-1.5 whitespace-nowrap"
          style={{
            background: 'rgba(180,83,9,0.92)',
            color: '#ffffff',
            boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
          }}
          data-testid="captured-aoi-label"
        >
          ⬡ Captured FortyGuard AOI · {captureAoiLabel}
        </div>
      )}

      {/* Empty state overlay */}
      {!spatialField && !analysisAoi && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" data-testid="map-empty-overlay">
          <div className="bg-surface-card/95 backdrop-blur-md px-5 py-3 rounded-xl text-center border border-border shadow-lg max-w-sm">
            <p className="text-text-muted text-sm">
              {emptyMapMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default ThermalMap;
