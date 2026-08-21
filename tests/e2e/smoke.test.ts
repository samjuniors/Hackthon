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

    // 5. Verify joint spatial-temporal decision outcome card and advantage banner render
    await expect(page.getByText('Recommended Operational Plan')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('★ Optimal Plan #1')).toBeVisible();
    await expect(page.getByText('FortyGuard Joint Advantage')).toBeVisible();
    await expect(page.getByRole('strong').filter({ hasText: 'Battery Park Greenway' })).toBeVisible();
    await expect(page.getByText('EVALUATED SEARCH')).toBeVisible();

    // 6. Verify What-If Operational Constraint Sensitivity Analysis renders
    await expect(page.getByText('What-If Operational Constraint Analysis')).toBeVisible();
    await expect(page.getByRole('button', { name: /Noise Curfew/ })).toBeVisible();
    await expect(page.getByText('Constraint Cost:')).toBeVisible();

    // 7. Capture screenshot of working vertical slice
    await page.screenshot({ path: 'tests/e2e/workspace-smoke.png', fullPage: true });

  });
});




