import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\STUDIO-1\\.gemini\\antigravity-ide\\brain\\69599f9a-3b67-4af8-925d-5337a1eb3d8c';

const LOCATIONS = [
  { name: '1_NY_Manhattan', search: 'Battery Park', label: 'Battery Park Greenway' },
  { name: '2_LA_California', search: 'Los Angeles', label: 'Los Angeles, CA' },
  { name: '3_SF_California', search: 'San Francisco', label: 'San Francisco, CA' },
  { name: '4_CHI_Illinois', search: 'Chicago', label: 'Chicago, IL' },
  { name: '5_ATX_Texas', search: 'Austin', label: 'Austin, TX' },
];

async function main() {
  console.log('=== STARTING VISUAL AUDIT ACROSS ALL 5 REQUIRED LOCATIONS ===');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));

  for (const loc of LOCATIONS) {
    console.log(`\nTesting Location: ${loc.label}...`);

    // 1. Search and Select Location
    await page.click('input[placeholder*="Search"]', { clickCount: 3 });
    await page.type('input[placeholder*="Search"]', loc.search);
    await new Promise((r) => setTimeout(r, 600));

    // Click the matching search result in dropdown
    const resultClicked = await page.evaluate((text) => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find((b) => b.textContent && b.textContent.includes(text));
      if (target) {
        target.click();
        return true;
      }
      return false;
    }, loc.search);

    console.log(`Dropdown selection for "${loc.search}": ${resultClicked ? 'SUCCESS' : 'NO_DROPDOWN'}`);
    await new Promise((r) => setTimeout(r, 1500));

    // A. TEST POLYGON MODE
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const polyBtn = btns.find((b) => b.textContent && b.textContent.trim() === 'Polygon');
      if (polyBtn) polyBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    await page.evaluate(() => window.__thermalMap?.triggerRepaint());
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `visual_${loc.name}_polygon.png`) });
    console.log(`  Saved visual_${loc.name}_polygon.png`);

    // B. TEST CIRCLE MODE
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const circleBtn = btns.find((b) => b.textContent && b.textContent.trim() === 'Circle');
      if (circleBtn) circleBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1000));
    await page.evaluate(() => window.__thermalMap?.triggerRepaint());
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `visual_${loc.name}_circle.png`) });
    console.log(`  Saved visual_${loc.name}_circle.png`);
  }

  // C. TEST STATE VIEW ZOOM
  console.log('\nTesting State View Framing...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const stateBtn = btns.find((b) => b.textContent && b.textContent.includes('State View'));
    if (stateBtn) stateBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.evaluate(() => window.__thermalMap?.triggerRepaint());
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'visual_state_view_texas.png') });
  console.log('  Saved visual_state_view_texas.png');

  // D. TEST LIGHT MODE
  console.log('\nTesting Light Mode...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const themeBtn = btns.find((b) => b.querySelector('svg.lucide-sun') || b.querySelector('svg.lucide-moon'));
    if (themeBtn) themeBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  await page.evaluate(() => window.__thermalMap?.triggerRepaint());
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'visual_light_mode_overview.png') });
  console.log('  Saved visual_light_mode_overview.png');

  await browser.close();
  console.log('\n=== AUDIT COMPLETE: ALL SCREENSHOTS SAVED ===');
}

main().catch(console.error);
