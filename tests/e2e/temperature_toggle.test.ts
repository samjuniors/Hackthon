import { test, expect } from '@playwright/test';

test.describe('Temperature Unit Preference & Toggle (°C / °F)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.clear();
    });
    await page.reload();
    await expect(page.getByText('★ Recommended Plan')).toBeVisible({ timeout: 20000 });
  });

  test('1. Default display is °F across all major UI surfaces', async ({ page }) => {
    // 1. Check toggle button state (F active by default)
    const btnF = page.getByTestId('temp-unit-f');
    const btnC = page.getByTestId('temp-unit-c');
    await expect(btnF).toBeVisible();
    await expect(btnC).toBeVisible();
    await expect(btnF).toHaveAttribute('aria-pressed', 'true');
    await expect(btnC).toHaveAttribute('aria-pressed', 'false');

    // 2. Recommended Plan hero displays Fahrenheit (~85.69°F for 3h fixture baseline)
    const recommendedTemp = page.getByTestId('recommended-temp-display');
    await expect(recommendedTemp).toBeVisible();
    await expect(recommendedTemp).toContainText('°F');
    await expect(recommendedTemp).toContainText(/85\.(69|70)/);

    // 3. Map legend header displays °F
    const mapLegendHeader = page.getByTestId('map-legend-header');
    await expect(mapLegendHeader).toBeVisible();
    await expect(mapLegendHeader).toContainText('°F');

    // 4. What-If baseline displays °F
    const whatifBaseline = page.getByTestId('whatif-baseline-temp');
    await expect(whatifBaseline).toBeVisible();
    await expect(whatifBaseline).toContainText('°F');

    // 5. What-If cost delta displays scaled delta in °F (+4.27°F for Site Lock at 3h)
    const siteLockBtn = page.getByRole('button', { name: /Site Lock/ });
    await siteLockBtn.click();
    const whatifCost = page.getByTestId('whatif-cost-display');
    await expect(whatifCost).toBeVisible();
    await expect(whatifCost).toContainText('°F');
    await expect(whatifCost).toContainText(/\+4\.27/);
  });

  test('2. Toggling to °C converts all primary displays seamlessly without re-ranking', async ({ page }) => {
    const btnC = page.getByTestId('temp-unit-c');
    await btnC.click();
    await expect(btnC).toHaveAttribute('aria-pressed', 'true');

    // 1. Recommended plan updates to Celsius (29.83°C for 3h)
    const recommendedTemp = page.getByTestId('recommended-temp-display');
    await expect(recommendedTemp).toContainText('29.83°C');

    // 2. Map legend header updates to °C
    const mapLegendHeader = page.getByTestId('map-legend-header');
    await expect(mapLegendHeader).toContainText('°C');

    // 3. What-If baseline updates to Celsius
    const whatifBaseline = page.getByTestId('whatif-baseline-temp');
    await expect(whatifBaseline).toContainText('29.83°C');

    // 4. What-If cost delta updates to Celsius (+2.37°C for Site Lock at 3h)
    const siteLockBtn = page.getByRole('button', { name: /Site Lock/ });
    await siteLockBtn.click();
    const whatifCost = page.getByTestId('whatif-cost-display');
    await expect(whatifCost).toContainText('+2.37°C');

    // 5. Verify ranking and location invariant: Battery Park Greenway remains #1
    await expect(page.getByText(/Battery Park/i).first()).toBeVisible();
  });

  test('3. Unit preference persists across page reloads via localStorage', async ({ page }) => {
    // Switch to °C
    const btnC = page.getByTestId('temp-unit-c');
    await btnC.click();
    await expect(btnC).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('recommended-temp-display')).toContainText('29.83°C');

    // Reload page
    await page.reload();
    await expect(page.getByText('★ Recommended Plan')).toBeVisible({ timeout: 20000 });

    // Verify °C is still active
    await expect(page.getByTestId('temp-unit-c')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('recommended-temp-display')).toContainText('29.83°C');
  });

  test('4. Toggle satisfies mobile touch target requirement (>= 44px)', async ({ page }) => {
    const btnF = page.getByTestId('temp-unit-f');
    const box = await btnF.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  });
});
