import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { DatabaseService } from "../database/database.service";

describe("ReportsService", () => {
  let service: ReportsService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  describe("generateExecutiveReport", () => {
    it("returns a full report structure", async () => {
      // CWV
      mockDb.query.mockResolvedValueOnce({
        rows: [{ lcp_p75: "2200", fcp_p75: "900", cls_p75: "0.05", inp_p75: "150", ttfb_p75: "400" }],
      });
      // Run stats
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total: "20", completed: "18", failed: "2" }],
      });
      // Gate stats
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total: "40", passed: "35", failed: "5" }],
      });
      // Anomaly stats
      mockDb.query.mockResolvedValueOnce({
        rows: [{ total: "3", critical: "1", resolved: "2" }],
      });
      // Trend directions (4 queries, one per metric)
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ first_half: "2200", second_half: "2000" }] })
        .mockResolvedValueOnce({ rows: [{ first_half: "900", second_half: "850" }] })
        .mockResolvedValueOnce({ rows: [{ first_half: "0.06", second_half: "0.05" }] })
        .mockResolvedValueOnce({ rows: [{ first_half: "400", second_half: "410" }] });
      // Persist snapshot
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const report = await service.generateExecutiveReport("p-1", 30);

      expect(report.period.days).toBe(30);
      expect(report.core_web_vitals.lcp_p75_ms).toBe(2200);
      expect(report.run_stats.total_runs).toBe(20);
      expect(report.run_stats.pass_rate).toBe(90);
      expect(report.gate_stats.pass_rate).toBe(88);
      expect(report.anomalies.total).toBe(3);
      expect(report.trend_direction).toBeDefined();
    });

    it("handles empty data", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] })    // CWV
        .mockResolvedValueOnce({ rows: [{ total: "0", completed: "0", failed: "0" }] })
        .mockResolvedValueOnce({ rows: [{ total: "0", passed: "0", failed: "0" }] })
        .mockResolvedValueOnce({ rows: [{ total: "0", critical: "0", resolved: "0" }] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [] });

      const report = await service.generateExecutiveReport("p-1", 7);
      expect(report.core_web_vitals.lcp_p75_ms).toBeNull();
      expect(report.run_stats.total_runs).toBe(0);
      expect(report.run_stats.pass_rate).toBe(0);
    });
  });

  describe("listReports", () => {
    it("returns saved snapshots", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "rpt-1", report_type: "executive" }],
      });
      const result = await service.listReports("p-1");
      expect(result).toHaveLength(1);
    });

    it("filters by type", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.listReports("p-1", "team_scorecard");
      expect(mockDb.query.mock.calls[0][1]).toContain("team_scorecard");
    });
  });

  describe("getReport", () => {
    it("returns report by id", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "rpt-1" }] });
      const result = await service.getReport("rpt-1");
      expect(result.id).toBe("rpt-1");
    });

    it("throws NotFoundException", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getReport("nope")).rejects.toThrow(NotFoundException);
    });
  });
});
