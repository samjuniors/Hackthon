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
  console.log('=== STARTING VISUAL AUDIT: CIRCLE & POLYGON MODES ===');
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

    // Click dropdown result
    await page.evaluate((text) => {
      const btns = Array.from(document.querySelectorAll('button'));
      const target = btns.find((b) => b.textContent && b.textContent.includes(text));
      if (target) target.click();
    }, loc.search);
    await new Promise((r) => setTimeout(r, 1200));

    // A. POLYGON MODE
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const polyBtn = btns.find((b) => b.textContent && b.textContent.toLowerCase().trim() === 'polygon');
      if (polyBtn) polyBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `visual_${loc.name}_polygon.png`) });
    console.log(`  Saved visual_${loc.name}_polygon.png`);

    // B. CIRCLE MODE
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const circleBtn = btns.find((b) => b.textContent && b.textContent.toLowerCase().trim() === 'circle');
      if (circleBtn) circleBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACT_DIR, `visual_${loc.name}_circle.png`) });
    console.log(`  Saved visual_${loc.name}_circle.png`);
  }

  await browser.close();
  console.log('\n=== COMPLETE ===');
}

main().catch(console.error);
