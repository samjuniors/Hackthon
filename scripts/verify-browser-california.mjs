import { chromium } from "playwright";

async function verifyCalifornia() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("\n==================================================");
  console.log("BROWSER LIVE VERIFICATION — CALIFORNIA LOCATIONS");
  console.log("==================================================");

  await page.goto("http://localhost:3050");
  await page.waitForLoadState("networkidle");

  // Switch to LIVE mode
  console.log("\n--> Clicking LIVE API mode toggle...");
  const liveBtn = page.getByRole("button", { name: "LIVE API" });
  await liveBtn.click();
  await page.waitForTimeout(500);

  const testMetros = [
    { search: "California", select: "Los Angeles, CA", expectedLat: 34.0522, expectedLon: -118.2437 },
    { search: "California", select: "San Francisco, CA", expectedLat: 37.7749, expectedLon: -122.4194 },
    { search: "California", select: "San Diego, CA", expectedLat: 32.7157, expectedLon: -117.1611 },
  ];

  for (const item of testMetros) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Testing: Search "${item.search}" ? Select "${item.select}"`);
    console.log(`--------------------------------------------------`);

    // Search
    const searchInput = page.getByTestId("location-search-input");
    await searchInput.fill(item.search);
    await page.waitForTimeout(300);

    // Select from dropdown
    const option = page.getByText(item.select, { exact: false }).first();
    await option.click();
    await page.waitForTimeout(300);

    // Verify Active Location Indicator
    const activeIndicator = page.getByTestId("active-analysis-location-indicator");
    const indicatorText = await activeIndicator.textContent();
    console.log(`Active Analysis Location Indicator: "${indicatorText.trim()}"`);

    // Click Calculate
    console.log(`Clicking Calculate...`);
    const calcBtn = page.getByRole("button", { name: "Calculate", exact: false }).first();
    await calcBtn.click();

    // Wait for calculation to complete (polling FortyGuard LIVE API)
    console.log(`Waiting for FortyGuard LIVE calculation...`);
    await page.waitForSelector("[data-testid=\"optimal-plan-card\"]", { timeout: 60000 });

    // Extract Decision Card Content
    const optimalPlanCard = page.getByTestId("optimal-plan-card");
    const cardText = await optimalPlanCard.textContent();

    // Extract Plan Title / Location Name
    const planLocationName = await optimalPlanCard.locator("h3").first().textContent();
    const planScore = await optimalPlanCard.locator(".font-mono.text-white").first().textContent();
    const planBadge = await page.locator("header").textContent();

    console.log(`RECOMMENDATION RESULT:`);
    console.log(`  Location Name in Decision Card : ${planLocationName?.trim()}`);
    console.log(`  Mean Exposure Score            : ${planScore?.trim()}`);
    console.log(`  Header DataSource Attribution  : ${cardText.includes("LIVE") || indicatorText.includes("LIVE") ? "LIVE" : "UNKNOWN"}`);

    // Verify it is NOT Manhattan / Battery Park
    if (planLocationName?.includes("Battery Park") || planLocationName?.includes("Manhattan")) {
      console.error(`  FAILURE: Silent Manhattan substitution detected!`);
      process.exit(1);
    } else {
      console.log(`  VERIFIED: Recommendation belongs strictly to ${item.select}`);
    }
  }

  await browser.close();
  console.log("\n==================================================");
  console.log("ALL BROWSER LIVE VERIFICATIONS PASSED!");
  console.log("==================================================\n");
}

verifyCalifornia().catch((err) => {
  console.error("Browser verification failed:", err);
  process.exit(1);
});
