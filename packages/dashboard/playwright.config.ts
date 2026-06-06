/**
 * E-85: Playwright E2E configuration for the dashboard.
 *
 * Run with:
 *   npx playwright test
 *
 * Prerequisites:
 *   - API server running on port 4000
 *   - Dashboard dev server running on port 4200
 *   - npx playwright install chromium
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30_000,

  use: {
    baseURL: process.env.DASHBOARD_URL ?? "http://localhost:4200",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        port: 4200,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
