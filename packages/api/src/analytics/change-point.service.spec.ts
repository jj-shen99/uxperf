import { Test } from "@nestjs/testing";
import { ChangePointService } from "./change-point.service";
import { DatabaseService } from "../database/database.service";

describe("ChangePointService", () => {
  let service: ChangePointService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ChangePointService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(ChangePointService);
  });

  describe("cusum", () => {
    it("returns not detected for stable series", () => {
      const values = [100, 102, 98, 101, 99, 100, 101, 98, 102, 100];
      const result = service.cusum(values);
      expect(result.detected).toBe(false);
    });

    it("detects a mean shift", () => {
      // Stable at ~100, then jump to ~200 — use lower threshold for sensitivity
      const values = [
        100, 102, 98, 101, 99, 100, 101, 98, 102, 100,
        200, 198, 202, 199, 201, 200, 198, 202, 201, 199,
      ];
      const result = service.cusum(values, 1, 0.25);
      expect(result.detected).toBe(true);
      expect(result.changeIndex).not.toBeNull();
      expect(result.magnitude).toBeGreaterThan(50);
    });

    it("returns not detected for too few values", () => {
      const result = service.cusum([1, 2, 3]);
      expect(result.detected).toBe(false);
      expect(result.cumSum).toEqual([]);
    });

    it("handles constant values (zero stddev)", () => {
      const result = service.cusum([5, 5, 5, 5, 5, 5]);
      expect(result.detected).toBe(false);
    });
  });

  describe("ewma", () => {
    it("returns not detected for stable series", () => {
      const values = [100, 102, 98, 101, 99, 100, 101, 98, 102, 100];
      const result = service.ewma(values);
      expect(result.detected).toBe(false);
    });

    it("detects drift in series", () => {
      const values = [
        100, 102, 98, 101, 99, 100, 101, 98, 102, 100,
        500, 498, 502, 499, 501, 500, 498, 502, 501, 499,
      ];
      const result = service.ewma(values, 0.5, 2.0);
      expect(result.detected).toBe(true);
      expect(result.changeIndex).not.toBeNull();
    });

    it("returns not detected for too few values", () => {
      const result = service.ewma([1, 2]);
      expect(result.detected).toBe(false);
    });

    it("handles constant values", () => {
      const result = service.ewma([5, 5, 5, 5, 5, 5]);
      expect(result.detected).toBe(false);
      expect(result.currentEwma).toBe(5);
    });
  });

  describe("detectForProject", () => {
    it("returns empty for insufficient data", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "r-1", metrics: { lcp_ms: 100 }, finished_at: "2026-01-01" }] });
      const results = await service.detectForProject("p-1");
      expect(results).toEqual([]);
    });

    it("detects change points across metrics", async () => {
      const rows = [];
      // 20 stable runs, then 20 regressed runs — big shift for reliable detection
      for (let i = 0; i < 20; i++) {
        rows.push({ id: `r-${i}`, metrics: { lcp_ms: 2000 }, finished_at: `2026-01-${String(i + 1).padStart(2, '0')}` });
      }
      for (let i = 20; i < 40; i++) {
        rows.push({ id: `r-${i}`, metrics: { lcp_ms: 5000 }, finished_at: `2026-02-${String(i - 19).padStart(2, '0')}` });
      }
      mockDb.query.mockResolvedValueOnce({ rows });

      const results = await service.detectForProject("p-1");
      const lcpResults = results.filter((r) => r.metric === "lcp_ms");
      expect(lcpResults.length).toBeGreaterThan(0);
      expect(lcpResults[0].detected).toBe(true);
    });
  });
});
