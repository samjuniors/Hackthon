import type { NamedLocation } from '@/types/provider';
import { isPointInFixtureExtent } from '@/lib/fortyguard/fixture-display';

/**
 * Curated, verified database of major metropolitan areas and key operational hubs.
 * Provides deterministic coordinate resolution without flaky third-party rate limits.
 */
export const METROPOLITAN_LOCATIONS: NamedLocation[] = [
  // Manhattan Demo Sites (Pinned to fixture dataset)
  {
    id: 'DEMO-NYC-A',
    name: 'Battery Park Greenway (Waterfront)',
    displayName: 'Battery Park Greenway, Manhattan, NY (Demo Dataset)',
    category: 'Demo Site',
    latitude: 40.7120,
    longitude: -74.0080,
    city: 'New York',
    state: 'NY',
    country: 'USA',
    zipCode: '10004',
    timezone: 'America/New_York',
    isDemoOnly: true,
    description: 'Manhattan Waterfront fixture capture zone',
  },
  {
    id: 'DEMO-NYC-B',
    name: 'City Hall Civic Center (Mid-Density)',
    displayName: 'City Hall Civic Center, Manhattan, NY (Demo Dataset)',
    category: 'Demo Site',
    latitude: 40.7120,
    longitude: -73.9980,
    city: 'New York',
    state: 'NY',
    country: 'USA',
    zipCode: '10007',
    timezone: 'America/New_York',
    isDemoOnly: true,
    description: 'Manhattan Civic Center fixture capture zone',
  },
  {
    id: 'DEMO-NYC-C',
    name: 'Chinatown / Bowery Staging (Asphalt Canyon)',
    displayName: 'Chinatown / Bowery Staging, Manhattan, NY (Demo Dataset)',
    category: 'Demo Site',
    latitude: 40.7120,
    longitude: -73.9880,
    city: 'New York',
    state: 'NY',
    country: 'USA',
    zipCode: '10002',
    timezone: 'America/New_York',
    isDemoOnly: true,
    description: 'Manhattan Asphalt Canyon fixture capture zone',
  },

  // Major US Metropolitan Operational Centers
  {
    id: 'US-LAX',
    name: 'Los Angeles, CA',
    displayName: 'Los Angeles, CA (Downtown / Civic Center)',
    category: 'Metropolitan Area',
    latitude: 34.0522,
    longitude: -118.2437,
    city: 'Los Angeles',
    state: 'CA',
    country: 'USA',
    zipCode: '90012',
    timezone: 'America/Los_Angeles',
    isDemoOnly: false,
    description: 'Downtown Los Angeles urban core',
  },
  {
    id: 'US-SFO',
    name: 'San Francisco, CA',
    displayName: 'San Francisco, CA (Financial District / Embarcadero)',
    category: 'Metropolitan Area',
    latitude: 37.7749,
    longitude: -122.4194,
    city: 'San Francisco',
    state: 'CA',
    country: 'USA',
    zipCode: '94103',
    timezone: 'America/Los_Angeles',
    isDemoOnly: false,
    description: 'San Francisco urban peninsula microclimate',
  },
  {
    id: 'US-NYC',
    name: 'New York, NY',
    displayName: 'New York, NY (Midtown Manhattan)',
    category: 'Metropolitan Area',
    latitude: 40.7580,
    longitude: -73.9855,
    city: 'New York',
    state: 'NY',
    country: 'USA',
    zipCode: '10036',
    timezone: 'America/New_York',
    isDemoOnly: false,
    description: 'Midtown Manhattan urban thermal hub',
  },
  {
    id: 'US-CHI',
    name: 'Chicago, IL',
    displayName: 'Chicago, IL (The Loop)',
    category: 'Metropolitan Area',
    latitude: 41.8781,
    longitude: -87.6298,
    city: 'Chicago',
    state: 'IL',
    country: 'USA',
    zipCode: '60604',
    timezone: 'America/Chicago',
    isDemoOnly: false,
    description: 'Chicago central business district',
  },
  {
    id: 'US-AUS',
    name: 'Austin, TX',
    displayName: 'Austin, TX (Downtown / Congress Ave)',
    category: 'Metropolitan Area',
    latitude: 30.2672,
    longitude: -97.7431,
    city: 'Austin',
    state: 'TX',
    country: 'USA',
    zipCode: '78701',
    timezone: 'America/Chicago',
    isDemoOnly: false,
    description: 'Austin downtown heat corridor',
  },
  {
    id: 'US-MIA',
    name: 'Miami, FL',
    displayName: 'Miami, FL (Brickell / Downtown)',
    category: 'Metropolitan Area',
    latitude: 25.7617,
    longitude: -80.1918,
    city: 'Miami',
    state: 'FL',
    country: 'USA',
    zipCode: '33131',
    timezone: 'America/New_York',
    isDemoOnly: false,
    description: 'Miami coastal subtropical urban core',
  },
  {
    id: 'US-HOU',
    name: 'Houston, TX',
    displayName: 'Houston, TX (Downtown)',
    category: 'Metropolitan Area',
    latitude: 29.7604,
    longitude: -95.3698,
    city: 'Houston',
    state: 'TX',
    country: 'USA',
    zipCode: '77002',
    timezone: 'America/Chicago',
    isDemoOnly: false,
    description: 'Houston downtown commercial corridor',
  },
  {
    id: 'US-PHX',
    name: 'Phoenix, AZ',
    displayName: 'Phoenix, AZ (Downtown / Urban Heat Island)',
    category: 'Metropolitan Area',
    latitude: 33.4484,
    longitude: -112.0740,
    city: 'Phoenix',
    state: 'AZ',
    country: 'USA',
    zipCode: '85003',
    timezone: 'America/Phoenix',
    isDemoOnly: false,
    description: 'Desert urban heat island microclimate',
  },
  {
    id: 'US-SAN',
    name: 'San Diego, CA',
    displayName: 'San Diego, CA (Downtown / Embarcadero)',
    category: 'Metropolitan Area',
    latitude: 32.7157,
    longitude: -117.1611,
    city: 'San Diego',
    state: 'CA',
    country: 'USA',
    zipCode: '92101',
    timezone: 'America/Los_Angeles',
    isDemoOnly: false,
    description: 'Coastal urban transition zone',
  },
  {
    id: 'US-DAL',
    name: 'Dallas, TX',
    displayName: 'Dallas, TX (Main Street District)',
    category: 'Metropolitan Area',
    latitude: 32.7767,
    longitude: -96.7970,
    city: 'Dallas',
    state: 'TX',
    country: 'USA',
    zipCode: '75201',
    timezone: 'America/Chicago',
    isDemoOnly: false,
    description: 'North Texas urban center',
  },
  {
    id: 'US-SEA',
    name: 'Seattle, WA',
    displayName: 'Seattle, WA (Pioneer Square / Downtown)',
    category: 'Metropolitan Area',
    latitude: 47.6062,
    longitude: -122.3321,
    city: 'Seattle',
    state: 'WA',
    country: 'USA',
    zipCode: '98104',
    timezone: 'America/Los_Angeles',
    isDemoOnly: false,
    description: 'Pacific Northwest maritime corridor',
  },
  {
    id: 'US-DEN',
    name: 'Denver, CO',
    displayName: 'Denver, CO (Downtown / LoDo)',
    category: 'Metropolitan Area',
    latitude: 39.7392,
    longitude: -104.9903,
    city: 'Denver',
    state: 'CO',
    country: 'USA',
    zipCode: '80202',
    timezone: 'America/Denver',
    isDemoOnly: false,
    description: 'High-altitude inland urban core',
  },
  {
    id: 'US-ATL',
    name: 'Atlanta, GA',
    displayName: 'Atlanta, GA (Midtown / Downtown)',
    category: 'Metropolitan Area',
    latitude: 33.7490,
    longitude: -84.3880,
    city: 'Atlanta',
    state: 'GA',
    country: 'USA',
    zipCode: '30303',
    timezone: 'America/New_York',
    isDemoOnly: false,
    description: 'Southeast urban heat island canopy',
  },
  {
    id: 'US-BOS',
    name: 'Boston, MA',
    displayName: 'Boston, MA (Financial District)',
    category: 'Metropolitan Area',
    latitude: 42.3601,
    longitude: -71.0589,
    city: 'Boston',
    state: 'MA',
    country: 'USA',
    zipCode: '02109',
    timezone: 'America/New_York',
    isDemoOnly: false,
    description: 'New England coastal urban center',
  },
  {
    id: 'US-WAS',
    name: 'Washington, DC',
    displayName: 'Washington, DC (National Mall / Federal Triangle)',
    category: 'Metropolitan Area',
    latitude: 38.9072,
    longitude: -77.0369,
    city: 'Washington',
    state: 'DC',
    country: 'USA',
    zipCode: '20004',
    timezone: 'America/New_York',
    isDemoOnly: false,
    description: 'Mid-Atlantic federal and commercial core',
  },
  {
    id: 'US-LAS',
    name: 'Las Vegas, NV',
    displayName: 'Las Vegas, NV (The Strip / Urban Core)',
    category: 'Metropolitan Area',
    latitude: 36.1699,
    longitude: -115.1398,
    city: 'Las Vegas',
    state: 'NV',
    country: 'USA',
    zipCode: '89101',
    timezone: 'America/Los_Angeles',
    isDemoOnly: false,
    description: 'High-desert thermal extreme corridor',
  },

];

const US_STATE_NAMES: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

/**
 * Search locations by query string (city, state, ZIP, name, or country).
 */
export function searchLocations(query: string, maxResults = 8): NamedLocation[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return METROPOLITAN_LOCATIONS.slice(0, maxResults);
  }

  // Exact ZIP search
  const zipMatch = METROPOLITAN_LOCATIONS.filter(
    (loc) => loc.zipCode && loc.zipCode.toLowerCase().startsWith(q)
  );
  if (zipMatch.length > 0 && /^\d+$/.test(q)) {
    return zipMatch.slice(0, maxResults);
  }

  // Multi-term substring and keyword matching
  const matched = METROPOLITAN_LOCATIONS.filter((loc) => {
    const stateFullName = loc.state ? US_STATE_NAMES[loc.state.toUpperCase()] || '' : '';
    const haystack = [
      loc.name,
      loc.displayName,
      loc.city || '',
      loc.state || '',
      stateFullName,
      loc.country || '',
      loc.zipCode || '',
      loc.description || '',
    ].join(' ').toLowerCase();

    const terms = q.split(/\s+/);
    return terms.every((t) => haystack.includes(t));
  });

  return matched.slice(0, maxResults);
}

/**
 * Returns preset location options for quick selection in the UI.
 */
export function getPresetLocations(isFixtureMode?: boolean): NamedLocation[] {
  if (isFixtureMode) {
    return METROPOLITAN_LOCATIONS.filter((l) => l.isDemoOnly);
  }
  return METROPOLITAN_LOCATIONS.filter((l) => !l.isDemoOnly);
}

/**
 * Verifies whether a given coordinate point lies inside the geographic extent
 * of the REAL captured DEMO thermal field (Lower Manhattan — the bounding box
 * of the captured FortyGuard cells). FIXTURE mode can only analyse inside
 * this extent; anything outside is honestly rejected as OUTSIDE_COVERAGE.
 */
export function isLocationCoveredByFixture(loc: { latitude: number; longitude: number }): boolean {
  return isPointInFixtureExtent(loc.latitude, loc.longitude);
}

/**
 * Resolves a point into the closest named location or formats a custom location.
 */
export function resolveLocationPoint(
  lat: number,
  lon: number,
  customName?: string
): NamedLocation {
  // Check if exactly matching one of our predefined locations (within ~100m)
  for (const loc of METROPOLITAN_LOCATIONS) {
    const dLat = Math.abs(loc.latitude - lat);
    const dLon = Math.abs(loc.longitude - lon);
    if (dLat < 0.001 && dLon < 0.001) {
      return loc;
    }
  }

  // Otherwise create a cleanly formatted custom/GPS location
  return {
    id: `CUSTOM-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    name: customName || `Location (${lat.toFixed(4)}, ${lon.toFixed(4)})`,
    displayName: customName || `Custom Coordinates (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
    category: 'Custom Location',
    latitude: lat,
    longitude: lon,
    isDemoOnly: false,
  };
}

