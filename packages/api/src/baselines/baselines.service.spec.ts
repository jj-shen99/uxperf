import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { BaselinesService } from "./baselines.service";
import { DatabaseService } from "../database/database.service";

// ============================================================
// Baselines Service — Unit Tests
// Techniques: EP, boundary, decision tree, structural, primary path
// ============================================================

describe("BaselinesService", () => {
  let service: BaselinesService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        BaselinesService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(BaselinesService);
  });

  // -- percentile --
  describe("percentile", () => {
    it("returns 0 for empty array (boundary)", () => {
      expect(service.percentile([], 0.5)).toBe(0);
    });

    it("returns single value for single-element array (boundary)", () => {
      expect(service.percentile([42], 0.5)).toBe(42);
    });

    it("computes correct p50 for even-length sorted array", () => {
      expect(service.percentile([10, 20, 30, 40], 0.5)).toBeCloseTo(25, 5);
    });

    it("computes correct p75 for sorted array", () => {
      expect(service.percentile([100, 200, 300, 400, 500], 0.75)).toBeCloseTo(400, 5);
    });

    it("computes correct p95 for larger array", () => {
      const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
      const p95 = service.percentile(sorted, 0.95);
      expect(p95).toBeCloseTo(95.05, 1);
    });

    it("p0 returns first element, p100 returns last (boundary)", () => {
      expect(service.percentile([10, 20, 30], 0)).toBe(10);
      expect(service.percentile([10, 20, 30], 1)).toBe(30);
    });
  });

  // -- findAll --
  describe("findAll", () => {
    it("returns all baselines when no projectId (primary path)", async () => {
      const rows = [{ id: "b-1" }, { id: "b-2" }];
      mockDb.query.mockResolvedValueOnce({ rows });
      const result = await service.findAll();
      expect(result).toEqual(rows);
      expect(mockDb.query.mock.calls[0][0]).not.toContain("project_id");
    });

    it("filters by projectId when provided (EP)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "b-1" }] });
      const result = await service.findAll("p-1");
      expect(result).toHaveLength(1);
      expect(mockDb.query.mock.calls[0][1]).toEqual(["p-1"]);
    });
  });

  // -- findActive --
  describe("findActive", () => {
    it("returns active baseline (primary path)", async () => {
      const baseline = { id: "b-1", metric: "lcp", is_active: true };
      mockDb.query.mockResolvedValueOnce({ rows: [baseline] });
      const result = await service.findActive("p-1", "lcp", "staging");
      expect(result).toEqual(baseline);
    });

    it("returns null when no active baseline (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.findActive("p-1", "lcp", "staging");
      expect(result).toBeNull();
    });
  });

  // -- findById --
  describe("findById", () => {
    it("returns baseline by id (primary path)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "b-1" }] });
      const result = await service.findById("b-1");
      expect(result.id).toBe("b-1");
    });

    it("throws NotFoundException when not found (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findById("b-missing")).rejects.toThrow(NotFoundException);
    });
  });

  // -- delete --
  describe("delete", () => {
    it("deletes baseline (primary path)", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.delete("b-1")).resolves.toBeUndefined();
    });

    it("throws NotFoundException when not found (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.delete("b-missing")).rejects.toThrow(NotFoundException);
    });
  });

  // -- computeBaseline --
  describe("computeBaseline", () => {
    it("returns null when fewer than 3 samples (boundary)", async () => {
      // Only 2 completed runs
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { metrics: { lcp_ms: 1000 } },
          { metrics: { lcp_ms: 2000 } },
        ],
      });

      const result = await service.computeBaseline({
        project_id: "p-1",
        metric: "lcp",
      });
      expect(result).toBeNull();
    });

    it("computes baseline from completed runs (primary path)", async () => {
      const metricsRows = [
        { metrics: { lcp_ms: 1000 } },
        { metrics: { lcp_ms: 1500 } },
        { metrics: { lcp_ms: 2000 } },
        { metrics: { lcp_ms: 2500 } },
        { metrics: { lcp_ms: 3000 } },
      ];
      // Fetch run metrics
      mockDb.query.mockResolvedValueOnce({ rows: metricsRows });
      // Deactivate old baselines
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // INSERT new baseline
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: "b-new",
          metric: "lcp",
          p50: 2000,
          p75: 2500,
          mean: 2000,
          sample_size: 5,
          is_active: true,
        }],
      });

      const result = await service.computeBaseline({
        project_id: "p-1",
        metric: "lcp",
      });

      expect(result).not.toBeNull();
      expect(result!.id).toBe("b-new");
      // Verify deactivation query was called
      expect(mockDb.query.mock.calls[1][0]).toContain("is_active = false");
      // Verify INSERT
      expect(mockDb.query.mock.calls[2][0]).toContain("INSERT INTO baselines");
    });

    it("skips rows where metric key is not a number (structural)", async () => {
      const metricsRows = [
        { metrics: { lcp_ms: 1000 } },
        { metrics: { lcp_ms: "bad" } },   // not a number
        { metrics: { lcp_ms: null } },     // null
        { metrics: { lcp_ms: 2000 } },
        { metrics: { lcp_ms: 3000 } },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: metricsRows });
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "b-1", metric: "lcp", sample_size: 3 }],
      });

      const result = await service.computeBaseline({
        project_id: "p-1",
        metric: "lcp",
      });
      expect(result).not.toBeNull();
      // INSERT params: sample_size should be 3 (only numeric values)
      const insertParams = mockDb.query.mock.calls[2][1];
      expect(insertParams[10]).toBe(3); // sample_size at index 10
    });
  });

  // -- refreshBaselines --
  describe("refreshBaselines", () => {
    it("computes baselines for all metric keys (structural)", async () => {
      // Each metric's computeBaseline will query once and get < 3 results
      mockDb.query.mockResolvedValue({ rows: [] });

      const results = await service.refreshBaselines("p-1", "staging");
      // All metrics return null (not enough data) → empty results
      expect(results).toEqual([]);
      // Should have been called once per metric key
      expect(mockDb.query.mock.calls.length).toBeGreaterThanOrEqual(10);
    });
  });
});
