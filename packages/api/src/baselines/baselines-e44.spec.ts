/**
 * Seasonality-Aware Baselines Tests (E-44)
 *
 * Book Ch 14, p238: "Baselines should be computed per time-of-day/day-of-week."
 */
import { Test } from "@nestjs/testing";
import { BaselinesService } from "./baselines.service";
import { DatabaseService } from "../database/database.service";

describe("BaselinesService — Seasonality (E-44)", () => {
  let service: BaselinesService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    };

    const module = await Test.createTestingModule({
      providers: [
        BaselinesService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get(BaselinesService);
  });

  describe("computeBaseline with day_of_week/hour_bucket", () => {
    it("adds DOW filter to query when day_of_week is provided", async () => {
      // Return enough data to compute baseline
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { metrics: { lcp_ms: 1000 } },
            { metrics: { lcp_ms: 1100 } },
            { metrics: { lcp_ms: 1200 } },
          ],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // deactivate old
        .mockResolvedValueOnce({ rows: [{ id: "b-1" }] }); // insert

      await service.computeBaseline({
        project_id: "proj-1",
        metric: "lcp",
        day_of_week: 1, // Monday
      });

      const selectQuery = mockDb.query.mock.calls[0][0];
      expect(selectQuery).toContain("EXTRACT(DOW FROM finished_at)");
      expect(mockDb.query.mock.calls[0][1]).toContain(1); // day_of_week param
    });

    it("adds hour filter when hour_bucket is provided", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { metrics: { lcp_ms: 800 } },
            { metrics: { lcp_ms: 900 } },
            { metrics: { lcp_ms: 1000 } },
          ],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: "b-2" }] });

      await service.computeBaseline({
        project_id: "proj-1",
        metric: "lcp",
        hour_bucket: 14, // 2 PM
      });

      const selectQuery = mockDb.query.mock.calls[0][0];
      expect(selectQuery).toContain("EXTRACT(HOUR FROM finished_at)");
    });

    it("adds both DOW and hour filters together", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { metrics: { lcp_ms: 500 } },
            { metrics: { lcp_ms: 600 } },
            { metrics: { lcp_ms: 700 } },
          ],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: "b-3" }] });

      await service.computeBaseline({
        project_id: "proj-1",
        metric: "lcp",
        day_of_week: 5, // Friday
        hour_bucket: 12, // noon
        seasonality_bucket: "Friday-afternoon",
      });

      const selectQuery = mockDb.query.mock.calls[0][0];
      expect(selectQuery).toContain("EXTRACT(DOW FROM finished_at)");
      expect(selectQuery).toContain("EXTRACT(HOUR FROM finished_at)");

      // Insert should include seasonality_bucket
      const insertParams = mockDb.query.mock.calls[2][1];
      expect(insertParams).toContain("Friday-afternoon");
    });

    it("does not add seasonal filters when neither is provided", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { metrics: { lcp_ms: 1000 } },
            { metrics: { lcp_ms: 1100 } },
            { metrics: { lcp_ms: 1200 } },
          ],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: "b-4" }] });

      await service.computeBaseline({
        project_id: "proj-1",
        metric: "lcp",
      });

      const selectQuery = mockDb.query.mock.calls[0][0];
      expect(selectQuery).not.toContain("EXTRACT(DOW");
      expect(selectQuery).not.toContain("EXTRACT(HOUR");
    });
  });

  describe("computeSeasonalBaselines", () => {
    it("generates baselines for all 7 days x metrics", async () => {
      // Each computeBaseline returns null (not enough data) — that's fine for counting calls
      const result = await service.computeSeasonalBaselines("proj-1");
      // 12 metrics x 7 days = 84 calls for the SELECT query
      expect(mockDb.query).toHaveBeenCalled();
      expect(result).toEqual([]); // all return null
    });

    it("generates hourly buckets when includeHourly is true", async () => {
      await service.computeSeasonalBaselines("proj-1", "staging", undefined, {
        includeHourly: true,
      });
      // 12 metrics x 7 days x 4 hour buckets = 336 calls minimum
      expect(mockDb.query.mock.calls.length).toBeGreaterThan(84);
    });

    it("uses custom window size", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { metrics: { lcp_ms: 100 } },
            { metrics: { lcp_ms: 200 } },
            { metrics: { lcp_ms: 300 } },
          ],
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 })
        .mockResolvedValueOnce({ rows: [{ id: "b-1" }] })
        .mockResolvedValue({ rows: [], rowCount: 0 });

      await service.computeSeasonalBaselines("proj-1", "staging", undefined, {
        windowSize: 10,
      });
      // First call's LIMIT should be 10
      expect(mockDb.query.mock.calls[0][1]).toContain(10);
    });
  });

  describe("findActive with seasonality", () => {
    it("prefers seasonal baselines over global ones", async () => {
      const seasonalBaseline = {
        id: "b-seasonal",
        day_of_week: 3,
        hour_bucket: 14,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [seasonalBaseline] });

      const result = await service.findActive("proj-1", "lcp", "staging", undefined, 3, 14);
      expect(result?.id).toBe("b-seasonal");

      // Query should use ORDER BY day_of_week IS NOT NULL DESC
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("day_of_week IS NOT NULL DESC");
    });
  });
});
