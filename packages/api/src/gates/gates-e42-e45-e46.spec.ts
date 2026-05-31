/**
 * Gate Enhancement Tests — E-42, E-45, E-46
 *
 * E-42: Percentile confidence intervals in gate evaluation
 * E-45: Baseline-relative gates with CI awareness
 * E-46: Statistical gates with rolling median ± Nσ
 */
import { Test } from "@nestjs/testing";
import { GatesService, GateDefinition } from "./gates.service";
import { DatabaseService } from "../database/database.service";
import { BaselinesService } from "../baselines/baselines.service";

describe("Gate Enhancements E-42/E-45/E-46", () => {
  let service: GatesService;
  let mockDb: { query: jest.Mock };
  let mockBaselines: { findActive: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    mockBaselines = { findActive: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        GatesService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: BaselinesService, useValue: mockBaselines },
      ],
    }).compile();

    service = module.get(GatesService);
  });

  // ── E-45: Baseline-relative gate ─────────────────────────────

  describe("evaluateBaselineRelative (E-45)", () => {
    it("passes when actual is within regression threshold", async () => {
      const def: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 10,
      };
      mockBaselines.findActive.mockResolvedValue({
        p75: 2000,
        ci_p75_lower: null,
        ci_p75_upper: null,
        ci_p75_reliable: false,
      });
      const result = await service.evaluateBaselineRelative(def, 2100, "p-1");
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(2200); // 2000 * 1.1
      expect(result.baselineValue).toBe(2000);
    });

    it("fails when actual exceeds regression threshold", async () => {
      const def: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 10,
      };
      mockBaselines.findActive.mockResolvedValue({
        p75: 2000,
        ci_p75_lower: null,
        ci_p75_upper: null,
        ci_p75_reliable: false,
      });
      const result = await service.evaluateBaselineRelative(def, 2300, "p-1");
      expect(result.passed).toBe(false);
      expect(result.computedThreshold).toBe(2200);
    });

    it("uses custom baseline_stat (p50)", async () => {
      const def: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 20,
        baseline_stat: "p50",
      };
      mockBaselines.findActive.mockResolvedValue({
        p50: 1500,
        p75: 2000,
        ci_p75_lower: null,
        ci_p75_upper: null,
        ci_p75_reliable: false,
      });
      const result = await service.evaluateBaselineRelative(def, 1700, "p-1");
      expect(result.passed).toBe(true);
      // 1500 * 1.2 = 1800 threshold
      expect(result.computedThreshold).toBe(1800);
    });

    it("passes when no baseline exists", async () => {
      const def: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 10,
      };
      mockBaselines.findActive.mockResolvedValue(null);
      const result = await service.evaluateBaselineRelative(def, 9999, "p-1");
      expect(result.passed).toBe(true);
    });

    it("passes when actual is undefined", async () => {
      const def: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 10,
      };
      const result = await service.evaluateBaselineRelative(def, undefined, "p-1");
      expect(result.passed).toBe(true);
    });

    it("defaults regression_pct to 10 when not specified", async () => {
      const def: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
      };
      mockBaselines.findActive.mockResolvedValue({
        p75: 1000,
        ci_p75_lower: null,
        ci_p75_upper: null,
        ci_p75_reliable: false,
      });
      const result = await service.evaluateBaselineRelative(def, 1050, "p-1");
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(1100); // 1000 * 1.1
    });

    // ── E-42: CI-aware baseline-relative gate ─────────────────

    it("uses CI upper bound when CI is reliable (E-42)", async () => {
      const def: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 10,
      };
      mockBaselines.findActive.mockResolvedValue({
        p75: 2000,
        ci_p75_lower: 1800,
        ci_p75_upper: 2200,
        ci_p75_reliable: true,
      });
      // Without CI: threshold = 2000 * 1.1 = 2200 → 2300 would fail
      // With CI: threshold = 2200 * 1.1 = 2420 → 2300 should pass
      const result = await service.evaluateBaselineRelative(def, 2300, "p-1");
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(2420);
      expect(result.ci_reliable).toBe(true);
      expect(result.ci_lower).toBe(1800);
      expect(result.ci_upper).toBe(2200);
    });

    it("does not use CI when not reliable (E-42)", async () => {
      const def: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 10,
      };
      mockBaselines.findActive.mockResolvedValue({
        p75: 2000,
        ci_p75_lower: 1500,
        ci_p75_upper: 2500,
        ci_p75_reliable: false,
      });
      // Unreliable CI → falls back to standard threshold
      const result = await service.evaluateBaselineRelative(def, 2300, "p-1");
      expect(result.passed).toBe(false);
      expect(result.computedThreshold).toBe(2200); // 2000 * 1.1, not 2500 * 1.1
      expect(result.ci_reliable).toBe(false);
    });

    it("does not use CI for non-p75 baseline_stat (E-42)", async () => {
      const def: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 10,
        baseline_stat: "mean",
      };
      mockBaselines.findActive.mockResolvedValue({
        mean: 2000,
        p75: 2200,
        ci_p75_lower: 1800,
        ci_p75_upper: 2500,
        ci_p75_reliable: true,
      });
      // Using mean, not p75 — CI should not apply
      const result = await service.evaluateBaselineRelative(def, 2300, "p-1");
      expect(result.passed).toBe(false);
      expect(result.computedThreshold).toBe(2200); // 2000 * 1.1
    });
  });

  // ── E-46: Statistical gate ────────────────────────────────────

  describe("evaluateStatistical (E-46)", () => {
    it("passes when actual is within mean + N*stddev", async () => {
      const def: GateDefinition = {
        type: "statistical",
        metric: "lcp",
        stddev_multiplier: 2,
      };
      mockBaselines.findActive.mockResolvedValue({
        mean: 2000,
        stddev: 200,
        ci_p75_lower: null,
        ci_p75_upper: null,
        ci_p75_reliable: false,
      });
      // threshold = 2000 + 2*200 = 2400
      const result = await service.evaluateStatistical(def, 2300, "p-1");
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(2400);
      expect(result.baselineValue).toBe(2000);
    });

    it("fails when actual exceeds mean + N*stddev", async () => {
      const def: GateDefinition = {
        type: "statistical",
        metric: "lcp",
        stddev_multiplier: 2,
      };
      mockBaselines.findActive.mockResolvedValue({
        mean: 2000,
        stddev: 200,
        ci_p75_lower: null,
        ci_p75_upper: null,
        ci_p75_reliable: false,
      });
      const result = await service.evaluateStatistical(def, 2500, "p-1");
      expect(result.passed).toBe(false);
    });

    it("defaults stddev_multiplier to 2", async () => {
      const def: GateDefinition = {
        type: "statistical",
        metric: "lcp",
      };
      mockBaselines.findActive.mockResolvedValue({
        mean: 1000,
        stddev: 100,
        ci_p75_lower: null,
        ci_p75_upper: null,
        ci_p75_reliable: false,
      });
      const result = await service.evaluateStatistical(def, 1200, "p-1");
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(1200); // 1000 + 2*100
    });

    it("passes exactly at threshold boundary", async () => {
      const def: GateDefinition = {
        type: "statistical",
        metric: "lcp",
        stddev_multiplier: 3,
      };
      mockBaselines.findActive.mockResolvedValue({
        mean: 1000,
        stddev: 100,
        ci_p75_lower: null,
        ci_p75_upper: null,
        ci_p75_reliable: false,
      });
      // threshold = 1000 + 3*100 = 1300
      const result = await service.evaluateStatistical(def, 1300, "p-1");
      expect(result.passed).toBe(true);
    });

    it("passes when no baseline exists", async () => {
      const def: GateDefinition = {
        type: "statistical",
        metric: "lcp",
        stddev_multiplier: 2,
      };
      mockBaselines.findActive.mockResolvedValue(null);
      const result = await service.evaluateStatistical(def, 9999, "p-1");
      expect(result.passed).toBe(true);
    });

    it("passes when baseline has null mean/stddev", async () => {
      const def: GateDefinition = {
        type: "statistical",
        metric: "lcp",
        stddev_multiplier: 2,
      };
      mockBaselines.findActive.mockResolvedValue({
        mean: null,
        stddev: null,
      });
      const result = await service.evaluateStatistical(def, 9999, "p-1");
      expect(result.passed).toBe(true);
    });

    it("returns CI info when available (E-42)", async () => {
      const def: GateDefinition = {
        type: "statistical",
        metric: "lcp",
        stddev_multiplier: 2,
      };
      mockBaselines.findActive.mockResolvedValue({
        mean: 2000,
        stddev: 200,
        ci_p75_lower: 1900,
        ci_p75_upper: 2100,
        ci_p75_reliable: true,
      });
      const result = await service.evaluateStatistical(def, 2300, "p-1");
      expect(result.ci_lower).toBe(1900);
      expect(result.ci_upper).toBe(2100);
      expect(result.ci_reliable).toBe(true);
    });
  });

  // ── E-42: CI propagation through evaluateGatesForRun ──────────

  describe("evaluateGatesForRun with CI (E-42)", () => {
    it("includes CI info in baseline_relative outcome", async () => {
      const gate = {
        id: "g-1",
        project_id: "p-1",
        name: "LCP Baseline",
        definition: { type: "baseline_relative", metric: "lcp", regression_pct: 10 },
        policy: "warn",
        enabled: true,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [gate] });
      mockBaselines.findActive.mockResolvedValue({
        p75: 2000,
        ci_p75_lower: 1800,
        ci_p75_upper: 2200,
        ci_p75_reliable: true,
      });
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // quorum
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // insert

      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", { lcp_ms: 2100 });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].ci_lower).toBe(1800);
      expect(outcomes[0].ci_upper).toBe(2200);
      expect(outcomes[0].ci_reliable).toBe(true);
    });

    it("includes CI info in statistical outcome", async () => {
      const gate = {
        id: "g-2",
        project_id: "p-1",
        name: "LCP Statistical",
        definition: { type: "statistical", metric: "lcp", stddev_multiplier: 2 },
        policy: "block",
        enabled: true,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [gate] });
      mockBaselines.findActive.mockResolvedValue({
        mean: 2000,
        stddev: 200,
        ci_p75_lower: 1900,
        ci_p75_upper: 2100,
        ci_p75_reliable: true,
      });
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // quorum
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // insert

      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", { lcp_ms: 2300 });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].ci_reliable).toBe(true);
    });

    it("CI-aware baseline gate prevents false positive", async () => {
      const gate = {
        id: "g-3",
        project_id: "p-1",
        name: "LCP Baseline CI",
        definition: { type: "baseline_relative", metric: "lcp", regression_pct: 10 },
        policy: "block",
        enabled: true,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [gate] });
      mockBaselines.findActive.mockResolvedValue({
        p75: 2000,
        ci_p75_lower: 1900,
        ci_p75_upper: 2150,
        ci_p75_reliable: true,
      });
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // quorum
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // insert

      // Without CI: threshold = 2000 * 1.1 = 2200, actual 2250 → fail
      // With CI: threshold = 2150 * 1.1 = 2365, actual 2250 → pass
      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", { lcp_ms: 2250 });
      expect(outcomes[0].status).toBe("passed");
    });

    it("handles mixed gate types with CI", async () => {
      const gates = [
        {
          id: "g-1",
          project_id: "p-1",
          name: "Threshold",
          definition: { type: "threshold", metric: "lcp", operator: "lte", threshold: 3000 },
          policy: "warn",
          enabled: true,
        },
        {
          id: "g-2",
          project_id: "p-1",
          name: "Baseline",
          definition: { type: "baseline_relative", metric: "fcp", regression_pct: 15 },
          policy: "warn",
          enabled: true,
        },
        {
          id: "g-3",
          project_id: "p-1",
          name: "Statistical",
          definition: { type: "statistical", metric: "lcp", stddev_multiplier: 2 },
          policy: "block",
          enabled: true,
        },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: gates });
      mockBaselines.findActive.mockResolvedValue({
        p75: 1000,
        mean: 1000,
        stddev: 100,
        ci_p75_lower: 900,
        ci_p75_upper: 1100,
        ci_p75_reliable: true,
      });
      // 3 quorum checks
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // 3 inserts
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", {
        lcp_ms: 1100,
        fcp_ms: 1050,
      });
      expect(outcomes).toHaveLength(3);
      expect(outcomes[0].gate_name).toBe("Threshold");
      expect(outcomes[1].gate_name).toBe("Baseline");
      expect(outcomes[2].gate_name).toBe("Statistical");

      // Threshold gate: 1100 <= 3000 → pass
      expect(outcomes[0].status).toBe("passed");
      // Baseline gate: CI-aware
      expect(outcomes[1].ci_reliable).toBe(true);
      // Statistical gate: CI included in result
      expect(outcomes[2].ci_reliable).toBe(true);
    });
  });
});
