/**
 * Regression tests for Phase 2 bugs found during audit.
 */
import { Test } from "@nestjs/testing";
import { PerRequestService } from "../per-request/per-request.service";
import { TrendsService } from "../trends/trends.service";
import { ScheduleDispatcherService } from "../schedules/schedule-dispatcher.service";
import { SchedulesService } from "../schedules/schedules.service";
import { RunsService } from "../runs/runs.service";
import { DatabaseService } from "../database/database.service";

describe("Phase 2 Bug Regressions", () => {
  // BUG-1: PerRequestService.ingest was missing protocol column in INSERT
  describe("BUG-1: per-request ingest includes protocol", () => {
    it("stores protocol field from DTO", async () => {
      const mockDb = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      const module = await Test.createTestingModule({
        providers: [
          PerRequestService,
          { provide: DatabaseService, useValue: mockDb },
        ],
      }).compile();
      const service = module.get(PerRequestService);

      await service.ingest({
        run_id: "r-1",
        requests: [
          { request_url: "https://a.com/js", protocol: "h2", duration_ms: 100 },
        ],
      });

      const sql = mockDb.query.mock.calls[0][0] as string;
      expect(sql).toContain("protocol");
      // protocol should be in params (11 params per row: pos 10 is protocol)
      const params = mockDb.query.mock.calls[0][1];
      expect(params[9]).toBe("h2");
    });
  });

  // BUG-2: TrendsService returned NaN instead of null for non-numeric metric values
  describe("BUG-2: trends NaN → null coercion", () => {
    it("returns null for non-numeric metric value", async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue({
          rows: [{ run_id: "r-1", finished_at: "2026-01-01", environment: "staging", lcp_ms: "abc" }],
        }),
      };
      const module = await Test.createTestingModule({
        providers: [
          TrendsService,
          { provide: DatabaseService, useValue: mockDb },
        ],
      }).compile();
      const service = module.get(TrendsService);

      const result = await service.getMetricTrends("p-1", ["lcp_ms"]);
      expect(result[0].lcp_ms).toBeNull();
      // Verify it's NOT NaN
      expect(Number.isNaN(result[0].lcp_ms)).toBe(false);
    });

    it("returns null for empty string metric", async () => {
      const mockDb = {
        query: jest.fn().mockResolvedValue({
          rows: [{ run_id: "r-1", finished_at: "2026-01-01", environment: "staging", lcp_ms: "" }],
        }),
      };
      const module = await Test.createTestingModule({
        providers: [
          TrendsService,
          { provide: DatabaseService, useValue: mockDb },
        ],
      }).compile();
      const service = module.get(TrendsService);

      const result = await service.getMetricTrends("p-1", ["lcp_ms"]);
      expect(result[0].lcp_ms).toBeNull();
    });
  });

  // BUG-3: ScheduleDispatcherService setTimeout not cleared on destroy
  describe("BUG-3: scheduler cleans up timeout on destroy", () => {
    it("clears both interval and timeout handles on destroy", async () => {
      const mockSchedules = { findDueSchedules: jest.fn().mockResolvedValue([]) };
      const mockRuns = {};
      const module = await Test.createTestingModule({
        providers: [
          ScheduleDispatcherService,
          { provide: SchedulesService, useValue: mockSchedules },
          { provide: RunsService, useValue: mockRuns },
        ],
      }).compile();
      const service = module.get(ScheduleDispatcherService);

      // Start the service (creates both interval and timeout)
      service.onModuleInit();

      // Verify handles were created (internal state check)
      expect((service as any).intervalHandle).not.toBeNull();
      expect((service as any).timeoutHandle).not.toBeNull();

      // Destroy should clear both
      service.onModuleDestroy();
      expect((service as any).intervalHandle).toBeNull();
      expect((service as any).timeoutHandle).toBeNull();
    });
  });
});
