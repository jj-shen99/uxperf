import { describe, it, expect, vi } from "vitest";
import {
  collectWebVitals,
  collectWebVitalsSPA,
  collectPageTimings,
  collectResourceSummary,
} from "../metrics-collector";

/**
 * Unit tests for metrics-collector functions.
 * Since these functions call page.evaluate() with browser-only APIs,
 * we mock the Page object and verify the evaluate callback structure.
 */

function mockPage(evaluateResult: unknown) {
  return {
    evaluate: vi.fn().mockResolvedValue(evaluateResult),
  } as any;
}

describe("metrics-collector", () => {
  describe("collectWebVitals", () => {
    it("returns web vitals from page.evaluate", async () => {
      const vitals = {
        lcp_ms: 1500,
        fcp_ms: 800,
        cls: 0.05,
        ttfb_ms: 120,
      };
      const page = mockPage(vitals);
      const result = await collectWebVitals(page);
      expect(result).toEqual(vitals);
      expect(page.evaluate).toHaveBeenCalledTimes(1);
    });

    it("handles missing optional vitals", async () => {
      const page = mockPage({ ttfb_ms: 50 });
      const result = await collectWebVitals(page);
      expect(result.ttfb_ms).toBe(50);
      expect(result.lcp_ms).toBeUndefined();
      expect(result.fcp_ms).toBeUndefined();
      expect(result.cls).toBeUndefined();
      expect(result.inp_ms).toBeUndefined();
    });

    it("handles empty result from evaluate", async () => {
      const page = mockPage({});
      const result = await collectWebVitals(page);
      expect(result).toEqual({});
    });
  });

  describe("collectWebVitalsSPA", () => {
    it("returns SPA-derived vitals from page.evaluate", async () => {
      const vitals = {
        lcp_ms: 350.5,
        fcp_ms: 210.3,
        cls: 0.01,
        ttfb_ms: 45.2,
      };
      const page = mockPage(vitals);
      const result = await collectWebVitalsSPA(page);
      expect(result).toEqual(vitals);
      expect(page.evaluate).toHaveBeenCalledTimes(1);
    });

    it("handles result with only lcp_ms from SPA marker", async () => {
      const page = mockPage({ lcp_ms: 280 });
      const result = await collectWebVitalsSPA(page);
      expect(result.lcp_ms).toBe(280);
      expect(result.cls).toBeUndefined();
    });

    it("handles empty result from SPA collector", async () => {
      const page = mockPage({});
      const result = await collectWebVitalsSPA(page);
      expect(result).toEqual({});
    });
  });

  describe("collectPageTimings", () => {
    it("returns DOM and load timings", async () => {
      const timings = {
        dom_content_loaded_ms: 450,
        load_event_ms: 1200,
      };
      const page = mockPage(timings);
      const result = await collectPageTimings(page);
      expect(result).toEqual(timings);
    });

    it("returns empty object when no nav entries", async () => {
      const page = mockPage({});
      const result = await collectPageTimings(page);
      expect(result).toEqual({});
    });
  });

  describe("collectResourceSummary", () => {
    it("returns request count and transfer size", async () => {
      const summary = {
        total_requests: 42,
        total_transfer_size_bytes: 1_500_000,
      };
      const page = mockPage(summary);
      const result = await collectResourceSummary(page);
      expect(result.total_requests).toBe(42);
      expect(result.total_transfer_size_bytes).toBe(1_500_000);
    });

    it("handles zero resources", async () => {
      const page = mockPage({
        total_requests: 1,
        total_transfer_size_bytes: 0,
      });
      const result = await collectResourceSummary(page);
      expect(result.total_requests).toBe(1);
      expect(result.total_transfer_size_bytes).toBe(0);
    });
  });
});
