import { Test } from "@nestjs/testing";
import { GatesService, GateDefinition } from "./gates.service";
import { BaselinesService } from "../baselines/baselines.service";
import { DatabaseService } from "../database/database.service";

// ============================================================
// Gates Phase 2 — Baseline-relative & Statistical gates
// Techniques: EP, boundary, decision tree, MC/DC, structural
// ============================================================

describe("GatesService — Phase 2 gate types", () => {
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

  // ----------------------------------------------------------
  // evaluateBaselineRelative
  // ----------------------------------------------------------
  describe("evaluateBaselineRelative", () => {
    const def: GateDefinition = {
      type: "baseline_relative",
      metric: "lcp",
      regression_pct: 10,
      baseline_stat: "p75",
    };

    it("passes when actual <= baseline p75 * 1.1 (primary path)", async () => {
      mockBaselines.findActive.mockResolvedValue({ p75: 2000, p50: 1800, mean: 1900, stddev: 200 });
      const result = await service.evaluateBaselineRelative(def, 2200, "p-1");
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(2200);
      expect(result.baselineValue).toBe(2000);
    });

    it("fails when actual > baseline p75 * 1.1 (boundary)", async () => {
      mockBaselines.findActive.mockResolvedValue({ p75: 2000 });
      const result = await service.evaluateBaselineRelative(def, 2201, "p-1");
      expect(result.passed).toBe(false);
      expect(result.computedThreshold).toBe(2200);
    });

    it("passes exactly at threshold (boundary: lte)", async () => {
      mockBaselines.findActive.mockResolvedValue({ p75: 2000 });
      const result = await service.evaluateBaselineRelative(def, 2200, "p-1");
      expect(result.passed).toBe(true);
    });

    it("passes when no baseline exists (decision: no data)", async () => {
      mockBaselines.findActive.mockResolvedValue(null);
      const result = await service.evaluateBaselineRelative(def, 5000, "p-1");
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBeUndefined();
    });

    it("passes when actual is undefined (EP: skip)", async () => {
      const result = await service.evaluateBaselineRelative(def, undefined, "p-1");
      expect(result.passed).toBe(true);
    });

    it("uses default baseline_stat p75 when not specified", async () => {
      const defNoBstat: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 20,
      };
      mockBaselines.findActive.mockResolvedValue({ p75: 1000, p50: 800 });
      const result = await service.evaluateBaselineRelative(defNoBstat, 1200, "p-1");
      // threshold = 1000 * 1.2 = 1200
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(1200);
    });

    it("uses custom baseline_stat p50", async () => {
      const defP50: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
        regression_pct: 10,
        baseline_stat: "p50",
      };
      mockBaselines.findActive.mockResolvedValue({ p75: 2000, p50: 1500 });
      const result = await service.evaluateBaselineRelative(defP50, 1650, "p-1");
      // threshold = 1500 * 1.1 = 1650
      expect(result.passed).toBe(true);
      expect(result.baselineValue).toBe(1500);
    });

    it("uses default regression_pct 10 when not specified", async () => {
      const defNoReg: GateDefinition = {
        type: "baseline_relative",
        metric: "lcp",
      };
      mockBaselines.findActive.mockResolvedValue({ p75: 1000 });
      const result = await service.evaluateBaselineRelative(defNoReg, 1101, "p-1");
      // threshold = 1000 * 1.1 = 1100
      expect(result.passed).toBe(false);
    });

    it("passes when baseline stat value is null (structural)", async () => {
      mockBaselines.findActive.mockResolvedValue({ p75: null });
      const result = await service.evaluateBaselineRelative(def, 5000, "p-1");
      expect(result.passed).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // evaluateStatistical
  // ----------------------------------------------------------
  describe("evaluateStatistical", () => {
    const def: GateDefinition = {
      type: "statistical",
      metric: "lcp",
      stddev_multiplier: 2,
    };

    it("passes when actual <= mean + 2*stddev (primary path)", async () => {
      mockBaselines.findActive.mockResolvedValue({ mean: 2000, stddev: 200 });
      const result = await service.evaluateStatistical(def, 2400, "p-1");
      // threshold = 2000 + 2*200 = 2400
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(2400);
      expect(result.baselineValue).toBe(2000);
    });

    it("fails when actual > mean + 2*stddev (boundary)", async () => {
      mockBaselines.findActive.mockResolvedValue({ mean: 2000, stddev: 200 });
      const result = await service.evaluateStatistical(def, 2401, "p-1");
      expect(result.passed).toBe(false);
    });

    it("passes when no baseline (decision: no data)", async () => {
      mockBaselines.findActive.mockResolvedValue(null);
      const result = await service.evaluateStatistical(def, 9999, "p-1");
      expect(result.passed).toBe(true);
    });

    it("passes when baseline has null mean/stddev (structural)", async () => {
      mockBaselines.findActive.mockResolvedValue({ mean: null, stddev: null });
      const result = await service.evaluateStatistical(def, 9999, "p-1");
      expect(result.passed).toBe(true);
    });

    it("passes when actual is undefined (EP: skip)", async () => {
      const result = await service.evaluateStatistical(def, undefined, "p-1");
      expect(result.passed).toBe(true);
    });

    it("uses default multiplier 2 when not specified", async () => {
      const defNoMult: GateDefinition = { type: "statistical", metric: "lcp" };
      mockBaselines.findActive.mockResolvedValue({ mean: 1000, stddev: 100 });
      const result = await service.evaluateStatistical(defNoMult, 1201, "p-1");
      // threshold = 1000 + 2*100 = 1200
      expect(result.passed).toBe(false);
    });

    it("works with custom multiplier (EP: 3-sigma)", async () => {
      const def3: GateDefinition = { type: "statistical", metric: "lcp", stddev_multiplier: 3 };
      mockBaselines.findActive.mockResolvedValue({ mean: 1000, stddev: 100 });
      const result = await service.evaluateStatistical(def3, 1300, "p-1");
      // threshold = 1000 + 3*100 = 1300
      expect(result.passed).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // evaluateGatesForRun — integration with baseline/statistical
  // ----------------------------------------------------------
  describe("evaluateGatesForRun with Phase 2 gates", () => {
    it("evaluates baseline_relative gate end-to-end", async () => {
      const gate = {
        id: "g-1",
        project_id: "p-1",
        name: "LCP Baseline",
        definition: { type: "baseline_relative", metric: "lcp", regression_pct: 10 },
        policy: "warn",
        enabled: true,
      };
      // Fetch enabled gates
      mockDb.query.mockResolvedValueOnce({ rows: [gate] });
      mockBaselines.findActive.mockResolvedValue({ p75: 2000 });
      // checkQuorum
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // INSERT gate_results
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", { lcp_ms: 2100 });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe("passed");
      expect(outcomes[0].computed_threshold).toBe(2200);
      expect(outcomes[0].baseline_value).toBe(2000);
    });

    it("evaluates statistical gate end-to-end", async () => {
      const gate = {
        id: "g-2",
        project_id: "p-1",
        name: "LCP Statistical",
        definition: { type: "statistical", metric: "lcp", stddev_multiplier: 2 },
        policy: "block",
        enabled: true,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [gate] });
      mockBaselines.findActive.mockResolvedValue({ mean: 2000, stddev: 200 });
      // checkQuorum
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // INSERT gate_results
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", { lcp_ms: 2500 });
      expect(outcomes).toHaveLength(1);
      // 2500 > 2000 + 400 = 2400 → single run fails, but quorum says pass (0 past failures)
      expect(outcomes[0].status).toBe("passed");
    });

    it("handles mixed gate types in single evaluation", async () => {
      const gates = [
        {
          id: "g-1", project_id: "p-1", name: "Threshold",
          definition: { type: "threshold", metric: "lcp", operator: "lte", threshold: 3000 },
          policy: "warn", enabled: true,
        },
        {
          id: "g-2", project_id: "p-1", name: "Baseline",
          definition: { type: "baseline_relative", metric: "fcp", regression_pct: 15 },
          policy: "warn", enabled: true,
        },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: gates });
      mockBaselines.findActive.mockResolvedValue({ p75: 1000 });
      // checkQuorum for g-1
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // INSERT for g-1
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // checkQuorum for g-2
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // INSERT for g-2
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", {
        lcp_ms: 2000,
        fcp_ms: 1100,
      });
      expect(outcomes).toHaveLength(2);
      expect(outcomes[0].gate_name).toBe("Threshold");
      expect(outcomes[1].gate_name).toBe("Baseline");
    });
  });
});
