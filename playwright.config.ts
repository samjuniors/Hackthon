import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://localhost:3050',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle'],
        },
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 7'],
        launchOptions: {
          args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle'],
        },
      },
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 15'],
      },
    },
  ],
  webServer: {
    command: 'pnpm run dev --port 3050',
    url: 'http://localhost:3050',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
