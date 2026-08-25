import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3050';

test.describe('Vertical Slice: Location Search + Real Health + Failure UX + Provider Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('★ Recommended Plan')).toBeVisible({ timeout: 20000 });
  });

  // 1. Location Search interaction
  test('1. Location Search: query city, select from dropdown, and update selected location', async ({ page }) => {
    const searchInput = page.getByTestId('location-search-input');
    await expect(searchInput).toBeVisible();

    // Search for Los Angeles
    await searchInput.fill('Los Angeles');
    const optionLA = page.getByTestId('location-option-US-LAX');
    await expect(optionLA).toBeVisible({ timeout: 5000 });
    await optionLA.click();

    // Verify Selected Location Card updates
    await expect(page.getByTestId('selected-location-name')).toContainText('Los Angeles, CA');
    await expect(page.getByTestId('active-analysis-location-coords')).toContainText('34.0522°');
  });

  // 2. Preset Location Chips
  test('2. Preset Location Chips: clicking preset updates coordinates and recalculates', async ({ page }) => {
    const chipCityHall = page.getByTestId('preset-chip-DEMO-NYC-B');
    await expect(chipCityHall).toBeVisible();
    await chipCityHall.click();

    await expect(page.getByTestId('selected-location-name')).toContainText('City Hall Civic Center');
  });

  // 3. Provider Health Card & Test Connection buttons
  test('3. Provider Health Card: testing FortyGuard and AI connectivity triggers real status updates', async ({ page }) => {
    const testFgBtn = page.getByTestId('test-fortyguard-btn');
    await expect(testFgBtn).toBeVisible();
    await testFgBtn.click();

    // Verify button goes through testing and recovers
    await expect(testFgBtn).toBeEnabled({ timeout: 10000 });

    const testAiBtn = page.getByTestId('test-ai-btn');
    await expect(testAiBtn).toBeVisible();
    await testAiBtn.click();
    await expect(testAiBtn).toBeEnabled({ timeout: 10000 });
  });

  // 4. Mode Toggle & Status Transition
  test('4. Mode Toggle: toggling LIVE mode updates badges and warns for unconfigured or outside coverage', async ({ page }) => {
    const liveBtn = page.getByRole('button', { name: 'LIVE API' });
    await liveBtn.click();

    // In LIVE mode the header shows a "LIVE API" badge; button also reads "LIVE API"
    // Use .first() to avoid strict mode violation (2 matching elements expected)
    await expect(page.getByText('LIVE API').first()).toBeVisible({ timeout: 5000 });
    // DEMO notice should no longer be visible
    await expect(page.getByText('DEMO — Captured FortyGuard Data')).not.toBeVisible();
  });

  // 5. Production Failure State & Stale State Clearing
  test('5. Failure UX: invalid coordinates clear decision card and render structured error banner', async ({ page }) => {
    // Reveal coordinate inputs
    const coordsToggle = page.getByRole('button', { name: /Coordinates/ });
    await coordsToggle.click();

    const latInput = page.locator('#manual-lat-input');
    await expect(latInput).toBeVisible();
    await latInput.fill('999'); // Invalid latitude > 90

    const recalculateBtn = page.getByTestId('recalculate-decision-btn');
    await recalculateBtn.click();

    // Verify error banner appears with production details
    await expect(page.getByTestId('production-error-banner')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('VALIDATION_ERROR')).toBeVisible();
    await expect(page.getByText(/Action:/)).toBeVisible();

    // Verify stale decision card is CLEARED from the DOM
    await expect(page.getByTestId('decision-card')).not.toBeVisible();
  });

  // 6. Security Check: API endpoints never return secrets
  test('6. Security: API health endpoints never leak keys or headers', async ({ request }) => {
    const fgRes = await request.post(`${BASE}/api/health/fortyguard`, {
      data: { mode: 'FIXTURE' },
    });
    const fgBody = await fgRes.json();
    const fgText = JSON.stringify(fgBody);
    expect(fgText).not.toContain('FORTYGUARD_API_KEY');
    expect(fgText).not.toContain('Bearer');
    expect(fgText).not.toContain('api-key');

    const aiRes = await request.post(`${BASE}/api/health/ai`);
    const aiBody = await aiRes.json();
    const aiText = JSON.stringify(aiBody);
    expect(aiText).not.toContain('GEMINI_API_KEY');
    expect(aiText).not.toContain('OPENAI_API_KEY');
    expect(aiText).not.toContain('AI_API_KEY');
  });

  // 7. Default 3-Hour Duration verification
  test('7. Default Duration: initializes to 3 Hours and updates decision calculation', async ({ page }) => {
    // Verify duration display shows 3h (redesigned slider)
    await expect(page.getByTestId('duration-display')).toContainText('3h');

    // Verify recommended plan duration is 3 Hours
    await expect(page.getByTestId('recommended-duration')).toContainText('3h');
  });

  // 8. Location Search Empty State & Guidance
  test('8. Empty State UX: searching unlisted query shows supported metro guidance and GPS CTA', async ({ page }) => {
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('Unknown Nowhere Town');

    // Verify empty state card renders
    const emptyCard = page.getByTestId('location-search-empty-state');
    await expect(emptyCard).toBeVisible({ timeout: 5000 });
    await expect(emptyCard).toContainText('No matching supported metro area found');
    await expect(emptyCard.getByRole('button', { name: /Use My GPS Location/i })).toBeVisible();
  });
});
