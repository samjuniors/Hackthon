import { test, expect } from '@playwright/test';

test.describe('California LIVE Browser Verification', () => {
  test.setTimeout(120000);

  test('executes LIVE decision for Los Angeles', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('location-search-input')).toBeVisible();

    // Switch to LIVE mode
    const liveBtn = page.getByRole('button', { name: 'LIVE API' });
    await liveBtn.click();
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('LIVE');

    // Search California
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');
    await page.waitForTimeout(300);

    // Select Los Angeles (ID: US-LAX) and wait for LIVE API decision response
    const option = page.getByTestId('location-option-US-LAX');
    await expect(option).toBeVisible();

    const decisionResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/decision') && resp.status() === 200,
      { timeout: 60000 }
    );
    await option.click();
    const response = await decisionResponsePromise;
    const responseData = await response.json();
    expect(responseData?.jointDecision?.dataSource).toBe('LIVE');

    // Verify Active Indicator
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('Los Angeles, CA');

    // Wait for decision card to render
    const decisionCard = page.getByTestId('decision-card');
    await expect(decisionCard).toBeVisible({ timeout: 15000 });

    const cardContent = await decisionCard.textContent();
    expect(cardContent).not.toContain('Battery Park');
    expect(cardContent).not.toContain('Manhattan');
    expect(cardContent).toContain('LIVE');
    expect(cardContent).toContain('Site');
  });

  test('executes LIVE decision for San Francisco', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('location-search-input')).toBeVisible();

    // Switch to LIVE mode
    const liveBtn = page.getByRole('button', { name: 'LIVE API' });
    await liveBtn.click();
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('LIVE');

    // Search California
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');
    await page.waitForTimeout(300);

    // Select San Francisco (ID: US-SFO) and wait for LIVE API decision response
    const option = page.getByTestId('location-option-US-SFO');
    await expect(option).toBeVisible();

    const decisionResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/decision') && resp.status() === 200,
      { timeout: 60000 }
    );
    await option.click();
    const response = await decisionResponsePromise;
    const responseData = await response.json();
    expect(responseData?.jointDecision?.dataSource).toBe('LIVE');

    // Verify Active Indicator
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('San Francisco, CA');

    // Wait for decision card to render
    const decisionCard = page.getByTestId('decision-card');
    await expect(decisionCard).toBeVisible({ timeout: 15000 });

    const cardContent = await decisionCard.textContent();
    expect(cardContent).not.toContain('Battery Park');
    expect(cardContent).not.toContain('Manhattan');
    expect(cardContent).toContain('LIVE');
    expect(cardContent).toContain('Site');
  });

  test('executes LIVE decision for San Diego', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('location-search-input')).toBeVisible();

    // Switch to LIVE mode
    const liveBtn = page.getByRole('button', { name: 'LIVE API' });
    await liveBtn.click();
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('LIVE');

    // Search California
    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');
    await page.waitForTimeout(300);

    // Select San Diego (ID: US-SAN) and wait for LIVE API decision response
    const option = page.getByTestId('location-option-US-SAN');
    await expect(option).toBeVisible();

    const decisionResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/decision') && resp.status() === 200,
      { timeout: 60000 }
    );
    await option.click();
    const response = await decisionResponsePromise;
    const responseData = await response.json();
    expect(responseData?.jointDecision?.dataSource).toBe('LIVE');

    // Verify Active Indicator
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('San Diego, CA');

    // Wait for decision card to render
    const decisionCard = page.getByTestId('decision-card');
    await expect(decisionCard).toBeVisible({ timeout: 15000 });

    const cardContent = await decisionCard.textContent();
    expect(cardContent).not.toContain('Battery Park');
    expect(cardContent).not.toContain('Manhattan');
    expect(cardContent).toContain('LIVE');
    expect(cardContent).toContain('Site');
  });
});
