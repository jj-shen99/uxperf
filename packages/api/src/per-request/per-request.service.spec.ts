import { Test } from "@nestjs/testing";
import { PerRequestService } from "./per-request.service";
import { DatabaseService } from "../database/database.service";

describe("PerRequestService", () => {
  let service: PerRequestService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        PerRequestService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(PerRequestService);
  });

  describe("ingest", () => {
    it("returns 0 for empty requests array", async () => {
      const count = await service.ingest({ run_id: "r-1", requests: [] });
      expect(count).toBe(0);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it("bulk inserts per-request data", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const count = await service.ingest({
        run_id: "r-1",
        requests: [
          { request_url: "https://a.com/script.js", resource_type: "script", transfer_size: 5000, duration_ms: 120 },
          { request_url: "https://a.com/style.css", resource_type: "stylesheet", transfer_size: 3000, duration_ms: 80 },
        ],
      });
      expect(count).toBe(2);
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("INSERT INTO per_request_data");
      expect(mockDb.query.mock.calls[0][1]).toHaveLength(22); // 2 rows * 11 params
    });
  });

  describe("findByRun", () => {
    it("returns per-request data for run", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "pr-1", request_url: "https://a.com/js", duration_ms: 120 }],
      });
      const rows = await service.findByRun("r-1");
      expect(rows).toHaveLength(1);
    });

    it("clamps limit to 2000", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.findByRun("r-1", 9999);
      expect(mockDb.query.mock.calls[0][1][1]).toBe(2000);
    });
  });

  describe("summarizeByRun", () => {
    it("returns aggregated summary by resource type", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { resource_type: "script", count: 5, total_transfer_size: 50000, total_content_size: 80000, avg_duration_ms: 120, avg_ttfb_ms: 30, third_party_count: 2 },
          { resource_type: "stylesheet", count: 3, total_transfer_size: 20000, total_content_size: 35000, avg_duration_ms: 60, avg_ttfb_ms: 15, third_party_count: 0 },
        ],
      });

      const summary = await service.summarizeByRun("r-1");
      expect(summary).toHaveLength(2);
      expect(summary[0].resource_type).toBe("script");
      expect(summary[0].third_party_count).toBe(2);
    });
  });
});
