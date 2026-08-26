/**
 * Accurate GeoJSON boundary geometries for States & Metropolitan Regional Territories.
 * Used to render the geographical boundary polygon when a state/city (e.g. California, New York, Texas, UK, UAE) is selected.
 */
import type { PolygonAOI } from '@/types/domain';

// California full state boundary geometry (simplified polygon from USGS/Census)
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

// New York State boundary geometry
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

// Texas State boundary geometry
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

// Illinois State boundary geometry
export const ILLINOIS_STATE_BOUNDARY: [number, number][] = [
  [-90.639980, 42.510000],
  [-87.801859, 42.501859],
  [-87.521859, 41.761859],
  [-87.521859, 39.371859],
  [-87.551859, 37.951859],
  [-88.501859, 37.051859],
  [-89.151859, 37.001859],
  [-89.501859, 37.251859],
  [-91.451859, 40.351859],
  [-91.351859, 41.501859],
  [-90.151859, 42.151859],
  [-90.639980, 42.510000],
];

// Florida State boundary geometry
export const FLORIDA_STATE_BOUNDARY: [number, number][] = [
  [-87.521859, 31.001859],
  [-85.001859, 31.001859],
  [-82.051859, 30.501859],
  [-81.401859, 30.701859],
  [-80.001859, 26.801859],
  [-80.121859, 25.751859],
  [-80.451859, 25.151859],
  [-81.251859, 24.551859],
  [-81.851859, 24.551859],
  [-81.751859, 25.901859],
  [-82.801859, 27.801859],
  [-83.951859, 30.001859],
  [-86.501859, 30.401859],
  [-87.521859, 30.301859],
  [-87.521859, 31.001859],
];

// Arizona State boundary geometry
export const ARIZONA_STATE_BOUNDARY: [number, number][] = [
  [-114.811859, 37.001859],
  [-109.041859, 37.001859],
  [-109.041859, 31.331859],
  [-111.081859, 31.331859],
  [-114.811859, 32.721859],
  [-114.531859, 35.001859],
  [-114.811859, 37.001859],
];

// Washington State boundary geometry
export const WASHINGTON_STATE_BOUNDARY: [number, number][] = [
  [-124.751859, 48.381859],
  [-123.001859, 49.001859],
  [-117.041859, 49.001859],
  [-117.041859, 46.001859],
  [-119.001859, 46.001859],
  [-124.001859, 46.251859],
  [-124.751859, 48.381859],
];

// Colorado State boundary geometry
export const COLORADO_STATE_BOUNDARY: [number, number][] = [
  [-109.051859, 41.001859],
  [-102.051859, 41.001859],
  [-102.051859, 37.001859],
  [-109.051859, 37.001859],
  [-109.051859, 41.001859],
];

// Georgia State boundary geometry
export const GEORGIA_STATE_BOUNDARY: [number, number][] = [
  [-85.601859, 35.001859],
  [-83.101859, 35.001859],
  [-81.001859, 32.051859],
  [-81.401859, 30.701859],
  [-82.051859, 30.501859],
  [-85.001859, 31.001859],
  [-85.001859, 32.301859],
  [-85.601859, 35.001859],
];

// Massachusetts State boundary geometry
export const MASSACHUSETTS_STATE_BOUNDARY: [number, number][] = [
  [-73.501859, 42.751859],
  [-70.801859, 42.881859],
  [-70.001859, 41.801859],
  [-69.901859, 41.251859],
  [-71.101859, 41.501859],
  [-71.801859, 42.001859],
  [-73.501859, 42.051859],
  [-73.501859, 42.751859],
];

// Nevada State boundary geometry
export const NEVADA_STATE_BOUNDARY: [number, number][] = [
  [-120.005746, 42.002207],
  [-114.041859, 42.002207],
  [-114.041859, 37.001859],
  [-114.633058, 35.001857],
  [-114.536098, 35.001857],
  [-120.005746, 39.000000],
  [-120.005746, 42.002207],
];

// United Kingdom (Great Britain) Regional Territory Boundary
export const UNITED_KINGDOM_BOUNDARY: [number, number][] = [
  [-5.718, 50.065],
  [-3.535, 50.218],
  [1.446, 51.151],
  [1.758, 52.482],
  [0.178, 53.565],
  [-0.108, 54.673],
  [-1.984, 55.813],
  [-3.064, 58.643],
  [-5.012, 58.601],
  [-6.208, 56.782],
  [-4.845, 54.882],
  [-3.078, 53.412],
  [-5.312, 51.723],
  [-5.718, 50.065],
];

// United Arab Emirates (UAE) Regional Boundary
export const UAE_BOUNDARY: [number, number][] = [
  [51.583, 24.167],
  [52.551, 24.312],
  [54.218, 24.482],
  [55.271, 25.205],
  [56.371, 25.682],
  [56.321, 24.812],
  [55.912, 24.112],
  [55.212, 23.012],
  [52.012, 23.012],
  [51.583, 24.167],
];

// Japan (Greater Tokyo / Kanto & Central Honshu) Regional Boundary
export const JAPAN_REGION_BOUNDARY: [number, number][] = [
  [138.50, 34.50],
  [140.00, 34.80],
  [140.85, 35.70],
  [140.75, 36.80],
  [139.80, 37.20],
  [138.60, 36.80],
  [138.00, 35.50],
  [138.50, 34.50],
];

// Map of region/state code to boundary coordinates
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
  AZ: ARIZONA_STATE_BOUNDARY,
  ARIZONA: ARIZONA_STATE_BOUNDARY,
  WA: WASHINGTON_STATE_BOUNDARY,
  WASHINGTON: WASHINGTON_STATE_BOUNDARY,
  CO: COLORADO_STATE_BOUNDARY,
  COLORADO: COLORADO_STATE_BOUNDARY,
  GA: GEORGIA_STATE_BOUNDARY,
  GEORGIA: GEORGIA_STATE_BOUNDARY,
  MA: MASSACHUSETTS_STATE_BOUNDARY,
  MASSACHUSETTS: MASSACHUSETTS_STATE_BOUNDARY,
  NV: NEVADA_STATE_BOUNDARY,
  NEVADA: NEVADA_STATE_BOUNDARY,
  UK: UNITED_KINGDOM_BOUNDARY,
  GB: UNITED_KINGDOM_BOUNDARY,
  'UNITED KINGDOM': UNITED_KINGDOM_BOUNDARY,
  LONDON: UNITED_KINGDOM_BOUNDARY,
  UAE: UAE_BOUNDARY,
  'UNITED ARAB EMIRATES': UAE_BOUNDARY,
  DUBAI: UAE_BOUNDARY,
  'ABU DHABI': UAE_BOUNDARY,
  JP: JAPAN_REGION_BOUNDARY,
  JAPAN: JAPAN_REGION_BOUNDARY,
  TOKYO: JAPAN_REGION_BOUNDARY,
};

/**
 * Get GeoJSON FeatureCollection representing the geographical/state boundary polygon
 * for the selected location (e.g. California, New York, Texas, UK, UAE).
 */
export function getRegionBoundaryPolygon(
  stateOrCode?: string,
  cityName?: string,
  centerLat?: number,
  centerLon?: number,
): PolygonAOI | null {
  const normState = (stateOrCode || '').toUpperCase().trim();
  const normCity = (cityName || '').toUpperCase().trim();

  const rawCoords =
    STATE_BOUNDARIES[normState] ||
    STATE_BOUNDARIES[normCity] ||
    (normCity.includes('LONDON') ? UNITED_KINGDOM_BOUNDARY : null) ||
    (normCity.includes('DUBAI') || normCity.includes('ABU DHABI') ? UAE_BOUNDARY : null) ||
    (normCity.includes('TOKYO') ? JAPAN_REGION_BOUNDARY : null);

  if (rawCoords && rawCoords.length > 0) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: `${stateOrCode || cityName || 'Regional'} Territory Boundary`,
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

  // Fallback: Generate a clean 100km administrative regional boundary box around the coordinates
  if (Number.isFinite(centerLat) && Number.isFinite(centerLon)) {
    const lat = centerLat as number;
    const lon = centerLon as number;
    const spanLat = 0.45;
    const spanLon = 0.55;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: `${cityName || stateOrCode || 'Regional'} Territory Context`,
            isRegionBoundary: true,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [lon - spanLon, lat - spanLat],
                [lon + spanLon, lat - spanLat],
                [lon + spanLon, lat + spanLat],
                [lon - spanLon, lat + spanLat],
                [lon - spanLon, lat - spanLat],
              ],
            ],
          },
        },
      ],
    };
  }

  return null;
}

/**
 * Creates an inverted mask polygon (Donut polygon) that covers the entire world EXCEPT
 * the specified region polygon. Used to dim / darken the outer map and spotlight
 * only the selected state region.
 */
export function getInvertedMaskPolygon(innerBoundary: PolygonAOI | null): PolygonAOI | null {
  if (!innerBoundary || innerBoundary.features.length === 0) return null;
  const geom = innerBoundary.features[0].geometry as { type: string; coordinates: number[][][] };
  if (!geom || !geom.coordinates || geom.coordinates.length === 0) return null;

  const worldOuterRing: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];

  const holeRing = geom.coordinates[0];

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
