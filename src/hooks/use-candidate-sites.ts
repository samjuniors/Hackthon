'use client';

/**
 * Candidate-site management hook (Section 8).
 *
 * REAL sites only — the user explicitly adds each candidate by:
 *   - clicking the map inside the analysis area, or
 *   - searching a site/address.
 * Nothing is auto-generated. Geographic offsets are never invented sites.
 *
 * Lifecycle: ADD → MOVE → REMOVE. A MOVE that would drop the site OUTSIDE
 * the canonical AOI is REJECTED (Section 7) — the site stays at its last
 * valid position; it is never silently clamped or moved to a valid spot.
 *
 * Containment (Section 9): a candidate outside the analysis AOI is flagged
 * `outsideAoi` — surfaced as an error, never silently moved or clamped.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { CandidateLocation, LocationPoint, PolygonAOI } from '@/types/domain';
import { isPointInAoi } from '@/lib/spatial/aoi';

/**
 * Structural subset of a geocoder `NamedLocation` the candidate-add path
 * needs (keeps the hook decoupled from the provider type module).
 */
export interface SearchCandidateSource {
  name: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
}

export interface CandidateSite extends CandidateLocation {
  /** True when the site falls outside the current AOI (validation flag). */
  outsideAoi?: boolean;
  /** How the site was added — provenance label in the UI. */
  origin: 'map-click' | 'search' | 'demo-captured';
  /** Locality line for search-added sites ("New York, NY") — shown in the candidate list. */
  address?: string;
  /** State code for search-added sites ("NY"). */
  state?: string;
}

/** Outcome of adding a candidate from a search result (pure, testable). */
export type CandidateAddOutcome =
  | { status: 'added'; site: CandidateSite }
  | { status: 'duplicate'; existing: CandidateSite }
  | { status: 'outside-aoi' };

/** Inputs for a candidate add from a search result. */
export interface CandidateAddInput {
  latitude: number;
  longitude: number;
  name: string;
  /** Locality line ("New York, NY") — preserved for the candidate list. */
  address?: string;
  state?: string;
}

/**
 * Map a geocoder result to the candidate-add input: a clean display name and
 * the locality line. Coordinates pass through VERBATIM — the exact returned
 * latitude/longitude is preserved all the way to the pin and Generate.
 */
export function candidateInputFromLocation(loc: SearchCandidateSource): CandidateAddInput {
  return {
    latitude: loc.latitude,
    longitude: loc.longitude,
    name: loc.name.split(' (')[0].split(',')[0].trim() || loc.name,
    address: [loc.city, loc.state].filter(Boolean).join(', ') || undefined,
    state: loc.state,
  };
}

/**
 * Pure candidate-add decision (testable without React).
 *
 * ORDER OF AUTHORITY:
 *   1. Canonical AOI containment — a point outside the analysis area is NEVER
 *      added and NEVER clamped/moved into the AOI (status 'outside-aoi').
 *   2. Exact-coordinate duplicate — never duplicated; the EXISTING candidate is
 *      returned so the UI can highlight it with an "Already added" state.
 *   3. Otherwise the site is added with the EXACT returned latitude/longitude
 *      (no rounding — pin, list and Generate all use this same value) and a
 *      stable `SITE-nn` id.
 */
export function resolveCandidateAdd(
  sites: CandidateSite[],
  nextLocationId: string,
  input: CandidateAddInput,
  aoi: PolygonAOI | null | undefined,
): CandidateAddOutcome {
  // 1. Outside the canonical analysis area — rejected, never clamped.
  if (aoi && !isPointInAoi({ latitude: input.latitude, longitude: input.longitude }, aoi)) {
    return { status: 'outside-aoi' };
  }
  // 2. Exact coordinate already a candidate — no duplicate.
  const existing = sites.find(
    (s) => s.location.latitude === input.latitude && s.location.longitude === input.longitude,
  );
  if (existing) {
    return { status: 'duplicate', existing };
  }
  // 3. Add with the EXACT returned coordinates (no rounding) + stable id.
  const site: CandidateSite = {
    locationId: nextLocationId,
    name: input.name,
    location: { latitude: input.latitude, longitude: input.longitude },
    address: input.address,
    state: input.state,
    origin: 'search',
  };
  return { status: 'added', site };
}

/** Auto-generated fallback name pattern for map-click sites without identity. */
export const MAP_POINT_FALLBACK_RE = /^Map point \d+$/;

/**
 * Pure display-identity update (testable without React).
 *
 * Applies a reverse-geocoded identity to a map-click candidate WITHOUT ever
 * touching its coordinates:
 *   - name/address/state are DISPLAY METADATA — the coordinate is the spatial
 *     authority and is returned UNCHANGED (bit-identical latitude/longitude).
 *   - a user- or search-provided name is NEVER overwritten: the identity is
 *     applied only while the site still carries the auto-generated
 *     "Map point N" fallback (or the explicit `force` flag, used by History
 *     restore which must reproduce the saved identity verbatim).
 */
export function applySiteIdentity<T extends CandidateSite>(
  sites: T[],
  locationId: string,
  identity: { name?: string; address?: string; state?: string },
  options?: { force?: boolean },
): { sites: T[]; applied: boolean; reason?: 'NOT_FOUND' | 'NAME_PROTECTED' | 'NO_NAME' } {
  const site = sites.find((s) => s.locationId === locationId);
  if (!site) return { sites, applied: false, reason: 'NOT_FOUND' };

  const cleanName = identity.name?.trim();
  if (!cleanName) return { sites, applied: false, reason: 'NO_NAME' };

  const hasFallbackName = MAP_POINT_FALLBACK_RE.test(site.name);
  if (!hasFallbackName && !options?.force) {
    // Known identity (search result or user rename) — never replaced.
    return { sites, applied: false, reason: 'NAME_PROTECTED' };
  }

  return {
    sites: sites.map((s) =>
      s.locationId === locationId
        ? {
            ...s,
            name: cleanName,
            address: identity.address?.trim() || s.address,
            state: identity.state?.trim() || s.state,
            // COORDINATES UNTOUCHED — the reverse-geocode result is display
            // identity only; the clicked point remains the spatial authority.
          }
        : s,
    ),
    applied: true,
  };
}

/**
 * Pure candidate-move application (testable without React).
 *
 * Moving a candidate to a point OUTSIDE the canonical AOI is REJECTED:
 * the returned list is unchanged and `accepted` is false — the candidate
 * remains at its last valid position. Moving inside the AOI updates the
 * coordinates and clears any stale `outsideAoi` flag.
 */
export function applyCandidateMove<T extends CandidateLocation & { outsideAoi?: boolean }>(
  sites: T[],
  locationId: string,
  point: LocationPoint,
  aoi: PolygonAOI | null | undefined,
): { sites: T[]; accepted: boolean; reason?: 'NOT_FOUND' | 'OUTSIDE_AOI' } {
  const site = sites.find((s) => s.locationId === locationId);
  if (!site) return { sites, accepted: false, reason: 'NOT_FOUND' };
  if (aoi && !isPointInAoi(point, aoi)) {
    // REJECTED — never silently moved, never clamped (Section 7).
    return { sites, accepted: false, reason: 'OUTSIDE_AOI' };
  }
  return {
    sites: sites.map((s) =>
      s.locationId === locationId
        ? {
            ...s,
            location: {
              latitude: Number(point.latitude.toFixed(6)),
              longitude: Number(point.longitude.toFixed(6)),
            },
            outsideAoi: false,
          }
        : s
    ),
    accepted: true,
  };
}

export function useCandidateSites() {
  const [sites, setSites] = useState<CandidateSite[]>([]);
  const nextIdRef = useRef(1);
  const sitesRef = useRef<CandidateSite[]>([]);
  useEffect(() => {
    sitesRef.current = sites;
  }, [sites]);

  const addSiteAt = useCallback((lat: number, lng: number, name?: string, origin: CandidateSite['origin'] = 'map-click'): CandidateSite => {
    const id = `SITE-${String(nextIdRef.current++).padStart(2, '0')}`;
    const site: CandidateSite = {
      locationId: id,
      name: name || `Map point ${nextIdRef.current - 1}`,
      location: { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) },
      origin,
    };
    setSites((prev) => [...prev, site]);
    return site;
  }, []);

  /**
   * Add a candidate from a SEARCH result.
   *
   * The canonical AOI containment check and exact-coordinate duplicate check
   * run here (pure `resolveCandidateAdd`); coordinates are preserved EXACTLY
   * as the geocoder returned them. The caller decides how to present the
   * outcome ('added' / 'duplicate' / 'outside-aoi'). This performs NO provider
   * request — Generate is the only trigger for the decision pipeline.
   */
  const addSiteFromSearch = useCallback(
    (loc: SearchCandidateSource, aoi: PolygonAOI | null | undefined): CandidateAddOutcome => {
      const outcome = resolveCandidateAdd(
        sitesRef.current,
        `SITE-${String(nextIdRef.current).padStart(2, '0')}`,
        candidateInputFromLocation(loc),
        aoi,
      );
      if (outcome.status === 'added') {
        nextIdRef.current++;
        setSites((prev) => [...prev, outcome.site]);
      }
      return outcome;
    },
    [],
  );

  /**
   * Apply a reverse-geocoded DISPLAY identity to a map-click candidate.
   *
   * The geocoder result is display metadata ONLY: the exact clicked
   * coordinates are never moved or snapped, and an existing search-result /
   * user-provided name is never overwritten (pure `applySiteIdentity` guards
   * both invariants). Returns whether the identity was applied.
   */
  const applyIdentity = useCallback(
    (locationId: string, identity: { name?: string; address?: string; state?: string }, options?: { force?: boolean }): boolean => {
      const result = applySiteIdentity(sitesRef.current, locationId, identity, options);
      if (!result.applied) return false;
      setSites(result.sites);
      return true;
    },
    [],
  );

  const removeSite = useCallback((locationId: string) => {
    setSites((prev) => prev.filter((s) => s.locationId !== locationId));
  }, []);

  const renameSite = useCallback((locationId: string, name: string) => {
    setSites((prev) => prev.map((s) => (s.locationId === locationId ? { ...s, name } : s)));
  }, []);

  /**
   * Move a candidate to a new point (drag commit). When an AOI is provided
   * and the point lies OUTSIDE it, the move is REJECTED and the candidate
   * stays at its last valid position (returns false).
   */
  const moveSite = useCallback((locationId: string, lat: number, lng: number, aoi?: PolygonAOI | null): boolean => {
    const result = applyCandidateMove(
      sitesRef.current,
      locationId,
      { latitude: lat, longitude: lng },
      aoi,
    );
    if (!result.accepted) return false;
    setSites(result.sites as CandidateSite[]);
    return true;
  }, []);

  const clearSites = useCallback(() => {
    setSites([]);
  }, []);

  /**
   * Replace the entire site list with the given candidates, preserving their
   * ORIGINAL locationIds AND display identity (name + address + state) —
   * used by History restoration: the saved decision results reference the
   * original ids, and the restored candidate list must show the SAME real
   * names the analysis ran with (the map highlight contract
   * `recommendedLocationId === candidate.locationId` must keep holding).
   */
  const replaceSites = useCallback((sites: CandidateLocation[]) => {
    setSites(sites.map((s) => ({
      locationId: s.locationId,
      name: s.name,
      location: s.location,
      address: s.address,
      state: s.state,
      origin: 'search' as const,
      outsideAoi: false,
    })));
    // Keep the id counter past any restored SITE-nn id to avoid collisions.
    for (const s of sites) {
      const m = /^SITE-(\d+)$/.exec(s.locationId);
      if (m) {
        const n = Number(m[1]) + 1;
        if (n > nextIdRef.current) nextIdRef.current = n;
      }
    }
  }, []);

  /** Re-validate every site against the current AOI (flags outsideAoi only if changed). */
  const validateAgainstAoi = useCallback((aoi: PolygonAOI | null) => {
    if (!aoi) return;
    setSites((prev) => {
      let changed = false;
      const next = prev.map((s) => {
        const outside = !isPointInAoi(s.location, aoi);
        if (s.outsideAoi !== outside) {
          changed = true;
          return { ...s, outsideAoi: outside };
        }
        return s;
      });
      return changed ? next : prev;
    });
  }, []);

  return { sites, addSiteAt, addSiteFromSearch, removeSite, renameSite, moveSite, clearSites, replaceSites, applyIdentity, validateAgainstAoi };
}
