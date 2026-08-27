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
import { moveAoiToCenter, getAoiCenter, isPointInAoi } from '@/lib/spatial/aoi';
import { validateAnalysisAoi } from '@/lib/spatial/aoi-validation';
import type { SelectionCameraBehavior as CameraBehavior } from '@/lib/location/selection-behavior';
import { Flame, MapPin, Maximize2, Map as MapIcon } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';

// Minimal inline type for MapLibre GeoJSON source data casts.
type GeoJSONFC = FeatureCollection;


interface ThermalMapProps {
  /**
   * User-selected analysis center. Used for the fallback fit + marker.
   * NULL in the EMPTY workspace state — the map then opens on a neutral
   * continental view and renders NO analysis marker (no location is chosen).
   */
  location: LocationPoint | null;
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
  /**
   * True when the canonical AOI currently FAILS validation (Section 6).
   * The geometry is RETAINED visibly as invalid: the outline turns red,
   * an inline map banner explains the reason, and Generate is disabled.
   */
  aoiInvalid?: boolean;
  /** Human reason shown in the invalid-AOI map banner (from validateAnalysisAoi). */
  aoiInvalidMessage?: string;
  /**
   * DEMO only: span label for the CAPTURED analysis area (e.g. "≈2.4km × 2.4km").
   * Rendered as an explicit small label on the map so the ONE canonical
   * boundary reads as "Captured FortyGuard AOI · …" (Section 9).
   */
  captureAoiLabel?: string;
  /**
   * Whether the OPERATING LOCATION marker is draggable (LIVE only — the
   * canonical location coordinates update on drag; a new FortyGuard request
   * still requires explicit Generate).
   */
  locationDraggable?: boolean;
  /** Fired when the user finishes dragging the operating-location marker. */
  onMoveOperatingLocation?: (point: LocationPoint) => void;
  /** Whether candidate markers are draggable (LIVE only — DEMO candidates are application-defined fixed points). */
  candidatesDraggable?: boolean;
  /** Fired when a candidate is dragged to a point INSIDE the AOI (drag commit). */
  onMoveCandidate?: (locationId: string, lat: number, lng: number) => void;
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
  /**
   * Whether the AOI drag handle is offered. FALSE in DEMO: the captured
   * analysis area is FIXED (the genuine capture request AOI) — dragging it
   * would imply a provider capture that does not exist. LIVE keeps the
   * draggable AOI (the user's own analysis area).
   */
  aoiDraggable?: boolean;
  /**
   * Whether the fallback "Selected Analysis Area" marker renders when no
   * candidate sites exist. FALSE when NO analysis area exists (e.g. a DEMO
   * location with no capture) so the map never labels a point as an analysis
   * area that was never configured.
   */
  showLocationMarker?: boolean;
  /** Message shown by the empty-map overlay (no field AND no AOI). */
  emptyMapMessage?: string;
  /** Add-candidate-site mode: map clicks place a candidate at the clicked point. */
  addSiteMode?: boolean;
  onAddSiteAt?: (lng: number, lat: number) => void;
  /** Camera behavior requested by the page; applied when cameraNonce changes. */
  cameraBehavior?: CameraBehavior;
  /** Bump to re-apply cameraBehavior (also refits on location changes). */
  cameraNonce?: number;
}

/** Empty FeatureCollection sentinel for source initialization / clear. */
const EMPTY_FC: GeoJSONFC = { type: 'FeatureCollection', features: [] };

/**
 * Neutral continental-US view for the EMPTY workspace state — no location is
 * selected, so the map must not imply any analysis context (and never the
 * implicit Manhattan DEMO). Pure view default; nothing is analysed here.
 */
const DEFAULT_EMPTY_VIEW: { center: [number, number]; zoom: number } = {
  center: [-98.5795, 39.8283], // geographic center of the contiguous US
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

/**
 * Apply valid/invalid paint to the canonical AOI layers (Section 6).
 *   valid   → subtle outline (theme-aware rose) + barely-there fill
 *   invalid → red, thicker outline + visible red tint (geometry RETAINED,
 *            never moved or shrunk — the user sees exactly what is wrong).
 * Shared by the committed-validity effect and the live drag preview.
 */
function applyAoiValidityPaint(map: MapLibreMap, invalid: boolean, isDark: boolean): void {
  try {
    if (map.getLayer('aoi-outline')) {
      map.setPaintProperty('aoi-outline', 'line-color', invalid ? '#ef4444' : (isDark ? '#fb7185' : '#be123c'));
      map.setPaintProperty('aoi-outline', 'line-width', invalid ? 4 : 2.5);
    }
    if (map.getLayer('aoi-fill')) {
      map.setPaintProperty('aoi-fill', 'fill-color', invalid ? '#ef4444' : '#f43f5e');
      map.setPaintProperty('aoi-fill', 'fill-opacity', invalid ? (isDark ? 0.10 : 0.08) : (isDark ? 0.04 : 0.03));
    }
  } catch {
    /* safe */
  }
}

/**
 * Drag-affordance anchor for the AOI handle: the NORTH-EAST point of the AOI
 * boundary — the exact NE corner vertex for squares, the 45° boundary point
 * for circles.
 *
 * The handle previously sat at the AOI CENTER, where the recommended-site
 * marker (40px, z-index 30) fully covered the 34px handle (z-index 25)
 * whenever the winner candidate is the analysis center, making the AOI
 * undraggable. Anchoring the handle at the NE boundary keeps the affordance
 * reachable without touching any candidate marker. Dragging translates the
 * WHOLE AOI by the handle's movement delta — the AOI center is NOT moved to
 * the handle position, and the canonical geometry (shape/size) is unchanged.
 */
function getAoiHandleAnchor(aoi: PolygonAOI): LocationPoint | null {
  const feat = aoi.features[0];
  const geom = feat?.geometry as { type: string; coordinates: number[][][] } | undefined;
  if (!feat || !geom || !Array.isArray(geom.coordinates?.[0])) return null;
  const ring = geom.coordinates[0];
  if (ring.length < 3) return null;

  const center = getAoiCenter(aoi);
  if (!center) return null;

  let maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  const props = (feat.properties ?? {}) as { shape?: string };
  if (props.shape === 'circle') {
    // 45° point ON the circle (NE), derived from the ring's bbox radii.
    const rLng = maxLng - center.longitude;
    const rLat = maxLat - center.latitude;
    return {
      longitude: center.longitude + rLng * Math.SQRT1_2,
      latitude: center.latitude + rLat * Math.SQRT1_2,
    };
  }

  // Square: the exact NE corner vertex of the ring.
  return { longitude: maxLng, latitude: maxLat };
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
  spatialField,
  selectedTileId,
  candidates,
  recommendedLocationId,
  unit = DEFAULT_TEMP_UNIT,
  layerVisibility = { thermal: true, candidates: true, labels: true, aoi: true },
  onToggleLayer,
  areaShape = 'polygon',
  onMoveAoi,
  aoiDraggable = true,
  showLocationMarker = true,
  emptyMapMessage = 'Select a location to render the thermal field',
  addSiteMode = false,
  onAddSiteAt,
  cameraBehavior = 'fit-aoi',
  cameraNonce = 0,
}: ThermalMapProps) {
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const aoiHandleRef = useRef<Marker | null>(null);
  const draggingAoiRef = useRef(false);
  // Latest AOI geometry + move callbacks for the drag listeners. The
  // listeners attach ONCE at marker creation — reading through refs keeps them
  // free of stale closures as the AOI moves/resizes.
  const aoiGeometryRef = useRef<{ aoi: PolygonAOI; center: LocationPoint } | null>(null);
  const aoiMoveCallbackRef = useRef<((center: LocationPoint) => void) | undefined>(undefined);
  const [mapReady, setMapReady] = useState(false);
  const [showRegionBoundary, setShowRegionBoundary] = useState(true);
  // Compact in-map feedback when a candidate drop is REJECTED (outside the
  // AOI) — the candidate stays at its last valid position (Section 7).
  const [candidateRejectedToast, setCandidateRejectedToast] = useState<string | null>(null);
  const candidateToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for values read inside map event callbacks (avoid stale closures).
  const addSiteModeRef = useRef(addSiteMode);
  const onAddSiteAtRef = useRef(onAddSiteAt);
  const onMoveOperatingLocationRef = useRef(onMoveOperatingLocation);
  const onMoveCandidateRef = useRef(onMoveCandidate);
  const regionBoundaryRef = useRef(regionBoundary);
  const regionDisplayNameRef = useRef(regionDisplayName);
  const themeRef = useRef(theme);
  useEffect(() => {
    addSiteModeRef.current = addSiteMode;
    onAddSiteAtRef.current = onAddSiteAt;
    onMoveOperatingLocationRef.current = onMoveOperatingLocation;
    onMoveCandidateRef.current = onMoveCandidate;
    regionBoundaryRef.current = regionBoundary;
    regionDisplayNameRef.current = regionDisplayName;
    themeRef.current = theme;
  }, [addSiteMode, onAddSiteAt, onMoveOperatingLocation, onMoveCandidate, regionBoundary, regionDisplayName, theme]);

  // Auto-dismiss the candidate-rejection toast.
  useEffect(() => {
    if (!candidateRejectedToast) return;
    if (candidateToastTimerRef.current) clearTimeout(candidateToastTimerRef.current);
    candidateToastTimerRef.current = setTimeout(() => setCandidateRejectedToast(null), 2600);
    return () => {
      if (candidateToastTimerRef.current) clearTimeout(candidateToastTimerRef.current);
    };
  }, [candidateRejectedToast]);

  // The AOI geometry is ALWAYS tracked in a ref (not only when draggable) so
  // candidate-marker drag commits can validate containment against the
  // CURRENT canonical AOI — including the fixed DEMO captured area.
  useEffect(() => {
    const center = analysisAoi ? getAoiCenter(analysisAoi) : null;
    aoiGeometryRef.current = analysisAoi && center ? { aoi: analysisAoi, center } : null;
  }, [analysisAoi]);

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
        map.setPaintProperty('aoi-outline', 'line-width', 2.5);
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

    // EMPTY state (location === null): neutral continental view — no implied
    // analysis context. Otherwise center on the selected analysis point.
    const hasLocation =
      location !== null &&
      Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90 &&
      Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180;
    const centerLng = hasLocation && location ? location.longitude : DEFAULT_EMPTY_VIEW.center[0];
    const centerLat = hasLocation && location ? location.latitude : DEFAULT_EMPTY_VIEW.center[1];
    const initialZoom = hasLocation ? 14.5 : DEFAULT_EMPTY_VIEW.zoom;

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
      zoom: initialZoom,
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
      //    ONE canonical analysis-area boundary (Section 9): the AOI outline is
      //    the ONLY analysis-extent rectangle — no second competing square.
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

      // Layer E: Local Analysis AOI Interior Tint (very low opacity — never a
      // solid overlay; the thermal cells beneath remain the visual hero)
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

      // Layer G: Canonical Analysis AOI outline — a SUBTLE crisp boundary over
      // the thermal field (NOT a second filled square). Turns red when the
      // geometry is invalid (Section 6; see applyAoiValidityPaint).
      if (!map.getLayer('aoi-outline')) {
        map.addLayer({
          id: 'aoi-outline',
          type: 'line',
          source: 'analysis-aoi',
          paint: {
            'line-color': isDark ? '#fb7185' : '#be123c',
            'line-width': 2.5,
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

    // Zoom / navigation controls — the one control family that genuinely
    // belongs ON the map (Section 8). Positioned bottom-right, above the
    // native basemap attribution.
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

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
        const thermalSource = map.getSource('thermal-tiles') as GeoJSONSource | undefined;
        const aoiSource = map.getSource('analysis-aoi') as GeoJSONSource | undefined;

        if (maskSource) {
          maskSource.setData((regionMask ?? EMPTY_FC) as unknown as GeoJSONFC);
        }

        if (regionSource) {
          regionSource.setData((regionBoundary ?? EMPTY_FC) as unknown as GeoJSONFC);
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
  }, [mapReady, spatialField, analysisAoi, regionBoundary, regionMask]);

  // ─────────────────────────────────────────────────────────────────
  // Committed AOI validity paint (Section 6): when the canonical AOI is
  // invalid the RETAINED geometry renders red — never moved or shrunk.
  // Runs AFTER the theme effect so validity always wins the AOI paint.
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyAoiValidityPaint(map, aoiInvalid, theme === 'dark');
  }, [mapReady, aoiInvalid, theme]);

  // ─────────────────────────────────────────────────────────────────────
  // Draggable AOI handle (Section 4 — the AOI moves as ONE object)
  // Pure translation: square stays square, circle stays circular, size is
  // preserved. dragend → onMoveAoi(newCenter) → canonical geometry update.
  //
  // The handle is anchored at the AOI's NORTH-EAST boundary point (see
  // getAoiHandleAnchor) — NOT the center. The recommended-site marker
  // (40px, z-index 30) sits at the AOI center whenever the winner candidate
  // is the analysis center and fully covered the previous center-anchored
  // handle (34px, z-index 25), making the AOI undraggable. Dragging the
  // corner handle translates the WHOLE AOI by the handle's movement delta:
  // map AOI == canonical AOI == FortyGuard request AOI is preserved.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // DEMO: the captured analysis area is FIXED — no drag affordance. Dragging
    // it would imply a provider capture for a different geometry that does
    // not exist. (LIVE keeps the draggable AOI.)
    if (!aoiDraggable) {
      if (aoiHandleRef.current) {
        try { aoiHandleRef.current.remove(); } catch { /* safe */ }
        aoiHandleRef.current = null;
      }
      return;
    }

    const center = analysisAoi ? getAoiCenter(analysisAoi) : null;
    const anchor = analysisAoi ? getAoiHandleAnchor(analysisAoi) : null;
    if (!analysisAoi || !center || !anchor) {
      if (aoiHandleRef.current) {
        try { aoiHandleRef.current.remove(); } catch { /* safe */ }
        aoiHandleRef.current = null;
      }
      return;
    }

    // Keep the drag callback on the latest value (the geometry itself is
    // tracked by the dedicated aoiGeometryRef effect above).
    aoiMoveCallbackRef.current = onMoveAoi;

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
        .setLngLat([anchor.longitude, anchor.latitude])
        .addTo(map);

      // Drag origin: handle position + AOI center at drag start. The AOI is
      // translated by (handle − handleOrigin) — releasing the corner handle
      // anywhere yields exactly the translation dragging the center would.
      let dragOrigin: {
        handleLng: number; handleLat: number;
        centerLng: number; centerLat: number;
      } | null = null;

      const ensureDragOrigin = () => {
        const state = aoiGeometryRef.current;
        if (!state) return;
        if (!dragOrigin) {
          const ll = marker.getLngLat();
          dragOrigin = {
            handleLng: ll.lng,
            handleLat: ll.lat,
            centerLng: state.center.longitude,
            centerLat: state.center.latitude,
          };
        }
        draggingAoiRef.current = true;
      };

      const translatedCenter = (): LocationPoint | null => {
        if (!dragOrigin) return null;
        const ll = marker.getLngLat();
        return {
          longitude: dragOrigin.centerLng + (ll.lng - dragOrigin.handleLng),
          latitude: dragOrigin.centerLat + (ll.lat - dragOrigin.handleLat),
        };
      };

      const onDrag = () => {
        ensureDragOrigin();
        const state = aoiGeometryRef.current;
        const newCenter = translatedCenter();
        if (!state || !newCenter) return;
        // Live preview: translate the canonical geometry under the handle.
        const preview = moveAoiToCenter(state.aoi, newCenter);
        const aoiSource = map.getSource('analysis-aoi') as GeoJSONSource | undefined;
        if (aoiSource) aoiSource.setData(preview as unknown as GeoJSONFC);
        // IMMEDIATE validation while dragging (Section 6): the outline turns
        // red the moment the geometry leaves the honest constraint set
        // (documented provider limit / geographic bounds / active region
        // boundary). Nothing is silently clamped or reverted.
        const previewValidation = validateAnalysisAoi(preview, {
          regionBoundary: regionBoundaryRef.current,
          regionDisplayName: regionDisplayNameRef.current,
        });
        applyAoiValidityPaint(map, !previewValidation.valid, themeRef.current === 'dark');
        el.style.cursor = 'grabbing';
      };

      const onDragEnd = () => {
        draggingAoiRef.current = false;
        el.style.cursor = 'grab';
        const newCenter = translatedCenter();
        dragOrigin = null;
        if (newCenter) aoiMoveCallbackRef.current?.(newCenter);
      };

      marker.on('drag', onDrag);
      marker.on('dragend', onDragEnd);
      aoiHandleRef.current = marker;
    } else {
      // External geometry update (size/shape/location change) — re-anchor handle
      if (!draggingAoiRef.current) {
        aoiHandleRef.current.setLngLat([anchor.longitude, anchor.latitude]);
      }
    }
  }, [mapReady, analysisAoi, onMoveAoi, theme]);

  // ─────────────────────────────────────────────────────────────────────
  // Markers effect (operating location + candidate sites)
  //
  // The map communicates exactly the canonical spatial story (Section 8):
  //   1. OPERATING LOCATION — a distinct pin, DRAGGABLE in LIVE (drag updates
  //      the canonical location coordinates + recomputes the AOI; Generate is
  //      still required — no automatic provider request).
  //   2. ANALYSIS AOI — the boundary polygon (handled by layers above).
  //   3. THERMAL FIELD — genuine provider/captured cells (layers above).
  //   4. CANDIDATE SITES — draggable in LIVE; an outside-AOI drop is REJECTED
  //      (snapped back to the last valid position) with immediate feedback.
  //   5. RECOMMENDED SITE — the winner styling.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const m of markersRef.current) {
      try { m.remove(); } catch { /* safe */ }
    }
    markersRef.current = [];

    const isDark = theme === 'dark';

    // ── 1. Operating location marker (always visible when a location exists) ──
    if (
      showLocationMarker &&
      location &&
      Number.isFinite(location.latitude) && location.latitude >= -90 && location.latitude <= 90 &&
      Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= 180
    ) {
      const el = document.createElement('div');
      el.style.cssText = [
        'position:relative',
        'width:26px',
        'height:26px',
        `cursor:${locationDraggable ? 'grab' : 'pointer'}`,
        'z-index:22',
      ].join(';');
      el.innerHTML = `
        <span style="
          position:absolute;inset:0;border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          background:#14b8a6;
          border:3px solid #ffffff;
          box-shadow:0 2px 8px rgba(0,0,0,0.45);
        "></span>
        <span style="
          position:absolute;inset:7px;border-radius:50%;
          background:#ffffff;
        "></span>
      `;
      if (locationDraggable) {
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'Operating location — drag to move it; a new LIVE analysis still requires Generate');
        el.title = 'Operating location — drag to move';
      } else {
        el.title = 'Operating location';
      }

      const operatingPopup = new Popup({ offset: 20, closeButton: false }).setHTML(`
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
            color:#14b8a6;
            font-weight:700;
            font-size:10px;
            margin-bottom:3px;
            letter-spacing:0.05em;
            text-transform:uppercase;
          ">Operating Location</div>
          <div style="color:${isDark ? '#f1f5f9' : '#0f172a'};font-size:13px;font-weight:700;">${(locationName || 'Selected location').split(' (')[0]}</div>
          ${locationDraggable ? `<div style="color:${isDark ? '#94a3b8' : '#64748b'};font-size:10px;margin-top:3px;">Drag to move · Generate runs the next LIVE request</div>` : ''}
        </div>
      `);

      const operatingMarker = new Marker({ element: el, draggable: !!locationDraggable })
        .setLngLat([location.longitude, location.latitude])
        .setPopup(operatingPopup)
        .addTo(map);

      if (locationDraggable) {
        operatingMarker.on('dragend', () => {
          const ll = operatingMarker.getLngLat();
          onMoveOperatingLocationRef.current?.({ latitude: ll.lat, longitude: ll.lng });
        });
      }
      markersRef.current.push(operatingMarker);
    }

    if (layerVisibility.candidates === false) {
      return;
    }

    // ── 2. Candidate + recommended-site markers ──
    const locsToRender: Array<{
      id: string; name: string; loc: LocationPoint; isWinner: boolean;
    }> = (candidates ?? []).map((c) => ({
      id: c.locationId,
      name: c.name,
      loc: c.location,
      isWinner: c.locationId === recommendedLocationId,
    }));

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
          `cursor:${candidatesDraggable ? 'grab' : 'pointer'}`,
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
          `cursor:${candidatesDraggable ? 'grab' : 'pointer'}`,
          'z-index:20',
        ].join(';');
      }
      if (candidatesDraggable) {
        el.title = 'Candidate site — drag to move (must stay inside the analysis area)';
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
          ${candidatesDraggable ? `<div style="color:${isDark ? '#94a3b8' : '#64748b'};font-size:10px;margin-top:3px;">Drag to move — must stay inside the analysis area</div>` : ''}
        </div>
      `);

      const marker = new Marker({ element: el, draggable: !!candidatesDraggable })
        .setLngLat([item.loc.longitude, item.loc.latitude])
        .setPopup(popup)
        .addTo(map);

      if (candidatesDraggable) {
        // The site's CURRENT position is the last valid position. A drop
        // OUTSIDE the canonical AOI is REJECTED: the marker snaps back, the
        // site is never silently moved (Section 7), and immediate in-map
        // feedback explains why.
        const lastValid: [number, number] = [item.loc.longitude, item.loc.latitude];
        marker.on('dragend', () => {
          const ll = marker.getLngLat();
          const aoi = aoiGeometryRef.current?.aoi;
          const inside = !aoi || isPointInAoi({ latitude: ll.lat, longitude: ll.lng }, aoi);
          if (!inside) {
            marker.setLngLat(lastValid);
            setCandidateRejectedToast(item.name.split(' (')[0]);
            return;
          }
          const moved =
            Math.abs(ll.lng - lastValid[0]) > 1e-9 ||
            Math.abs(ll.lat - lastValid[1]) > 1e-9;
          if (moved) onMoveCandidateRef.current?.(item.id, ll.lat, ll.lng);
        });
      }

      markersRef.current.push(marker);
    }
  }, [mapReady, candidates, recommendedLocationId, location, locationName, theme, layerVisibility.candidates, locationDraggable, candidatesDraggable, showLocationMarker]);

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
    if (!focus) {
      // EMPTY state: neutral continental view — no implied analysis context.
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
          TOP MAP CONTROLS TOOLBAR (Section 8 — reduced)
          Visualization toggles + camera only. Configuration lives in the
          ControlRail; no duplicate add-site/AOI-size controls on the map.
          ───────────────────────────────────────────────────────────── */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 flex-wrap pointer-events-none z-20">

        {/* Left: Geographic Region + Analysis Area visualization toggles */}
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

        {/* Right: Thermal / Sites visualization toggles + Fit camera */}
        <div className="pointer-events-auto flex items-center gap-1.5 bg-surface-card/95 backdrop-blur-md p-1 rounded-xl border border-border shadow-lg">

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
          className="absolute top-16 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-xs font-semibold z-20 pointer-events-none max-w-md text-center"
          style={{
            background: 'rgba(5,150,105,0.92)',
            color: '#ffffff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          }}
          data-testid="add-site-mode-hint"
        >
          Click the map inside the analysis area to place a candidate site · click “Add on map” again to exit
        </div>
      )}

      {/* Invalid-AOI banner (Section 6) — the retained geometry is visibly
          invalid; Generate is disabled until the user fixes the area. */}
      {aoiInvalid && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-xs font-semibold z-20 pointer-events-none max-w-md text-center"
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

      {/* Candidate-drop rejection feedback (Section 7) — the candidate stays
          at its last valid position (never silently moved). */}
      {candidateRejectedToast && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-xs font-semibold z-20 pointer-events-none max-w-md text-center"
          style={{
            background: 'rgba(190,18,60,0.95)',
            color: '#ffffff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
          role="alert"
          data-testid="candidate-rejected-toast"
        >
          “{candidateRejectedToast}” must stay inside the analysis area — kept at its last valid position
        </div>
      )}

      {/* Thermal legend — bottom-left overlay (provenance integrated) */}
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
        {/* FortyGuard provenance line (integrated — no competing badge) */}
        <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-border/60">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse flex-shrink-0" />
          <span className="text-[9px] text-text-dimmed font-mono uppercase tracking-wide">
            FortyGuard Hyperlocal Thermal
          </span>
        </div>
      </div>

      {/* DEMO captured analysis-area label (Section 9): the ONE canonical
          boundary is the captured FortyGuard request AOI — labeled explicitly
          so the thermal field and the analysis area read as the same extent. */}
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

      {/* Empty state overlay (shown only when no spatialField AND no AOI) */}
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
