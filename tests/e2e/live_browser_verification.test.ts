import { test, expect } from '@playwright/test';

test.describe('Live Browser Product & UX Verification', () => {
  test('Complete first-time user journey & visual validation', async ({ page }) => {
    // 1. Navigate to live server
    await page.goto('/');

    // 2. Header & Branding
    await expect(page.locator('h1')).toContainText('Thermal Decision Engine');
    await expect(page.getByTestId('temp-unit-toggle')).toBeVisible();

    // 3. Temperature Unit Toggle (°F -> °C -> °F)
    const btnF = page.getByTestId('temp-unit-f');
    const btnC = page.getByTestId('temp-unit-c');
    await expect(btnF).toBeVisible();
    await expect(btnC).toBeVisible();

    // Verify initial unit is °F
    await expect(page.getByTestId('map-legend-header')).toContainText('°F');
    const initialTemp = await page.getByTestId('recommended-temp-display').textContent();
    expect(initialTemp).toMatch(/°F/);

    // Toggle to °C
    await btnC.click();
    await expect(page.getByTestId('map-legend-header')).toContainText('°C');
    const tempC = await page.getByTestId('recommended-temp-display').textContent();
    expect(tempC).toMatch(/°C/);

    // Toggle back to °F
    await btnF.click();
    await expect(page.getByTestId('map-legend-header')).toContainText('°F');

    // 4. Location Search — Search "California"
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.click();
    await searchInput.fill('California');

    // Verify California metropolitan hubs appear in dropdown
    await expect(page.getByTestId('location-option-US-LAX')).toBeVisible();
    await expect(page.getByTestId('location-option-US-SFO')).toBeVisible();
    await expect(page.getByTestId('location-option-US-SAN')).toBeVisible();

    // Select Los Angeles
    await page.getByTestId('location-option-US-LAX').click();
    await expect(page.getByTestId('selected-location-name')).toContainText('Los Angeles, CA');

    // 5. Test Unlisted Query / Empty State
    await searchInput.click();
    await searchInput.fill('Smallville Nowhere');
    await expect(page.getByTestId('location-search-empty-state')).toBeVisible();
    await expect(page.getByTestId('location-search-empty-state')).toContainText('No matching supported metro area found');

    // Clear search and switch back to Battery Park demo preset
    await searchInput.fill('');
    await searchInput.press('Escape');
    await page.getByTestId('preset-chip-DEMO-NYC-A').click();
    await expect(page.getByTestId('selected-location-name')).toContainText('Battery Park');

    // 6. Calculate Decision
    const calcBtn = page.getByTestId('recalculate-decision-btn');
    await expect(calcBtn).toBeVisible();
    await calcBtn.click();

    // Verify Recommended Operational Plan hero card
    await expect(page.getByTestId('decision-card')).toBeVisible();
    await expect(page.getByTestId('recommended-temp-display')).toBeVisible();
    await expect(page.getByTestId('recommended-duration')).toContainText('3h');

    // 7. What-If Constraint Sensitivity Preset
    const siteLockBtn = page.getByRole('button', { name: /Site Lock/ });
    await expect(siteLockBtn).toBeVisible();
    await siteLockBtn.click();

    // Verify What-If 3-Box flow and constraint cost update
    await expect(page.getByTestId('whatif-cost-display')).toBeVisible();
    await expect(page.getByTestId('whatif-cost-display')).toContainText('+');

    // 8. Provider Health Card
    const testAiBtn = page.getByTestId('test-ai-btn');
    await expect(testAiBtn).toBeVisible();
    await testAiBtn.click();
    await expect(testAiBtn).toBeEnabled({ timeout: 10000 });

    // 9. AI Explanation Layer
    await expect(page.getByText('Operational Summary')).toBeVisible();
    await expect(page.getByText('Why This Plan Wins')).toBeVisible();

    // 10. Capture high-res screenshot of the complete verified workspace
    await page.screenshot({ path: 'tests/e2e/live-browser-verification.png', fullPage: true });
  });
});
