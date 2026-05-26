import { Test } from "@nestjs/testing";
import { AttributionService } from "./attribution.service";
import { DatabaseService } from "../database/database.service";

describe("AttributionService", () => {
  let service: AttributionService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        AttributionService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(AttributionService);
  });

  describe("attributeRegression", () => {
    it("returns attribution result with explanation", async () => {
      // Mock run metrics
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ metrics: { lcp_ms: 2000 } }] })   // baseline run
        .mockResolvedValueOnce({ rows: [{ metrics: { lcp_ms: 3000 } }] })   // regression run
        // Phase attribution: baseline summary
        .mockResolvedValueOnce({
          rows: [
            { resource_type: "script", avg_duration: "100", avg_ttfb: "20", total_transfer: "50000" },
            { resource_type: "image", avg_duration: "200", avg_ttfb: "30", total_transfer: "120000" },
          ],
        })
        // Phase attribution: regression summary
        .mockResolvedValueOnce({
          rows: [
            { resource_type: "script", avg_duration: "150", avg_ttfb: "25", total_transfer: "55000" },
            { resource_type: "image", avg_duration: "450", avg_ttfb: "80", total_transfer: "200000" },
          ],
        })
        // Request attribution: regression top requests
        .mockResolvedValueOnce({
          rows: [
            { request_url: "https://cdn.example.com/hero.jpg", duration_ms: 450, resource_type: "image", is_third_party: false },
          ],
        })
        // Request attribution: baseline requests
        .mockResolvedValueOnce({
          rows: [
            { request_url: "https://cdn.example.com/hero.jpg", duration_ms: 200 },
          ],
        });

      const result = await service.attributeRegression("base-run", "reg-run", "lcp_ms");

      expect(result.metric).toBe("lcp_ms");
      expect(result.regression_ms).toBe(1000);
      expect(result.attributions.length).toBeGreaterThan(0);
      expect(result.explanation).toContain("lcp_ms");
      expect(result.explanation).toContain("regressed");
    });

    it("handles missing run metrics gracefully", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })   // baseline not found
        .mockResolvedValueOnce({ rows: [] })   // regression not found
        .mockResolvedValueOnce({ rows: [] })   // phase baseline
        .mockResolvedValueOnce({ rows: [] })   // phase regression
        .mockResolvedValueOnce({ rows: [] })   // request regression
        .mockResolvedValueOnce({ rows: [] });  // request baseline

      const result = await service.attributeRegression("x", "y", "lcp_ms");
      expect(result.regression_ms).toBe(0);
      expect(result.explanation).toContain("no specific per-request attribution");
    });

    it("identifies third-party attributions", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ metrics: { lcp_ms: 2000 } }] })
        .mockResolvedValueOnce({ rows: [{ metrics: { lcp_ms: 3500 } }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            { request_url: "https://ads.vendor.com/tag.js", duration_ms: 800, resource_type: "script", is_third_party: true },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ request_url: "https://ads.vendor.com/tag.js", duration_ms: 100 }],
        });

      const result = await service.attributeRegression("b", "r", "lcp_ms");
      const thirdParty = result.attributions.filter((a) => a.type === "third_party");
      expect(thirdParty.length).toBeGreaterThan(0);
    });
  });
});
