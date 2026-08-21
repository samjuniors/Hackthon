/**
 * Full Verification Protocol — §2 DEMO/FIXTURE + §7 Mobile Viewport
 */
import { test, expect, type Page } from '@playwright/test';

async function waitForDecision(page: Page, timeout = 20000): Promise<void> {
  await expect(page.getByText('Recommended Operational Plan')).toBeVisible({ timeout });
}

// §2 — DEMO / FIXTURE verification
test.describe('§2 — DEMO / FIXTURE Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForDecision(page);
  });

  test('§2.1 — DEMO badge amber and visible on load', async ({ page }) => {
    await expect(page.getByText('DEMO — CAPTURED FORTYGUARD DATA')).toBeVisible();
    await expect(page.getByText('LIVE — FORTYGUARD API')).not.toBeVisible();
  });

  test('§2.2 — Manhattan fixture workspace renders (map + 3 candidates)', async ({ page }) => {
    const mapCanvas = page.locator('canvas').first();
    await expect(mapCanvas).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /LOC-A.*Battery Park/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /LOC-B.*City Hall/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /LOC-C.*Chinatown/ })).toBeVisible();
  });

  test('§2.3 — Recommended Operational Plan shows correct fixture values', async ({ page }) => {
    await expect(page.getByText('Recommended Operational Plan')).toBeVisible();
    await expect(page.getByRole('strong').filter({ hasText: 'Battery Park Greenway' })).toBeVisible();
    await expect(page.getByText('★ Optimal Plan #1')).toBeVisible();
    await expect(page.getByText('FortyGuard Joint Advantage')).toBeVisible();
    await expect(page.getByText('EVALUATED SEARCH')).toBeVisible();
    // Use .first() because 29.15°C appears in multiple sections (score card, table, sparkline)
    await expect(page.getByText(/29\.15/).first()).toBeVisible();
  });

  test('§2.4 — What-If: all 3 presets clickable with correct constraint costs', async ({ page }) => {
    await expect(page.getByText('What-If Operational Constraint Analysis')).toBeVisible();

    // Preset 1: Noise Curfew → +2.95°C
    const noiseCurfewBtn = page.getByRole('button', { name: /Noise Curfew/ });
    await expect(noiseCurfewBtn).toBeVisible();
    await noiseCurfewBtn.click();
    await expect(page.getByText(/\+2\.95°C/).first()).toBeVisible({ timeout: 5000 });

    // Preset 2: Site Lock → +2.20°C
    const siteLockBtn = page.getByRole('button', { name: /Site Lock/ });
    await siteLockBtn.click();
    await expect(page.getByText(/\+2\.20°C/).first()).toBeVisible({ timeout: 5000 });

    // Preset 3: Duration Expansion → +1.48°C
    const durationBtn = page.getByRole('button', { name: /Duration/ });
    await durationBtn.click();
    await expect(page.getByText(/\+1\.48°C/).first()).toBeVisible({ timeout: 5000 });
  });

  test('§2.5 — AI explanation section renders with required structure', async ({ page }) => {
    await expect(page.getByText('Decision Explanation & Evidence Synthesis')).toBeVisible();
    await expect(page.getByText('OPERATIONAL SUMMARY')).toBeVisible();
    await expect(page.getByText('WHY THIS PLAN WINS')).toBeVisible();
    await expect(page.getByText('Grounding: 100% Verified Evidence')).toBeVisible();
    await expect(page.getByText('FortyGuard Hyperlocal Intelligence:')).toBeVisible();
  });

  test('§2.6 — DEMO/FIXTURE attribution explicit and correctly labeled', async ({ page }) => {
    await expect(page.getByText('DEMO — CAPTURED FORTYGUARD DATA')).toBeVisible();
    await expect(page.getByText('MODEL: v1.0.0-spatial-thermal-baseline')).toBeVisible();
  });

  test('§2.7 — API returns error for invalid request (lat=999); verify error schema', async ({ page }) => {
    // Verify the decision endpoint returns a structured error for out-of-range latitude.
    // This validates the Zod schema boundary (lat must be <= 90).
    const res = await page.request.post('http://localhost:3050/api/decision', {
      data: { latitude: 999, longitude: -74.008, durationHours: 2, mode: 'FIXTURE' },
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
    // Also verify the message contains the latitude field reference
    expect(body.error?.message).toMatch(/latitude/i);
  });

  test('§2.8 — Desktop workspace full screenshot', async ({ page }) => {
    await page.screenshot({ path: 'tests/e2e/evidence/demo-desktop.png', fullPage: true });
  });
});

// §7 — Mobile Viewport (390×844)
test.describe('§7 — Mobile Viewport (390x844)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForDecision(page);
  });

  test('§7.1 — No horizontal overflow', async ({ page }) => {
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });

  test('§7.2 — Mode toggle buttons visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'DEMO (Fixture)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'LIVE (API)' })).toBeVisible();
  });

  test('§7.3 — Location buttons accessible', async ({ page }) => {
    await expect(page.getByRole('button', { name: /LOC-A.*Battery Park/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /LOC-B.*City Hall/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /LOC-C.*Chinatown/ })).toBeVisible();
  });

  test('§7.4 — Decision card and submit visible on mobile', async ({ page }) => {
    await expect(page.getByText('Recommended Operational Plan')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recalculate Decision' })).toBeVisible();
  });

  test('§7.5 — What-If interaction on mobile', async ({ page }) => {
    await expect(page.getByText('What-If Operational Constraint Analysis')).toBeVisible();
    const siteLockBtn = page.getByRole('button', { name: /Site Lock/ });
    await expect(siteLockBtn).toBeVisible();
    await siteLockBtn.click();
    await expect(page.getByText(/\+2\.20°C/).first()).toBeVisible({ timeout: 5000 });
  });

  test('§7.6 — AI explanation accessible on mobile', async ({ page }) => {
    await expect(page.getByText('Decision Explanation & Evidence Synthesis')).toBeVisible();
  });

  test('§7.7 — Mobile screenshot', async ({ page }) => {
    await page.screenshot({ path: 'tests/e2e/evidence/mobile-workspace.png', fullPage: true });
  });
});
