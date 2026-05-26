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
