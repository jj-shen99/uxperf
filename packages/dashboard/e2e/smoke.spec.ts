/**
 * E-85: Dashboard E2E smoke tests
 *
 * Validates that core pages load, navigation works, and key elements render.
 * These tests run against a live dev server and require the API to be up.
 */
import { test, expect } from "@playwright/test";

test.describe("Dashboard Smoke Tests", () => {
  test("login page loads and shows form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("h1, h2").first()).toBeVisible();
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/");
    // Should redirect to login or show login form
    await page.waitForURL(/\/(login)?$/);
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("forgot password page loads", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
  });
});

test.describe("Authenticated Navigation", () => {
  test.beforeEach(async ({ page }) => {
    // Login with demo admin credentials — override via E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars
    const email = process.env.E2E_ADMIN_EMAIL ?? "admin@perftest.io";
    const password = process.env.E2E_ADMIN_PASSWORD ?? "changeme_dev!!";
    await page.goto("/login");
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    // Wait for redirect to dashboard
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 10_000 });
  });

  test("dashboard home page loads with sidebar", async ({ page }) => {
    await page.goto("/");
    // Sidebar should be visible
    await expect(page.locator("nav, aside, [data-testid='sidebar']").first()).toBeVisible();
    // Should show some content
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });

  test("runs page loads", async ({ page }) => {
    await page.goto("/runs");
    await page.waitForLoadState("networkidle");
    // Should display runs table or empty state
    const content = page.locator("main, [role='main']").first();
    await expect(content).toBeVisible();
  });

  test("scripts page loads", async ({ page }) => {
    await page.goto("/scripts");
    await page.waitForLoadState("networkidle");
    const content = page.locator("main, [role='main']").first();
    await expect(content).toBeVisible();
  });

  test("trends page loads", async ({ page }) => {
    await page.goto("/trends");
    await page.waitForLoadState("networkidle");
    const content = page.locator("main, [role='main']").first();
    await expect(content).toBeVisible();
  });

  test("knowledge page loads with tabs", async ({ page }) => {
    await page.goto("/knowledge");
    await page.waitForLoadState("networkidle");
    // Should have tab buttons
    await expect(page.getByRole("button", { name: /metrics/i }).or(page.getByText(/metrics/i)).first()).toBeVisible();
  });

  test("intelligence page loads with tabs", async ({ page }) => {
    await page.goto("/intelligence");
    await page.waitForLoadState("networkidle");
    // Should have tab navigation
    await expect(page.getByText(/health overview/i).first()).toBeVisible();
  });

  test("gates page loads", async ({ page }) => {
    await page.goto("/gates");
    await page.waitForLoadState("networkidle");
    const content = page.locator("main, [role='main']").first();
    await expect(content).toBeVisible();
  });

  test("budgets page loads", async ({ page }) => {
    await page.goto("/budgets");
    await page.waitForLoadState("networkidle");
    const content = page.locator("main, [role='main']").first();
    await expect(content).toBeVisible();
  });

  test("anomalies page loads", async ({ page }) => {
    await page.goto("/anomalies");
    await page.waitForLoadState("networkidle");
    const content = page.locator("main, [role='main']").first();
    await expect(content).toBeVisible();
  });

  test("reports page loads", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    const content = page.locator("main, [role='main']").first();
    await expect(content).toBeVisible();
  });

  test("settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    const content = page.locator("main, [role='main']").first();
    await expect(content).toBeVisible();
  });

  test("sidebar navigation links work", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Click through sidebar links
    const sidebarLinks = [
      { text: /runs/i, url: "/runs" },
      { text: /scripts/i, url: "/scripts" },
      { text: /trends/i, url: "/trends" },
    ];

    for (const link of sidebarLinks) {
      const el = page.locator("nav a, aside a").filter({ hasText: link.text }).first();
      if (await el.isVisible()) {
        await el.click();
        await page.waitForURL(`**${link.url}**`);
        await page.waitForLoadState("networkidle");
      }
    }
  });
});
