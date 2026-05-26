import { Test } from "@nestjs/testing";
import { TrendsService } from "./trends.service";
import { DatabaseService } from "../database/database.service";

// ============================================================
// Trends Service — Unit Tests
// Techniques: EP, boundary, structural, primary path
// ============================================================

describe("TrendsService", () => {
  let service: TrendsService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        TrendsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(TrendsService);
  });

  // -- getMetricTrends --
  describe("getMetricTrends", () => {
    it("returns metric trend points in chronological order (primary path)", async () => {
      const rows = [
        { run_id: "r-2", finished_at: "2026-01-02", environment: "staging", lcp_ms: "2500" },
        { run_id: "r-1", finished_at: "2026-01-01", environment: "staging", lcp_ms: "2000" },
      ];
      mockDb.query.mockResolvedValueOnce({ rows });

      const result = await service.getMetricTrends("p-1", ["lcp_ms"]);

      // Should be reversed (oldest first)
      expect(result[0].run_id).toBe("r-1");
      expect(result[1].run_id).toBe("r-2");
      // Values should be parsed to numbers
      expect(result[0].lcp_ms).toBe(2000);
      expect(result[1].lcp_ms).toBe(2500);
    });

    it("returns empty array when no completed runs (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.getMetricTrends("p-1", ["lcp_ms"]);
      expect(result).toEqual([]);
    });

    it("handles null metric values (EP)", async () => {
      const rows = [
        { run_id: "r-1", finished_at: "2026-01-01", environment: "staging", lcp_ms: null },
      ];
      mockDb.query.mockResolvedValueOnce({ rows });

      const result = await service.getMetricTrends("p-1", ["lcp_ms"]);
      expect(result[0].lcp_ms).toBeNull();
    });

    it("treats non-numeric metric values as null (NaN regression)", async () => {
      const rows = [
        { run_id: "r-1", finished_at: "2026-01-01", environment: "staging", lcp_ms: "not-a-number" },
      ];
      mockDb.query.mockResolvedValueOnce({ rows });

      const result = await service.getMetricTrends("p-1", ["lcp_ms"]);
      expect(result[0].lcp_ms).toBeNull();
    });

    it("filters by environment when provided (decision tree)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.getMetricTrends("p-1", ["lcp_ms"], "production");
      const query = mockDb.query.mock.calls[0][0];
      expect(query).toContain("environment");
      expect(mockDb.query.mock.calls[0][1]).toContain("production");
    });

    it("clamps limit between 1 and 500 (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.getMetricTrends("p-1", ["lcp_ms"], undefined, 9999);
      const params = mockDb.query.mock.calls[0][1];
      expect(params[params.length - 1]).toBe(500);
    });

    it("handles multiple metrics (structural)", async () => {
      const rows = [
        { run_id: "r-1", finished_at: "2026-01-01", environment: "staging", lcp_ms: "2000", fcp_ms: "800" },
      ];
      mockDb.query.mockResolvedValueOnce({ rows });

      const result = await service.getMetricTrends("p-1", ["lcp_ms", "fcp_ms"]);
      expect(result[0].lcp_ms).toBe(2000);
      expect(result[0].fcp_ms).toBe(800);
    });
  });

  // -- getProjectSummary --
  describe("getProjectSummary", () => {
    it("returns aggregate summary (primary path)", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          total_runs: "10",
          completed_runs: "8",
          failed_runs: "2",
          avg_lcp_ms: "2100.5",
          avg_fcp_ms: "950.3",
          avg_cls: "0.05",
          avg_lighthouse_performance: "0.85",
          last_run_at: "2026-01-10T00:00:00Z",
        }],
      });

      const summary = await service.getProjectSummary("p-1");
      expect(summary.total_runs).toBe(10);
      expect(summary.completed_runs).toBe(8);
      expect(summary.failed_runs).toBe(2);
      expect(summary.avg_lcp_ms).toBeCloseTo(2100.5);
      expect(summary.avg_fcp_ms).toBeCloseTo(950.3);
      expect(summary.avg_cls).toBeCloseTo(0.05);
      expect(summary.avg_lighthouse_performance).toBeCloseTo(0.85);
      expect(summary.last_run_at).toBe("2026-01-10T00:00:00Z");
    });

    it("returns null averages when no completed runs (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          total_runs: "0",
          completed_runs: "0",
          failed_runs: "0",
          avg_lcp_ms: null,
          avg_fcp_ms: null,
          avg_cls: null,
          avg_lighthouse_performance: null,
          last_run_at: null,
        }],
      });

      const summary = await service.getProjectSummary("p-1");
      expect(summary.total_runs).toBe(0);
      expect(summary.avg_lcp_ms).toBeNull();
      expect(summary.avg_cls).toBeNull();
      expect(summary.last_run_at).toBeNull();
    });

    it("filters by environment when provided (decision tree)", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          total_runs: "5", completed_runs: "4", failed_runs: "1",
          avg_lcp_ms: null, avg_fcp_ms: null, avg_cls: null,
          avg_lighthouse_performance: null, last_run_at: null,
        }],
      });

      await service.getProjectSummary("p-1", "production");
      const query = mockDb.query.mock.calls[0][0];
      expect(query).toContain("environment");
      expect(mockDb.query.mock.calls[0][1]).toContain("production");
    });
  });
});
