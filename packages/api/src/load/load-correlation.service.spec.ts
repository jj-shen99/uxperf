import { Test } from "@nestjs/testing";
import { LoadCorrelationService } from "./load-correlation.service";
import { DatabaseService } from "../database/database.service";

describe("LoadCorrelationService", () => {
  let service: LoadCorrelationService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        LoadCorrelationService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(LoadCorrelationService);
  });

  describe("getCorrelation", () => {
    it("returns empty for missing load run", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.getCorrelation("lr-missing");
      expect(result.data_points).toHaveLength(0);
      expect(result.stages).toHaveLength(0);
    });

    it("builds correlated data points", async () => {
      const start = new Date("2024-01-01T00:00:00Z");
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: "lr-1",
            stages: [
              { duration_s: 60, target_vus: 10 },
              { duration_s: 60, target_vus: 50 },
            ],
            started_at: start.toISOString(),
            finished_at: new Date(start.getTime() + 120000).toISOString(),
            target_vus: 1,
            actual_peak_vus: 50,
            metrics_summary: { browser_lcp_p95: 1200 },
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { timestamp: new Date(start.getTime() + 10000).toISOString(), cpu_percent: 20, memory_percent: 40, active_connections: 50, event_loop_lag_ms: 5, http_request_rate: 100 },
            { timestamp: new Date(start.getTime() + 30000).toISOString(), cpu_percent: 45, memory_percent: 55, active_connections: 120, event_loop_lag_ms: 10, http_request_rate: 300 },
            { timestamp: new Date(start.getTime() + 70000).toISOString(), cpu_percent: 80, memory_percent: 70, active_connections: 200, event_loop_lag_ms: 25, http_request_rate: 500 },
          ],
        });

      const result = await service.getCorrelation("lr-1");
      expect(result.data_points).toHaveLength(3);
      expect(result.stages).toHaveLength(2);
      expect(result.summary.peak_vus).toBe(50);
      expect(result.summary.avg_lcp_ms).toBe(1200);
    });
  });

  describe("buildStageAnnotations", () => {
    it("builds stage annotations with correct offsets", () => {
      const stages = service.buildStageAnnotations([
        { duration_s: 30, target_vus: 10 },
        { duration_s: 60, target_vus: 50 },
        { duration_s: 30, target_vus: 0 },
      ]);
      expect(stages).toHaveLength(3);
      expect(stages[0].start_offset_s).toBe(0);
      expect(stages[1].start_offset_s).toBe(30);
      expect(stages[2].start_offset_s).toBe(90);
    });
  });

  describe("pearson", () => {
    it("computes perfect positive correlation", () => {
      expect(service.pearson([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBeCloseTo(1.0);
    });

    it("computes perfect negative correlation", () => {
      expect(service.pearson([1, 2, 3, 4, 5], [10, 8, 6, 4, 2])).toBeCloseTo(-1.0);
    });

    it("returns 0 for no correlation", () => {
      expect(service.pearson([1, 2, 3, 4, 5], [3, 3, 3, 3, 3])).toBe(0);
    });

    it("returns 0 for single element", () => {
      expect(service.pearson([1], [2])).toBe(0);
    });
  });
});
