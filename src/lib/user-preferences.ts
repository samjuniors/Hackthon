'use client';

import { useSyncExternalStore, useCallback } from 'react';
import type { PreferredAIProvider } from '@/types/provider';
import {
  type AnalysisTimeMode,
  DEFAULT_TIME_MODE,
  DEFAULT_DAY_WINDOW_HOURS,
} from '@/lib/temporal/analysis-window';

/**
 * User Preferences Store — Thermal Decision Engine
 *
 * Mirrors the SSR-safe persistence pattern in `./temperature.ts`:
 *   - Module-level `Set<() => void>` of listeners
 *   - `loadX()` / `saveX()` with try/catch around localStorage
 *   - `subscribe` / `getSnapshot` / `getServerSnapshot` triple
 *   - `useX()` hook returning `[value, setters]`
 *
 * Snapshot stability: `loadUserPreferences()` returns the SAME object
 * reference when the underlying localStorage payload has not changed, so
 * `useSyncExternalStore` does not enter an infinite re-render loop. A
 * module-level `cachedPrefs`/`cachedRaw` pair invalidates the cache only
 * when the raw JSON string actually changes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AnalysisResolution = 60 | 80 | 100;
export type AnalysisAreaShape = 'polygon' | 'circle';
export type { AnalysisTimeMode } from '@/lib/temporal/analysis-window';

/**
 * Preset AOI half-side sizes (in metres). The user picks one to define the
 * size of the canonical analysis area. Half-side is:
 *   - For 'polygon' shape: half the side length of the square AOI.
 *   - For 'circle' shape: the radius of the circle.
 *
 * All presets are well within the FortyGuard 150 mi² AOI limit (largest
 * preset 5000m polygon = ~38.6 mi², 5000m circle = ~30 mi²). The 150 mi²
 * limit is still validated client-side in page.tsx via isAoiWithinLimit()
 * so a future custom-draw feature cannot silently send an oversized AOI.
 */
export const AOI_HALF_SIDE_PRESETS = [250, 400, 1000, 2000, 5000] as const;
export type AoiHalfSideMetres = (typeof AOI_HALF_SIDE_PRESETS)[number];

export function isValidAoiHalfSide(v: unknown): v is AoiHalfSideMetres {
  return typeof v === 'number' && (AOI_HALF_SIDE_PRESETS as readonly number[]).includes(v);
}

export interface MapLayerVisibility {
  thermal: boolean;
  candidates: boolean;
  labels: boolean;
  aoi: boolean;
}

export interface UserPreferences {
  dataSourceMode: 'LIVE' | 'FIXTURE';
  preferredAIProvider: PreferredAIProvider;
  analysisResolution: AnalysisResolution;
  analysisAreaShape: AnalysisAreaShape;
  analysisAoiHalfSideMetres: AoiHalfSideMetres;
  /** Time mode persisted per Section 5 (Single Hour / Range of Hours / Single Day). */
  analysisTimeMode: AnalysisTimeMode;
  /** For Single Day mode — the operating-window length the engine finds (2h/3h/4h). */
  analysisDayWindowHours: 2 | 3 | 4;
  mapLayerVisibility: MapLayerVisibility;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  dataSourceMode: 'FIXTURE',
  preferredAIProvider: 'auto',
  analysisResolution: 60,
  analysisAreaShape: 'polygon',
  analysisAoiHalfSideMetres: 400,
  analysisTimeMode: DEFAULT_TIME_MODE,
  analysisDayWindowHours: DEFAULT_DAY_WINDOW_HOURS,
  mapLayerVisibility: {
    thermal: true,
    candidates: true,
    labels: true,
    aoi: true,
  },
};

/** localStorage key for persisting the user preferences blob. */
export const PREFS_KEY = 'tde_user_preferences' as const;

// ─────────────────────────────────────────────────────────────────────────────
// localStorage persistence
// ─────────────────────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

// Cache for snapshot stability — see file header comment.
let cachedPrefs: UserPreferences | null = null;
let cachedRaw: string | null = null;

function isValidPreferredProvider(v: unknown): v is PreferredAIProvider {
  return v === 'auto' || v === 'gemini' || v === 'claude' || v === 'zai';
}

function isValidResolution(v: unknown): v is AnalysisResolution {
  return v === 60 || v === 80 || v === 100;
}

function isValidAreaShape(v: unknown): v is AnalysisAreaShape {
  return v === 'polygon' || v === 'circle';
}

function isValidTimeMode(v: unknown): v is AnalysisTimeMode {
  return v === 'single-hour' || v === 'range-of-hours' || v === 'single-day';
}

function isValidDayWindowHours(v: unknown): v is 2 | 3 | 4 {
  return v === 2 || v === 3 || v === 4;
}

/**
 * Load the persisted user preferences. Falls back to DEFAULT_USER_PREFERENCES
 * when localStorage is unavailable (SSR, private browsing) or the stored
 * payload is missing/corrupt. Missing keys never crash — every field is
 * validated and merged over the defaults; `mapLayerVisibility` is merged
 * field-by-field over its default.
 */
export function loadUserPreferences(): UserPreferences {
  // 1. Read raw from localStorage (SSR-safe).
  let raw: string | null = null;
  try {
    if (typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(PREFS_KEY);
    }
  } catch {
    // localStorage unavailable (SSR or strict private browsing)
  }

  // 2. Return cached object if raw hasn't changed (snapshot stability).
  if (raw === cachedRaw && cachedPrefs !== null) {
    return cachedPrefs;
  }

  cachedRaw = raw;

  // 3. Nothing stored → defaults.
  if (!raw) {
    cachedPrefs = DEFAULT_USER_PREFERENCES;
    return cachedPrefs;
  }

  // 4. Parse + validate, merging every field over the defaults.
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      cachedPrefs = DEFAULT_USER_PREFERENCES;
      return cachedPrefs;
    }
    const p = parsed as Partial<UserPreferences>;

    const mergedLayers: MapLayerVisibility = {
      ...DEFAULT_USER_PREFERENCES.mapLayerVisibility,
      ...(p.mapLayerVisibility && typeof p.mapLayerVisibility === 'object'
        ? p.mapLayerVisibility
        : {}),
    };
    // Coerce any non-boolean layer flags back to the defaults so a corrupt
    // localStorage payload can never reach the Switch component.
    (['thermal', 'candidates', 'labels', 'aoi'] as const).forEach((key) => {
      if (typeof mergedLayers[key] !== 'boolean') {
        mergedLayers[key] = DEFAULT_USER_PREFERENCES.mapLayerVisibility[key];
      }
    });

    cachedPrefs = {
      dataSourceMode:
        p.dataSourceMode === 'LIVE' || p.dataSourceMode === 'FIXTURE'
          ? p.dataSourceMode
          : DEFAULT_USER_PREFERENCES.dataSourceMode,
      preferredAIProvider: isValidPreferredProvider(p.preferredAIProvider)
        ? p.preferredAIProvider
        : DEFAULT_USER_PREFERENCES.preferredAIProvider,
      analysisResolution: isValidResolution(p.analysisResolution)
        ? p.analysisResolution
        : DEFAULT_USER_PREFERENCES.analysisResolution,
      analysisAreaShape: isValidAreaShape(p.analysisAreaShape)
        ? p.analysisAreaShape
        : DEFAULT_USER_PREFERENCES.analysisAreaShape,
      analysisAoiHalfSideMetres: isValidAoiHalfSide(p.analysisAoiHalfSideMetres)
        ? p.analysisAoiHalfSideMetres
        : DEFAULT_USER_PREFERENCES.analysisAoiHalfSideMetres,
      analysisTimeMode: isValidTimeMode(p.analysisTimeMode)
        ? p.analysisTimeMode
        : DEFAULT_USER_PREFERENCES.analysisTimeMode,
      analysisDayWindowHours: isValidDayWindowHours(p.analysisDayWindowHours)
        ? p.analysisDayWindowHours
        : DEFAULT_USER_PREFERENCES.analysisDayWindowHours,
      mapLayerVisibility: mergedLayers,
    };
    return cachedPrefs;
  } catch {
    // Corrupt JSON — fall back to defaults.
    cachedPrefs = DEFAULT_USER_PREFERENCES;
    return cachedPrefs;
  }
}

/** Persist the user preferences blob for the current browser session. */
export function saveUserPreferences(p: UserPreferences): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    }
  } catch {
    // Ignore write errors
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// useSyncExternalStore wiring
// ─────────────────────────────────────────────────────────────────────────────

function subscribe(callback: () => void) {
  listeners.add(callback);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', callback);
  }
  return () => {
    listeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', callback);
    }
  };
}

function getSnapshot(): UserPreferences {
  return loadUserPreferences();
}

function getServerSnapshot(): UserPreferences {
  return DEFAULT_USER_PREFERENCES;
}

/** Internal: persist + notify every listener so all hooks re-render. */
function commit(next: UserPreferences): void {
  saveUserPreferences(next);
  for (const listener of listeners) {
    listener();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// React Hook
// ─────────────────────────────────────────────────────────────────────────────

export interface UserPreferencesSetters {
  setDataSourceMode: (m: 'LIVE' | 'FIXTURE') => void;
  setPreferredAIProvider: (p: PreferredAIProvider) => void;
  setAnalysisResolution: (r: AnalysisResolution) => void;
  setAnalysisAreaShape: (s: AnalysisAreaShape) => void;
  setAnalysisAoiHalfSideMetres: (m: AoiHalfSideMetres) => void;
  setAnalysisTimeMode: (m: AnalysisTimeMode) => void;
  setAnalysisDayWindowHours: (h: 2 | 3 | 4) => void;
  setMapLayerVisibility: (v: Partial<MapLayerVisibility>) => void;
  reset: () => void;
}

/**
 * React hook to synchronize user preferences across components, page
 * reloads, and browser storage without hydration mismatches.
 *
 * @returns `[prefs, setters]` — each setter persists + notifies every
 *          subscribed component. `setMapLayerVisibility` merges a partial
 *          into the existing `mapLayerVisibility` object. `reset` writes
 *          the DEFAULT_USER_PREFERENCES back to localStorage.
 */
export function useUserPreferences(): [UserPreferences, UserPreferencesSetters] {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setDataSourceMode = useCallback((m: 'LIVE' | 'FIXTURE') => {
    commit({ ...getSnapshot(), dataSourceMode: m });
  }, []);

  const setPreferredAIProvider = useCallback((p: PreferredAIProvider) => {
    commit({ ...getSnapshot(), preferredAIProvider: p });
  }, []);

  const setAnalysisResolution = useCallback((r: AnalysisResolution) => {
    commit({ ...getSnapshot(), analysisResolution: r });
  }, []);

  const setAnalysisAreaShape = useCallback((s: AnalysisAreaShape) => {
    commit({ ...getSnapshot(), analysisAreaShape: s });
  }, []);

  const setAnalysisAoiHalfSideMetres = useCallback((m: AoiHalfSideMetres) => {
    commit({ ...getSnapshot(), analysisAoiHalfSideMetres: m });
  }, []);

  const setAnalysisTimeMode = useCallback((m: AnalysisTimeMode) => {
    commit({ ...getSnapshot(), analysisTimeMode: m });
  }, []);

  const setAnalysisDayWindowHours = useCallback((h: 2 | 3 | 4) => {
    commit({ ...getSnapshot(), analysisDayWindowHours: h });
  }, []);

  const setMapLayerVisibility = useCallback((v: Partial<MapLayerVisibility>) => {
    const current = getSnapshot();
    commit({
      ...current,
      mapLayerVisibility: { ...current.mapLayerVisibility, ...v },
    });
  }, []);

  const reset = useCallback(() => {
    commit(DEFAULT_USER_PREFERENCES);
  }, []);

  return [
    prefs,
    {
      setDataSourceMode,
      setPreferredAIProvider,
      setAnalysisResolution,
      setAnalysisAreaShape,
      setAnalysisAoiHalfSideMetres,
      setAnalysisTimeMode,
      setAnalysisDayWindowHours,
      setMapLayerVisibility,
      reset,
    },
  ];
}
