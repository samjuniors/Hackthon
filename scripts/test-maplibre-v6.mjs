import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\STUDIO-1\\.gemini\\antigravity-ide\\brain\\69599f9a-3b67-4af8-925d-5337a1eb3d8c';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle'],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  const result = await page.evaluate(async () => {
    const map = window.__thermalMap;
    if (!map) return 'NO_MAP';

    // Check what sources exist and what data is loaded
    const thermalSource = map.getSource('thermal-tiles');
    const aoiSource = map.getSource('analysis-aoi');
    const regionSource = map.getSource('region-boundary');

    // Pan slightly to force tile index refresh in MapLibre 6
    const center = map.getCenter();
    map.jumpTo({ center: [center.lng + 0.00001, center.lat + 0.00001] });

    await new Promise((r) => setTimeout(r, 600));

    const rendered = map.queryRenderedFeatures();

    return {
      center: map.getCenter(),
      renderedCount: rendered.length,
      renderedLayers: [...new Set(rendered.map((f) => f.layer.id))],
      thermalSourceDataFeatures: thermalSource?._data?.features?.length ?? 'none',
      aoiSourceDataFeatures: aoiSource?._data?.features?.length ?? 'none',
      regionSourceDataFeatures: regionSource?._data?.features?.length ?? 'none',
    };
  });

  console.log('MAPLIBRE 6 TEST RESULT:', JSON.stringify(result, null, 2));

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_maplibre_v6_pan.png') });
  await browser.close();
  console.log('Saved test_maplibre_v6_pan.png');
}

main().catch(console.error);
