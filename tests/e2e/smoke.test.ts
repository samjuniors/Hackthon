import { test, expect } from '@playwright/test';

test.describe('Thermal Decision Engine Workspace Smoke Test', () => {
  test('loads workspace UI, recalculates decision, and displays evidence recommendation', async ({ page }) => {
    // 1. Load primary workspace
    await page.goto('/');

    // 2. Verify workspace header title and prominent Data Source indicator are present
    await expect(page.locator('h1')).toContainText('Thermal Decision Engine');
    await expect(page.getByText('DEMO — CAPTURED FORTYGUARD DATA')).toBeVisible();

    // 3. Click recalculate decision button to trigger decision pipeline
    const recalculateBtn = page.getByRole('button', { name: 'Recalculate Decision' });
    await expect(recalculateBtn).toBeVisible();
    await recalculateBtn.click();

    // 4. Wait for decision calculation to settle
    await page.waitForTimeout(2000);

    // 5. Verify optimal operating window recommendation card renders
    await expect(page.getByText('Optimal Operating Window')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Rank #1')).toBeVisible();

    // 6. Capture screenshot of working vertical slice
    await page.screenshot({ path: 'tests/e2e/workspace-smoke.png', fullPage: true });
  });
});

