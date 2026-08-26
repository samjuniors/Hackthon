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
  await new Promise((r) => setTimeout(r, 2500));

  const info = await page.evaluate(() => {
    const map = window.__thermalMap;
    if (!map) return 'NO_MAP';

    const thermalSource = map.getSource('thermal-tiles');
    const regionSource = map.getSource('region-boundary');
    const aoiSource = map.getSource('analysis-aoi');

    return {
      center: map.getCenter(),
      zoom: map.getZoom(),
      thermalFeaturesCount: thermalSource?._data?.features?.length || 0,
      regionFeaturesCount: regionSource?._data?.features?.length || 0,
      aoiFeaturesCount: aoiSource?._data?.features?.length || 0,
      thermalLayerVisible: map.getLayoutProperty('thermal-tiles-fill', 'visibility'),
      regionLayerVisible: map.getLayoutProperty('region-boundary-outline', 'visibility'),
      aoiLayerVisible: map.getLayoutProperty('aoi-outline', 'visibility'),
    };
  });

  console.log('RENDER INFO:', JSON.stringify(info, null, 2));

  // Take a high-resolution screenshot centered on the canvas
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'render_verification.png') });
  await browser.close();
}

main().catch(console.error);
