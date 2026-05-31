import { Test } from "@nestjs/testing";
import { NotFoundException, ConflictException } from "@nestjs/common";
import { GatesService, GateDefinition } from "./gates.service";
import { DatabaseService } from "../database/database.service";

// ============================================================
// Gates Service — Unit Tests
// Techniques: equivalence partitions, boundary conditions,
// decision trees, MC/DC, structural, primary path, regression
// ============================================================

describe("GatesService", () => {
  let service: GatesService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        GatesService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(GatesService);
  });

  // ----------------------------------------------------------
  // evaluateThreshold — decision tree + MC/DC
  // ----------------------------------------------------------
  describe("evaluateThreshold", () => {
    const baseDef: GateDefinition = {
      type: "threshold",
      metric: "lcp",
      operator: "lte",
      threshold: 2500,
    };

    // EP: undefined/null metric → skip (pass)
    it("returns true when metric value is undefined", () => {
      expect(service.evaluateThreshold(baseDef, undefined)).toBe(true);
    });

    // EP: lte operator
    it("passes when value <= threshold (lte)", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "lte" }, 2500)).toBe(true);
    });
    it("fails when value > threshold (lte)", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "lte" }, 2501)).toBe(false);
    });

    // EP: gte operator
    it("passes when value >= threshold (gte)", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "gte" }, 2500)).toBe(true);
    });
    it("fails when value < threshold (gte)", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "gte" }, 2499)).toBe(false);
    });

    // EP: lt operator
    it("passes when value < threshold (lt)", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "lt" }, 2499)).toBe(true);
    });
    it("fails when value >= threshold (lt)", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "lt" }, 2500)).toBe(false);
    });

    // EP: gt operator
    it("passes when value > threshold (gt)", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "gt" }, 2501)).toBe(true);
    });
    it("fails when value <= threshold (gt)", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "gt" }, 2500)).toBe(false);
    });

    // Boundary: exactly at threshold for each operator
    it("boundary: lte at exact threshold passes", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "lte", threshold: 0 }, 0)).toBe(true);
    });
    it("boundary: gte at exact threshold passes", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "gte", threshold: 0 }, 0)).toBe(true);
    });
    it("boundary: lt at exact threshold fails", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "lt", threshold: 0 }, 0)).toBe(false);
    });
    it("boundary: gt at exact threshold fails", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "gt", threshold: 0 }, 0)).toBe(false);
    });

    // Structural: unknown operator defaults to true
    it("returns true for unknown operator", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "eq" as any }, 100)).toBe(true);
    });

    // Boundary: negative values
    it("handles negative metric values", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "lte", threshold: -1 }, -2)).toBe(true);
    });

    // Boundary: zero threshold
    it("handles zero threshold with lte", () => {
      expect(service.evaluateThreshold({ ...baseDef, operator: "lte", threshold: 0 }, 0.001)).toBe(false);
    });
  });

  // ----------------------------------------------------------
  // extractMetricValue — EP + decision tree
  // ----------------------------------------------------------
  describe("extractMetricValue", () => {
    // EP: known alias mapping
    it("maps 'lcp' to 'lcp_ms'", () => {
      expect(service.extractMetricValue({ lcp_ms: 2500 }, "lcp")).toBe(2500);
    });
    it("maps 'lighthouse_performance' to 'lighthouse_performance_score'", () => {
      expect(service.extractMetricValue({ lighthouse_performance_score: 0.9 }, "lighthouse_performance")).toBe(0.9);
    });

    // EP: direct key (no alias)
    it("falls back to direct key when no alias exists", () => {
      expect(service.extractMetricValue({ custom_metric: 42 }, "custom_metric")).toBe(42);
    });

    // EP: metric not present → undefined
    it("returns undefined when metric is not in metrics object", () => {
      expect(service.extractMetricValue({}, "lcp")).toBeUndefined();
    });

    // EP: non-number value → undefined
    it("returns undefined when metric value is not a number", () => {
      expect(service.extractMetricValue({ lcp_ms: "fast" }, "lcp")).toBeUndefined();
    });

    // Boundary: zero is a valid number
    it("returns 0 as a valid metric value", () => {
      expect(service.extractMetricValue({ cls: 0 }, "cls")).toBe(0);
    });
  });

  // ----------------------------------------------------------
  // checkQuorum — 3-of-5 quorum decision tree + MC/DC
  // ----------------------------------------------------------
  describe("checkQuorum", () => {
    const gateId = "gate-1";
    const projectId = "proj-1";

    // Helper: mock past gate results
    function mockPastResults(statuses: string[]) {
      mockDb.query.mockResolvedValueOnce({
        rows: statuses.map((s) => ({ status: s })),
      });
    }

    // Decision tree: current fails, 0 past failures → 1 total < 3 → pass
    it("does not fail when only current run fails (1/5)", async () => {
      mockPastResults(["passed", "passed", "passed", "passed"]);
      const result = await service.checkQuorum(gateId, projectId, true);
      expect(result.shouldFail).toBe(false);
      expect(result.recentFailures).toBe(1);
    });

    // Decision tree: current fails, 1 past failure → 2 total < 3 → pass
    it("does not fail with 2 total failures (2/5)", async () => {
      mockPastResults(["failed", "passed", "passed", "passed"]);
      const result = await service.checkQuorum(gateId, projectId, true);
      expect(result.shouldFail).toBe(false);
      expect(result.recentFailures).toBe(2);
    });

    // Decision tree: current fails, 2 past failures → 3 total >= 3 → FAIL
    it("fails with 3 total failures (3/5) — quorum reached", async () => {
      mockPastResults(["failed", "failed", "passed", "passed"]);
      const result = await service.checkQuorum(gateId, projectId, true);
      expect(result.shouldFail).toBe(true);
      expect(result.recentFailures).toBe(3);
    });

    // Decision tree: current passes, 3 past failures → 3 total >= 3 → FAIL
    it("fails when current passes but past has 3 failures", async () => {
      mockPastResults(["failed", "failed", "failed", "passed"]);
      const result = await service.checkQuorum(gateId, projectId, false);
      expect(result.shouldFail).toBe(true);
      expect(result.recentFailures).toBe(3);
    });

    // Decision tree: current passes, 2 past failures → 2 total < 3 → pass
    it("passes when current passes and only 2 past failures", async () => {
      mockPastResults(["failed", "failed", "passed", "passed"]);
      const result = await service.checkQuorum(gateId, projectId, false);
      expect(result.shouldFail).toBe(false);
      expect(result.recentFailures).toBe(2);
    });

    // Boundary: no past results (first run ever)
    it("handles first run with no history — current fail → 1/1", async () => {
      mockPastResults([]);
      const result = await service.checkQuorum(gateId, projectId, true);
      expect(result.shouldFail).toBe(false);
      expect(result.recentFailures).toBe(1);
    });

    // Boundary: all 4 past runs failed + current fails → 5/5
    it("fails decisively when all 5 runs fail", async () => {
      mockPastResults(["failed", "failed", "failed", "failed"]);
      const result = await service.checkQuorum(gateId, projectId, true);
      expect(result.shouldFail).toBe(true);
      expect(result.recentFailures).toBe(5);
    });

    // Boundary: all past pass + current passes → 0/5
    it("passes when all 5 runs pass", async () => {
      mockPastResults(["passed", "passed", "passed", "passed"]);
      const result = await service.checkQuorum(gateId, projectId, false);
      expect(result.shouldFail).toBe(false);
      expect(result.recentFailures).toBe(0);
    });

    // MC/DC: change only currentRunFailed while holding past constant
    it("MC/DC: toggling current failure changes outcome from 2→3", async () => {
      // Past: 2 failures. Current pass → 2 total (pass). Current fail → 3 total (fail).
      mockPastResults(["failed", "failed", "passed", "passed"]);
      const pass = await service.checkQuorum(gateId, projectId, false);
      expect(pass.shouldFail).toBe(false);

      mockPastResults(["failed", "failed", "passed", "passed"]);
      const fail = await service.checkQuorum(gateId, projectId, true);
      expect(fail.shouldFail).toBe(true);
    });
  });

  // ----------------------------------------------------------
  // CRUD operations — primary path + structural
  // ----------------------------------------------------------
  describe("CRUD", () => {
    const mockGate = {
      id: "g-1",
      project_id: "p-1",
      name: "LCP Gate",
      definition: { type: "threshold", metric: "lcp", operator: "lte", threshold: 2500 },
      policy: "warn",
      enabled: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    describe("findAll", () => {
      it("returns all gates without filter", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [mockGate] });
        const result = await service.findAll();
        expect(result).toEqual([mockGate]);
        expect(mockDb.query.mock.calls[0][0]).toContain("ORDER BY");
      });

      it("filters by projectId when provided", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [mockGate] });
        await service.findAll("p-1");
        expect(mockDb.query.mock.calls[0][1]).toEqual(["p-1"]);
      });
    });

    describe("findById", () => {
      it("returns gate when found", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [mockGate] });
        const result = await service.findById("g-1");
        expect(result).toEqual(mockGate);
      });

      it("throws NotFoundException when not found", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });
        await expect(service.findById("missing")).rejects.toThrow(NotFoundException);
      });
    });

    describe("create", () => {
      it("creates with defaults", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });
        mockDb.query.mockResolvedValueOnce({ rows: [mockGate] });
        const result = await service.create({
          project_id: "p-1",
          name: "LCP Gate",
          definition: { type: "threshold", metric: "lcp", operator: "lte", threshold: 2500 },
        });
        expect(result).toEqual(mockGate);
      });

      it("throws ConflictException when duplicate name+project exists", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [{ id: "existing-1" }] });
        await expect(
          service.create({
            project_id: "p-1",
            name: "LCP Gate",
            definition: { type: "threshold", metric: "lcp", operator: "lte", threshold: 2500 },
          })
        ).rejects.toThrow(ConflictException);
        expect(mockDb.query).toHaveBeenCalledTimes(1);
      });
    });

    describe("batchCreate", () => {
      const baseDef = { type: "threshold" as const, metric: "lcp", operator: "lte" as const, threshold: 2500 };
      const mockCreated = {
        id: "new-1", project_id: "p-1", name: "LCP Gate", definition: baseDef,
        policy: "warn", enabled: true, created_at: new Date(), updated_at: new Date(),
      };

      it("creates all gates when none exist", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });
        mockDb.query.mockResolvedValueOnce({ rows: [mockCreated] });
        mockDb.query.mockResolvedValueOnce({ rows: [{ ...mockCreated, id: "new-2", name: "FCP Gate" }] });

        const result = await service.batchCreate("p-1", [
          { name: "LCP Gate", definition: baseDef },
          { name: "FCP Gate", definition: { ...baseDef, metric: "fcp" } },
        ]);
        expect(result.created).toHaveLength(2);
        expect(result.skipped).toHaveLength(0);
      });

      it("skips gates that already exist by name", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [{ name: "LCP Gate" }] });
        mockDb.query.mockResolvedValueOnce({ rows: [{ ...mockCreated, id: "new-2", name: "FCP Gate" }] });

        const result = await service.batchCreate("p-1", [
          { name: "LCP Gate", definition: baseDef },
          { name: "FCP Gate", definition: { ...baseDef, metric: "fcp" } },
        ]);
        expect(result.created).toHaveLength(1);
        expect(result.created[0].name).toBe("FCP Gate");
        expect(result.skipped).toEqual(["LCP Gate"]);
      });

      it("skips all when all already exist", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [{ name: "LCP Gate" }, { name: "FCP Gate" }] });

        const result = await service.batchCreate("p-1", [
          { name: "LCP Gate", definition: baseDef },
          { name: "FCP Gate", definition: { ...baseDef, metric: "fcp" } },
        ]);
        expect(result.created).toHaveLength(0);
        expect(result.skipped).toEqual(["LCP Gate", "FCP Gate"]);
      });

      it("deduplicates within the same batch", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });
        mockDb.query.mockResolvedValueOnce({ rows: [mockCreated] });

        const result = await service.batchCreate("p-1", [
          { name: "LCP Gate", definition: baseDef },
          { name: "LCP Gate", definition: baseDef },
        ]);
        expect(result.created).toHaveLength(1);
        expect(result.skipped).toEqual(["LCP Gate"]);
      });

      it("returns empty arrays for empty input", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });
        const result = await service.batchCreate("p-1", []);
        expect(result.created).toHaveLength(0);
        expect(result.skipped).toHaveLength(0);
      });
    });

    describe("update", () => {
      it("updates specified fields", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [{ ...mockGate, enabled: false }] });
        const result = await service.update("g-1", { enabled: false });
        expect(result.enabled).toBe(false);
      });

      it("returns existing gate when no fields to update", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [mockGate] });
        const result = await service.update("g-1", {});
        expect(result).toEqual(mockGate);
      });

      it("throws NotFoundException on update of missing gate", async () => {
        mockDb.query.mockResolvedValueOnce({ rows: [] });
        await expect(service.update("missing", { enabled: false })).rejects.toThrow(NotFoundException);
      });
    });

    describe("delete", () => {
      it("deletes existing gate", async () => {
        mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
        await expect(service.delete("g-1")).resolves.toBeUndefined();
      });

      it("throws NotFoundException when deleting missing gate", async () => {
        mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
        await expect(service.delete("missing")).rejects.toThrow(NotFoundException);
      });
    });
  });

  // ----------------------------------------------------------
  // evaluateAgainstRun — structured response
  // ----------------------------------------------------------
  describe("evaluateAgainstRun", () => {
    it("throws when run not found", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.evaluateAgainstRun("missing-run")).rejects.toThrow("Run missing-run not found");
    });

    it("returns reason when run has no metrics", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ project_id: "p-1", metrics: null, status: "completed" }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ name: "Demo" }] });

      const result = await service.evaluateAgainstRun("run-1");
      expect(result.outcomes).toEqual([]);
      expect(result.project_name).toBe("Demo");
      expect(result.reason).toContain("no metrics");
    });

    it("returns reason when no enabled gates for project", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ project_id: "p-1", metrics: { lcp_ms: 1000 }, status: "completed" }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ name: "Demo" }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: "0" }] });

      const result = await service.evaluateAgainstRun("run-1");
      expect(result.outcomes).toEqual([]);
      expect(result.project_name).toBe("Demo");
      expect(result.reason).toContain("No enabled gates");
    });

    it("returns outcomes when gates exist and run has metrics", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ project_id: "p-1", metrics: { lcp_ms: 1000 }, status: "completed" }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ name: "Demo" }] });
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: "1" }] });
      // evaluateGatesForRun mocks: gates query, quorum, insert
      mockDb.query.mockResolvedValueOnce({ rows: [{
        id: "g-1", project_id: "p-1", name: "LCP Gate",
        definition: { type: "threshold", metric: "lcp", operator: "lte", threshold: 2500 },
        policy: "block", enabled: true,
      }] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.evaluateAgainstRun("run-1");
      expect(result.outcomes).toHaveLength(1);
      expect(result.project_name).toBe("Demo");
      expect(result.reason).toBeUndefined();
    });
  });

  // ----------------------------------------------------------
  // evaluateGatesForRun — integration-like + structural
  // ----------------------------------------------------------
  describe("evaluateGatesForRun", () => {
    it("evaluates enabled threshold gates and persists results", async () => {
      // Setup: 1 enabled gate, LCP <= 2500
      const gate = {
        id: "g-1",
        project_id: "p-1",
        name: "LCP Gate",
        definition: { type: "threshold", metric: "lcp", operator: "lte", threshold: 2500 },
        policy: "block",
        enabled: true,
      };

      // Mock: findAll gates
      mockDb.query.mockResolvedValueOnce({ rows: [gate] });
      // Mock: checkQuorum (past results)
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // Mock: INSERT gate_result
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", { lcp_ms: 2000 });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe("passed");
      expect(outcomes[0].gate_name).toBe("LCP Gate");
      expect(outcomes[0].actual_value).toBe(2000);
    });

    it("evaluates baseline_relative gates (passes when no baseline service)", async () => {
      const gate = {
        id: "g-2",
        project_id: "p-1",
        name: "Baseline Gate",
        definition: { type: "baseline_relative", metric: "lcp" },
        policy: "warn",
        enabled: true,
      };

      mockDb.query.mockResolvedValueOnce({ rows: [gate] });
      // checkQuorum
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // INSERT gate_results
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", { lcp_ms: 5000 });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe("passed");
    });

    it("marks gate as skipped when metric is missing", async () => {
      const gate = {
        id: "g-3",
        project_id: "p-1",
        name: "CLS Gate",
        definition: { type: "threshold", metric: "cls", operator: "lte", threshold: 0.1 },
        policy: "warn",
        enabled: true,
      };

      mockDb.query.mockResolvedValueOnce({ rows: [gate] });
      // checkQuorum
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      // INSERT
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", { lcp_ms: 2000 });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].status).toBe("skipped");
    });

    // Regression: gate that fails quorum check
    it("marks gate as failed when quorum threshold is reached", async () => {
      const gate = {
        id: "g-4",
        project_id: "p-1",
        name: "LCP Gate",
        definition: { type: "threshold", metric: "lcp", operator: "lte", threshold: 2500 },
        policy: "block",
        enabled: true,
      };

      mockDb.query.mockResolvedValueOnce({ rows: [gate] });
      // Past: 2 failures already
      mockDb.query.mockResolvedValueOnce({
        rows: [{ status: "failed" }, { status: "failed" }],
      });
      // INSERT
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      // Current run also fails (LCP 3000 > 2500)
      const outcomes = await service.evaluateGatesForRun("p-1", "run-1", { lcp_ms: 3000 });
      expect(outcomes[0].status).toBe("failed");
      expect(outcomes[0].quorum_detail?.recent_failures).toBe(3);
    });
  });
});
