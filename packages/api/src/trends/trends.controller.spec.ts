import { Test, TestingModule } from "@nestjs/testing";
import { TrendsController } from "./trends.controller";
import { TrendsService } from "./trends.service";
import { DatabaseService } from "../database/database.service";

const mockDb = { query: jest.fn() };

describe("TrendsController", () => {
  let controller: TrendsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrendsController],
      providers: [
        TrendsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    controller = module.get<TrendsController>(TrendsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("getMetricTrends (GET /trends)", () => {
    it("returns trend points", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ run_id: "r-1", finished_at: "2026-01-01", environment: "staging", lcp_ms: "2000" }],
      });
      const result = await controller.getMetricTrends("p-1", "lcp_ms");
      expect(result).toHaveLength(1);
      expect(result[0].lcp_ms).toBe(2000);
    });

    it("handles multiple metrics (comma-separated)", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ run_id: "r-1", finished_at: "2026-01-01", environment: "staging", lcp_ms: "2000", fcp_ms: "800" }],
      });
      const result = await controller.getMetricTrends("p-1", "lcp_ms,fcp_ms");
      expect(result[0].lcp_ms).toBe(2000);
      expect(result[0].fcp_ms).toBe(800);
    });
  });

  describe("getProjectSummary (GET /trends/summary)", () => {
    it("returns project summary", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          total_runs: "10", completed_runs: "8", failed_runs: "2",
          avg_lcp_ms: "2100", avg_fcp_ms: "900", avg_cls: "0.05",
          avg_lighthouse_performance: "0.85", last_run_at: "2026-01-10",
        }],
      });
      const result = await controller.getSummary("p-1");
      expect(result.total_runs).toBe(10);
    });
  });
});
