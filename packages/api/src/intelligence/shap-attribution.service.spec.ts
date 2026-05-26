import { Test } from "@nestjs/testing";
import { ShapAttributionService } from "./shap-attribution.service";
import { DatabaseService } from "../database/database.service";

describe("ShapAttributionService", () => {
  let service: ShapAttributionService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ShapAttributionService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(ShapAttributionService);
  });

  describe("computeAttribution", () => {
    it("returns insufficient data when < 10 samples", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: Array(5).fill({ metrics: { lcp_ms: 100 }, created_at: "2024-01-01" }) });
      const result = await service.computeAttribution({
        project_id: "p-1",
        target_metric: "lcp_ms",
      });
      expect(result.confidence).toBe(0);
      expect(result.explanation).toContain("Insufficient");
    });

    it("computes attribution with sufficient data", async () => {
      const runs = Array.from({ length: 20 }, (_, i) => ({
        metrics: {
          lcp_ms: 100 + i * 10,
          fcp_ms: 50 + i * 5,
          ttfb_ms: 30 + i * 3,
          total_requests: 20 + i,
        },
        created_at: new Date(2024, 0, i + 1).toISOString(),
      }));
      mockDb.query
        .mockResolvedValueOnce({ rows: runs }) // buildFeatureMatrix
        .mockResolvedValueOnce({ rows: [{ id: "attr-1" }] }); // saveAttribution

      const result = await service.computeAttribution({
        project_id: "p-1",
        target_metric: "lcp_ms",
      });

      expect(result.feature_importances.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.explanation).toContain("lcp_ms");
    });
  });

  describe("computePermutationImportance", () => {
    it("computes feature importances", () => {
      const features = [
        [1, 10], [2, 20], [3, 30], [4, 40], [5, 50],
      ];
      const target = [100, 200, 300, 400, 500];
      const names = ["feature_a", "feature_b"];

      const result = service.computePermutationImportance(features, target, names);
      expect(result.length).toBe(2);
      // Both features are perfectly correlated with target
      expect(Math.abs(result[0].shap_value)).toBeGreaterThan(0);
    });

    it("returns empty for single row", () => {
      expect(service.computePermutationImportance([[1]], [1], ["a"])).toHaveLength(0);
    });
  });

  describe("listAttributions", () => {
    it("returns attributions", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "attr-1" }] });
      const result = await service.listAttributions("p-1");
      expect(result).toHaveLength(1);
    });
  });
});
