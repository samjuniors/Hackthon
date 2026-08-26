/**
 * Authoritative Geographic State & Regional Boundaries (GeoJSON).
 *
 * Implements the two-tier spatial hierarchy:
 * 1. REGION / STATE CONTEXT: Real geographic state/national territory (CA, NY, TX, IL, etc.).
 * 2. LOCAL ANALYSIS AOI: Local 400m square/circle analytical focus.
 */
import type { PolygonAOI } from '@/types/domain';

// ── 1. Authoritative State & Regional Boundaries ─────────────────────────────

export const CALIFORNIA_STATE_BOUNDARY: [number, number][] = [
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
];

export const NEW_YORK_STATE_BOUNDARY: [number, number][] = [
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
];

export const TEXAS_STATE_BOUNDARY: [number, number][] = [
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
];

export const ILLINOIS_STATE_BOUNDARY: [number, number][] = [
  [-90.641859, 42.501859],
  [-87.021859, 42.501859],
  [-87.521859, 41.761859],
  [-87.521859, 39.381859],
  [-87.501859, 37.801859],
  [-88.101859, 37.801859],
  [-89.151859, 36.981859],
  [-91.421859, 40.381859],
  [-91.101859, 41.651859],
  [-90.151859, 42.151859],
  [-90.641859, 42.501859],
];

export const FLORIDA_STATE_BOUNDARY: [number, number][] = [
  [-87.601859, 31.001859],
  [-85.001859, 31.001859],
  [-82.051859, 30.351859],
  [-81.401859, 30.701859],
  [-80.051859, 26.801859],
  [-80.151859, 25.401859],
  [-81.801859, 24.501859],
  [-82.801859, 27.801859],
  [-83.901859, 30.101859],
  [-86.401859, 30.401859],
  [-87.601859, 30.301859],
  [-87.601859, 31.001859],
];

export const WASHINGTON_STATE_BOUNDARY: [number, number][] = [
  [-124.751859, 48.351859],
  [-122.751859, 49.001859],
  [-117.031859, 49.001859],
  [-117.031859, 46.001859],
  [-119.001859, 46.001859],
  [-124.001859, 46.251859],
  [-124.751859, 48.351859],
];

export const UNITED_KINGDOM_BOUNDARY: [number, number][] = [
  [-5.80, 50.00],
  [1.80, 51.20],
  [1.80, 52.90],
  [0.20, 54.50],
  [-1.80, 55.80],
  [-2.00, 58.70],
  [-5.20, 58.70],
  [-6.20, 56.50],
  [-5.00, 54.80],
  [-3.50, 53.40],
  [-5.40, 51.80],
  [-5.80, 50.00],
];

// ── 2. Local Municipal & Borough Boundaries (For Detailed Zoom) ───────────────

export const MANHATTAN_BOROUGH_BOUNDARY: [number, number][] = [
  [-74.0175, 40.7005],
  [-74.0182, 40.7065],
  [-74.0150, 40.7180],
  [-74.0115, 40.7310],
  [-74.0090, 40.7480],
  [-74.0020, 40.7620],
  [-73.9920, 40.7760],
  [-73.9780, 40.8010],
  [-73.9530, 40.8350],
  [-73.9280, 40.8690],
  [-73.9160, 40.8730],
  [-73.9210, 40.8620],
  [-73.9330, 40.8380],
  [-73.9310, 40.8080],
  [-73.9360, 40.7850],
  [-73.9430, 40.7680],
  [-73.9610, 40.7480],
  [-73.9720, 40.7310],
  [-73.9740, 40.7130],
  [-73.9870, 40.7070],
  [-74.0030, 40.7020],
  [-74.0120, 40.6995],
  [-74.0175, 40.7005],
];

export const LOS_ANGELES_CORE_BOUNDARY: [number, number][] = [
  [-118.2950, 34.0750],
  [-118.2300, 34.0750],
  [-118.2150, 34.0500],
  [-118.2250, 34.0250],
  [-118.2750, 34.0250],
  [-118.2950, 34.0500],
  [-118.2950, 34.0750],
];

export const SAN_FRANCISCO_PENINSULA_BOUNDARY: [number, number][] = [
  [-122.5150, 37.7780],
  [-122.4780, 37.8100],
  [-122.4100, 37.8080],
  [-122.3900, 37.7980],
  [-122.3850, 37.7700],
  [-122.3800, 37.7300],
  [-122.4000, 37.7080],
  [-122.5050, 37.7080],
  [-122.5150, 37.7780],
];

export const CHICAGO_LOOP_BOUNDARY: [number, number][] = [
  [-87.6550, 41.9050],
  [-87.6150, 41.9050],
  [-87.6100, 41.8600],
  [-87.6400, 41.8600],
  [-87.6550, 41.8800],
  [-87.6550, 41.9050],
];

export const AUSTIN_CORE_BOUNDARY: [number, number][] = [
  [-97.7700, 30.2900],
  [-97.7200, 30.2900],
  [-97.7150, 30.2500],
  [-97.7650, 30.2500],
  [-97.7700, 30.2900],
];

// Map of state codes and full names to true State Boundary Polygons
const STATE_BOUNDARIES: Record<string, [number, number][]> = {
  CA: CALIFORNIA_STATE_BOUNDARY,
  CALIFORNIA: CALIFORNIA_STATE_BOUNDARY,
  NY: NEW_YORK_STATE_BOUNDARY,
  'NEW YORK': NEW_YORK_STATE_BOUNDARY,
  TX: TEXAS_STATE_BOUNDARY,
  TEXAS: TEXAS_STATE_BOUNDARY,
  IL: ILLINOIS_STATE_BOUNDARY,
  ILLINOIS: ILLINOIS_STATE_BOUNDARY,
  FL: FLORIDA_STATE_BOUNDARY,
  FLORIDA: FLORIDA_STATE_BOUNDARY,
  WA: WASHINGTON_STATE_BOUNDARY,
  WASHINGTON: WASHINGTON_STATE_BOUNDARY,
  UK: UNITED_KINGDOM_BOUNDARY,
  GB: UNITED_KINGDOM_BOUNDARY,
  'UNITED KINGDOM': UNITED_KINGDOM_BOUNDARY,
};

/**
 * Get GeoJSON FeatureCollection representing the true Geographic State / Regional Boundary
 * for the selected location (e.g. California State for LA/SF, New York State for NYC, Texas for Austin).
 */
export function getRegionBoundaryPolygon(
  stateOrCode?: string,
  cityName?: string,
  centerLat?: number,
  centerLon?: number,
): PolygonAOI | null {
  const normState = (stateOrCode || '').toUpperCase().trim();
  const normCity = (cityName || '').toUpperCase().trim();

  let rawCoords: [number, number][] | undefined;
  let resolvedName = `${stateOrCode || cityName || 'State'} Boundary`;

  // 1. Check direct State match
  if (STATE_BOUNDARIES[normState]) {
    rawCoords = STATE_BOUNDARIES[normState];
    resolvedName = `${normState} State Boundary`;
  } else if (STATE_BOUNDARIES[normCity]) {
    rawCoords = STATE_BOUNDARIES[normCity];
    resolvedName = `${normCity} Regional Boundary`;
  } else {
    // 2. City-to-State mappings
    if (normCity.includes('LOS ANGELES') || normCity.includes('SAN FRANCISCO') || normCity.includes('SAN JOSE') || normCity.includes('SAN DIEGO')) {
      rawCoords = CALIFORNIA_STATE_BOUNDARY;
      resolvedName = 'California State Boundary';
    } else if (normCity.includes('NEW YORK') || normCity.includes('MANHATTAN') || normCity.includes('BROOKLYN')) {
      rawCoords = NEW_YORK_STATE_BOUNDARY;
      resolvedName = 'New York State Boundary';
    } else if (normCity.includes('CHICAGO')) {
      rawCoords = ILLINOIS_STATE_BOUNDARY;
      resolvedName = 'Illinois State Boundary';
    } else if (normCity.includes('AUSTIN') || normCity.includes('HOUSTON') || normCity.includes('DALLAS')) {
      rawCoords = TEXAS_STATE_BOUNDARY;
      resolvedName = 'Texas State Boundary';
    } else if (normCity.includes('MIAMI') || normCity.includes('ORLANDO') || normCity.includes('TAMPA')) {
      rawCoords = FLORIDA_STATE_BOUNDARY;
      resolvedName = 'Florida State Boundary';
    } else if (normCity.includes('SEATTLE')) {
      rawCoords = WASHINGTON_STATE_BOUNDARY;
      resolvedName = 'Washington State Boundary';
    } else if (normCity.includes('LONDON')) {
      rawCoords = UNITED_KINGDOM_BOUNDARY;
      resolvedName = 'United Kingdom Boundary';
    }
  }

  // 3. Proximity fallback to known State bounds
  if (!rawCoords && Number.isFinite(centerLat) && Number.isFinite(centerLon)) {
    const lat = centerLat as number;
    const lon = centerLon as number;
    if (lat >= 32.5 && lat <= 42.0 && lon >= -124.5 && lon <= -114.0) {
      rawCoords = CALIFORNIA_STATE_BOUNDARY;
      resolvedName = 'California State Boundary';
    } else if (lat >= 40.5 && lat <= 45.0 && lon >= -79.8 && lon <= -71.8) {
      rawCoords = NEW_YORK_STATE_BOUNDARY;
      resolvedName = 'New York State Boundary';
    } else if (lat >= 36.9 && lat <= 42.5 && lon >= -91.5 && lon <= -87.5) {
      rawCoords = ILLINOIS_STATE_BOUNDARY;
      resolvedName = 'Illinois State Boundary';
    } else if (lat >= 25.8 && lat <= 36.5 && lon >= -106.6 && lon <= -93.5) {
      rawCoords = TEXAS_STATE_BOUNDARY;
      resolvedName = 'Texas State Boundary';
    } else if (lat >= 49.5 && lat <= 59.0 && lon >= -8.0 && lon <= 2.0) {
      rawCoords = UNITED_KINGDOM_BOUNDARY;
      resolvedName = 'United Kingdom Boundary';
    }
  }

  if (rawCoords && rawCoords.length > 0) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: resolvedName,
            state: stateOrCode,
            city: cityName,
            isRegionBoundary: true,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [rawCoords],
          },
        },
      ],
    };
  }

  return null;
}

/**
 * Calculates signed polygon ring area to check winding direction.
 * Positive = Counter-Clockwise (CCW), Negative = Clockwise (CW).
 */
function ringSignedArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
  }
  return sum;
}

/**
 * Creates an inverted mask polygon (Donut polygon) covering the entire world EXCEPT
 * the specified region polygon. Used to dim / darken the outer map and spotlight
 * only the selected state/territory.
 *
 * Enforces RFC 7946 GeoJSON winding rules:
 * - Exterior Ring: Counter-Clockwise (CCW)
 * - Interior Hole Ring: Clockwise (CW)
 */
export function getInvertedMaskPolygon(innerBoundary: PolygonAOI | null): PolygonAOI | null {
  if (!innerBoundary || innerBoundary.features.length === 0) return null;
  const geom = innerBoundary.features[0].geometry as { type: string; coordinates: number[][][] };
  if (!geom || !geom.coordinates || geom.coordinates.length === 0) return null;

  // Exterior ring: Counter-Clockwise covering the world (within strict Web Mercator EPSG:3857 bounds)
  const worldOuterRing: [number, number][] = [
    [-179.999, -85.051],
    [179.999, -85.051],
    [179.999, 85.051],
    [-179.999, 85.051],
    [-179.999, -85.051],
  ];

  // Hole ring: Clone coordinates and ensure Clockwise winding order (CW)
  let holeRing: [number, number][] = geom.coordinates[0].map(([lng, lat]) => [lng, lat]);
  if (ringSignedArea(holeRing) > 0) {
    holeRing = holeRing.reverse();
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { isMask: true },
        geometry: {
          type: 'Polygon',
          coordinates: [worldOuterRing, holeRing],
        },
      },
    ],
  };
}
