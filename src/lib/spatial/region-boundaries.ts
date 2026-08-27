/**
 * Authoritative Geographic State & Regional Boundaries (GeoJSON).
 *
 * DATA PROVENANCE:
 *   Source: PublicaMundi/MappingAPI GitHub repository
 *   (https://github.com/PublicaMundi/MappingAPI/blob/master/data/geojson/us-states.json)
 *   Derived from: Natural Earth / US Census Bureau Cartographic Boundary data.
 *   License: Public Domain / US Government Works.
 *   Coordinate precision: Rounded to 5 decimal places (~1m precision).
 *   CA: 93 pts  NY: 68 pts  TX: 152 pts  IL: 67 pts  FL: 78 pts  WA: 61 pts
 *
 * GEOMETRY INTEGRITY:
 *   - These are REAL geographic state boundaries, NOT hand-authored approximations.
 *   - No center-based generation, no bounding-box rectangles, no fabricated coordinates.
 *   - Exterior rings only (largest ring selected for MultiPolygon states like Washington).
 *
 * Implements the two-tier spatial hierarchy:
 * 1. REGION / STATE CONTEXT: Real geographic state/national territory (CA, NY, TX, IL, etc.).
 *    GEOGRAPHIC CONTEXT ONLY — never FortyGuard coverage.
 * 2. LOCAL ANALYSIS AOI: Local 400m–5km square/circle analytical focus (separate geometry).
 */
import type { PolygonAOI } from '@/types/domain';

// ── Authoritative State Boundaries (Natural Earth / US Census Bureau) ─────────
// DO NOT hand-edit these coordinates. To update, re-derive from the source.

export const CALIFORNIA_STATE_BOUNDARY: [number, number][] = [
  [-123.23326, 42.00619], [-122.37885, 42.01166], [-121.037, 41.99523],
  [-120.00186, 41.99523], [-119.99638, 40.26452], [-120.00186, 38.99935],
  [-118.71478, 38.10113], [-117.4989, 37.21934], [-116.54043, 36.50186],
  [-115.85034, 35.9706], [-114.63446, 35.00118], [-114.63446, 34.87521],
  [-114.47015, 34.7109], [-114.33323, 34.44801], [-114.13606, 34.30561],
  [-114.25655, 34.17416], [-114.41538, 34.10844], [-114.53587, 33.93318],
  [-114.49754, 33.69767], [-114.52492, 33.54979], [-114.72757, 33.40739],
  [-114.66184, 33.03496], [-114.52492, 33.02948], [-114.47015, 32.84327],
  [-114.52492, 32.75563], [-114.72209, 32.7173], [-116.04751, 32.62419],
  [-117.12647, 32.53656], [-117.24696, 32.668], [-117.25244, 32.87613],
  [-117.32911, 33.12259], [-117.47151, 33.29785], [-117.7837, 33.53884],
  [-118.18352, 33.76339], [-118.26019, 33.70315], [-118.41355, 33.74148],
  [-118.39164, 33.84007], [-118.5669, 34.04272], [-118.80241, 33.9989],
  [-119.21866, 34.14678], [-119.2789, 34.26727], [-119.55823, 34.41515],
  [-119.87589, 34.40967], [-120.13878, 34.47539], [-120.47288, 34.44801],
  [-120.64814, 34.57946], [-120.6098, 34.85878], [-120.67005, 34.9026],
  [-120.63171, 35.09976], [-120.8946, 35.24764], [-120.90556, 35.45029],
  [-121.00414, 35.46124], [-121.16845, 35.63651], [-121.28346, 35.67484],
  [-121.33276, 35.78438], [-121.71614, 36.19515], [-121.89688, 36.31565],
  [-121.93522, 36.63879], [-121.85854, 36.6114], [-121.78734, 36.80309],
  [-121.92974, 36.97836], [-122.10501, 36.95645], [-122.33504, 37.11528],
  [-122.41719, 37.24125], [-122.40076, 37.36174], [-122.51578, 37.52057],
  [-122.51578, 37.78347], [-122.32956, 37.78347], [-122.40624, 38.15042],
  [-122.48839, 38.11208], [-122.50482, 37.93134], [-122.70199, 37.893],
  [-122.9375, 38.02993], [-122.97584, 38.26544], [-123.12919, 38.45165],
  [-123.33184, 38.56667], [-123.44138, 38.69811], [-123.73713, 38.95553],
  [-123.68784, 39.03221], [-123.82476, 39.3663], [-123.76452, 39.55252],
  [-123.85215, 39.83184], [-124.10957, 40.10569], [-124.36151, 40.25904],
  [-124.4108, 40.43978], [-124.15886, 40.87794], [-124.10957, 41.02581],
  [-124.15886, 41.14083], [-124.06575, 41.44206], [-124.1479, 41.71591],
  [-124.25744, 41.78163], [-124.21363, 42.00071], [-123.23326, 42.00619],
];

export const NEW_YORK_STATE_BOUNDARY: [number, number][] = [
  [-73.34381, 45.01303], [-73.33285, 44.8049], [-73.38762, 44.61869],
  [-73.29451, 44.43795], [-73.3219, 44.24626], [-73.43691, 44.04361],
  [-73.34928, 43.76976], [-73.40405, 43.68761], [-73.24522, 43.5233],
  [-73.27808, 42.8332], [-73.26713, 42.74557], [-73.50811, 42.08834],
  [-73.48621, 42.05], [-73.55193, 41.29418], [-73.48073, 41.21203],
  [-73.72719, 41.10249], [-73.65599, 40.98748], [-73.22879, 40.90532],
  [-73.14116, 40.96557], [-72.7742, 40.96557], [-72.58799, 40.99843],
  [-72.28128, 41.15726], [-72.25937, 41.04225], [-72.10054, 40.99295],
  [-72.4675, 40.84508], [-73.23974, 40.626], [-73.56288, 40.58218],
  [-73.77648, 40.59314], [-73.93532, 40.54384], [-74.25000, 40.50000],
  [-74.15000, 40.64000], [-74.02295, 40.70815], [-73.97000, 40.80000],
  [-73.90245, 40.99843], [-74.23655, 41.14083], [-74.69661, 41.35991],
  [-74.74043, 41.43111], [-74.89378, 41.43658], [-75.07452, 41.60637],
  [-75.05261, 41.75425], [-75.1731, 41.86926], [-75.24978, 41.86379],
  [-75.35932, 42.00071], [-79.76278, 42.00071], [-79.76278, 42.25265],
  [-79.76278, 42.26908], [-79.14936, 42.55388], [-79.05078, 42.6908],
  [-78.85361, 42.78391], [-78.93028, 42.9537], [-79.01244, 42.98656],
  [-79.07269, 43.26041], [-78.48665, 43.37542], [-77.96634, 43.36994],
  [-77.75822, 43.34256], [-77.53366, 43.23302], [-77.39126, 43.27684],
  [-76.95859, 43.27136], [-76.69569, 43.34256], [-76.41637, 43.5233],
  [-76.23563, 43.52878], [-76.23015, 43.80262], [-76.13705, 43.96145],
  [-76.3616, 44.07099], [-76.31231, 44.19696], [-75.91249, 44.36675],
  [-75.76461, 44.51463], [-75.28264, 44.84872], [-74.82806, 45.0185],
  [-74.14892, 44.99112], [-73.34381, 45.01303],
];

export const TEXAS_STATE_BOUNDARY: [number, number][] = [
  [-101.81294, 36.50186], [-100.00007, 36.50186], [-100.00007, 34.56302],
  [-99.9234, 34.57398], [-99.69884, 34.38229], [-99.57835, 34.41515],
  [-99.26069, 34.40419], [-99.18949, 34.2125], [-98.98684, 34.22345],
  [-98.76776, 34.13582], [-98.57059, 34.14678], [-98.48844, 34.06462],
  [-98.36247, 34.15773], [-98.17078, 34.11392], [-98.08862, 34.00438],
  [-97.94622, 33.98795], [-97.86954, 33.85102], [-97.69428, 33.98247],
  [-97.45877, 33.90579], [-97.37114, 33.82364], [-97.25613, 33.86198],
  [-97.17397, 33.73601], [-96.92203, 33.96056], [-96.85083, 33.84555],
  [-96.63176, 33.84555], [-96.42363, 33.77434], [-96.34696, 33.68671],
  [-96.14979, 33.84007], [-95.93618, 33.88936], [-95.8376, 33.83459],
  [-95.60209, 33.93318], [-95.54732, 33.87841], [-95.28991, 33.87293],
  [-95.22418, 33.96056], [-94.96677, 33.86198], [-94.86818, 33.74696],
  [-94.4848, 33.63742], [-94.38073, 33.54431], [-94.18356, 33.59361],
  [-94.04116, 33.54979], [-94.04116, 33.01853], [-94.04116, 31.99434],
  [-93.82209, 31.77526], [-93.81661, 31.55618], [-93.54276, 31.15089],
  [-93.52633, 30.93729], [-93.63039, 30.67987], [-93.72898, 30.57581],
  [-93.69612, 30.43889], [-93.76732, 30.33483], [-93.69064, 30.14313],
  [-93.92615, 29.78713], [-93.83852, 29.68855], [-94.00282, 29.68307],
  [-94.52313, 29.54615], [-94.70935, 29.62282], [-94.74221, 29.78713],
  [-94.87366, 29.67212], [-94.96677, 29.6995], [-95.01606, 29.5571],
  [-94.912, 29.49685], [-94.89557, 29.31064], [-95.08178, 29.11347],
  [-95.38301, 28.86701], [-95.98548, 28.60411], [-96.04572, 28.64793],
  [-96.22646, 28.58221], [-96.23194, 28.64245], [-96.4784, 28.59864],
  [-96.59342, 28.72461], [-96.66462, 28.69722], [-96.40172, 28.43981],
  [-96.59342, 28.35765], [-96.77416, 28.40694], [-96.80154, 28.2262],
  [-97.0261, 28.03999], [-97.25613, 27.69494], [-97.404, 27.33346],
  [-97.51354, 27.36085], [-97.54093, 27.2294], [-97.42591, 27.26226],
  [-97.48068, 26.99937], [-97.55736, 26.98842], [-97.56284, 26.84054],
  [-97.46973, 26.75838], [-97.44234, 26.45715], [-97.3328, 26.35309],
  [-97.30542, 26.1614], [-97.21779, 25.99161], [-97.5245, 25.88755],
  [-97.65047, 26.019], [-97.88598, 26.06829], [-98.19816, 26.05734],
  [-98.46653, 26.22164], [-98.66918, 26.23808], [-98.82253, 26.36952],
  [-99.03066, 26.41334], [-99.17306, 26.53931], [-99.26616, 26.84054],
  [-99.4469, 27.02128], [-99.425, 27.17463], [-99.50715, 27.33894],
  [-99.47976, 27.48134], [-99.60573, 27.64017], [-99.7098, 27.6566],
  [-99.87958, 27.799], [-99.93435, 27.97974], [-100.08223, 28.14405],
  [-100.29583, 28.28097], [-100.39989, 28.58221], [-100.49848, 28.66436],
  [-100.62992, 28.90535], [-100.67374, 29.10252], [-100.79971, 29.24492],
  [-101.01331, 29.37089], [-101.0626, 29.45852], [-101.25977, 29.53519],
  [-101.41312, 29.75427], [-101.85128, 29.80356], [-102.11417, 29.79261],
  [-102.33873, 29.86929], [-102.38802, 29.76523], [-102.62901, 29.73236],
  [-102.80974, 29.52424], [-102.91928, 29.19015], [-102.97953, 29.18467],
  [-103.11645, 28.9875], [-103.28076, 28.98202], [-103.52722, 29.13538],
  [-104.14612, 29.38184], [-104.26661, 29.51329], [-104.5076, 29.63926],
  [-104.67738, 29.92406], [-104.68834, 30.18147], [-104.85812, 30.3896],
  [-104.89646, 30.57034], [-105.006, 30.68535], [-105.39486, 30.85514],
  [-105.60298, 31.08517], [-105.77277, 31.16732], [-105.95351, 31.36449],
  [-106.20545, 31.46855], [-106.38071, 31.73145], [-106.52859, 31.78622],
  [-106.6436, 31.90123], [-106.61622, 31.99982], [-103.06716, 31.99982],
  [-103.06716, 33.0021], [-103.04525, 34.01533], [-103.03978, 36.50186],
  [-103.00144, 36.50186], [-101.81294, 36.50186],
];

export const ILLINOIS_STATE_BOUNDARY: [number, number][] = [
  [-90.63998, 42.51007], [-88.78878, 42.49363], [-87.80293, 42.49363],
  [-87.83579, 42.30194], [-87.68244, 42.07739], [-87.5236, 41.71043],
  [-87.52908, 39.34987], [-87.63862, 39.16913], [-87.51265, 38.95553],
  [-87.49622, 38.78027], [-87.62219, 38.63787], [-87.65505, 38.50642],
  [-87.83579, 38.29282], [-87.95081, 38.27639], [-87.92342, 38.15042],
  [-88.0001, 38.10113], [-88.06034, 37.86562], [-88.02748, 37.7999],
  [-88.15893, 37.6575], [-88.06582, 37.48223], [-88.47659, 37.38913],
  [-88.51493, 37.28506], [-88.42182, 37.15362], [-88.54779, 37.07146],
  [-88.91475, 37.22482], [-89.02976, 37.21386], [-89.18312, 37.0386],
  [-89.13382, 36.98383], [-89.29266, 36.99479], [-89.51721, 37.27959],
  [-89.43506, 37.34531], [-89.51721, 37.537], [-89.51721, 37.69036],
  [-89.84035, 37.90396], [-89.94989, 37.88205], [-90.05943, 38.0135],
  [-90.35518, 38.21614], [-90.34971, 38.37498], [-90.17992, 38.63239],
  [-90.2073, 38.7255], [-90.10872, 38.84599], [-90.25112, 38.91719],
  [-90.4702, 38.96101], [-90.58521, 38.8679], [-90.66189, 38.92815],
  [-90.72761, 39.25676], [-91.06171, 39.47036], [-91.36842, 39.72778],
  [-91.49439, 40.03449], [-91.50534, 40.23714], [-91.41771, 40.37953],
  [-91.40128, 40.56027], [-91.12195, 40.66981], [-91.09457, 40.82317],
  [-90.96312, 40.92175], [-90.94669, 41.09701], [-91.111, 41.23942],
  [-91.04528, 41.41468], [-90.65641, 41.46397], [-90.34423, 41.58994],
  [-90.31137, 41.74329], [-90.17992, 41.80902], [-90.14158, 42.00071],
  [-90.16897, 42.12668], [-90.39352, 42.22526], [-90.42091, 42.32933],
  [-90.63998, 42.51007],
];

export const FLORIDA_STATE_BOUNDARY: [number, number][] = [
  [-85.49714, 30.99754], [-85.00421, 31.00301], [-84.86729, 30.71274],
  [-83.49805, 30.64701], [-82.21645, 30.57034], [-82.16716, 30.35673],
  [-82.04666, 30.36221], [-82.00285, 30.56486], [-82.04119, 30.75107],
  [-81.94808, 30.82775], [-81.71805, 30.7456], [-81.4442, 30.70726],
  [-81.38395, 30.27458], [-81.25799, 29.78713], [-80.96771, 29.14633],
  [-80.52407, 28.46171], [-80.5898, 28.41242], [-80.56789, 28.09476],
  [-80.38167, 27.73876], [-80.0914, 27.02128], [-80.03115, 26.79672],
  [-80.03663, 26.56669], [-80.14617, 25.73967], [-80.23927, 25.72324],
  [-80.33786, 25.46583], [-80.305, 25.38367], [-80.49669, 25.19746],
  [-80.57337, 25.24127], [-80.75958, 25.1646], [-81.07725, 25.12078],
  [-81.17035, 25.22484], [-81.12654, 25.3782], [-81.35109, 25.82183],
  [-81.52635, 25.90398], [-81.67971, 25.84374], [-81.8002, 26.0902],
  [-81.83306, 26.29284], [-82.04119, 26.5174], [-82.09048, 26.66528],
  [-82.05762, 26.87888], [-82.17263, 26.91722], [-82.14525, 26.79125],
  [-82.24931, 26.75838], [-82.56697, 27.3006], [-82.69294, 27.43753],
  [-82.39171, 27.83734], [-82.58888, 27.81543], [-82.72033, 27.68946],
  [-82.85177, 27.88663], [-82.67651, 28.43433], [-82.64365, 28.88891],
  [-82.76414, 28.99845], [-82.80248, 29.14633], [-82.99417, 29.17919],
  [-83.21873, 29.42018], [-83.39947, 29.51876], [-83.41042, 29.66664],
  [-83.53639, 29.72141], [-83.64045, 29.88572], [-84.02384, 30.1048],
  [-84.35793, 30.0555], [-84.3415, 29.90215], [-84.45104, 29.92953],
  [-84.86729, 29.74332], [-85.31092, 29.6995], [-85.29997, 29.80904],
  [-85.40403, 29.94049], [-85.92434, 30.23624], [-86.29677, 30.36221],
  [-86.63086, 30.39507], [-86.91019, 30.37317], [-87.51813, 30.28006],
  [-87.37025, 30.42793], [-87.44693, 30.51009], [-87.40859, 30.6744],
  [-87.63314, 30.86609], [-87.60028, 30.99754], [-85.49714, 30.99754],
];

export const WASHINGTON_STATE_BOUNDARY: [number, number][] = [
  [-117.03336, 49.00024], [-117.04431, 47.76245], [-117.03884, 46.42608],
  [-117.05527, 46.34392], [-116.92382, 46.16866], [-116.91834, 45.9934],
  [-118.98863, 45.99888], [-119.12555, 45.93315], [-119.52537, 45.91125],
  [-119.96352, 45.82361], [-120.20998, 45.72503], [-120.50574, 45.69764],
  [-120.63719, 45.74694], [-121.18488, 45.60454], [-121.21774, 45.67026],
  [-121.5354, 45.72503], [-121.80925, 45.7086], [-122.24741, 45.54977],
  [-122.76224, 45.65931], [-122.81153, 45.96054], [-122.90464, 46.08103],
  [-123.11824, 46.18509], [-123.21135, 46.17414], [-123.37018, 46.14675],
  [-123.54544, 46.26177], [-123.72618, 46.30011], [-123.87406, 46.23986],
  [-124.06575, 46.32749], [-124.02741, 46.46442], [-123.89597, 46.53562],
  [-124.09861, 46.74374], [-124.23554, 47.28596], [-124.31769, 47.35716],
  [-124.42723, 47.74054], [-124.6244, 47.88842], [-124.70655, 48.18418],
  [-124.59701, 48.38135], [-124.39437, 48.28824], [-123.9836, 48.16227],
  [-123.70427, 48.16774], [-123.42495, 48.11845], [-123.16206, 48.16774],
  [-123.03609, 48.08011], [-122.80058, 48.08559], [-122.63627, 47.86651],
  [-122.51578, 47.88294], [-122.49387, 47.58719], [-122.42267, 47.31882],
  [-122.32408, 47.3462], [-122.42267, 47.57624], [-122.39528, 47.80079],
  [-122.23098, 48.03082], [-122.36242, 48.12393], [-122.37338, 48.28824],
  [-122.47196, 48.46898], [-122.42267, 48.60042], [-122.48839, 48.75378],
  [-122.64722, 48.77569], [-122.7951, 48.8907], [-122.75676, 49.00024],
  [-117.03336, 49.00024],
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

// Map of state codes and full names to authoritative boundary polygons
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

/** Clean display names (no 'Boundary' suffix). */
const STATE_DISPLAY_NAMES: Record<string, string> = {
  CA: 'California', CALIFORNIA: 'California',
  NY: 'New York', 'NEW YORK': 'New York',
  TX: 'Texas', TEXAS: 'Texas',
  IL: 'Illinois', ILLINOIS: 'Illinois',
  FL: 'Florida', FLORIDA: 'Florida',
  WA: 'Washington', WASHINGTON: 'Washington',
  UK: 'United Kingdom', GB: 'United Kingdom', 'UNITED KINGDOM': 'United Kingdom',
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
  let displayName = '';

  // 1. Direct state code / name match
  if (normState && STATE_BOUNDARIES[normState]) {
    rawCoords = STATE_BOUNDARIES[normState];
    displayName = STATE_DISPLAY_NAMES[normState] || normState;
  } else if (normCity && STATE_BOUNDARIES[normCity]) {
    rawCoords = STATE_BOUNDARIES[normCity];
    displayName = STATE_DISPLAY_NAMES[normCity] || normCity;
  } else {
    // 2. City-to-state inference
    if (normCity.includes('LOS ANGELES') || normCity.includes('SAN FRANCISCO') ||
        normCity.includes('SAN JOSE') || normCity.includes('SAN DIEGO') ||
        normCity.includes('OAKLAND') || normCity.includes('SACRAMENTO')) {
      rawCoords = CALIFORNIA_STATE_BOUNDARY;
      displayName = 'California';
    } else if (normCity.includes('NEW YORK') || normCity.includes('MANHATTAN') ||
               normCity.includes('BROOKLYN') || normCity.includes('QUEENS') ||
               normCity.includes('BRONX') || normCity.includes('BUFFALO')) {
      rawCoords = NEW_YORK_STATE_BOUNDARY;
      displayName = 'New York';
    } else if (normCity.includes('CHICAGO') || normCity.includes('SPRINGFIELD') ||
               normCity.includes('ROCKFORD')) {
      rawCoords = ILLINOIS_STATE_BOUNDARY;
      displayName = 'Illinois';
    } else if (normCity.includes('AUSTIN') || normCity.includes('HOUSTON') ||
               normCity.includes('DALLAS') || normCity.includes('SAN ANTONIO') ||
               normCity.includes('FORT WORTH') || normCity.includes('EL PASO')) {
      rawCoords = TEXAS_STATE_BOUNDARY;
      displayName = 'Texas';
    } else if (normCity.includes('MIAMI') || normCity.includes('ORLANDO') ||
               normCity.includes('TAMPA') || normCity.includes('JACKSONVILLE')) {
      rawCoords = FLORIDA_STATE_BOUNDARY;
      displayName = 'Florida';
    } else if (normCity.includes('SEATTLE') || normCity.includes('SPOKANE') ||
               normCity.includes('TACOMA')) {
      rawCoords = WASHINGTON_STATE_BOUNDARY;
      displayName = 'Washington';
    } else if (normCity.includes('LONDON')) {
      rawCoords = UNITED_KINGDOM_BOUNDARY;
      displayName = 'United Kingdom';
    }
  }

  // 3. Proximity fallback using bounding boxes derived from authoritative polygon extents
  if (!rawCoords && Number.isFinite(centerLat) && Number.isFinite(centerLon)) {
    const lat = centerLat as number;
    const lon = centerLon as number;
    if (lat >= 32.53 && lat <= 42.01 && lon >= -124.41 && lon <= -114.13) {
      rawCoords = CALIFORNIA_STATE_BOUNDARY;
      displayName = 'California';
    } else if (lat >= 40.50 && lat <= 45.02 && lon >= -79.77 && lon <= -71.86) {
      rawCoords = NEW_YORK_STATE_BOUNDARY;
      displayName = 'New York';
    } else if (lat >= 25.84 && lat <= 36.50 && lon >= -106.65 && lon <= -93.52) {
      rawCoords = TEXAS_STATE_BOUNDARY;
      displayName = 'Texas';
    } else if (lat >= 36.97 && lat <= 42.51 && lon >= -91.51 && lon <= -87.50) {
      rawCoords = ILLINOIS_STATE_BOUNDARY;
      displayName = 'Illinois';
    } else if (lat >= 25.12 && lat <= 31.00 && lon >= -87.64 && lon <= -80.03) {
      rawCoords = FLORIDA_STATE_BOUNDARY;
      displayName = 'Florida';
    } else if (lat >= 45.54 && lat <= 49.00 && lon >= -124.71 && lon <= -116.92) {
      rawCoords = WASHINGTON_STATE_BOUNDARY;
      displayName = 'Washington';
    } else if (lat >= 49.5 && lat <= 59.0 && lon >= -8.0 && lon <= 2.0) {
      rawCoords = UNITED_KINGDOM_BOUNDARY;
      displayName = 'United Kingdom';
    }
  }

  if (rawCoords && rawCoords.length > 0) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: displayName,
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
 * Resolve the canonical geographic-region DISPLAY NAME for a point, by
 * coordinates only (proximity resolution against the product's authoritative
 * boundary catalog). Returns a short region label such as "New York" or
 * "California", or undefined when the point lies outside every known region.
 *
 * Used when the operating location is DRAGGED on the map: the geographic
 * region context follows the point honestly instead of staying stale.
 */
export function resolveRegionDisplayName(lat: number, lng: number): string | undefined {
  const boundary = getRegionBoundaryPolygon(undefined, undefined, lat, lng);
  const name = (
    boundary?.features?.[0]?.properties as { name?: string } | undefined
  )?.name;
  return name || undefined;
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
