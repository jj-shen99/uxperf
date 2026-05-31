import { Test } from "@nestjs/testing";
import { CanaryAnalysisService, CanaryResult } from "./canary-analysis.service";
import { DatabaseService } from "../database/database.service";

/**
 * Canary Analysis Service — Unit Tests (E-35)
 *
 * Ch 13, p162–164: Statistical canary vs baseline comparison.
 */

describe("CanaryAnalysisService", () => {
  let service: CanaryAnalysisService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        CanaryAnalysisService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(CanaryAnalysisService);
  });

  describe("computeStats", () => {
    it("computes basic statistics correctly", () => {
      const values = [100, 200, 300, 400, 500];
      const stats = service.computeStats("build-1", values);

      expect(stats.count).toBe(5);
      expect(stats.mean).toBe(300);
      expect(stats.median).toBe(300);
      expect(stats.p75).toBe(400);
      expect(stats.stddev).toBeGreaterThan(0);
    });

    it("handles empty values", () => {
      const stats = service.computeStats("build-1", []);
      expect(stats.count).toBe(0);
      expect(stats.mean).toBe(0);
    });

    it("handles single value", () => {
      const stats = service.computeStats("build-1", [42]);
      expect(stats.count).toBe(1);
      expect(stats.mean).toBe(42);
      expect(stats.median).toBe(42);
    });
  });

  describe("mannWhitneyU", () => {
    it("returns high p-value for identical distributions", () => {
      const a = [100, 200, 300, 400, 500];
      const b = [100, 200, 300, 400, 500];
      const p = service.mannWhitneyU(a, b);
      expect(p).toBeGreaterThan(0.05);
    });

    it("returns low p-value for clearly different distributions", () => {
      const a = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190];
      const b = [500, 510, 520, 530, 540, 550, 560, 570, 580, 590];
      const p = service.mannWhitneyU(a, b);
      expect(p).toBeLessThan(0.05);
    });

    it("returns 1 for empty arrays", () => {
      expect(service.mannWhitneyU([], [1, 2, 3])).toBe(1);
      expect(service.mannWhitneyU([1, 2], [])).toBe(1);
    });
  });

  describe("analyze", () => {
    it("returns inconclusive when insufficient samples", async () => {
      // Canary has 3 samples (< 10 default min)
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ value: "100" }, { value: "110" }, { value: "120" }] })
        .mockResolvedValueOnce({ rows: Array(15).fill({ value: "200" }) });

      const result = await service.analyze({
        project_id: "p-1",
        canary_build: "canary-v1",
        baseline_build: "baseline-v1",
        metric: "lcp_ms",
      });

      expect(result.verdict).toBe("inconclusive");
      expect(result.reason).toContain("Insufficient samples");
    });

    it("passes when no significant difference", async () => {
      // Generate similar distributions
      const canaryRows = Array.from({ length: 20 }, (_, i) => ({
        value: String(200 + (i % 5)),
      }));
      const baselineRows = Array.from({ length: 20 }, (_, i) => ({
        value: String(200 + (i % 5)),
      }));

      mockDb.query
        .mockResolvedValueOnce({ rows: canaryRows })
        .mockResolvedValueOnce({ rows: baselineRows });

      const result = await service.analyze({
        project_id: "p-1",
        canary_build: "canary-v1",
        baseline_build: "baseline-v1",
        metric: "lcp_ms",
      });

      expect(result.verdict).toBe("pass");
    });

    it("fails when canary is significantly worse", async () => {
      // Canary much slower
      const canaryRows = Array.from({ length: 20 }, (_, i) => ({
        value: String(500 + i * 10),
      }));
      const baselineRows = Array.from({ length: 20 }, (_, i) => ({
        value: String(100 + i * 2),
      }));

      mockDb.query
        .mockResolvedValueOnce({ rows: canaryRows })
        .mockResolvedValueOnce({ rows: baselineRows });

      const result = await service.analyze({
        project_id: "p-1",
        canary_build: "canary-v1",
        baseline_build: "baseline-v1",
        metric: "lcp_ms",
      });

      expect(result.verdict).toBe("fail");
      expect(result.relative_change_pct).toBeGreaterThan(0);
      expect(result.significant).toBe(true);
    });

    it("passes when canary is significantly better (improvement)", async () => {
      const canaryRows = Array.from({ length: 20 }, (_, i) => ({
        value: String(50 + i),
      }));
      const baselineRows = Array.from({ length: 20 }, (_, i) => ({
        value: String(500 + i * 10),
      }));

      mockDb.query
        .mockResolvedValueOnce({ rows: canaryRows })
        .mockResolvedValueOnce({ rows: baselineRows });

      const result = await service.analyze({
        project_id: "p-1",
        canary_build: "canary-v1",
        baseline_build: "baseline-v1",
        metric: "lcp_ms",
      });

      expect(result.verdict).toBe("pass");
      expect(result.relative_change_pct).toBeLessThan(0);
    });

    it("respects custom min_samples", async () => {
      const rows = Array(5).fill({ value: "100" });
      mockDb.query
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows });

      const result = await service.analyze({
        project_id: "p-1",
        canary_build: "c",
        baseline_build: "b",
        metric: "lcp_ms",
        min_samples: 3, // lower threshold
      });

      expect(result.verdict).not.toBe("inconclusive");
    });
  });

  describe("analyzeMultiMetric", () => {
    it("fails if any metric fails", async () => {
      // First metric: similar (pass)
      const similar = Array(15).fill({ value: "100" });
      mockDb.query
        .mockResolvedValueOnce({ rows: similar })
        .mockResolvedValueOnce({ rows: similar });

      // Second metric: canary much worse (fail)
      const canary = Array.from({ length: 15 }, (_, i) => ({ value: String(500 + i * 20) }));
      const baseline = Array.from({ length: 15 }, (_, i) => ({ value: String(100 + i) }));
      mockDb.query
        .mockResolvedValueOnce({ rows: canary })
        .mockResolvedValueOnce({ rows: baseline });

      const { results, overall_verdict } = await service.analyzeMultiMetric(
        "p-1", "canary", "baseline", ["lcp_ms", "fcp_ms"],
      );

      expect(results).toHaveLength(2);
      expect(overall_verdict).toBe("fail");
    });

    it("passes when all metrics pass", async () => {
      const similar = Array(15).fill({ value: "100" });
      mockDb.query
        .mockResolvedValueOnce({ rows: similar })
        .mockResolvedValueOnce({ rows: similar })
        .mockResolvedValueOnce({ rows: similar })
        .mockResolvedValueOnce({ rows: similar });

      const { overall_verdict } = await service.analyzeMultiMetric(
        "p-1", "canary", "baseline", ["lcp_ms", "fcp_ms"],
      );

      expect(overall_verdict).toBe("pass");
    });
  });
});
