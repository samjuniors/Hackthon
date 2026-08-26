import puppeteer from 'puppeteer-core';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ARTIFACT_DIR = 'C:\\Users\\STUDIO-1\\.gemini\\antigravity-ide\\brain\\69599f9a-3b67-4af8-925d-5337a1eb3d8c';

async function run() {
  console.log('Launching browser to test Los Angeles & California boundary...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    defaultViewport: { width: 1440, height: 950 },
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));

  // Click Los Angeles preset chip using exact testid
  console.log('Clicking Los Angeles chip (data-testid="preset-chip-US-LAX")...');
  const chipClicked = await page.evaluate(() => {
    const chip = document.querySelector('button[data-testid="preset-chip-US-LAX"]') ||
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent && b.textContent.includes('Los Angeles'));
    if (chip) {
      chip.click();
      return true;
    }
    return false;
  });
  console.log('Clicked Los Angeles chip:', chipClicked);

  await new Promise((r) => setTimeout(r, 3000));

  // Capture Los Angeles local thermal field & AOI in Dark mode
  const localDarkPath = path.join(ARTIFACT_DIR, '01_final_la_dark.png');
  await page.screenshot({ path: localDarkPath });
  console.log('Saved 01_final_la_dark.png');

  // Click State View button to view the full California state boundary polygon
  console.log('Clicking State View button...');
  const stateViewClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const svBtn = buttons.find((b) => b.textContent && b.textContent.includes('State View'));
    if (svBtn) {
      svBtn.click();
      return true;
    }
    return false;
  });
  console.log('Clicked State View:', stateViewClicked);

  await new Promise((r) => setTimeout(r, 2500));

  // Capture California State View in Dark mode
  const stateDarkPath = path.join(ARTIFACT_DIR, '02_final_california_dark.png');
  await page.screenshot({ path: stateDarkPath });
  console.log('Saved 02_final_california_dark.png');

  // Switch to Light Mode in State View
  console.log('Switching to Light Mode in State View...');
  const themeToggle = await page.$('button[title*="Light Mode"], button[title*="Dark Mode"]');
  if (themeToggle) {
    await themeToggle.click();
    await new Promise((r) => setTimeout(r, 2000));
  }

  const stateLightPath = path.join(ARTIFACT_DIR, '03_final_california_light.png');
  await page.screenshot({ path: stateLightPath });
  console.log('Saved 03_final_california_light.png');

  await browser.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
