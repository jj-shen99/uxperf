import { Test } from "@nestjs/testing";
import { CapacityPlanningService } from "./capacity-planning.service";
import { DatabaseService } from "../database/database.service";

describe("CapacityPlanningService", () => {
  let service: CapacityPlanningService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        CapacityPlanningService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(CapacityPlanningService);
  });

  describe("generateReport", () => {
    it("returns empty report with no load runs", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const report = await service.generateReport("p-1");
      expect(report.max_sustainable_vus).toBeNull();
      expect(report.recommendations).toHaveLength(0);
    });

    it("generates report with load runs", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { id: "lr-1", target_vus: 20, actual_peak_vus: 20, metrics_summary: { http_req_duration_p95: 500 }, saturation_warnings: [] },
            { id: "lr-2", target_vus: 50, actual_peak_vus: 50, metrics_summary: { http_req_duration_p95: 1200 }, saturation_warnings: [{ message: "high latency" }] },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ peak_cpu: 85, peak_memory: 70, peak_lag: 50 }] }) // analyzeResources
        .mockResolvedValueOnce({ rows: [{ id: "cap-1" }] }); // saveReport

      const report = await service.generateReport("p-1");
      expect(report.max_sustainable_vus).toBe(20);
      expect(report.load_runs_analyzed).toHaveLength(2);
      expect(report.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe("evaluateResourceFloor", () => {
    it("evaluates passing floor conditions", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ host: "app-01", value: 45 }],
      });

      const result = await service.evaluateResourceFloor("lr-1", [
        { metric: "cpu_percent", operator: "lt", threshold: 80, host_pattern: "*" },
      ]);
      expect(result.overall_passed).toBe(true);
      expect(result.results[0].passed).toBe(true);
    });

    it("evaluates failing floor conditions", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ host: "app-01", value: 92 }],
      });

      const result = await service.evaluateResourceFloor("lr-1", [
        { metric: "cpu_percent", operator: "lt", threshold: 80, host_pattern: "*" },
      ]);
      expect(result.overall_passed).toBe(false);
    });
  });

  describe("evaluateCapacityFloor", () => {
    it("passes when VUs and lag are within limits", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ actual_peak_vus: 60 }] })
        .mockResolvedValueOnce({ rows: [{ max_lag: 50 }] });

      const result = await service.evaluateCapacityFloor("lr-1", {
        min_sustainable_vus: 50,
        max_event_loop_lag_ms: 100,
      });
      expect(result.passed).toBe(true);
    });

    it("fails when VUs below floor", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ actual_peak_vus: 30 }] })
        .mockResolvedValueOnce({ rows: [{ max_lag: 50 }] });

      const result = await service.evaluateCapacityFloor("lr-1", {
        min_sustainable_vus: 50,
        max_event_loop_lag_ms: 100,
      });
      expect(result.passed).toBe(false);
    });
  });
});
