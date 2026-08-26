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

  const info = await page.evaluate(() => {
    const map = window.__thermalMap;
    if (!map) return 'NO_MAP';

    // Add a blatant red square test layer
    if (!map.getSource('test-aoi-box')) {
      map.addSource('test-aoi-box', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [-74.012, 40.709],
                    [-74.002, 40.709],
                    [-74.002, 40.715],
                    [-74.012, 40.715],
                    [-74.012, 40.709],
                  ],
                ],
              },
            },
          ],
        },
      });
    }

    if (!map.getLayer('test-aoi-box-fill')) {
      map.addLayer({
        id: 'test-aoi-box-fill',
        type: 'fill',
        source: 'test-aoi-box',
        paint: {
          'fill-color': '#f43f5e',
          'fill-opacity': 0.4,
        },
      });
    }

    if (!map.getLayer('test-aoi-box-line')) {
      map.addLayer({
        id: 'test-aoi-box-line',
        type: 'line',
        source: 'test-aoi-box',
        paint: {
          'line-color': '#ffffff',
          'line-width': 4,
        },
      });
    }

    map.triggerRepaint();

    return {
      hasMap: true,
      center: map.getCenter(),
      layers: map.getStyle().layers.map((l) => l.id),
    };
  });

  console.log('EVAL:', JSON.stringify(info, null, 2));

  await new Promise((r) => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_aoi_visible.png') });
  await browser.close();
  console.log('Saved test_aoi_visible.png');
}

main().catch(console.error);
