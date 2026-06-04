import { Test } from "@nestjs/testing";
import { LoadResultsService } from "./load-results.service";
import { DatabaseService } from "../database/database.service";

function makeRun(overrides: Record<string, any> = {}) {
  return {
    id: overrides.id ?? "lr-1",
    project_id: "p-1",
    status: "completed",
    target_vus: 10,
    actual_peak_vus: null,
    stages: [{ duration_s: 60, target_vus: 10 }],
    cache_state: "warm",
    engine: "k6_browser",
    vu_minutes: 10,
    duration_s: 60,
    created_at: "2026-01-01T00:00:00Z",
    started_at: "2026-01-01T00:00:01Z",
    finished_at: "2026-01-01T00:01:01Z",
    metrics_summary: null,
    error: null,
    ...overrides,
  };
}

describe("LoadResultsService", () => {
  let service: LoadResultsService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        LoadResultsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(LoadResultsService);
  });

  describe("analyse", () => {
    it("returns analysis with zero runs", async () => {
      // completed runs query
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // all runs query
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.analyse("p-1");

      expect(result.project_id).toBe("p-1");
      expect(result.total_completed_runs).toBe(0);
      expect(result.total_failed_runs).toBe(0);
      expect(result.total_vu_minutes).toBe(0);
      expect(result.capacity.confidence).toBe("low");
      expect(result.percentiles).toHaveLength(5);
      expect(result.trend).toHaveLength(0);
      expect(result.vu_vs_response).toHaveLength(0);
      expect(result.error_analysis).toHaveLength(0);
    });

    it("computes percentiles from completed runs with metrics", async () => {
      const runs = [
        makeRun({ id: "lr-1", metrics_summary: { lcp_ms: 1000, fcp_ms: 500, ttfb_ms: 200 } }),
        makeRun({ id: "lr-2", metrics_summary: { lcp_ms: 1200, fcp_ms: 600, ttfb_ms: 250 } }),
        makeRun({ id: "lr-3", metrics_summary: { lcp_ms: 1500, fcp_ms: 700, ttfb_ms: 300 } }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.total_completed_runs).toBe(3);
      const lcpPctl = result.percentiles.find((p: any) => p.metric === "lcp_ms")!;
      expect(lcpPctl).toBeDefined();
      expect(lcpPctl.count).toBe(3);
      expect(lcpPctl.min).toBe(1000);
      expect(lcpPctl.max).toBe(1500);
      expect(lcpPctl.p50).toBeDefined();
    });

    it("builds VU vs response curve from different VU levels", async () => {
      const runs = [
        makeRun({ id: "lr-1", target_vus: 5, metrics_summary: { lcp_ms: 800, fcp_ms: 400, ttfb_ms: 100 } }),
        makeRun({ id: "lr-2", target_vus: 10, metrics_summary: { lcp_ms: 1200, fcp_ms: 600, ttfb_ms: 200 } }),
        makeRun({ id: "lr-3", target_vus: 20, metrics_summary: { lcp_ms: 2000, fcp_ms: 900, ttfb_ms: 400 } }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.vu_vs_response).toHaveLength(3);
      expect(result.vu_vs_response[0].vus).toBe(5);
      expect(result.vu_vs_response[1].vus).toBe(10);
      expect(result.vu_vs_response[2].vus).toBe(20);
      expect(result.vu_vs_response[0].lcp_ms).toBeLessThan(result.vu_vs_response[2].lcp_ms);
    });

    it("estimates capacity with positive degradation slope", async () => {
      const runs = [
        makeRun({ id: "lr-1", target_vus: 5, metrics_summary: { lcp_ms: 500, fcp_ms: 200, ttfb_ms: 50 } }),
        makeRun({ id: "lr-2", target_vus: 10, metrics_summary: { lcp_ms: 1000, fcp_ms: 400, ttfb_ms: 100 } }),
        makeRun({ id: "lr-3", target_vus: 20, metrics_summary: { lcp_ms: 2000, fcp_ms: 800, ttfb_ms: 200 } }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.capacity.max_sustainable_vus).toBeGreaterThan(0);
      expect(result.capacity.degradation_slope).toBeGreaterThan(0);
      expect(result.capacity.confidence).toBe("medium");
    });

    it("handles single VU level with low confidence", async () => {
      const runs = [
        makeRun({ id: "lr-1", target_vus: 10, metrics_summary: { lcp_ms: 1000, fcp_ms: 400, ttfb_ms: 100 } }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.capacity.confidence).toBe("low");
      expect(result.capacity.max_sustainable_vus).toBe(10);
    });

    it("aggregates errors from failed runs", async () => {
      const completed = [
        makeRun({ id: "lr-1", metrics_summary: { lcp_ms: 1000 } }),
      ];
      const allRuns = [
        ...completed,
        makeRun({ id: "lr-2", status: "failed", error: "k6 timed out" }),
        makeRun({ id: "lr-3", status: "failed", error: "k6 timed out", created_at: "2026-02-01T00:00:00Z" }),
        makeRun({ id: "lr-4", status: "failed", error: "No URL configured" }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: completed });
      mockDb.query.mockResolvedValueOnce({ rows: allRuns });

      const result = await service.analyse("p-1");

      expect(result.total_failed_runs).toBe(3);
      expect(result.error_analysis).toHaveLength(2);
      const timeoutErr = result.error_analysis.find((e: any) => e.error === "k6 timed out")!;
      expect(timeoutErr.count).toBe(2);
    });

    it("builds cache comparison when multiple cache states exist", async () => {
      const runs = [
        makeRun({ id: "lr-1", cache_state: "warm", metrics_summary: { lcp_ms: 800, fcp_ms: 400, ttfb_ms: 100 } }),
        makeRun({ id: "lr-2", cache_state: "warm", metrics_summary: { lcp_ms: 900, fcp_ms: 450, ttfb_ms: 120 } }),
        makeRun({ id: "lr-3", cache_state: "cold", metrics_summary: { lcp_ms: 1500, fcp_ms: 700, ttfb_ms: 300 } }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.cache_comparison).toHaveLength(2);
      const warm = result.cache_comparison.find((c: any) => c.cache_state === "warm")!;
      const cold = result.cache_comparison.find((c: any) => c.cache_state === "cold")!;
      expect(warm).toBeDefined();
      expect(cold).toBeDefined();
      expect(warm.run_count).toBe(2);
      expect(cold.run_count).toBe(1);
      expect(cold.avg_lcp_ms).toBeGreaterThan(warm.avg_lcp_ms);
    });

    it("builds trend with both completed and failed runs", async () => {
      const completed = [
        makeRun({ id: "lr-1", metrics_summary: { lcp_ms: 1000 }, created_at: "2026-01-01T00:00:00Z" }),
      ];
      const allRuns = [
        ...completed,
        makeRun({ id: "lr-2", status: "failed", error: "fail", created_at: "2026-01-02T00:00:00Z" }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: completed });
      mockDb.query.mockResolvedValueOnce({ rows: allRuns });

      const result = await service.analyse("p-1");

      expect(result.trend).toHaveLength(2);
      expect(result.trend[0].error_rate).toBe(0);
      expect(result.trend[1].error_rate).toBe(1);
    });

    it("computes total VU-minutes correctly", async () => {
      const runs = [
        makeRun({ id: "lr-1", vu_minutes: 5.5 }),
        makeRun({ id: "lr-2", vu_minutes: 10.3 }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.total_vu_minutes).toBe(15.8);
    });
  });

  describe("capacity estimation edge cases", () => {
    it("handles negative slope (improving response times)", async () => {
      const runs = [
        makeRun({ id: "lr-1", target_vus: 5, metrics_summary: { lcp_ms: 1500, fcp_ms: 500, ttfb_ms: 200 } }),
        makeRun({ id: "lr-2", target_vus: 10, metrics_summary: { lcp_ms: 1200, fcp_ms: 400, ttfb_ms: 150 } }),
        makeRun({ id: "lr-3", target_vus: 20, metrics_summary: { lcp_ms: 900, fcp_ms: 300, ttfb_ms: 100 } }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.capacity.degradation_slope).toBeLessThan(0);
      expect(result.capacity.recommendation).toContain("headroom");
    });

    it("detects saturation point", async () => {
      const runs = [
        makeRun({ id: "lr-1", target_vus: 5, metrics_summary: { lcp_ms: 500, fcp_ms: 200, ttfb_ms: 50 } }),
        makeRun({ id: "lr-2", target_vus: 10, metrics_summary: { lcp_ms: 600, fcp_ms: 250, ttfb_ms: 60 } }),
        makeRun({ id: "lr-3", target_vus: 15, metrics_summary: { lcp_ms: 2000, fcp_ms: 800, ttfb_ms: 400 } }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.capacity.saturation_point_vus).toBe(10);
    });

    it("high confidence with 5+ data points", async () => {
      const runs = Array.from({ length: 6 }, (_, i) =>
        makeRun({
          id: `lr-${i}`,
          target_vus: (i + 1) * 5,
          metrics_summary: { lcp_ms: 400 + (i + 1) * 100, fcp_ms: 200 + i * 50, ttfb_ms: 50 + i * 20 },
        })
      );
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      // Each run has unique VUs, so 6 data points → high confidence
      expect(result.capacity.confidence).toBe("high");
    });
  });

  describe("percentile edge cases", () => {
    it("returns null percentiles when no metrics", async () => {
      const runs = [makeRun({ id: "lr-1", metrics_summary: null })];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      for (const p of result.percentiles) {
        expect(p.count).toBe(0);
        expect(p.p50).toBeNull();
      }
    });

    it("single sample sets all percentiles equal", async () => {
      const runs = [makeRun({ id: "lr-1", metrics_summary: { lcp_ms: 1234 } })];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      const lcp = result.percentiles.find((p: any) => p.metric === "lcp_ms")!;
      expect(lcp.count).toBe(1);
      expect(lcp.p50).toBe(1234);
      expect(lcp.p99).toBe(1234);
      expect(lcp.min).toBe(1234);
      expect(lcp.max).toBe(1234);
    });
  });

  describe("time_series", () => {
    it("returns empty time_series when no runs", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.analyse("p-1");
      expect(result.time_series).toHaveLength(0);
    });

    it("builds time series points from run stages", async () => {
      const runs = [
        makeRun({
          id: "lr-ts-1",
          target_vus: 10,
          actual_peak_vus: 10,
          stages: [
            { duration_s: 30, target_vus: 5 },
            { duration_s: 60, target_vus: 10 },
            { duration_s: 30, target_vus: 0 },
          ],
          started_at: "2026-01-01T00:00:00Z",
          metrics_summary: { lcp_ms: 1500, fcp_ms: 800, ttfb_ms: 200 },
        }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      // start point + 3 stage endpoints = 4 points
      expect(result.time_series).toHaveLength(4);
      expect(result.time_series[0].vus).toBe(0);
      expect(result.time_series[0].elapsed_s).toBe(0);
      expect(result.time_series[1].vus).toBe(5);
      expect(result.time_series[1].elapsed_s).toBe(30);
      expect(result.time_series[2].vus).toBe(10);
      expect(result.time_series[2].elapsed_s).toBe(90);
      // Metrics attached at peak stage
      expect(result.time_series[2].lcp_ms).toBe(1500);
      // Ramp-down stage has no metrics
      expect(result.time_series[3].vus).toBe(0);
      expect(result.time_series[3].lcp_ms).toBeNull();
    });

    it("creates single point for run without stages", async () => {
      const runs = [
        makeRun({
          id: "lr-ts-2",
          target_vus: 5,
          stages: [],
          metrics_summary: { lcp_ms: 1000 },
        }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.time_series).toHaveLength(1);
      expect(result.time_series[0].vus).toBe(5);
      expect(result.time_series[0].lcp_ms).toBe(1000);
    });

    it("sorts time series points by timestamp", async () => {
      const runs = [
        makeRun({
          id: "lr-ts-3",
          started_at: "2026-01-02T00:00:00Z",
          stages: [{ duration_s: 30, target_vus: 5 }],
          metrics_summary: { lcp_ms: 1000 },
        }),
        makeRun({
          id: "lr-ts-4",
          started_at: "2026-01-01T00:00:00Z",
          stages: [{ duration_s: 30, target_vus: 10 }],
          metrics_summary: { lcp_ms: 2000 },
        }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      // Earlier run should come first
      expect(result.time_series[0].run_id).toBe("lr-ts-4");
    });
  });

  describe("percentiles with k6 breakdown", () => {
    it("uses k6 percentile breakdown when available and count > 1", async () => {
      const runs = [
        makeRun({
          id: "lr-pct-1",
          metrics_summary: {
            lcp_ms: 2800,
            percentiles: {
              lcp_ms: { min: 500, med: 1100, avg: 1200, p75: 2000, p90: 2500, p95: 2800, p99: 3100, max: 3500, count: 20 },
            },
          },
        }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      const lcp = result.percentiles.find((p: any) => p.metric === "lcp_ms")!;
      expect(lcp.p50).toBe(1100); // med
      expect(lcp.p75).toBe(2000);
      expect(lcp.p90).toBe(2500);
      expect(lcp.p95).toBe(2800);
      expect(lcp.p99).toBe(3100);
      expect(lcp.min).toBe(500);
      expect(lcp.max).toBe(3500);
      expect(lcp.count).toBe(20);
    });

    it("falls back to cross-run percentiles when > 3 runs", async () => {
      const runs = Array.from({ length: 5 }, (_, i) =>
        makeRun({
          id: `lr-fb-${i}`,
          metrics_summary: {
            lcp_ms: 1000 + i * 200,
            percentiles: {
              lcp_ms: { min: 100, med: 500, avg: 600, p75: 700, p90: 800, p95: 900, p99: 950, max: 1000, count: 10 },
            },
          },
        })
      );
      mockDb.query.mockResolvedValueOnce({ rows: runs });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      const lcp = result.percentiles.find((p: any) => p.metric === "lcp_ms")!;
      // With 5 runs, should use cross-run percentiles not k6 breakdown
      expect(lcp.count).toBe(5);
      expect(lcp.min).toBe(1000);
      expect(lcp.max).toBe(1800);
    });
  });

  describe("error analysis", () => {
    it("truncates long error messages", async () => {
      const longError = "x".repeat(200);
      const runs = [
        makeRun({ id: "lr-1", status: "failed", error: longError }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.error_analysis[0].error.length).toBeLessThan(200);
      expect(result.error_analysis[0].error).toContain("…");
    });

    it("groups identical errors and tracks last_seen", async () => {
      const runs = [
        makeRun({ id: "lr-1", status: "failed", error: "timeout", created_at: "2026-01-01T00:00:00Z" }),
        makeRun({ id: "lr-2", status: "failed", error: "timeout", created_at: "2026-03-01T00:00:00Z" }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: runs });

      const result = await service.analyse("p-1");

      expect(result.error_analysis).toHaveLength(1);
      expect(result.error_analysis[0].count).toBe(2);
      expect(result.error_analysis[0].last_seen).toBe("2026-03-01T00:00:00Z");
    });
  });
});
