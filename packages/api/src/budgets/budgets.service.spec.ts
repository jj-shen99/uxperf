import { Test } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { BudgetsService, BudgetRow, DeviceClass } from "./budgets.service";
import { DatabaseService } from "../database/database.service";
import { BaselinesService } from "../baselines/baselines.service";

/**
 * Budgets Service — Unit Tests (E-28 through E-31)
 *
 * Covers:
 *   E-28: Performance budget CRUD + route-level evaluation
 *   E-29: Ratchet-on-improvement (auto-tighten)
 *   E-30: Variance-aware thresholds
 *   E-31: Device-class-specific budgets
 */

const makeBudget = (overrides?: Partial<BudgetRow>): BudgetRow => ({
  id: "b-1",
  project_id: "p-1",
  route: "/checkout",
  metric: "lcp_ms",
  device_class: "all" as DeviceClass,
  threshold: 2500,
  original_threshold: 2500,
  policy: "warn",
  variance_tolerance: 0,
  auto_ratchet: false,
  ratchet_pct: 5,
  enabled: true,
  last_ratcheted_at: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

describe("BudgetsService", () => {
  let service: BudgetsService;
  let mockDb: { query: jest.Mock };
  let mockBaselines: { findActive: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    mockBaselines = { findActive: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        BudgetsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: BaselinesService, useValue: mockBaselines },
      ],
    }).compile();

    service = module.get(BudgetsService);
  });

  // ── E-28: CRUD + Evaluation ────────────────────────────────

  describe("create (E-28)", () => {
    it("creates a budget with defaults", async () => {
      const created = makeBudget();
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })       // dedup check
        .mockResolvedValueOnce({ rows: [created] }); // insert

      const result = await service.create({
        project_id: "p-1",
        route: "/checkout",
        metric: "lcp_ms",
        threshold: 2500,
      });

      expect(result.id).toBe("b-1");
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      // Default device_class = "all"
      expect(mockDb.query.mock.calls[1][1]).toContain("all");
    });

    it("rejects duplicate budget (same project+route+metric+device)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "existing" }] });

      await expect(
        service.create({
          project_id: "p-1",
          route: "/checkout",
          metric: "lcp_ms",
          threshold: 2500,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("findAll (E-28)", () => {
    it("returns budgets for project", async () => {
      const budgets = [makeBudget(), makeBudget({ id: "b-2", route: "/products" })];
      mockDb.query.mockResolvedValueOnce({ rows: budgets });

      const result = await service.findAll("p-1");
      expect(result).toHaveLength(2);
    });

    it("returns all budgets when no project specified", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeBudget()] });
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });
  });

  describe("update (E-28)", () => {
    it("updates threshold", async () => {
      const updated = makeBudget({ threshold: 2000 });
      mockDb.query.mockResolvedValueOnce({ rows: [updated] });

      const result = await service.update("b-1", { threshold: 2000 });
      expect(result.threshold).toBe(2000);
    });

    it("throws NotFoundException for missing budget", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.update("nonexistent", { threshold: 1000 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("returns existing budget when no fields to update", async () => {
      const existing = makeBudget();
      mockDb.query.mockResolvedValueOnce({ rows: [existing] });

      const result = await service.update("b-1", {});
      expect(result.id).toBe("b-1");
    });
  });

  describe("delete (E-28)", () => {
    it("deletes existing budget", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.delete("b-1")).resolves.toBeUndefined();
    });

    it("throws for missing budget", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.delete("nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  // ── E-30: Variance-Aware Evaluation ──────────────────────────

  describe("evaluate — variance-aware (E-30)", () => {
    it("passes when value is under threshold", async () => {
      const budget = makeBudget({ threshold: 2500 });
      const result = await service.evaluate(budget, 2000);
      expect(result.passed).toBe(true);
      expect(result.within_noise_band).toBe(false);
    });

    it("fails when value exceeds threshold (no tolerance)", async () => {
      const budget = makeBudget({ threshold: 2500, variance_tolerance: 0 });
      const result = await service.evaluate(budget, 2700);
      expect(result.passed).toBe(false);
    });

    it("passes within noise band when variance_tolerance is set", async () => {
      // threshold = 2500, tolerance = 1 stddev, stddev = 300
      // effective = 2500 + 1*300 = 2800
      const budget = makeBudget({ threshold: 2500, variance_tolerance: 1 });
      const result = await service.evaluate(budget, 2700, 300);
      expect(result.passed).toBe(true);
      expect(result.within_noise_band).toBe(true);
      expect(result.effective_threshold).toBe(2800);
      expect(result.variance_tolerance_applied).toBe(300);
    });

    it("fails even with tolerance when value exceeds effective threshold", async () => {
      const budget = makeBudget({ threshold: 2500, variance_tolerance: 1 });
      // effective = 2500 + 300 = 2800, value = 3000 > 2800
      const result = await service.evaluate(budget, 3000, 300);
      expect(result.passed).toBe(false);
    });

    it("ignores tolerance when stddev is not provided", async () => {
      const budget = makeBudget({ threshold: 2500, variance_tolerance: 2 });
      const result = await service.evaluate(budget, 2600);
      expect(result.passed).toBe(false);
      expect(result.variance_tolerance_applied).toBe(0);
    });

    it("passes when actual_value is undefined (metric missing)", async () => {
      const budget = makeBudget();
      const result = await service.evaluate(budget, undefined);
      expect(result.passed).toBe(true);
      expect(result.actual_value).toBeUndefined();
    });
  });

  describe("evaluateRoute (E-28 + E-30 + E-31)", () => {
    it("evaluates all matching budgets for a route", async () => {
      const budgets = [
        makeBudget({ id: "b-1", metric: "lcp_ms", threshold: 2500 }),
        makeBudget({ id: "b-2", metric: "fcp_ms", threshold: 1800 }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: budgets });

      const metrics = { lcp_ms: 2000, fcp_ms: 1500 };
      const results = await service.evaluateRoute("p-1", "/checkout", metrics);

      expect(results).toHaveLength(2);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(true);
    });

    it("fetches stddev from baseline when variance_tolerance > 0", async () => {
      const budget = makeBudget({
        threshold: 2500,
        variance_tolerance: 1,
      });
      mockDb.query.mockResolvedValueOnce({ rows: [budget] });
      mockBaselines.findActive.mockResolvedValueOnce({ stddev: 200 });

      const results = await service.evaluateRoute(
        "p-1", "/checkout", { lcp_ms: 2600 },
      );

      expect(results[0].effective_threshold).toBe(2700); // 2500 + 1*200
      expect(results[0].passed).toBe(true);
      expect(results[0].within_noise_band).toBe(true);
      expect(mockBaselines.findActive).toHaveBeenCalled();
    });

    it("handles baseline service errors gracefully", async () => {
      const budget = makeBudget({ variance_tolerance: 2 });
      mockDb.query.mockResolvedValueOnce({ rows: [budget] });
      mockBaselines.findActive.mockRejectedValueOnce(new Error("DB down"));

      const results = await service.evaluateRoute(
        "p-1", "/checkout", { lcp_ms: 2600 },
      );

      // Falls back to raw threshold evaluation
      expect(results[0].passed).toBe(false);
      expect(results[0].variance_tolerance_applied).toBe(0);
    });
  });

  // ── E-31: Device-Class Specific Budgets ──────────────────────

  describe("device-class segmentation (E-31)", () => {
    it("creates budget with specific device_class", async () => {
      const mobileBudget = makeBudget({ device_class: "mobile", threshold: 4000 });
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mobileBudget] });

      const result = await service.create({
        project_id: "p-1",
        route: "/checkout",
        metric: "lcp_ms",
        device_class: "mobile",
        threshold: 4000,
      });

      expect(result.device_class).toBe("mobile");
      expect(result.threshold).toBe(4000);
    });

    it("allows same metric on different device classes", async () => {
      // First: desktop
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [makeBudget({ device_class: "desktop", threshold: 2500 })] });
      await service.create({
        project_id: "p-1", route: "/checkout", metric: "lcp_ms",
        device_class: "desktop", threshold: 2500,
      });

      // Second: mobile (different device_class → no conflict)
      mockDb.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [makeBudget({ id: "b-2", device_class: "mobile", threshold: 4000 })] });
      const result = await service.create({
        project_id: "p-1", route: "/checkout", metric: "lcp_ms",
        device_class: "mobile", threshold: 4000,
      });

      expect(result.device_class).toBe("mobile");
    });
  });

  // ── E-29: Ratchet on Improvement ─────────────────────────────

  describe("ratchetBudgets (E-29)", () => {
    it("ratchets threshold downward when baseline improves", async () => {
      const budget = makeBudget({
        threshold: 2500,
        auto_ratchet: true,
        ratchet_pct: 5,
      });
      mockDb.query
        .mockResolvedValueOnce({ rows: [budget] })  // find auto_ratchet budgets
        .mockResolvedValueOnce({ rows: [] });        // update

      // Baseline p75 improved to 2000 → new threshold = 2000 * 1.05 = 2100
      mockBaselines.findActive.mockResolvedValueOnce({ p75: 2000, stddev: 100 });

      const results = await service.ratchetBudgets("p-1");
      expect(results).toHaveLength(1);
      expect(results[0].ratcheted).toBe(true);
      expect(results[0].new_threshold).toBe(2100); // 2000 * 1.05
      expect(results[0].old_threshold).toBe(2500);
    });

    it("does not ratchet upward", async () => {
      const budget = makeBudget({
        threshold: 2000,
        auto_ratchet: true,
        ratchet_pct: 5,
      });
      mockDb.query.mockResolvedValueOnce({ rows: [budget] });

      // Baseline p75 = 2500 → candidate = 2500 * 1.05 = 2625 > 2000 → skip
      mockBaselines.findActive.mockResolvedValueOnce({ p75: 2500, stddev: 100 });

      const results = await service.ratchetBudgets("p-1");
      expect(results[0].ratcheted).toBe(false);
      expect(results[0].new_threshold).toBe(2000); // unchanged
      expect(results[0].reason).toContain("no ratchet");
    });

    it("skips when no baseline is available", async () => {
      const budget = makeBudget({ auto_ratchet: true });
      mockDb.query.mockResolvedValueOnce({ rows: [budget] });
      mockBaselines.findActive.mockResolvedValueOnce(null);

      const results = await service.ratchetBudgets("p-1");
      expect(results[0].ratcheted).toBe(false);
      expect(results[0].reason).toContain("No active baseline");
    });

    it("handles custom ratchet_pct", async () => {
      const budget = makeBudget({
        threshold: 3000,
        auto_ratchet: true,
        ratchet_pct: 10,
      });
      mockDb.query
        .mockResolvedValueOnce({ rows: [budget] })
        .mockResolvedValueOnce({ rows: [] });

      // p75 = 2000 → candidate = 2000 * 1.10 = 2200 < 3000 → ratchet
      mockBaselines.findActive.mockResolvedValueOnce({ p75: 2000 });

      const results = await service.ratchetBudgets("p-1");
      expect(results[0].ratcheted).toBe(true);
      expect(results[0].new_threshold).toBe(2200);
    });

    it("processes multiple budgets", async () => {
      const budgets = [
        makeBudget({ id: "b-1", metric: "lcp_ms", threshold: 3000, auto_ratchet: true, ratchet_pct: 5 }),
        makeBudget({ id: "b-2", metric: "fcp_ms", threshold: 2000, auto_ratchet: true, ratchet_pct: 5 }),
      ];
      mockDb.query
        .mockResolvedValueOnce({ rows: budgets })
        .mockResolvedValueOnce({ rows: [] })  // update b-1
        .mockResolvedValueOnce({ rows: [] }); // update b-2

      // Both baselines improve
      mockBaselines.findActive
        .mockResolvedValueOnce({ p75: 2000 })  // lcp: 2000*1.05=2100 < 3000
        .mockResolvedValueOnce({ p75: 1500 }); // fcp: 1500*1.05=1575 < 2000

      const results = await service.ratchetBudgets("p-1");
      expect(results).toHaveLength(2);
      expect(results[0].ratcheted).toBe(true);
      expect(results[1].ratcheted).toBe(true);
    });
  });

  // ── Regression Tests ─────────────────────────────────────────

  describe("regression: book scenarios", () => {
    it("Ch12 starter budget: 5% bundle growth gate", async () => {
      // "CI check that records gzipped JS bundle size and fails if > 5% over main"
      const budget = makeBudget({
        metric: "bundle_size_kb",
        threshold: 200,
        route: "*",
        variance_tolerance: 0,
      });

      // 210KB is 5% over 200 → should fail
      const result = await service.evaluate(budget, 210);
      expect(result.passed).toBe(false);

      // 199KB → should pass
      const result2 = await service.evaluate(budget, 199);
      expect(result2.passed).toBe(true);
    });

    it("Ch12 mobile budget: tighter LCP for mobile segment", async () => {
      // Desktop: 2500ms, Mobile: 4000ms (book p154-155)
      const desktopBudget = makeBudget({
        device_class: "desktop",
        metric: "lcp_ms",
        threshold: 2500,
      });
      const mobileBudget = makeBudget({
        device_class: "mobile",
        metric: "lcp_ms",
        threshold: 4000,
      });

      // 3000ms: passes mobile, fails desktop
      const dResult = await service.evaluate(desktopBudget, 3000);
      const mResult = await service.evaluate(mobileBudget, 3000);

      expect(dResult.passed).toBe(false);
      expect(mResult.passed).toBe(true);
    });

    it("Ch12 variance-aware: noise doesn't fire budget", async () => {
      // Budget = 2500, tolerance = 2 stddev, stddev = 100
      // effective = 2500 + 200 = 2700
      const budget = makeBudget({
        threshold: 2500,
        variance_tolerance: 2,
      });

      // 2600 > 2500 raw but < 2700 effective → noise band
      const result = await service.evaluate(budget, 2600, 100);
      expect(result.passed).toBe(true);
      expect(result.within_noise_band).toBe(true);
    });
  });
});
