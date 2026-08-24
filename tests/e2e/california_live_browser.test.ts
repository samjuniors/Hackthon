import { test, expect } from '@playwright/test';

test.describe('California LIVE Browser Verification', () => {
  test.setTimeout(300000);

  test('executes LIVE decision for Los Angeles', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('location-search-input')).toBeVisible();

    const liveBtn = page.getByRole('button', { name: 'LIVE API' });
    await liveBtn.click();
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('LIVE');

    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');
    await page.waitForTimeout(300);

    const option = page.getByTestId('location-option-US-LAX');
    await expect(option).toBeVisible();

    const decisionResponsePromise = page.waitForResponse(
      (resp): boolean =>
        resp.url().includes('/api/decision') &&
        ((resp.request().postData()?.includes('34.0522') ?? false) ||
          (resp.request().postData()?.includes('-118.2437') ?? false)),
      { timeout: 120000 }
    );
    await option.click();
    const response = await decisionResponsePromise;
    const responseData = await response.json();

    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('Los Angeles, CA');

    if (response.status() === 200) {
      expect(responseData?.jointDecision?.dataSource).toBe('LIVE');
      const decisionCard = page.getByTestId('decision-card');
      await expect(decisionCard).toBeVisible({ timeout: 15000 });
      const cardContent = await decisionCard.textContent();
      expect(cardContent).not.toContain('Battery Park');
      expect(cardContent).not.toContain('Manhattan');
      expect(cardContent).toContain('LIVE');
      expect(cardContent).toContain('Site');
    } else {
      expect(responseData?.error?.code).toMatch(/FORTYGUARD_TIMEOUT|FORTYGUARD_PROVIDER_ERROR|FORTYGUARD_INCOMPLETE_COVERAGE/);
      const errorBanner = page.getByTestId('production-error-banner');
      await expect(errorBanner).toBeVisible({ timeout: 15000 });
    }
  });

  test('executes LIVE decision for San Francisco', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('location-search-input')).toBeVisible();

    const liveBtn = page.getByRole('button', { name: 'LIVE API' });
    await liveBtn.click();
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('LIVE');

    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');
    await page.waitForTimeout(300);

    const option = page.getByTestId('location-option-US-SFO');
    await expect(option).toBeVisible();

    const decisionResponsePromise = page.waitForResponse(
      (resp): boolean =>
        resp.url().includes('/api/decision') &&
        ((resp.request().postData()?.includes('37.7749') ?? false) ||
          (resp.request().postData()?.includes('-122.4194') ?? false)),
      { timeout: 120000 }
    );
    await option.click();
    const response = await decisionResponsePromise;
    const responseData = await response.json();

    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('San Francisco, CA');

    if (response.status() === 200) {
      expect(responseData?.jointDecision?.dataSource).toBe('LIVE');
      const decisionCard = page.getByTestId('decision-card');
      await expect(decisionCard).toBeVisible({ timeout: 15000 });
      const cardContent = await decisionCard.textContent();
      expect(cardContent).not.toContain('Battery Park');
      expect(cardContent).not.toContain('Manhattan');
      expect(cardContent).toContain('LIVE');
      expect(cardContent).toContain('Site');
    } else {
      expect(responseData?.error?.code).toMatch(/FORTYGUARD_TIMEOUT|FORTYGUARD_PROVIDER_ERROR|FORTYGUARD_INCOMPLETE_COVERAGE/);
      const errorBanner = page.getByTestId('production-error-banner');
      await expect(errorBanner).toBeVisible({ timeout: 15000 });
    }
  });

  test('executes LIVE decision for San Diego', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('location-search-input')).toBeVisible();

    const liveBtn = page.getByRole('button', { name: 'LIVE API' });
    await liveBtn.click();
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('LIVE');

    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');
    await page.waitForTimeout(300);

    const option = page.getByTestId('location-option-US-SAN');
    await expect(option).toBeVisible();

    const decisionResponsePromise = page.waitForResponse(
      (resp): boolean =>
        resp.url().includes('/api/decision') &&
        ((resp.request().postData()?.includes('32.7157') ?? false) ||
          (resp.request().postData()?.includes('-117.1611') ?? false)),
      { timeout: 120000 }
    );
    await option.click();
    const response = await decisionResponsePromise;
    const responseData = await response.json();

    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('San Diego, CA');

    if (response.status() === 200) {
      expect(responseData?.jointDecision?.dataSource).toBe('LIVE');
      const decisionCard = page.getByTestId('decision-card');
      await expect(decisionCard).toBeVisible({ timeout: 15000 });
      const cardContent = await decisionCard.textContent();
      expect(cardContent).not.toContain('Battery Park');
      expect(cardContent).not.toContain('Manhattan');
      expect(cardContent).toContain('LIVE');
      expect(cardContent).toContain('Site');
    } else {
      expect(responseData?.error?.code).toMatch(/FORTYGUARD_TIMEOUT|FORTYGUARD_PROVIDER_ERROR|FORTYGUARD_INCOMPLETE_COVERAGE/);
      const errorBanner = page.getByTestId('production-error-banner');
      await expect(errorBanner).toBeVisible({ timeout: 15000 });
    }
  });

  test('handles rapid location switching (LA -> immediately SF) ensuring newest request wins', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('location-search-input')).toBeVisible();

    const liveBtn = page.getByRole('button', { name: 'LIVE API' });
    await liveBtn.click();
    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('LIVE');

    const searchInput = page.getByTestId('location-search-input');
    await searchInput.fill('California');
    await page.waitForTimeout(300);

    const laOption = page.getByTestId('location-option-US-LAX');
    await expect(laOption).toBeVisible();
    await laOption.click();

    await searchInput.fill('San Francisco');
    await page.waitForTimeout(200);
    const sfOption = page.getByTestId('location-option-US-SFO');
    await expect(sfOption).toBeVisible();

    const sfDecisionPromise = page.waitForResponse(
      (resp): boolean =>
        resp.url().includes('/api/decision') &&
        ((resp.request().postData()?.includes('37.7749') ?? false) ||
          (resp.request().postData()?.includes('-122.4194') ?? false)),
      { timeout: 120000 }
    );
    await sfOption.click();

    const response = await sfDecisionPromise;
    const responseData = await response.json();

    await expect(page.getByTestId('active-analysis-location-indicator')).toContainText('San Francisco, CA');

    if (response.status() === 200) {
      const decisionCard = page.getByTestId('decision-card');
      await expect(decisionCard).toBeVisible({ timeout: 15000 });
      const cardContent = await decisionCard.textContent();
      expect(cardContent).not.toContain('Battery Park');
      expect(cardContent).not.toContain('Manhattan');
      expect(cardContent).toContain('LIVE');
      expect(cardContent).toContain('Site');
    } else {
      expect(responseData?.error?.code).toMatch(/FORTYGUARD_TIMEOUT|FORTYGUARD_PROVIDER_ERROR|FORTYGUARD_INCOMPLETE_COVERAGE/);
      const errorBanner = page.getByTestId('production-error-banner');
      await expect(errorBanner).toBeVisible({ timeout: 15000 });
    }
  });
});
