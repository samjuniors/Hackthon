import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\STUDIO-1\\.gemini\\antigravity-ide\\brain\\69599f9a-3b67-4af8-925d-5337a1eb3d8c';

const TEST_CASES = [
  { id: '1_NY_Polygon_400m', locId: 'DEMO-NYC-A', shape: 'polygon', sizeVal: 400 },
  { id: '2_NY_Circle_400m', locId: 'DEMO-NYC-A', shape: 'circle', sizeVal: 400 },
  { id: '3_LA_Polygon_400m', locId: 'US-LAX', shape: 'polygon', sizeVal: 400 },
  { id: '4_LA_Circle_400m', locId: 'US-LAX', shape: 'circle', sizeVal: 400 },
  { id: '5_LA_Polygon_1km', locId: 'US-LAX', shape: 'polygon', sizeVal: 1000 },
  { id: '6_CHI_Polygon_400m', locId: 'US-CHI', shape: 'polygon', sizeVal: 400 },
  { id: '7_ATX_Polygon_400m', locId: 'US-AUS', shape: 'polygon', sizeVal: 400 },
  { id: '8_ATX_StateView', locId: 'US-AUS', shape: 'polygon', sizeVal: 400, stateView: true },
];

async function main() {
  console.log('=== STARTING SPATIAL SEMANTICS VISUAL AUDIT ===');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2000));

  for (const tc of TEST_CASES) {
    console.log(`\n--- Running Test: ${tc.id} (locId: ${tc.locId}) ---`);

    // 1. Focus search input to open dropdown, then click option by id
    await page.waitForSelector('#location-search-input', { timeout: 5000 });
    await page.click('#location-search-input', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await new Promise((r) => setTimeout(r, 200));

    // If needed, type partial query
    if (tc.locId === 'US-LAX') {
      await page.type('#location-search-input', 'Los Angeles');
    } else if (tc.locId === 'US-ORD') {
      await page.type('#location-search-input', 'Chicago');
    } else if (tc.locId === 'US-AUS') {
      await page.type('#location-search-input', 'Austin');
    } else {
      await page.type('#location-search-input', 'Battery');
    }
    await new Promise((r) => setTimeout(r, 600));

    // Click the target location option
    const optSelector = `#location-option-${tc.locId}`;
    await page.waitForSelector(optSelector, { timeout: 4000 });
    await page.click(optSelector);
    await new Promise((r) => setTimeout(r, 1200));

    // 2. Select Shape (polygon vs circle) via explicit data-testid
    const shapeSelector = `button[data-testid="aoi-shape-${tc.shape}"]`;
    await page.waitForSelector(shapeSelector, { timeout: 3000 });
    await page.click(shapeSelector);
    await new Promise((r) => setTimeout(r, 800));

    // 3. Select Size preset via explicit data-testid
    const sizeSelector = `button[data-testid="aoi-size-${tc.sizeVal}"]`;
    await page.waitForSelector(sizeSelector, { timeout: 3000 });
    await page.click(sizeSelector);
    await new Promise((r) => setTimeout(r, 1200));

    // 4. If stateView test, click State View button
    if (tc.stateView) {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const svBtn = btns.find((b) => b.textContent && b.textContent.includes('State View'));
        if (svBtn) svBtn.click();
      });
      await new Promise((r) => setTimeout(r, 1500));
    } else {
      // Otherwise ensure we are in local AOI focus view (fit to AOI)
      await new Promise((r) => setTimeout(r, 600));
    }

    // Capture screenshot
    const screenshotName = `audit_semantics_${tc.id}.png`;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, screenshotName) });
    console.log(`  Saved: ${screenshotName}`);
  }

  await browser.close();
  console.log('\n=== AUDIT COMPLETE ===');
}

main().catch(console.error);
