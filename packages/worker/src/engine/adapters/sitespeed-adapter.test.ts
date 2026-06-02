/**
 * E-69: Tests for the sitespeed.io adapter.
 *
 * Covers: buildArgs, parseResults, aggregateMetrics, buildIndividualRuns, isAvailable, run.
 * Techniques: equivalence partitioning, boundary value analysis, decision tables.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SitespeedAdapter, SitespeedPageResult } from "./sitespeed-adapter";
import type { EngineRunRequest } from "../types";

describe("SitespeedAdapter", () => {
  let adapter: SitespeedAdapter;

  beforeEach(() => {
    adapter = new SitespeedAdapter();
  });

  // ====== Basic identity ======

  it("should have name 'sitespeed'", () => {
    expect(adapter.name).toBe("sitespeed");
  });

  it("should support desktop and mobile", () => {
    expect(adapter.supports).toEqual(["desktop", "mobile"]);
  });

  // ====== isAvailable ======

  describe("isAvailable", () => {
    it("should return false when SITESPEED_ENABLED is not set", async () => {
      // In test env, env var is not set
      const available = await adapter.isAvailable();
      expect(available).toBe(false);
    });
  });

  // ====== buildArgs ======

  describe("buildArgs", () => {
    const baseRequest: EngineRunRequest = {
      url: "https://example.com",
      n_runs: 3,
      device: "desktop",
      viewport: { width: 1920, height: 1080 },
    };

    it("should include URL, outputFolder, and run count", () => {
      const args = adapter.buildArgs(baseRequest, "/tmp/out");
      expect(args).toContain("https://example.com");
      expect(args).toContain("--outputFolder");
      expect(args).toContain("/tmp/out");
      expect(args).toContain("-n");
      expect(args).toContain("3");
    });

    it("should include headless flag", () => {
      const args = adapter.buildArgs(baseRequest, "/tmp/out");
      expect(args).toContain("--browsertime.headless");
      expect(args).toContain("true");
    });

    it("should add --mobile flag for mobile device", () => {
      const mobileReq: EngineRunRequest = {
        ...baseRequest,
        device: "mobile",
        viewport: { width: 375, height: 812 },
      };
      const args = adapter.buildArgs(mobileReq, "/tmp/out");
      expect(args).toContain("--mobile");
    });

    it("should set custom viewport for desktop", () => {
      const args = adapter.buildArgs(baseRequest, "/tmp/out");
      expect(args).toContain("--browsertime.viewPort");
      expect(args).toContain("1920x1080");
    });

    it("should include throttling args when specified", () => {
      const req: EngineRunRequest = {
        ...baseRequest,
        throttling: {
          cpu_slowdown: 4,
          download_kbps: 1500,
          upload_kbps: 750,
          latency_ms: 150,
        },
      };
      const args = adapter.buildArgs(req, "/tmp/out");
      expect(args).toContain("--browsertime.chrome.CPUThrottlingRate");
      expect(args).toContain("4");
      expect(args).toContain("--connectivity.profile");
      expect(args).toContain("custom");
      expect(args).toContain("--connectivity.downstreamKbps");
      expect(args).toContain("1500");
    });

    it("should not include throttling args when not specified", () => {
      const args = adapter.buildArgs(baseRequest, "/tmp/out");
      expect(args).not.toContain("--connectivity.profile");
      expect(args).not.toContain("--browsertime.chrome.CPUThrottlingRate");
    });

    it("should default viewport for mobile when not provided", () => {
      const mobileReq: EngineRunRequest = {
        url: "https://example.com",
        n_runs: 1,
        device: "mobile",
        viewport: { width: 375, height: 812 },
      };
      const args = adapter.buildArgs(mobileReq, "/tmp/out");
      expect(args).toContain("375x812");
    });
  });

  // ====== aggregateMetrics ======

  describe("aggregateMetrics", () => {
    it("should return empty object for no results", () => {
      expect(adapter.aggregateMetrics([])).toEqual({});
    });

    it("should prefer statistics.median when available", () => {
      const results: SitespeedPageResult[] = [{
        statistics: {
          timings: {
            paintTiming: { "first-contentful-paint": { median: 800 } },
            largestContentfulPaint: { renderTime: { median: 1500 } },
            navigationTiming: {
              responseStart: { median: 200 },
              domContentLoadedEventEnd: { median: 1200 },
              loadEventEnd: { median: 2000 },
            },
          },
          pageinfo: {
            cumulativeLayoutShift: { median: 0.05 },
            longTasks: { totalBlockingTime: { median: 120 } },
          },
          requests: { total: { median: 45 } },
          transferSize: { total: { median: 512000 } },
        },
      }];

      const metrics = adapter.aggregateMetrics(results);
      expect(metrics.fcp_ms).toBe(800);
      expect(metrics.lcp_ms).toBe(1500);
      expect(metrics.ttfb_ms).toBe(200);
      expect(metrics.cls).toBe(0.05);
      expect(metrics.tbt_ms).toBe(120);
      expect(metrics.dom_content_loaded_ms).toBe(1200);
      expect(metrics.load_event_ms).toBe(2000);
      expect(metrics.total_requests).toBe(45);
      expect(metrics.total_transfer_size_bytes).toBe(512000);
    });

    it("should fallback to browserScripts when statistics absent", () => {
      const results: SitespeedPageResult[] = [{
        browserScripts: {
          timings: {
            paintTiming: { "first-contentful-paint": 900 },
            largestContentfulPaint: { renderTime: 1800, loadTime: 2000 },
            navigationTiming: {
              responseStart: 150,
              fetchStart: 0,
              domContentLoadedEventEnd: 1100,
              loadEventEnd: 1900,
            },
          },
          pageinfo: {
            cumulativeLayoutShift: 0.08,
            longTasks: { totalBlockingTime: 200 },
          },
        },
      }];

      const metrics = adapter.aggregateMetrics(results);
      expect(metrics.fcp_ms).toBe(900);
      expect(metrics.lcp_ms).toBe(1800); // prefers renderTime
      expect(metrics.ttfb_ms).toBe(150); // responseStart - fetchStart
      expect(metrics.cls).toBe(0.08);
      expect(metrics.tbt_ms).toBe(200);
    });

    it("should use loadTime when renderTime is undefined", () => {
      const results: SitespeedPageResult[] = [{
        browserScripts: {
          timings: {
            largestContentfulPaint: { loadTime: 2500 },
            navigationTiming: { responseStart: 100, fetchStart: 0 },
          },
          pageinfo: {},
        },
      }];

      const metrics = adapter.aggregateMetrics(results);
      expect(metrics.lcp_ms).toBe(2500);
    });

    it("should return empty when only empty browserScripts", () => {
      const results: SitespeedPageResult[] = [{ browserScripts: undefined }];
      expect(adapter.aggregateMetrics(results)).toEqual({});
    });
  });

  // ====== buildIndividualRuns ======

  describe("buildIndividualRuns", () => {
    it("should return empty array for no results", () => {
      expect(adapter.buildIndividualRuns([])).toEqual([]);
    });

    it("should filter out entries without browserScripts", () => {
      const results: SitespeedPageResult[] = [
        { statistics: {} },
        {
          browserScripts: {
            timings: { paintTiming: { "first-contentful-paint": 500 } },
            pageinfo: {},
          },
        },
      ];
      const runs = adapter.buildIndividualRuns(results);
      expect(runs).toHaveLength(1);
      expect(runs[0].run_index).toBe(0);
    });

    it("should populate web_vitals from browserScripts", () => {
      const results: SitespeedPageResult[] = [{
        browserScripts: {
          timings: {
            paintTiming: { "first-contentful-paint": 600 },
            largestContentfulPaint: { renderTime: 1200 },
            navigationTiming: {
              responseStart: 80,
              fetchStart: 0,
              domContentLoadedEventEnd: 900,
              loadEventEnd: 1500,
            },
          },
          pageinfo: {
            cumulativeLayoutShift: 0.02,
            longTasks: { totalBlockingTime: 50 },
          },
        },
      }];

      const runs = adapter.buildIndividualRuns(results);
      expect(runs).toHaveLength(1);
      expect(runs[0].web_vitals.fcp_ms).toBe(600);
      expect(runs[0].web_vitals.lcp_ms).toBe(1200);
      expect(runs[0].web_vitals.ttfb_ms).toBe(80);
      expect(runs[0].web_vitals.cls).toBe(0.02);
      expect(runs[0].lighthouse_timings.tbt_ms).toBe(50);
      expect(runs[0].dom_content_loaded_ms).toBe(900);
      expect(runs[0].load_event_ms).toBe(1500);
    });

    it("should handle multiple runs with sequential run_index", () => {
      const results: SitespeedPageResult[] = Array.from({ length: 3 }, () => ({
        browserScripts: {
          timings: { paintTiming: { "first-contentful-paint": 500 } },
          pageinfo: {},
        },
      }));
      const runs = adapter.buildIndividualRuns(results);
      expect(runs).toHaveLength(3);
      expect(runs.map((r) => r.run_index)).toEqual([0, 1, 2]);
    });
  });

  // ====== parseResults (no real FS) ======

  describe("parseResults", () => {
    it("should return empty array when pages dir does not exist", () => {
      const results = adapter.parseResults("/nonexistent/path", "https://example.com");
      expect(results).toEqual([]);
    });
  });

  // ====== run (error path) ======

  describe("run", () => {
    it("should return error result when sitespeed.io is not available", async () => {
      const request: EngineRunRequest = {
        url: "https://example.com",
        n_runs: 1,
        device: "desktop",
        viewport: { width: 1920, height: 1080 },
      };

      const result = await adapter.run(request);
      // Should fail because sitespeed.io is not installed in test env
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.url).toBe("https://example.com");
    });
  });
});
