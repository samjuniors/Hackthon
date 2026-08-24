import { test, expect } from '@playwright/test';

test.describe('Location Selection & Decision Synchronization Flows (Defect Prevention)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for initial load
    await expect(page.getByTestId('active-analysis-location-indicator')).toBeVisible({ timeout: 20000 });
  });

  // Flow A: Search 'California' -> LA/SF/SD appear -> select Los Angeles -> active location says Los Angeles -> switch/calculate -> no Battery Park result
  test('Flow A: Searching California yields California metros and selecting Los Angeles updates active analysis location', async ({ page }) => {
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');

    // Verify California metros appear in dropdown
    const optionLA = page.getByTestId('location-option-US-LAX');
    const optionSF = page.getByTestId('location-option-US-SFO');
    const optionSD = page.getByTestId('location-option-US-SAN');

    await expect(optionLA).toBeVisible({ timeout: 5000 });
    await expect(optionSF).toBeVisible();
    await expect(optionSD).toBeVisible();

    // Select Los Angeles
    await optionLA.click();

    // Verify Active Location Card & Indicator show Los Angeles, CA with correct coordinates
    await expect(page.getByTestId('active-analysis-location-name')).toContainText('Los Angeles, CA');
    await expect(page.getByTestId('active-analysis-location-coords')).toContainText('34.0522°');

    // Verify notice explains DEMO mode covers Manhattan only
    await expect(page.getByText('Fixture Mode Notice')).toBeVisible();

    // Switch to LIVE mode to evaluate Los Angeles
    const liveBtn = page.getByRole('button', { name: 'LIVE API' });
    await liveBtn.click();

    await expect(page.getByTestId('analysis-mode-badge')).toContainText('LIVE — FortyGuard');
    await expect(page.getByTestId('active-analysis-location-name')).toContainText('Los Angeles, CA');
  });

  // Flow B: Search 'California' -> select San Francisco -> active location updates to San Francisco
  test('Flow B: Searching California and selecting San Francisco updates coordinates to San Francisco', async ({ page }) => {
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');

    const optionSF = page.getByTestId('location-option-US-SFO');
    await expect(optionSF).toBeVisible({ timeout: 5000 });
    await optionSF.click();

    await expect(page.getByTestId('active-analysis-location-name')).toContainText('San Francisco, CA');
    await expect(page.getByTestId('active-analysis-location-coords')).toContainText('37.7749°');
  });

  // Flow C: Search 'Texas' -> supported Texas metros appear -> select one -> active location updates
  test('Flow C: Searching Texas returns Texas metros (Houston, Dallas, Austin) and updates selection', async ({ page }) => {
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('Texas');

    const optionAustin = page.getByTestId('location-option-US-AUS');
    const optionHouston = page.getByTestId('location-option-US-HOU');
    const optionDallas = page.getByTestId('location-option-US-DAL');

    await expect(optionAustin).toBeVisible({ timeout: 5000 });
    await expect(optionHouston).toBeVisible();
    await expect(optionDallas).toBeVisible();

    await optionAustin.click();
    await expect(page.getByTestId('active-analysis-location-name')).toContainText('Austin, TX');
    await expect(page.getByTestId('active-analysis-location-coords')).toContainText('30.2672°');
  });

  // Flow D: Search unsupported city -> clear empty state -> GPS/manual coordinate options -> no stale Manhattan recommendation
  test('Flow D: Searching unsupported town shows empty state with GPS and coordinate options', async ({ page }) => {
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('UnknownFarAwayVillage');

    await expect(page.getByTestId('location-search-empty-state')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('No matching supported metro area found')).toBeVisible();
  });

  // Flow E: Start with Manhattan -> search California -> select Los Angeles -> verify Manhattan results are not presented as California
  test('Flow E: Transition from Manhattan to California clears stale Manhattan results', async ({ page }) => {
    // Initial state is Manhattan fixture
    await expect(page.getByTestId('active-analysis-location-name')).toContainText('Battery Park Greenway');

    // Search and select Los Angeles
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');
    await page.getByTestId('location-option-US-LAX').click();

    // Active location must now be Los Angeles
    await expect(page.getByTestId('active-analysis-location-name')).toContainText('Los Angeles, CA');

    // Fixture Mode Notice should be visible warning that fixture is Manhattan-only
    await expect(page.getByText('Fixture Mode Notice')).toBeVisible();
  });

  // Flow F: Mode Switch to DEMO when in California resets to Manhattan demo location
  test('Flow F: Switching to DEMO mode from a non-demo location resets to Manhattan fixture', async ({ page }) => {
    // Switch to LIVE
    await page.getByRole('button', { name: 'LIVE API' }).click();

    // Select Los Angeles
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('Los Angeles');
    await page.getByTestId('location-option-US-LAX').click();
    await expect(page.getByTestId('active-analysis-location-name')).toContainText('Los Angeles, CA');

    // Now switch back to DEMO
    await page.getByRole('button', { name: 'DEMO' }).click();

    // Since LA is outside Manhattan, DEMO mode resets to Battery Park Greenway
    await expect(page.getByTestId('active-analysis-location-name')).toContainText('Battery Park Greenway');
    await expect(page.getByTestId('analysis-mode-badge')).toContainText('DEMO — Manhattan Fixture');
  });
});
