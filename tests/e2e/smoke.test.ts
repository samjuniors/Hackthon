import { test, expect } from '@playwright/test';

test.describe('Thermal Decision Engine Workspace Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Recommended Operational Plan')).toBeVisible({ timeout: 20000 });
  });

  test('loads workspace UI, recalculates decision, and displays evidence recommendation', async ({ page }) => {

    // 2. Verify workspace header title and prominent Data Source indicator are present
    await expect(page.locator('h1')).toContainText('Thermal Decision Engine');
    await expect(page.getByText('DEMO — Captured FortyGuard Data')).toBeVisible();

    // 3. Click recalculate decision button to trigger decision pipeline
    const recalculateBtn = page.getByRole('button', { name: /Calculate Decision/ });
    await expect(recalculateBtn).toBeVisible();
    const decisionResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/decision') && resp.status() === 200,
      { timeout: 15000 }
    );
    await recalculateBtn.click();
    await decisionResponsePromise;

    // 5. Verify joint spatial-temporal decision outcome card and advantage banner render
    await expect(page.getByText('★ Recommended Operational Plan')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Best feasible plan')).toBeVisible();
    await expect(page.getByText(/Battery Park/i).first()).toBeVisible();

    // 6. Verify What-If Constraint Sensitivity Analysis renders
    await expect(page.getByText('What-If Constraint Sensitivity')).toBeVisible();
    await expect(page.getByRole('button', { name: /Noise Curfew/ })).toBeVisible();
    await expect(page.getByText('Constraint Cost')).toBeVisible();

    // Click through canonical What-If preset scenarios
    const siteLockBtn = page.getByRole('button', { name: /Site Lock/ });
    await siteLockBtn.click();
    await expect(page.getByText(/\+(2\.37|2\.20)°C/).first()).toBeVisible();

    // 7. Verify Grounded Decision Explanation & Evidence Synthesis renders
    await expect(page.getByText('Decision Explanation')).toBeVisible();
    await expect(page.getByText('Operational Summary')).toBeVisible();
    await expect(page.getByText('Why This Plan Wins')).toBeVisible();

    // 8. Capture high-res screenshot of polished M10 demo workspace
    await page.screenshot({ path: 'tests/e2e/workspace-smoke.png', fullPage: true });
  });
});






