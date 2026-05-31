/**
 * RUM Aggregation Service Tests (E-39)
 *
 * Tests hourly aggregation of raw RUM events into distribution summaries,
 * hourly trend retrieval, daily summary, and raw event purging.
 */
import { Test } from "@nestjs/testing";
import { RumAggregationService } from "./rum-aggregation.service";
import { DatabaseService } from "../database/database.service";

describe("RumAggregationService (E-39)", () => {
  let service: RumAggregationService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };

    const module = await Test.createTestingModule({
      providers: [
        RumAggregationService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get(RumAggregationService);
  });

  describe("aggregateHourly", () => {
    it("processes all 5 core web vitals metrics", async () => {
      const results = await service.aggregateHourly("proj-1");
      expect(results).toHaveLength(5);
      expect(results.map((r) => r.metric)).toEqual([
        "lcp_ms", "fcp_ms", "inp_ms", "cls", "ttfb_ms",
      ]);
    });

    it("calls DB with INSERT ... ON CONFLICT for each metric", async () => {
      await service.aggregateHourly("proj-1");
      expect(mockDb.query).toHaveBeenCalledTimes(5);
      const firstCall = mockDb.query.mock.calls[0];
      expect(firstCall[0]).toContain("INSERT INTO rum_hourly_aggregates");
      expect(firstCall[0]).toContain("ON CONFLICT");
      expect(firstCall[0]).toContain("PERCENTILE_CONT");
      expect(firstCall[1][0]).toBe("proj-1");
    });

    it("uses provided hoursBack parameter", async () => {
      await service.aggregateHourly("proj-1", 24);
      const call = mockDb.query.mock.calls[0];
      expect(call[1][2]).toBe(24);
    });

    it("defaults hoursBack to 2", async () => {
      await service.aggregateHourly("proj-1");
      const call = mockDb.query.mock.calls[0];
      expect(call[1][2]).toBe(2);
    });

    it("reports correct rows_created from DB response", async () => {
      mockDb.query.mockResolvedValue({ rows: [], rowCount: 12 });
      const results = await service.aggregateHourly("proj-1");
      expect(results[0].rows_created).toBe(12);
    });
  });

  describe("getHourlyTrend", () => {
    it("fetches hourly aggregated data for a metric", async () => {
      const mockRows = [
        { hour_bucket: "2026-01-01T00:00:00Z", p50: 1000, p75: 1500, sample_count: 100 },
        { hour_bucket: "2026-01-01T01:00:00Z", p50: 1100, p75: 1600, sample_count: 95 },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getHourlyTrend("proj-1", "lcp_ms", 7);
      expect(result).toHaveLength(2);
      expect(mockDb.query.mock.calls[0][0]).toContain("rum_hourly_aggregates");
      expect(mockDb.query.mock.calls[0][1]).toEqual(["proj-1", "lcp_ms", 7]);
    });

    it("filters by origin when provided", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.getHourlyTrend("proj-1", "lcp_ms", 7, "https://example.com");
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("origin = $4");
      expect(mockDb.query.mock.calls[0][1][3]).toBe("https://example.com");
    });

    it("filters by device type when provided", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.getHourlyTrend("proj-1", "lcp_ms", 7, undefined, "mobile");
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("device_type = $4");
    });
  });

  describe("getDailySummary", () => {
    it("returns daily p50/p75/p90/p95/p99 from hourly aggregates", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { date: "2026-01-01", p50: 1000, p75: 1500, p90: 2000, p95: 2500, p99: 3000, count: 500 },
          { date: "2026-01-02", p50: 1050, p75: 1550, p90: 2100, p95: 2600, p99: 3100, count: 480 },
        ],
      });

      const result = await service.getDailySummary("proj-1", "lcp_ms");
      expect(result).toHaveLength(2);
      expect(result[0].p75).toBe(1500);
      expect(result[0].count).toBe(500);
    });

    it("filters by origin when provided", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.getDailySummary("proj-1", "lcp_ms", 28, "https://app.com");
      expect(mockDb.query.mock.calls[0][1][3]).toBe("https://app.com");
    });
  });

  describe("purgeRawEvents", () => {
    it("deletes old raw RUM events", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1000 });
      const result = await service.purgeRawEvents("proj-1", 14);
      expect(result.deleted).toBe(1000);
      expect(mockDb.query.mock.calls[0][0]).toContain("DELETE FROM rum_events");
    });

    it("uses default retention of 14 days", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await service.purgeRawEvents("proj-1");
      expect(mockDb.query.mock.calls[0][1][1]).toBe(14);
    });

    it("uses custom retention days", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await service.purgeRawEvents("proj-1", 7);
      expect(mockDb.query.mock.calls[0][1][1]).toBe(7);
    });
  });
});
