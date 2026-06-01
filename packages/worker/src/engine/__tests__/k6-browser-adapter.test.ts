import { describe, it, expect } from "vitest";
import { K6BrowserAdapter } from "../adapters/k6-browser-adapter";
import type { K6Summary } from "../adapters/k6-browser-adapter";

describe("K6BrowserAdapter", () => {
  const adapter = new K6BrowserAdapter();

  describe("name and supports", () => {
    it("has correct name", () => {
      expect(adapter.name).toBe("k6_browser");
    });

    it("supports desktop and mobile", () => {
      expect(adapter.supports).toContain("desktop");
      expect(adapter.supports).toContain("mobile");
    });
  });

  describe("generateK6Script", () => {
    it("generates a valid k6 script", () => {
      const script = adapter.generateK6Script(
        { url: "https://example.com", n_runs: 1, device: "desktop", viewport: { width: 1920, height: 1080 } },
        {
          stages: [
            { duration_s: 30, target_vus: 5 },
            { duration_s: 60, target_vus: 20 },
            { duration_s: 30, target_vus: 0 },
          ],
          target_vus: 20,
          cache_state: "warm",
        },
      );

      expect(script).toContain("import { browser } from 'k6/browser'");
      expect(script).toContain("ramping-vus");
      expect(script).toContain("https://example.com");
      expect(script).toContain("target: 5");
      expect(script).toContain("target: 20");
      expect(script).toContain("target: 0");
      expect(script).toContain("width: 1920");
    });

    it("generates mobile viewport", () => {
      const script = adapter.generateK6Script(
        { url: "https://example.com", n_runs: 1, device: "mobile", viewport: { width: 375, height: 812 } },
        {
          stages: [{ duration_s: 30, target_vus: 1 }],
          target_vus: 1,
          cache_state: "cold",
        },
      );
      expect(script).toContain("width: 375");
    });
  });

  describe("generateJourneyK6Script", () => {
    const baseProfile = {
      stages: [{ duration_s: 30, target_vus: 5 }],
      target_vus: 5,
      cache_state: "warm" as const,
    };

    it("generates journey script with click and measure steps", () => {
      const steps = [
        { intent: 'click "Product A"', action: "click" as const, target: "Product A", label: 'click "Product A"' },
        { intent: 'measure: "Product A"', action: "measure" as const, target: "measure", label: 'measure: "Product A"' },
      ];
      const script = adapter.generateJourneyK6Script(
        { url: "https://shop.com", n_runs: 1, device: "desktop", viewport: { width: 1920, height: 1080 } },
        baseProfile,
        steps,
      );
      expect(script).toContain("browser_journey");
      expect(script).toContain("https://shop.com");
      expect(script).toContain("Product A");
      expect(script).toContain(".click()");
      expect(script).toContain("// Measure:");
    });

    it("generates visit steps with goto", () => {
      const steps = [
        { intent: "navigate to https://shop.com/cart", action: "visit" as const, target: "https://shop.com/cart", label: "navigate to cart" },
      ];
      const script = adapter.generateJourneyK6Script(
        { url: "https://shop.com", n_runs: 1, device: "desktop" },
        baseProfile,
        steps,
      );
      expect(script).toContain("page.goto('https://shop.com/cart'");
    });

    it("generates fill steps", () => {
      const steps = [
        { intent: "type 'hello' into #search", action: "fill" as const, target: "#search", value: "hello", label: "fill search" },
      ];
      const script = adapter.generateJourneyK6Script(
        { url: "https://example.com", n_runs: 1, device: "desktop" },
        baseProfile,
        steps,
      );
      expect(script).toContain(".fill('hello')");
      expect(script).toContain("#search");
    });

    it("generates scroll and wait steps", () => {
      const steps = [
        { intent: "scroll down", action: "scroll" as const, target: "bottom", label: "scroll down" },
        { intent: "wait for page", action: "wait_for" as const, target: "body", label: "wait" },
      ];
      const script = adapter.generateJourneyK6Script(
        { url: "https://example.com", n_runs: 1, device: "desktop" },
        baseProfile,
        steps,
      );
      expect(script).toContain("scrollTo");
      expect(script).toContain("waitForTimeout(2000)");
    });

    it("dispatches to journey script when script_steps present in generateK6Script", () => {
      const request = {
        url: "https://example.com",
        n_runs: 1,
        device: "desktop",
        script_steps: [
          { intent: 'click "A"', action: "click" as const, target: "A", label: 'click "A"' },
          { intent: 'measure: "A"', action: "measure" as const, target: "measure", label: 'measure: "A"' },
        ],
      };
      const script = adapter.generateK6Script(request, baseProfile);
      expect(script).toContain("browser_journey");
      expect(script).toContain(".click()");
    });

    it("falls back to single-URL script when no script_steps", () => {
      const request = {
        url: "https://example.com",
        n_runs: 1,
        device: "desktop",
      };
      const script = adapter.generateK6Script(request, baseProfile);
      expect(script).toContain("browser_test");
      expect(script).not.toContain("browser_journey");
    });

    it("falls back to single-URL script when script_steps is empty", () => {
      const request = {
        url: "https://example.com",
        n_runs: 1,
        device: "desktop",
        script_steps: [],
      };
      const script = adapter.generateK6Script(request, baseProfile);
      expect(script).toContain("browser_test");
      expect(script).not.toContain("browser_journey");
    });

    it("escapes single quotes in targets and labels", () => {
      const steps = [
        { intent: "click button", action: "click" as const, target: "button[aria-label='Add']", label: "click 'Add' button" },
      ];
      const script = adapter.generateJourneyK6Script(
        { url: "https://example.com", n_runs: 1, device: "desktop" },
        baseProfile,
        steps,
      );
      // Should not produce broken JS from unescaped quotes
      expect(script).toContain("locator(");
      expect(script).not.toContain("locator('button[aria-label='Add']')");
    });

    it("handles unknown action type gracefully", () => {
      const steps = [
        { intent: "custom action", action: "something_new" as any, target: "x", label: "custom" },
      ];
      const script = adapter.generateJourneyK6Script(
        { url: "https://example.com", n_runs: 1, device: "desktop" },
        baseProfile,
        steps,
      );
      expect(script).toContain("// Unknown step: custom");
    });

    it("uses default viewport when none provided", () => {
      const steps = [
        { intent: 'measure: "home"', action: "measure" as const, target: "measure", label: 'measure: "home"' },
      ];
      const script = adapter.generateJourneyK6Script(
        { url: "https://example.com", n_runs: 1, device: "desktop" },
        baseProfile,
        steps,
      );
      expect(script).toContain("width: 1920");
      expect(script).toContain("height: 1080");
    });
  });

  describe("checkSaturation", () => {
    it("detects no saturation for normal metrics", () => {
      const summary: K6Summary = {
        metrics: {
          http_req_duration: { values: { avg: 200, p95: 500, p99: 800, med: 180 } },
          iterations: { values: { count: 100, rate: 5 } },
          vus_max: { values: { value: 10 } },
        },
      };
      const result = adapter.checkSaturation(summary);
      expect(result.saturated).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it("detects saturation when p95 > 10s", () => {
      const summary: K6Summary = {
        metrics: {
          http_req_duration: { values: { avg: 5000, p95: 12000, p99: 15000, med: 4000 } },
        },
      };
      const result = adapter.checkSaturation(summary);
      expect(result.saturated).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("10s threshold");
    });

    it("detects saturation when iteration rate is low", () => {
      const summary: K6Summary = {
        metrics: {
          http_req_duration: { values: { avg: 200, p95: 500, p99: 800, med: 180 } },
          iterations: { values: { count: 10, rate: 2 } },
          vus_max: { values: { value: 50 } },
        },
      };
      const result = adapter.checkSaturation(summary);
      expect(result.saturated).toBe(true);
      expect(result.warnings[0]).toContain("below 50%");
    });
  });

  describe("isAvailable", () => {
    it("returns false when K6_BROWSER_ENABLED is not set", async () => {
      // K6_BROWSER_ENABLED defaults to false in the adapter
      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });
  });
});
