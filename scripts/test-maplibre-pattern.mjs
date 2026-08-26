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

  const result = await page.evaluate(() => {
    const map = window.__thermalMap;
    if (!map) return 'NO_MAP';

    // Remove existing layers and re-add via addSource / addLayer pattern
    const sampleThermal = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { average_temperature: 30.5, tile_id: 't-1' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-74.015, 40.708],
                [-74.002, 40.708],
                [-74.002, 40.716],
                [-74.015, 40.716],
                [-74.015, 40.708],
              ],
            ],
          },
        },
        {
          type: 'Feature',
          properties: { average_temperature: 36.0, tile_id: 't-2' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-74.002, 40.708],
                [-73.988, 40.708],
                [-73.988, 40.716],
                [-74.002, 40.716],
                [-74.002, 40.708],
              ],
            ],
          },
        },
      ],
    };

    if (map.getLayer('thermal-tiles-fill')) map.removeLayer('thermal-tiles-fill');
    if (map.getLayer('thermal-tiles-outline')) map.removeLayer('thermal-tiles-outline');
    if (map.getSource('thermal-tiles-test')) map.removeSource('thermal-tiles-test');

    map.addSource('thermal-tiles-test', {
      type: 'geojson',
      data: sampleThermal,
    });

    map.addLayer(
      {
        id: 'thermal-tiles-fill',
        type: 'fill',
        source: 'thermal-tiles-test',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'average_temperature'],
            25, '#10b981',
            30, '#facc15',
            35, '#e11d48',
          ],
          'fill-opacity': 0.85,
        },
      },
      'carto-labels-dark-layer'
    );

    map.addLayer(
      {
        id: 'thermal-tiles-outline',
        type: 'line',
        source: 'thermal-tiles-test',
        paint: {
          'line-color': '#ffffff',
          'line-width': 2,
        },
      },
      'carto-labels-dark-layer'
    );

    return {
      sources: Object.keys(map.getStyle().sources),
      layers: map.getStyle().layers.map((l) => l.id),
    };
  });

  console.log('RE-ADD RESULT:', JSON.stringify(result, null, 2));

  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_readd_result.png') });
  await browser.close();
  console.log('Saved test_readd_result.png');
}

main().catch(console.error);
