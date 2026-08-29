'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Marker, Popup, NavigationControl, type GeoJSONSource, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LocationPoint, PolygonAOI, CandidateLocation } from '@/types/domain';
import { useTheme } from '@/components/ThemeProvider';
import {
  type TempUnit,
  DEFAULT_TEMP_UNIT,
  THERMAL_RAMP_STOPS,
  getThermalLegendRampTicks,
  tempUnitSuffix,
  thermalRampGradientCss,
} from '@/lib/temperature';
import type { MapLayerVisibility, AnalysisAreaShape } from '@/lib/user-preferences';
import { useUserPreferences, AOI_SPAN_PRESETS_LOCAL } from '@/lib/user-preferences';
import { getAoiCenter, isPointInAoi, moveAoiToCenter } from '@/lib/spatial/aoi';
import { computeAoiThermalCoverage, formatCoverageLine } from '@/lib/spatial/coverage';
import { logThermalDebug, logThermalFieldStage } from '@/lib/dev/thermal-debug';
import type { CameraBehavior } from '@/lib/location/selection-behavior';
import { Layers3, MapPin, Square, Maximize2, Minimize2, Plus, Check, X } from 'lucide-react';
import type { FeatureCollection } from 'geojson';
import type { Map as MapLibreMap } from 'maplibre-gl';

// Minimal inline type for MapLibre GeoJSON source data casts.
type GeoJSONFC = FeatureCollection;

// ─────────────────────────────────────────────────────────────────────────────
// Lucide map-pin markers — TRUE geographic anchoring.
//
// Every marker is a MapLibre Marker with `anchor: 'bottom'`: the wrapper's
// BOTTOM-CENTER sits exactly at the candidate's [lng, lat]. The glyph (Lucide
// "map-pin" icon, 24×24 viewBox, stroke 2) is absolutely positioned inside the
// wrapper with its TIP at the wrapper's bottom-centre — the icon's tip stroke
// outer edge sits 1.0/24 units above the SVG bottom, so the glyph is shifted
// down by size/24 px to land the tip EXACTLY on the geographic point. Zoom/pan
// can never detach the pin — MapLibre re-projects the anchor on every frame.
//
// Rank is encoded by a SEPARATE badge element (never inside the icon) plus a
// restrained deterministic colour — identity never relies on colour alone.
// The 44px wrapper guarantees a touch-friendly hit area without displacing
// the tip (the glyph is pointer-events: none inside it).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic restrained candidate palette (700-level tones — readable on
 * both basemaps, white inner-dot contrast). Rank badges carry the identity;
 * colour is only a secondary cue.
 */
export const CANDIDATE_COLOR_PALETTE = [
  '#0f766e', // teal 700
  '#475569', // slate 600
  '#92400e', // amber 800
  '#166534', // green 800
  '#7c2d12', // orange 900
  '#52525b', // zinc 600
];

/** Winner pin fill/stroke per theme — the ONE brand-accent marker on the map. */
const WINNER_PIN_COLORS = {
  dark:  { fill: '#22d3ee', stroke: '#0b1220', dot: '#0b1220' },
  light: { fill: '#0e7490', stroke: '#ffffff', dot: '#ffffff' },
};

export function getCandidateColor(index: number, isWinner?: boolean): string {
  if (isWinner) return WINNER_PIN_COLORS.light.fill;
  return CANDIDATE_COLOR_PALETTE[index % CANDIDATE_COLOR_PALETTE.length];
}

/** Lucide "map-pin" outline path (viewBox 0 0 24 24) — professional neutral geometry. */
const LUCIDE_MAP_PIN_PATH =
  'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0';

/**
 * Build the pin glyph HTML: Lucide map-pin SVG + optional separate rank badge.
 * The glyph is a positioned span whose bottom edge (after the tip offset)
 * coincides with the wrapper's bottom-centre — the geographic anchor.
 */
function pinGlyphHtml(opts: {
  size: number;
  fill: string;
  stroke: string;
  dot: string;
  strokeWidth?: number;
  badge?: string;
  badgeVariant?: 'candidate' | 'winner';
  glyphClass?: string;
}): string {
  const { size, fill, stroke, dot, strokeWidth = 2, badge, badgeVariant, glyphClass } = opts;
  // Lucide map-pin tip: arc bottom at y=22.0 (stroke centreline), outer edge
  // 23.0 of 24 with stroke 2 → shift the glyph down by size/24 px so the tip
  // touches the anchor point exactly.
  const tipOffset = (size / 24).toFixed(2);
  return (
    `<span class="map-pin__glyph${glyphClass ? ` ${glyphClass}` : ''}" style="--pin-size:${size}px;--pin-tip-offset:${tipOffset}px">` +
      `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" aria-hidden="true">` +
        `<path d="${LUCIDE_MAP_PIN_PATH}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="12" cy="10" r="3" fill="${dot}"/>` +
      `</svg>` +
      (badge
        ? `<span class="map-pin__badge${badgeVariant === 'winner' ? ' map-pin__badge--winner' : ''}">${badge}</span>`
        : '') +
    `</span>`
  );
}

/** Inner HTML for a candidate / recommended marker wrapper (anchor: bottom). */
function candidatePinInnerHtml({
  rank,
  color,
  isWinner,
  isDark,
}: {
  rank: string;
  color: string;
  isWinner: boolean;
  isDark: boolean;
}): string {
  if (isWinner) {
    const w = isDark ? WINNER_PIN_COLORS.dark : WINNER_PIN_COLORS.light;
    // Recommended site: brand-accent pin, LARGER (27px), static ground ring,
    // rank badge — dominant but never animated after the 200ms entrance.
    return (
      `<span class="winner-ring" aria-hidden="true"></span>` +
      pinGlyphHtml({
        size: 27,
        fill: w.fill,
        stroke: w.stroke,
        dot: w.dot,
        badge: rank,
        badgeVariant: 'winner',
      })
    );
  }
  return pinGlyphHtml({
    size: 22,
    fill: color,
    stroke: '#ffffff',
    dot: '#ffffff',
    badge: rank,
    badgeVariant: 'candidate',
  });
}

/** Build the wrapper DOM element for a candidate / recommended pin (anchor: bottom). */
function createCandidatePinElement({
  color,
  rank,
  isWinner,
  isDark,
  draggable,
}: {
  color: string;
  rank: string;
  isWinner: boolean;
  isDark: boolean;
  draggable: boolean;
}): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `map-pin${isWinner ? ' map-pin--winner' : ''}`;
  el.setAttribute('data-draggable', String(!!draggable));
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', isWinner ? `Recommended location rank ${rank}` : `Candidate location rank ${rank}`);
  el.style.zIndex = isWinner ? '30' : '20';
  el.innerHTML = candidatePinInnerHtml({ rank, color, isWinner, isDark });
  return el;
}

/** Build the wrapper DOM element for the operating-location pin (teal, no badge). */
function createOperatingPinElement(draggable: boolean): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'map-pin';
  el.setAttribute('data-draggable', String(!!draggable));
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Operating location');
  el.style.zIndex = '24';
  el.innerHTML = pinGlyphHtml({ size: 24, fill: '#0d9488', stroke: '#ffffff', dot: '#ffffff' });
  return el;
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
  /** Current AOI span in metres (square side / circle diameter) — toolbar active-state truth. */
  aoiSpanMetres?: number;
  /** Whether to render the operating location marker. */
  showLocationMarker?: boolean;
  /** Message shown by the empty-map overlay (no field AND no AOI). */
  emptyMapMessage?: string;
  /** Add-candidate-site mode (PLACE_SITE): map clicks place a candidate at the clicked point. */
  addSiteMode?: boolean;
  onAddSiteAt?: (lng: number, lat: number) => void;
  onExitAddSiteMode?: () => void;
  /** Toggle add-site mode from the map toolbar Sites menu (LIVE only). */
  onToggleAddSiteMode?: () => void;
  /** Camera behavior requested by the page; applied when cameraNonce changes. */
  cameraBehavior?: CameraBehavior;
  /** Bump to re-apply cameraBehavior. */
  cameraNonce?: number;
  /**
   * Point for the 'reveal-point' behavior: the camera moves ONLY when this
   * point is not already visible (used after a search-added candidate).
   */
  cameraRevealPoint?: { latitude: number; longitude: number } | null;
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

/** MapLibre interpolate expression built from the shared thermal ramp stops. */
const THERMAL_COLOR_EXPRESSION: unknown[] = [
  'interpolate',
  ['linear'],
  ['get', 'average_temperature'],
  ...THERMAL_RAMP_STOPS.flatMap((s) => [s.c, s.color]),
];

// AOI visual language:
//   LIVE  → solid brand-accent (cyan) 2px outline, transparent interior.
//   DEMO  → dashed amber 2px outline (the CAPTURED request area — context).
//   Invalid → red outline, retained visibly.
const AOI_LIVE_COLOR = { dark: '#22d3ee', light: '#0e7490' };
const AOI_CAPTURE_COLOR = { dark: '#f5a524', light: '#b45309' };
const AOI_INVALID_COLOR = { dark: '#f97066', light: '#d92d20' };

/** Apply valid/invalid/captured paint to the canonical AOI layers. */
function applyAoiValidityPaint(
  map: MapLibreMap,
  invalid: boolean,
  isDark: boolean,
  captured: boolean,
): void {
  try {
    const lineColor = invalid
      ? (isDark ? AOI_INVALID_COLOR.dark : AOI_INVALID_COLOR.light)
      : captured
        ? (isDark ? AOI_CAPTURE_COLOR.dark : AOI_CAPTURE_COLOR.light)
        : (isDark ? AOI_LIVE_COLOR.dark : AOI_LIVE_COLOR.light);
    const fillColor = invalid
      ? (isDark ? AOI_INVALID_COLOR.dark : AOI_INVALID_COLOR.light)
      : captured
        ? (isDark ? AOI_CAPTURE_COLOR.dark : AOI_CAPTURE_COLOR.light)
        : (isDark ? AOI_LIVE_COLOR.dark : AOI_LIVE_COLOR.light);

    if (map.getLayer('aoi-outline')) {
      map.setPaintProperty('aoi-outline', 'line-color', lineColor);
      map.setPaintProperty('aoi-outline', 'line-width', invalid ? 3 : 2);
      map.setPaintProperty('aoi-outline', 'line-dasharray', captured && !invalid ? [4, 3] : [1, 0]);
    }
    if (map.getLayer('aoi-fill')) {
      map.setPaintProperty('aoi-fill', 'fill-color', fillColor);
      map.setPaintProperty('aoi-fill', 'fill-opacity', invalid ? 0.06 : 0.03);
    }
  } catch {
    /* safe */
  }
}

/** Clean popup card HTML (themed via CSS vars — popups live inside the page tree). */
function popupCardHtml(opts: {
  eyebrow: string;
  eyebrowColor: string;
  title: string;
  coords: string;
  hint?: string;
  removeLabel?: boolean;
  removeId?: string;
}): string {
  return `
    <div style="
      min-width:172px;
      padding:10px 12px 11px;
      font-family:var(--font-inter),system-ui,sans-serif;
      background:var(--surface-card);
      color:var(--text-primary);
      border-radius:10px;
    ">
      <div style="font-size:9px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${opts.eyebrowColor};margin-bottom:3px;">
        ${opts.eyebrow}
      </div>
      <div style="font-size:13px;font-weight:600;line-height:1.3;">${opts.title}</div>
      <div style="font-size:10px;color:var(--text-muted);font-family:ui-monospace,SFMono-Regular,monospace;margin-top:3px;">
        ${opts.coords}
      </div>
      ${opts.hint ? `<div style="font-size:10px;color:var(--text-dimmed);margin-top:5px;">${opts.hint}</div>` : ''}
      ${
        opts.removeLabel && opts.removeId
          ? `<button type="button" id="remove-site-btn-${opts.removeId}" data-site-id="${opts.removeId}" style="
              margin-top:8px;width:100%;padding:5px 8px;font-size:11px;font-weight:600;
              color:var(--accent-red);background:var(--accent-red-bg);
              border:1px solid transparent;border-radius:6px;cursor:pointer;
            ">Remove site</button>`
          : ''
      }
    </div>
  `;
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
  aoiSpanMetres = 1000,
  showLocationMarker = true,
  emptyMapMessage = 'Select a location to render the thermal field',
  addSiteMode = false,
  onAddSiteAt,
  onExitAddSiteMode,
  onToggleAddSiteMode,
  cameraBehavior = 'fit-aoi',
  cameraNonce = 0,
  cameraRevealPoint = null,
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
  const [isExpanded, setIsExpanded] = useState(false);
  // Click-based toolbar menus (mouse + touch + keyboard — CSS hover variants
  // are gated by @media (hover:hover) and never open on touch/headless).
  const [openMenu, setOpenMenu] = useState<'layers' | 'sites' | 'aoi' | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [candidateToast, setCandidateToast] = useState<{ message: string; type: 'warning' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AOI shape/size controls live in the map toolbar menu too — read/write the
  // same preference store the ControlRail uses (single source of truth).
  const [, prefSetters] = useUserPreferences();
  const aoiLocked = !!captureAoiLabel; // DEMO: the captured analysis area is fixed

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

  // ESC exits the fullscreen map / closes toolbar menus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsExpanded(false);
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isExpanded]);

  // Click outside the toolbar closes any open menu
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openMenu]);

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
        map.setPaintProperty('region-mask-fill', 'fill-color', isDark ? '#05070c' : '#344054');
        map.setPaintProperty('region-mask-fill', 'fill-opacity', isDark ? 0.38 : 0.22);
      }
      if (map.getLayer('carto-labels-dark-layer')) {
        map.setLayoutProperty('carto-labels-dark-layer', 'visibility', isDark && (layerVisibility.labels !== false) ? 'visible' : 'none');
      }
      if (map.getLayer('carto-labels-light-layer')) {
        map.setLayoutProperty('carto-labels-light-layer', 'visibility', !isDark && (layerVisibility.labels !== false) ? 'visible' : 'none');
      }
      if (map.getLayer('thermal-tiles-fill')) {
        map.setPaintProperty('thermal-tiles-fill', 'fill-opacity', isDark ? 0.88 : 0.8);
      }
      if (map.getLayer('thermal-tiles-seam')) {
        map.setPaintProperty('thermal-tiles-seam', 'line-opacity', isDark ? 0.88 : 0.8);
      }
      if (map.getLayer('region-boundary-outline')) {
        map.setPaintProperty('region-boundary-outline', 'line-color', isDark ? '#8a94a8' : '#98a2b3');
      }
      applyAoiValidityPaint(map, aoiInvalid, isDark, aoiLocked);
      map.triggerRepaint();
    } catch {
      /* safe */
    }
  }, [layerVisibility.labels, aoiInvalid, aoiLocked]);

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
    const basemapAttribution = '© Esri, HERE, Garmin, OpenStreetMap contributors';

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
            attribution: basemapAttribution,
          },
          'carto-base-light': {
            type: 'raster',
            tiles: lightBaseTiles,
            tileSize: 256,
            maxzoom: 16,
            attribution: basemapAttribution,
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
            paint: { 'raster-opacity': isDark ? 0 : 0.95 },
            layout: { visibility: isDark ? 'none' : 'visible' },
          },
        ],
      },
      center: [centerLng, centerLat],
      zoom: initialZoom,
      attributionControl: { compact: true },
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

      // 2. Layer stack — strict visual hierarchy:
      //    basemap → region context (under data) → THERMAL FIELD (fill only,
      //    no cell outlines — a continuous professional thermal surface) →
      //    AOI boundary (thin, on top) → markers (DOM, above all).
      if (!map.getLayer('region-mask-fill')) {
        map.addLayer({
          id: 'region-mask-fill',
          type: 'fill',
          source: 'region-mask',
          paint: {
            'fill-color': isDark ? '#05070c' : '#344054',
            'fill-opacity': isDark ? 0.38 : 0.22,
          },
        });
      }

      // Region boundary — thin subdued context line UNDER the thermal field.
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
      if (!map.getLayer('region-boundary-outline')) {
        map.addLayer({
          id: 'region-boundary-outline',
          type: 'line',
          source: 'region-boundary',
          paint: {
            'line-color': isDark ? '#8a94a8' : '#98a2b3',
            'line-width': 1.25,
            'line-opacity': 0.8,
            'line-dasharray': [2, 2],
          },
        });
      }

      // Thermal cells — FILL ONLY (no visible outline). Provider geometry is
      // rendered verbatim; the continuous ramp makes adjacent cells read as
      // one thermal surface while retaining per-cell color variation.
      if (!map.getLayer('thermal-tiles-fill')) {
        map.addLayer({
          id: 'thermal-tiles-fill',
          type: 'fill',
          source: 'thermal-tiles',
          paint: {
            'fill-color': THERMAL_COLOR_EXPRESSION as never,
            'fill-opacity': isDark ? 0.88 : 0.8,
          },
        });
      }

      // Seam-fill: a 1px line in the SAME color as each cell's fill. Adjacent
      // GeoJSON polygons anti-alias with hairline gaps at shared edges (which
      // read as a dark grid); painting each cell's own edge in its own fill
      // color visually MERGES the cells into one continuous thermal surface
      // without adding any visible outline (seam color == fill color).
      if (!map.getLayer('thermal-tiles-seam')) {
        map.addLayer({
          id: 'thermal-tiles-seam',
          type: 'line',
          source: 'thermal-tiles',
          paint: {
            'line-color': THERMAL_COLOR_EXPRESSION as never,
            'line-width': 1,
            'line-opacity': isDark ? 0.88 : 0.8,
          },
        });
      }

      // AOI — transparent interior + thin boundary (style set by validity/capture)
      if (!map.getLayer('aoi-fill')) {
        map.addLayer({
          id: 'aoi-fill',
          type: 'fill',
          source: 'analysis-aoi',
          paint: {
            'fill-color': isDark ? AOI_LIVE_COLOR.dark : AOI_LIVE_COLOR.light,
            'fill-opacity': 0.03,
          },
        });
      }

      if (!map.getLayer('aoi-outline')) {
        map.addLayer({
          id: 'aoi-outline',
          type: 'line',
          source: 'analysis-aoi',
          paint: {
            'line-color': isDark ? AOI_LIVE_COLOR.dark : AOI_LIVE_COLOR.light,
            'line-width': 2.0,
            'line-opacity': 1.0,
          },
        });
      }

      setMapReady(true);
      map.resize();
      applyAoiValidityPaint(map, aoiInvalid, isDark, aoiLocked);
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
          showToast('Select an operating location before placing candidate locations.', 'warning');
          return;
        }
        const inside = isPointInAoi({ latitude: e.lngLat.lat, longitude: e.lngLat.lng }, aoi);
        if (inside) {
          onAddSiteAtRef.current?.(e.lngLat.lng, e.lngLat.lat);
        } else {
          showToast('Candidate location must be inside the analysis area.', 'warning');
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
      }
      if (map.getLayer('aoi-fill')) {
        map.setLayoutProperty('aoi-fill', 'visibility', showAoi ? 'visible' : 'none');
        map.setLayoutProperty('aoi-outline', 'visibility', showAoi ? 'visible' : 'none');
      }
      if (map.getLayer('thermal-tiles-fill')) {
        map.setLayoutProperty('thermal-tiles-fill', 'visibility', showThermal ? 'visible' : 'none');
      }
      if (map.getLayer('thermal-tiles-seam')) {
        map.setLayoutProperty('thermal-tiles-seam', 'visibility', showThermal ? 'visible' : 'none');
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
  // GeoJSON data sync effect — provider geometry rendered VERBATIM.
  // (No edge-stretching, no clipping, no synthetic alignment: the genuine
  // provider cells are drawn exactly as FortyGuard returned them.)
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
            ? spatialField
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
  // DEV-ONLY spatial instrumentation — AOI ↔ provider thermal coverage +
  // the MAP-SOURCE stage of the thermal pipeline proof.
  //
  // Measures (never modifies) the relationship between the canonical analysis
  // AOI and the genuine provider cells so coverage complaints can be
  // attributed correctly:
  //   rendering bug (CASE A) vs honest provider gap (CASE B) vs provider
  // overshoot beyond the requested AOI (CASE D).
  //
  // Also proves the pipeline invariant at the MAP stage: the features pushed
  // into the MapLibre `thermal-tiles` GeoJSON source (mapSourceFeatures) must
  // EQUAL the provider_response / client_spatial_field stage counts. Once the
  // map goes idle, a follow-up line counts the features MapLibre actually
  // holds (querySourceFeatures). Logs in development only.
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (!analysisAoi || !spatialField) return;
    try {
      const coverage = computeAoiThermalCoverage(analysisAoi, spatialField);
      if (coverage) {
        console.info('[thermal-coverage]', formatCoverageLine(coverage), coverage);
      }

      // MAP-SOURCE stage — features pushed into the MapLibre GeoJSON source.
      // Source inference (dev-log only): the capture label is passed ONLY in
      // DEMO mode with a genuine capture, so its presence identifies FIXTURE.
      const dbgSource: 'FIXTURE' | 'LIVE' = captureAoiLabel ? 'FIXTURE' : 'LIVE';
      const aoiB = coverage?.aoiBounds;
      const aoiCentroid = aoiB
        ? `(${((aoiB.minLat + aoiB.maxLat) / 2).toFixed(5)},${((aoiB.minLng + aoiB.maxLng) / 2).toFixed(5)})`
        : null;
      logThermalFieldStage('map_source', dbgSource, spatialField, {
        mapSourceFeatures: spatialField.features.length,
        aoiBounds: aoiB ? `[${aoiB.minLng.toFixed(5)},${aoiB.minLat.toFixed(5)} → ${aoiB.maxLng.toFixed(5)},${aoiB.maxLat.toFixed(5)}]` : null,
        aoiCentroid,
        aoiCoverage: coverage ? `${(coverage.coverageRatio * 100).toFixed(1)}% of ${coverage.aoiAreaKm2.toFixed(2)}km²` : null,
      });

      // Post-idle verification — count what MapLibre actually holds in the
      // thermal-tiles source after the setData + tile rebuild settle.
      const map = mapRef.current;
      if (map && map.getSource('thermal-tiles')) {
        map.once('idle', () => {
          try {
            const rendered = map.querySourceFeatures('thermal-tiles');
            logThermalDebug('map_source', {
              mapSourceFeaturesRendered: rendered.length,
              note: 'MapLibre querySourceFeatures count after idle',
            });
          } catch {
            /* diagnostics only */
          }
        });
      }
    } catch {
      /* diagnostics only — never break rendering */
    }
  }, [analysisAoi, spatialField, captureAoiLabel]);

  // ─────────────────────────────────────────────────────────────────────
  // Committed AOI validity paint
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    applyAoiValidityPaint(map, aoiInvalid, theme === 'dark', aoiLocked);
  }, [mapReady, aoiInvalid, theme, aoiLocked]);

  // ─────────────────────────────────────────────────────────────────────
  // 1. OPERATING LOCATION MARKER (Dedicated identity — SVG pin, tip-anchored)
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
    const popupHtml = popupCardHtml({
      eyebrow: 'Operating Location',
      eyebrowColor: '#0d9488',
      title: locName,
      coords: `${location!.latitude.toFixed(4)}°, ${location!.longitude.toFixed(4)}°`,
      hint: locationDraggable ? 'Drag to move · Generate required' : undefined,
    });

    if (!operatingMarkerRef.current) {
      const el = createOperatingPinElement(!!locationDraggable);
      el.setAttribute('data-testid', 'operating-location-marker');
      el.title = locationDraggable ? 'Operating location (drag to move)' : 'Operating location';

      const popup = new Popup({ offset: 8, closeButton: false }).setHTML(popupHtml);

      // anchor: 'bottom' — the pin TIP sits exactly at the geographic point.
      const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, 0], draggable: !!locationDraggable })
        .setLngLat([location!.longitude, location!.latitude])
        .setPopup(popup)
        .addTo(map);

      marker.on('dragstart', () => {
        el.setAttribute('data-dragging', 'true');
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
        el.setAttribute('data-dragging', 'false');
        const ll = marker.getLngLat();
        onMoveOperatingLocationRef.current?.({ latitude: ll.lat, longitude: ll.lng });
      });

      operatingMarkerRef.current = marker;
    } else {
      // Direct position update
      operatingMarkerRef.current.setLngLat([location!.longitude, location!.latitude]);
      operatingMarkerRef.current.setDraggable(!!locationDraggable);
      const el = operatingMarkerRef.current.getElement();
      el.setAttribute('data-draggable', String(!!locationDraggable));

      const popup = operatingMarkerRef.current.getPopup();
      if (popup) {
        popup.setHTML(popupHtml);
      }
    }
  }, [mapReady, location, locationName, locationDraggable, showLocationMarker, theme]);

  // ─────────────────────────────────────────────────────────────────────
  // 2. CANDIDATE MARKERS (Identity Map<string, Marker> — SVG pins, tip-anchored)
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

      const popupHtml = popupCardHtml({
        eyebrow: isWinner ? 'Recommended Location' : 'Candidate Location',
        eyebrowColor: isWinner ? '#0e7490' : 'var(--text-dimmed)',
        title: cleanName,
        coords: `${item.location.latitude.toFixed(4)}°, ${item.location.longitude.toFixed(4)}°`,
        hint: candidatesDraggable ? 'Drag to move inside the analysis area' : undefined,
        removeLabel: candidatesDraggable && !isWinner,
        removeId: candidatesDraggable && !isWinner ? item.locationId : undefined,
      });

      const siteColor = getCandidateColor(index, isWinner);
      // Rank number — rendered in the SEPARATE badge (never inside the icon).
      // Zero-padded ("01") — identical format to the candidate list rows.
      const rank = String(index + 1).padStart(2, '0');
      const isDark = theme === 'dark';

      if (existing) {
        existing.marker.setLngLat([item.location.longitude, item.location.latitude]);
        existing.marker.setDraggable(!!candidatesDraggable);
        existing.lastValid = [item.location.longitude, item.location.latitude];

        const popup = existing.marker.getPopup();
        if (popup) popup.setHTML(popupHtml);

        const el = existing.marker.getElement();
        el.setAttribute('data-testid', isWinner ? 'recommended-site-marker' : 'candidate-site-marker');
        el.setAttribute('data-location-id', item.locationId);
        el.style.zIndex = isWinner ? '30' : '20';
        el.setAttribute('data-draggable', String(!!candidatesDraggable));
        el.setAttribute('aria-label', isWinner ? `Recommended location ${cleanName}` : `Candidate location ${cleanName}`);

        // Only update the pin DOM if the winner state, index, or THEME changed
        // — prevents DOM destruction (and drag interruption) mid-interaction.
        const prevWinner = el.getAttribute('data-is-winner') === 'true';
        const prevIndex = el.getAttribute('data-site-index');
        const prevTheme = el.getAttribute('data-pin-theme');
        if (prevWinner !== isWinner || prevIndex !== String(index) || prevTheme !== theme) {
          el.setAttribute('data-is-winner', String(isWinner));
          el.setAttribute('data-site-index', String(index));
          el.setAttribute('data-pin-theme', theme);
          // NEVER overwrite className wholesale — MapLibre appends its own
          // positioning classes (maplibregl-marker, anchor classes) to this
          // element; wiping them detaches the pin from its geographic anchor.
          el.classList.add('map-pin');
          el.classList.toggle('map-pin--winner', isWinner);
          el.innerHTML = candidatePinInnerHtml({ rank, color: siteColor, isWinner, isDark });
        }
      } else {
        const el = createCandidatePinElement({
          color: siteColor,
          rank,
          isWinner,
          isDark,
          draggable: !!candidatesDraggable,
        });
        el.setAttribute('data-testid', isWinner ? 'recommended-site-marker' : 'candidate-site-marker');
        el.setAttribute('data-location-id', item.locationId);
        el.setAttribute('data-is-winner', String(isWinner));
        el.setAttribute('data-site-index', String(index));
        el.setAttribute('data-pin-theme', theme);

        const popup = new Popup({ offset: 8, closeButton: false }).setHTML(popupHtml);

        popup.on('open', () => {
          const btn = document.getElementById(`remove-site-btn-${item.locationId}`);
          if (btn) {
            btn.onclick = () => {
              popup.remove();
              onRemoveCandidateRef.current?.(item.locationId);
            };
          }
        });

        // anchor: 'bottom' — the pin TIP sits exactly at the candidate's
        // longitude/latitude; zoom/pan never detaches it.
        const marker = new Marker({ element: el, anchor: 'bottom', offset: [0, 0], draggable: !!candidatesDraggable })
          .setLngLat([item.location.longitude, item.location.latitude])
          .setPopup(popup)
          .addTo(map);

        const entry = {
          marker,
          lastValid: [item.location.longitude, item.location.latitude] as [number, number],
        };

        if (candidatesDraggable) {
          marker.on('dragstart', () => {
            el.setAttribute('data-dragging', 'true');
          });

          marker.on('dragend', () => {
            el.setAttribute('data-dragging', 'false');
            const ll = marker.getLngLat();
            const aoi = aoiGeometryRef.current?.aoi;
            const inside = !aoi || isPointInAoi({ latitude: ll.lat, longitude: ll.lng }, aoi);

            if (!inside) {
              marker.setLngLat(entry.lastValid);
              showToast('Candidate location must remain inside the analysis area.', 'warning');
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

  /**
   * Reveal a point ONLY when it is not already visible in the viewport —
   * a search-added candidate never causes a gratuitous pan/zoom. When the
   * point IS off-screen, fit the AOI+candidates bounds (guaranteed to make
   * the new candidate visible).
   */
  const revealPoint = useCallback(
    (point: { latitude: number; longitude: number } | null | undefined) => {
      const map = mapRef.current;
      if (!map || !point) return;
      const lngLat: [number, number] = [point.longitude, point.latitude];
      try {
        // Shrink the viewport bounds ~6% — points hugging the edge count as
        // not-visible. (maplibre LngLatBounds has no .pad — compute manually.)
        const b = map.getBounds();
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        const shrinkX = (ne.lng - sw.lng) * 0.06;
        const shrinkY = (ne.lat - sw.lat) * 0.06;
        const visible =
          lngLat[0] >= sw.lng + shrinkX &&
          lngLat[0] <= ne.lng - shrinkX &&
          lngLat[1] >= sw.lat + shrinkY &&
          lngLat[1] <= ne.lat - shrinkY;
        if (visible) return; // already visible — no camera move
      } catch {
        /* bounds unavailable — fall through to the safe fit */
      }
      fitToLocalAoi();
    },
    [fitToLocalAoi],
  );

  useEffect(() => {
    if (!mapReady) return;
    if (cameraBehavior === 'fit-region') {
      fitToRegion();
    } else if (cameraBehavior === 'fit-point') {
      fitToPoint();
    } else if (cameraBehavior === 'reveal-point') {
      revealPoint(cameraRevealPoint);
    } else {
      fitToLocalAoi();
    }
  }, [mapReady, cameraNonce]);

  const legendTicks = getThermalLegendRampTicks(unit);

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
      aria-label="Hyperlocal thermal context map showing FortyGuard provider thermal cells, the selected analysis area, application-defined candidate locations, and the recommended operational location"
      className={
        isExpanded
          ? 'fixed inset-0 z-[90] overflow-hidden bg-surface-bg'
          : 'relative w-full h-[46vh] min-h-[380px] sm:h-[52vh] lg:h-[560px] xl:h-[600px] rounded-xl overflow-hidden border border-border'
      }
      style={{ backgroundColor: theme === 'dark' ? '#0b0f17' : '#eef1f5' }}
    >
      {/* Map canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* ── COMPACT MAP TOOLBAR — [Layers] [Sites] [AOI] [Fullscreen] ──
          Menus close away; the map stays visually clean when they're closed. */}
      <div ref={toolbarRef} className="absolute top-3 right-3 z-20 flex items-center gap-0.5 rounded-xl border border-border bg-surface-card/95 backdrop-blur-md p-1 shadow-lg pointer-events-auto">
        {/* Layers menu — click to open (works on mouse, touch, keyboard) */}
        <div className="relative">
          <button
            type="button"
            data-testid="map-layers-btn"
            title="Map layers"
            aria-label="Map layers"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'layers'}
            onClick={() => setOpenMenu(openMenu === 'layers' ? null : 'layers')}
            className="map-tool-btn"
            data-active={openMenu === 'layers' ? 'true' : 'false'}
          >
            <Layers3 className="size-4" aria-hidden="true" />
          </button>
          {openMenu === 'layers' && (
          <div
            role="menu"
            aria-label="Map layer visibility"
            className="absolute right-0 top-full mt-1.5 w-60 rounded-xl border border-border bg-surface-card shadow-xl p-1.5 card-enter z-30"
          >
            <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-dimmed">
              Layers
            </div>
            <LayerToggleRow
              checked={layerVisibility.thermal !== false}
              label="Thermal field"
              onClick={() => toggleLayer('thermal')}
            />
            <LayerToggleRow
              checked={layerVisibility.candidates !== false}
              label="Candidate locations"
              onClick={() => toggleLayer('candidates')}
            />
            <LayerToggleRow
              checked={layerVisibility.aoi !== false}
              label={aoiLocked ? 'Analysis area (captured)' : 'Analysis area'}
              onClick={() => toggleLayer('aoi')}
            />
            <LayerToggleRow
              checked={showRegionBoundary}
              label={stateDisplayName ? `${stateDisplayName} boundary` : 'Geographic Region boundary'}
              title="Toggle Geographic Region boundary (context only — never provider coverage)"
              onClick={() => {
                // Toggle the context layer WITHOUT moving the camera — the user
                // is mid-analysis at AOI scale; re-enabling a context line must
                // not yank them to a state-wide view.
                setShowRegionBoundary((prev) => !prev);
              }}
            />
            <LayerToggleRow
              checked={layerVisibility.labels !== false}
              label="Street labels"
              onClick={() => toggleLayer('labels')}
            />
            <div className="px-2 pb-1 pt-1.5 border-t border-border/70 mt-1 text-[10px] text-text-dimmed leading-snug">
              FortyGuard thermal cells are genuine provider data.
            </div>
          </div>
          )}
        </div>

        {/* Sites menu — click to open */}
        <div className="relative">
          <button
            type="button"
            data-testid="map-sites-btn"
            title="Candidate locations"
            aria-label="Candidate locations"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'sites'}
            onClick={() => setOpenMenu(openMenu === 'sites' ? null : 'sites')}
            className="map-tool-btn"
            data-active={openMenu === 'sites' || addSiteMode ? 'true' : 'false'}
          >
            <MapPin className="size-4" aria-hidden="true" />
          </button>
          {openMenu === 'sites' && (
          <div
            role="menu"
            aria-label="Candidate location controls"
            className="absolute right-0 top-full mt-1.5 w-60 rounded-xl border border-border bg-surface-card shadow-xl p-1.5 card-enter z-30"
          >
            <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-text-dimmed">
              Candidate locations
            </div>
            <LayerToggleRow
              checked={layerVisibility.candidates !== false}
              label="Show candidate locations"
              onClick={() => toggleLayer('candidates')}
            />
            {candidatesDraggable && onToggleAddSiteMode ? (
              <button
                type="button"
                role="menuitem"
                data-testid="map-add-site-action"
                onClick={onToggleAddSiteMode}
                className="mt-1 w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium text-left transition-colors duration-150 border"
                style={
                  addSiteMode
                    ? { color: 'var(--accent-emerald)', borderColor: 'var(--accent-emerald)', background: 'var(--accent-emerald-bg)' }
                    : { color: 'var(--text-primary)', borderColor: 'var(--border)', background: 'transparent' }
                }
              >
                <span className="flex h-4 w-4 items-center justify-center shrink-0">
                  <Plus className="size-3.5" aria-hidden="true" />
                </span>
                <span className="flex-1">{addSiteMode ? 'Placing — click the map' : 'Add candidate on map'}</span>
              </button>
            ) : null}
            <div className="px-2 pb-1 pt-1.5 border-t border-border/70 mt-1 text-[10px] text-text-dimmed leading-snug">
              {candidatesDraggable
                ? 'Candidates must stay inside the analysis area — outside drops are rejected.'
                : 'DEMO candidates are application-defined points evaluated against the captured field.'}
            </div>
          </div>
          )}
        </div>

        {/* AOI menu — shape + size (LIVE only; DEMO capture area is fixed) */}
        <div className="relative">
          <button
            type="button"
            data-testid="map-aoi-btn"
            title="Analysis area shape & size"
            aria-label="Analysis area shape and size"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'aoi'}
            onClick={() => setOpenMenu(openMenu === 'aoi' ? null : 'aoi')}
            className="map-tool-btn"
            data-active={openMenu === 'aoi' ? 'true' : 'false'}
          >
            <Square className="size-4" aria-hidden="true" />
          </button>
          {openMenu === 'aoi' && (
          <div
            role="menu"
            aria-label="Analysis area controls"
            className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-surface-card shadow-xl p-2.5 card-enter z-30"
          >
            <div className="px-0.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-dimmed">
              Analysis area
            </div>
            {aoiLocked ? (
              <p className="px-1.5 pb-1 text-xs text-text-muted leading-relaxed">
                The captured FortyGuard analysis area is fixed — shape and size apply to LIVE mode only.
              </p>
            ) : (
              <>
                <div className="text-[10px] text-text-dimmed mb-1 px-1.5">Shape</div>
                <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                  {(['polygon', 'circle'] as const).map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      aria-pressed={areaShape === shape}
                      onClick={() => prefSetters.setAnalysisAreaShape(shape)}
                      className={`map-menu-row min-h-[34px] rounded-md text-xs font-medium border transition-colors duration-150 ${
                        areaShape === shape
                          ? 'border-primary bg-primary/10 text-text-primary'
                          : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {shape === 'polygon' ? 'Square' : 'Circle'}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-text-dimmed mb-1 px-1.5">Size</div>
                <div className="grid grid-cols-5 gap-1.5">
                  {AOI_SPAN_PRESETS_LOCAL.map((size) => (
                    <button
                      key={size}
                      type="button"
                      aria-pressed={size === (aoiSpanMetres ?? 1000)}
                      onClick={() => prefSetters.setAnalysisAoiSpanMetres(size)}
                      className={`map-menu-row min-h-[32px] rounded-md text-[10px] font-medium border tnum transition-colors duration-150 ${
                        size === (aoiSpanMetres ?? 1000)
                          ? 'border-primary bg-primary/10 text-text-primary'
                          : 'border-border bg-surface-elevated text-text-muted hover:text-text-primary'
                      }`}
                      title={`${size}m ${areaShape === 'circle' ? 'diameter' : 'square span'}`}
                    >
                      {size >= 1000 ? `${size / 1000}km` : `${size}m`}
                    </button>
                  ))}
                </div>
                <p className="mt-2 px-1.5 text-[10px] text-text-dimmed leading-snug">
                  The area follows the operating location — drag the teal pin to move it.
                </p>
              </>
            )}
          </div>
          )}
        </div>

        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Fullscreen / expand map */}
        <button
          type="button"
          data-testid="map-fullscreen-btn"
          onClick={() => setIsExpanded((v) => !v)}
          title={isExpanded ? 'Exit full map (Esc)' : 'Expand map'}
          aria-label={isExpanded ? 'Exit full map' : 'Expand map'}
          className="map-tool-btn"
        >
          {isExpanded ? <Minimize2 className="size-4" aria-hidden="true" /> : <Maximize2 className="size-4" aria-hidden="true" />}
        </button>
      </div>

      {/* ── PLACE_SITE Top Interactive Banner with Cancel ── */}
      {addSiteMode && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-xs font-medium z-30 pointer-events-auto flex items-center gap-3 shadow-lg backdrop-blur-md border border-emerald-500/30"
          style={{
            background: 'rgba(6, 78, 59, 0.92)',
            color: '#ffffff',
          }}
          data-testid="add-site-mode-hint"
        >
          <span>Click inside the analysis area to place a site</span>
          <button
            type="button"
            onClick={() => onExitAddSiteModeRef.current?.()}
            className="flex items-center gap-1 rounded-md bg-black/25 hover:bg-black/40 px-2 py-1 text-[11px] font-semibold text-white transition-colors duration-150"
            title="Cancel candidate placement"
          >
            <X className="size-3" aria-hidden="true" />
            Cancel
          </button>
        </div>
      )}

      {/* ── Invalid-AOI banner ── */}
      {aoiInvalid && !addSiteMode && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-xs font-medium z-20 pointer-events-none max-w-md text-center shadow-lg border"
          style={{
            background: 'var(--surface-card)',
            color: 'var(--accent-red)',
            borderColor: 'var(--accent-red)',
          }}
          role="alert"
          data-testid="aoi-invalid-banner"
        >
          {aoiInvalidMessage || 'Analysis area invalid'} · Generate disabled
        </div>
      )}

      {/* ── Dynamic Candidate Toast / Validation Feedback ── */}
      {candidateToast && (
        <div
          className="absolute top-16 left-1/2 -translate-x-1/2 px-3.5 py-2 rounded-lg text-xs font-medium z-30 pointer-events-none max-w-md text-center shadow-lg"
          style={{
            background: candidateToast.type === 'warning' ? 'rgba(180, 35, 24, 0.95)' : 'var(--surface-card)',
            color: '#ffffff',
          }}
          role="alert"
          data-testid="candidate-toast-feedback"
        >
          {candidateToast.message}
        </div>
      )}

      {/* ── Thermal legend (bottom-left) — continuous ramp bar ── */}
      <div
        className="absolute bottom-3 left-3 bg-surface-card/95 backdrop-blur-md px-3 py-2.5 rounded-xl shadow-lg border border-border z-10"
        data-testid="map-legend-ticks"
      >
        <div
          className="text-[10px] font-semibold text-text-dimmed uppercase tracking-wider mb-1.5 flex items-center justify-between gap-3"
          data-testid="map-legend-header"
          title="FortyGuard modeled tile-level thermal value (average_temperature). The provider does not document a sensor height or physical surface level — no surface-vs-air claim is made."
        >
          <span>Modeled temperature ({tempUnitSuffix(unit)})</span>
          {selectedTileId && (
            <span className="text-[9px] text-accent-cyan font-mono font-normal">
              Tile {selectedTileId}
            </span>
          )}
        </div>
        {/* Continuous gradient bar — same stops as the rendered field */}
        <div
          className="h-2 w-44 rounded-full"
          style={{ background: thermalRampGradientCss() }}
          aria-hidden="true"
        />
        <div className="flex items-center justify-between mt-1 w-44">
          {legendTicks.map((t, i) => (
            <span key={i} className="text-[9px] text-text-muted tnum">{t.label}</span>
          ))}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-border/60">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan flex-shrink-0" />
          <span className="text-[9px] text-text-dimmed uppercase tracking-wide">
            FortyGuard provider cells
          </span>
        </div>
      </div>

      {/* DEMO captured analysis-area label */}
      {captureAoiLabel && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-md text-[10px] font-medium z-10 pointer-events-none flex items-center gap-1.5 whitespace-nowrap border"
          style={{
            background: 'rgba(11, 15, 23, 0.72)',
            color: '#f5a524',
            borderColor: 'rgba(245, 165, 36, 0.4)',
            backdropFilter: 'blur(4px)',
          }}
          data-testid="captured-aoi-label"
        >
          Captured FortyGuard AOI · {captureAoiLabel}
        </div>
      )}

      {/* Empty state overlay */}
      {!spatialField && !analysisAoi && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" data-testid="map-empty-overlay">
          <div className="bg-surface-card/95 backdrop-blur-md px-5 py-3.5 rounded-xl text-center border border-border shadow-lg max-w-sm">
            <p className="text-[13px] text-text-muted">
              {emptyMapMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Menu row used by the Layers / Sites map-toolbar menus. */
function LayerToggleRow({
  checked,
  label,
  title,
  onClick,
}: {
  checked: boolean;
  label: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      title={title}
      onClick={onClick}
      className="map-menu-row flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-text-primary hover:bg-surface-deep text-left transition-colors duration-150"
    >
      <span className="flex h-4 w-4 items-center justify-center shrink-0">
        {checked ? <Check className="size-3.5 text-accent-cyan" aria-hidden="true" /> : null}
      </span>
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

export default ThermalMap;
