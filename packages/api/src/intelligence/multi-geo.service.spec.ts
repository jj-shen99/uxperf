import { Test } from "@nestjs/testing";
import { MultiGeoService } from "./multi-geo.service";
import { DatabaseService } from "../database/database.service";

describe("MultiGeoService", () => {
  let service: MultiGeoService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        MultiGeoService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(MultiGeoService);
  });

  describe("listLocations", () => {
    it("returns all active locations", () => {
      const locations = service.listLocations();
      expect(locations.length).toBeGreaterThan(0);
      expect(locations.every((l) => l.is_active)).toBe(true);
    });

    it("filters by provider", () => {
      const wpt = service.listLocations("wpt");
      expect(wpt.every((l) => l.provider === "wpt")).toBe(true);

      const k6 = service.listLocations("k6");
      expect(k6.every((l) => l.provider === "k6")).toBe(true);
    });
  });

  describe("dispatch", () => {
    it("dispatches multi-geo run", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // insert run
      const result = await service.dispatch({
        project_id: "p-1",
        url: "https://example.com",
        locations: ["us-east-1", "eu-west-1"],
        engine: "k6_browser",
      });
      expect(result.locations).toHaveLength(2);
      expect(result.project_id).toBe("p-1");
    });

    it("throws on no valid locations", async () => {
      await expect(
        service.dispatch({
          project_id: "p-1",
          url: "https://example.com",
          locations: ["invalid-region"],
          engine: "k6_browser",
        }),
      ).rejects.toThrow("No valid geo locations");
    });
  });

  describe("compareResults", () => {
    it("compares metrics across regions", () => {
      const results = [
        { location: "us-east-1", region: "us-east-1", status: "completed" as const, metrics: { lcp_ms: 1200, fcp_ms: 800 } },
        { location: "eu-west-1", region: "eu-west-1", status: "completed" as const, metrics: { lcp_ms: 1800, fcp_ms: 1100 } },
        { location: "ap-southeast-1", region: "ap-southeast-1", status: "completed" as const, metrics: { lcp_ms: 2500, fcp_ms: 1500 } },
      ];

      const comparisons = service.compareResults(results);
      const lcpComp = comparisons.find((c) => c.metric === "lcp_ms");
      expect(lcpComp).toBeDefined();
      expect(lcpComp!.best_region).toBe("us-east-1");
      expect(lcpComp!.worst_region).toBe("ap-southeast-1");
      expect(lcpComp!.range_ms).toBe(1300);
    });

    it("returns empty for single result", () => {
      expect(service.compareResults([
        { location: "us-east-1", region: "us-east-1", status: "completed", metrics: { lcp_ms: 1200 } },
      ])).toHaveLength(0);
    });
  });
});
