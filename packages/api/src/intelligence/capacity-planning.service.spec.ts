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

    it("returns empty report gracefully when DB query fails", async () => {
      mockDb.query.mockRejectedValueOnce(new Error("relation \"load_runs\" does not exist"));
      const report = await service.generateReport("p-1");
      expect(report.max_sustainable_vus).toBeNull();
      expect(report.load_runs_analyzed).toHaveLength(0);
      expect(report.recommendations).toHaveLength(0);
    });

    it("returns report even when saveReport fails", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { id: "lr-1", target_vus: 20, actual_peak_vus: 20, metrics_summary: { http_req_duration_p95: 500 }, saturation_warnings: [] },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ peak_cpu: 60, peak_memory: 50, peak_lag: 30 }] }) // analyzeResources
        .mockRejectedValueOnce(new Error("relation \"capacity_reports\" does not exist")); // saveReport fails

      const report = await service.generateReport("p-1");
      expect(report.max_sustainable_vus).toBe(20);
      expect(report.load_runs_analyzed).toHaveLength(1);
    });
  });

  describe("listReports", () => {
    it("returns empty array when DB query fails", async () => {
      mockDb.query.mockRejectedValueOnce(new Error("connection refused"));
      const result = await service.listReports("p-1");
      expect(result).toEqual([]);
    });

    it("returns rows on success", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "cap-1" }] });
      const result = await service.listReports("p-1");
      expect(result).toHaveLength(1);
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

  // Regression: evaluateCondition must return true for unknown operators (fail-open)
  describe("evaluateCondition via evaluateResourceFloor — operator handling", () => {
    it.each([
      { operator: "lt", value: 45, threshold: 80, expected: true },
      { operator: "lt", value: 85, threshold: 80, expected: false },
      { operator: "lte", value: 80, threshold: 80, expected: true },
      { operator: "lte", value: 81, threshold: 80, expected: false },
      { operator: "gt", value: 85, threshold: 80, expected: true },
      { operator: "gt", value: 75, threshold: 80, expected: false },
      { operator: "gte", value: 80, threshold: 80, expected: true },
      { operator: "gte", value: 79, threshold: 80, expected: false },
    ])(
      "$operator: $value vs $threshold => $expected",
      async ({ operator, value, threshold, expected }) => {
        mockDb.query.mockResolvedValueOnce({
          rows: [{ host: "app-01", value }],
        });
        const result = await service.evaluateResourceFloor("lr-1", [
          { metric: "cpu_percent", operator: operator as any, threshold, host_pattern: "*" },
        ]);
        expect(result.results[0].passed).toBe(expected);
      },
    );

    it("returns true (pass) for unknown operator (regression: was false)", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ host: "app-01", value: 50 }],
      });
      const result = await service.evaluateResourceFloor("lr-1", [
        { metric: "cpu_percent", operator: "invalid_op" as any, threshold: 80, host_pattern: "*" },
      ]);
      expect(result.results[0].passed).toBe(true);
      expect(result.overall_passed).toBe(true);
    });
  });

  // Regression: analyzeResources must use ANY($1::uuid[]) cast
  describe("analyzeResources SQL — uuid array cast", () => {
    it("passes loadRunIds array and uses ::uuid[] cast in query", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { id: "lr-1", target_vus: 20, actual_peak_vus: 20, metrics_summary: null, saturation_warnings: [] },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ peak_cpu: 60, peak_memory: 50, peak_lag: 30 }] }) // analyzeResources
        .mockResolvedValueOnce({ rows: [{ id: "cap-1" }] }); // saveReport

      await service.generateReport("p-1");

      // The second DB call is analyzeResources — verify it uses uuid[] cast
      const analyzeCall = mockDb.query.mock.calls[1];
      expect(analyzeCall[0]).toContain("ANY($1::uuid[])");
      expect(analyzeCall[1]).toEqual([["lr-1"]]);
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
