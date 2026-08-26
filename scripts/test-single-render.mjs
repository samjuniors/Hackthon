import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\STUDIO-1\\.gemini\\antigravity-ide\\brain\\69599f9a-3b67-4af8-925d-5337a1eb3d8c';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  // Inspect the layers and force a GeoJSON update
  const res = await page.evaluate(() => {
    const map = window.__thermalMap;
    if (!map) return 'NO_MAP';

    // Test pushing data directly
    const testGeoJSON = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { average_temperature: 35.0, tile_id: 'test-1' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-74.015, 40.705],
                [-74.000, 40.705],
                [-74.000, 40.720],
                [-74.015, 40.720],
                [-74.015, 40.705],
              ],
            ],
          },
        },
      ],
    };

    const thermalSrc = map.getSource('thermal-tiles');
    if (thermalSrc) {
      thermalSrc.setData(testGeoJSON);
    }
    map.triggerRepaint();

    return {
      sources: Object.keys(map.getStyle().sources),
      layers: map.getStyle().layers.map(l => l.id),
      thermalLayerVisible: map.getLayoutProperty('thermal-tiles-fill', 'visibility'),
      paintFill: map.getPaintProperty('thermal-tiles-fill', 'fill-color'),
    };
  });

  console.log('EVALUATE RESULT:', JSON.stringify(res, null, 2));

  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_direct_geojson.png') });
  await browser.close();
  console.log('Saved test_direct_geojson.png');
}

main().catch(console.error);
