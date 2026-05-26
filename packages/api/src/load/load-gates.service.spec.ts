import { Test } from "@nestjs/testing";
import { LoadGatesService } from "./load-gates.service";
import { DatabaseService } from "../database/database.service";

describe("LoadGatesService", () => {
  let service: LoadGatesService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        LoadGatesService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(LoadGatesService);
  });

  describe("evaluateForLoadRun", () => {
    it("evaluates passing gate", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: "g-1",
          name: "LCP under load",
          metric: "lcp_ms",
          vu_thresholds: [
            { min_vus: 1, max_vus: 10, threshold_value: 2000 },
            { min_vus: 11, max_vus: 50, threshold_value: 3000 },
            { min_vus: 51, max_vus: 100, threshold_value: 5000 },
          ],
          load_profile_id: null,
        }],
      });

      const result = await service.evaluateForLoadRun("lr-1", 25, { browser_lcp_p95: 2500 });
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("passed");
      expect(result[0].tier_used.min_vus).toBe(11);
      expect(result[0].tier_used.max_vus).toBe(50);
    });

    it("evaluates failing gate", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: "g-1",
          name: "LCP under load",
          metric: "lcp_ms",
          vu_thresholds: [
            { min_vus: 1, max_vus: 50, threshold_value: 2000 },
          ],
          load_profile_id: null,
        }],
      });

      const result = await service.evaluateForLoadRun("lr-1", 25, { browser_lcp_p95: 3000 });
      expect(result[0].status).toBe("failed");
    });

    it("skips when no tier matches", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: "g-1",
          name: "LCP under load",
          metric: "lcp_ms",
          vu_thresholds: [
            { min_vus: 100, max_vus: 200, threshold_value: 5000 },
          ],
          load_profile_id: null,
        }],
      });

      const result = await service.evaluateForLoadRun("lr-1", 5, { browser_lcp_p95: 1000 });
      expect(result[0].status).toBe("skipped");
    });
  });

  describe("resolveTier", () => {
    const tiers = [
      { min_vus: 1, max_vus: 10, threshold_value: 2000 },
      { min_vus: 11, max_vus: 50, threshold_value: 3000 },
      { min_vus: 51, max_vus: 100, threshold_value: 5000 },
    ];

    it("resolves correct tier", () => {
      expect(service.resolveTier(tiers, 5)?.threshold_value).toBe(2000);
      expect(service.resolveTier(tiers, 25)?.threshold_value).toBe(3000);
      expect(service.resolveTier(tiers, 75)?.threshold_value).toBe(5000);
    });

    it("uses highest tier for overflow", () => {
      expect(service.resolveTier(tiers, 150)?.threshold_value).toBe(5000);
    });

    it("returns null for empty tiers", () => {
      expect(service.resolveTier([], 10)).toBeNull();
    });
  });
});
