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
  page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  const result = await page.evaluate(() => {
    const map = window.__thermalMap;
    if (!map) return 'No map';

    const rendered = map.queryRenderedFeatures();
    const boundaryLayer = map.getLayer('region-boundary-outline');
    const bounds = map.getBounds();

    return {
      renderedLayerIds: Array.from(new Set(rendered.map((f) => f.layer.id))),
      boundaryLayerDef: boundaryLayer ? { id: boundaryLayer.id, type: boundaryLayer.type } : null,
      bounds: {
        w: bounds.getWest(),
        e: bounds.getEast(),
        s: bounds.getSouth(),
        n: bounds.getNorth(),
      },
    };
  });

  console.log('QUERY RESULT:', JSON.stringify(result, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'debug_current.png') });
  await browser.close();
}

main().catch(console.error);
