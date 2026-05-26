import { Test } from "@nestjs/testing";
import { RumIngestionService } from "./rum-ingestion.service";
import { DatabaseService } from "../database/database.service";

describe("RumIngestionService", () => {
  let service: RumIngestionService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        RumIngestionService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(RumIngestionService);
  });

  describe("ingest", () => {
    it("inserts a RUM event", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "rum-1" }] });
      const result = await service.ingest({
        project_id: "p-1",
        page_url: "https://example.com/page",
        origin: "https://example.com",
        lcp_ms: 1200,
        fcp_ms: 800,
        cls: 0.05,
      });
      expect(result.id).toBe("rum-1");
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  describe("ingestBatch", () => {
    it("ingests multiple events", async () => {
      mockDb.query.mockResolvedValue({ rows: [{ id: "rum-1" }] });
      const result = await service.ingestBatch([
        { project_id: "p-1", page_url: "/a", origin: "https://example.com", lcp_ms: 100 },
        { project_id: "p-1", page_url: "/b", origin: "https://example.com", lcp_ms: 200 },
      ]);
      expect(result.ingested).toBe(2);
    });
  });

  describe("getSummary", () => {
    it("returns p75 summary", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ origin: "https://example.com", device_type: "desktop", sample_count: 1000, lcp_p75: 1500 }],
      });
      const result = await service.getSummary("p-1");
      expect(result).toHaveLength(1);
      expect(result[0].sample_count).toBe(1000);
    });
  });

  describe("getTrend", () => {
    it("returns time-series trend", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { day: "2024-01-01", p75: 1200, p50: 900, count: 500 },
          { day: "2024-01-02", p75: 1100, p50: 850, count: 520 },
        ],
      });
      const result = await service.getTrend("p-1", "lcp_ms");
      expect(result).toHaveLength(2);
    });

    it("rejects invalid metric", async () => {
      await expect(service.getTrend("p-1", "invalid_metric")).rejects.toThrow("Invalid RUM metric");
    });
  });
});
