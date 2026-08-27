/**
 * Real location geocoding — server-side.
 *
 * Uses genuine geocoding providers (NOT FortyGuard — search never spends
 * heatmap credits):
 *   1. Photon (photon.komoot.io, OSM-based autocomplete) — primary
 *   2. Nominatim (nominatim.openstreetmap.org) — fallback
 *
 * Each result is resolved to { name, latitude, longitude, city, state,
 * country, timezone } where the timezone is derived offline from the
 * coordinate via @photostructure/tz-lookup (no network, deterministic).
 *
 * Falls back to the curated METROPOLITAN_LOCATIONS catalog when both
 * providers are unreachable so the UI degrades gracefully (clearly
 * marked as catalog results, never invented coordinates).
 */
import type { NamedLocation } from '@/types/provider';
import { searchLocations } from './search';
import { lookupTimezone } from './timezone-lookup';

export interface GeocodeOptions {
  limit?: number;
  timeoutMs?: number;
}

interface PhotonProperties {
  osm_key?: string;
  osm_value?: string;
  type?: string;
  name?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  postcode?: string;
  street?: string;
  housenumber?: string;
  extent?: [number, number, number, number];
}

interface PhotonResponse {
  features?: Array<{
    properties?: PhotonProperties;
    geometry?: { coordinates?: [number, number] };
  }>;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  name?: string;
  type?: string;
  class?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
    postcode?: string;
    road?: string;
    house_number?: string;
    neighbourhood?: string;
    suburb?: string;
  };
}

/** Classify a Photon result into a camera-behavior result type. */
function classifyPhoton(p: PhotonProperties): NamedLocation['resultType'] {
  const key = p.osm_key;
  const value = p.osm_value;
  if (key === 'place') {
    if (value === 'state' || value === 'region' || value === 'province') return 'state';
    if (value === 'city' || value === 'town') return 'city';
    if (value === 'suburb' || value === 'quarter' || value === 'neighbourhood' || value === 'borough') return 'neighborhood';
    if (value === 'house' || value === 'building') return 'address';
  }
  if (key === 'highway' || key === 'railway') return 'street';
  if (key === 'amenity' || key === 'shop' || key === 'tourism' || key === 'leisure' || key === 'office') return 'poi';
  if (key === 'place' && value === 'postcode') return 'zip';
  if (key === 'boundary' && value === 'administrative') return 'region';
  return 'poi';
}

/** Classify a Nominatim result into a camera-behavior result type. */
function classifyNominatim(r: NominatimResult): NamedLocation['resultType'] {
  const cls = r.class;
  const type = r.type;
  if (cls === 'place') {
    if (type === 'state' || type === 'region' || type === 'province') return 'state';
    if (type === 'city' || type === 'town') return 'city';
    if (type === 'suburb' || type === 'quarter' || type === 'neighbourhood' || type === 'borough') return 'neighborhood';
    if (type === 'house' || type === 'building') return 'address';
    if (type === 'postcode') return 'zip';
  }
  if (cls === 'boundary' && type === 'administrative') return 'region';
  if (cls === 'highway' || cls === 'railway') return 'street';
  if (cls === 'amenity' || cls === 'shop' || cls === 'tourism' || cls === 'leisure' || cls === 'office') return 'poi';
  return 'poi';
}

function stateCode(stateNameOrCode?: string, countryCode?: string): string | undefined {
  if (!stateNameOrCode) return undefined;
  return stateNameOrCode;
}

/** Build the human-facing short name for a geocode hit. */
function buildName(parts: {
  primary?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
}): string {
  const primary = parts.primary?.trim();
  if (primary) return primary;
  if (parts.street) {
    const num = parts.housenumber ? `${parts.housenumber} ` : '';
    return `${num}${parts.street}`;
  }
  if (parts.city) return parts.city;
  if (parts.county) return parts.county;
  return parts.state || parts.country || 'Location';
}

async function fetchWithTimeout(url: string, ms: number, headers: Record<string, string> = {}): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, headers });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Query Photon and map results to NamedLocation[]. */
async function geocodePhoton(query: string, limit: number, timeoutMs: number): Promise<NamedLocation[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res || !res.ok) return [];
  let data: PhotonResponse;
  try {
    data = (await res.json()) as PhotonResponse;
  } catch {
    return [];
  }
  const out: NamedLocation[] = [];
  for (const feature of data.features ?? []) {
    const p = feature.properties ?? {};
    const coords = feature.geometry?.coordinates;
    if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) continue;

    const lat = coords[1];
    const lon = coords[0];
    const name = buildName({
      primary: p.name,
      street: p.street,
      housenumber: p.housenumber,
      city: p.city,
      county: p.county,
      state: p.state,
      country: p.country,
    });
    const city = p.city || p.county;
    const region = stateCode(p.state);
    out.push({
      id: `GEO-${lat.toFixed(5)}-${lon.toFixed(5)}`,
      name,
      displayName: [name, city && city !== name ? city : null, region, p.country].filter(Boolean).join(', '),
      category: 'Custom Location',
      latitude: lat,
      longitude: lon,
      city,
      state: region,
      country: p.country,
      zipCode: p.postcode,
      timezone: lookupTimezone(lat, lon),
      isDemoOnly: false,
      resultType: classifyPhoton(p),
    });
  }
  return out;
}

/** Query Nominatim (fallback) and map results to NamedLocation[]. */
async function geocodeNominatim(query: string, limit: number, timeoutMs: number): Promise<NamedLocation[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${limit}&addressdetails=1`;
  const res = await fetchWithTimeout(url, timeoutMs, {
    // Nominatim usage policy requires a meaningful User-Agent.
    'User-Agent': 'ThermalDecisionEngine/1.0 (hackathon demo)',
    'Accept-Language': 'en',
  });
  if (!res || !res.ok) return [];
  let data: NominatimResult[];
  try {
    data = (await res.json()) as NominatimResult[];
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const out: NamedLocation[] = [];
  for (const r of data) {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const a = r.address ?? {};
    const name = r.name || buildName({
      street: a.road,
      housenumber: a.house_number,
      city: a.city || a.town || a.village || a.municipality,
      county: a.county,
      state: a.state,
      country: a.country,
    });
    const city = a.city || a.town || a.village || a.municipality || a.county;
    const displayNameParts = r.display_name?.split(',').map((s) => s.trim()) ?? [];
    out.push({
      id: `GEO-${lat.toFixed(5)}-${lon.toFixed(5)}`,
      name,
      displayName: displayNameParts.slice(0, 4).join(', ') || [name, city, a.state, a.country].filter(Boolean).join(', '),
      category: 'Custom Location',
      latitude: lat,
      longitude: lon,
      city,
      state: a.state,
      country: a.country ?? (displayNameParts[displayNameParts.length - 1] || undefined),
      zipCode: a.postcode,
      timezone: lookupTimezone(lat, lon),
      isDemoOnly: false,
      resultType: classifyNominatim(r),
    });
  }
  return out;
}

/**
 * Real geocode search with graceful degradation:
 *   Photon → Nominatim → curated catalog (clearly-labelled fallback).
 * NEVER calls FortyGuard (search is credit-free by contract).
 */
export async function geocodeSearch(query: string, options: GeocodeOptions = {}): Promise<{
  results: NamedLocation[];
  source: 'photon' | 'nominatim' | 'catalog-fallback';
}> {
  const limit = Math.max(1, Math.min(options.limit ?? 6, 8));
  const timeoutMs = options.timeoutMs ?? 6000;
  const q = query.trim();
  if (!q) return { results: [], source: 'photon' };

  let results = await geocodePhoton(q, limit, timeoutMs);
  if (results.length > 0) return { results, source: 'photon' };

  results = await geocodeNominatim(q, limit, timeoutMs);
  if (results.length > 0) return { results, source: 'nominatim' };

  // Offline degradation: curated catalog only. Coordinates here are verified
  // catalog entries — not inventions. Marked source for UI transparency.
  return { results: searchLocations(q, limit), source: 'catalog-fallback' };
}

/**
 * Reverse geocode a latitude/longitude coordinate to a human-readable NamedLocation.
 * Uses Photon reverse -> Nominatim reverse -> offline catalog/coordinate resolution.
 */
export async function reverseGeocode(lat: number, lon: number, timeoutMs = 4000): Promise<NamedLocation> {
  // 1. Try Photon reverse
  try {
    const photonUrl = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lon}`;
    const res = await fetchWithTimeout(photonUrl, timeoutMs);
    if (res && res.ok) {
      const data = (await res.json()) as PhotonResponse;
      const f = data.features?.[0];
      if (f && f.properties) {
        const p = f.properties;
        const name = buildName({
          primary: p.name,
          street: p.street,
          housenumber: p.housenumber,
          city: p.city,
          county: p.county,
          state: p.state,
          country: p.country,
        });
        const city = p.city || p.county;
        const state = stateCode(p.state);
        return {
          id: `REV-${lat.toFixed(5)}-${lon.toFixed(5)}`,
          name,
          displayName: [name, city && city !== name ? city : null, state, p.country].filter(Boolean).join(', '),
          category: 'Custom Location',
          latitude: lat,
          longitude: lon,
          city,
          state,
          country: p.country,
          zipCode: p.postcode,
          timezone: lookupTimezone(lat, lon),
          isDemoOnly: false,
          resultType: classifyPhoton(p),
        };
      }
    }
  } catch {
    // Fall through to Nominatim
  }

  // 2. Try Nominatim reverse
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
    const res = await fetchWithTimeout(nomUrl, timeoutMs, {
      'User-Agent': 'ThermalDecisionEngine/1.0 (hackathon demo)',
      'Accept-Language': 'en',
    });
    if (res && res.ok) {
      const data = (await res.json()) as NominatimResult;
      if (data && (data.display_name || data.name || data.address)) {
        const a = data.address ?? {};
        const name = data.name || buildName({
          street: a.road,
          housenumber: a.house_number,
          city: a.city || a.town || a.village || a.municipality,
          county: a.county,
          state: a.state,
          country: a.country,
        });
        const city = a.city || a.town || a.village || a.municipality || a.county;
        const displayNameParts = data.display_name?.split(',').map((s) => s.trim()) ?? [];
        return {
          id: `REV-${lat.toFixed(5)}-${lon.toFixed(5)}`,
          name,
          displayName: displayNameParts.slice(0, 4).join(', ') || [name, city, a.state, a.country].filter(Boolean).join(', '),
          category: 'Custom Location',
          latitude: lat,
          longitude: lon,
          city,
          state: a.state,
          country: a.country ?? (displayNameParts[displayNameParts.length - 1] || undefined),
          zipCode: a.postcode,
          timezone: lookupTimezone(lat, lon),
          isDemoOnly: false,
          resultType: classifyNominatim(data),
        };
      }
    }
  } catch {
    // Fall through to local resolver
  }

  // 3. Fallback to local catalog and coordinate resolution
  const local = searchLocations('', 50);
  let bestDist = Infinity;
  let bestLoc: NamedLocation | null = null;
  for (const item of local) {
    const dLat = item.latitude - lat;
    const dLon = (item.longitude - lon) * Math.cos((lat * Math.PI) / 180);
    const dist = Math.sqrt(dLat * dLat + dLon * dLon);
    if (dist < bestDist) {
      bestDist = dist;
      bestLoc = item;
    }
  }

  // If within ~30km (~0.3 degrees), use nearest city context
  if (bestLoc && bestDist < 0.3) {
    return {
      id: `GEO-${lat.toFixed(5)}-${lon.toFixed(5)}`,
      name: `${bestLoc.city || bestLoc.name} Area (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
      displayName: `${bestLoc.city || bestLoc.name}, ${bestLoc.state || ''} (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`.trim(),
      category: 'Custom Location',
      latitude: lat,
      longitude: lon,
      city: bestLoc.city,
      state: bestLoc.state,
      country: bestLoc.country || 'USA',
      timezone: lookupTimezone(lat, lon),
      isDemoOnly: false,
      resultType: 'neighborhood',
    };
  }

  return {
    id: `GEO-${lat.toFixed(5)}-${lon.toFixed(5)}`,
    name: `Location (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
    displayName: `Custom Coordinates (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
    category: 'Custom Location',
    latitude: lat,
    longitude: lon,
    timezone: lookupTimezone(lat, lon),
    isDemoOnly: false,
    resultType: 'address',
  };
}

