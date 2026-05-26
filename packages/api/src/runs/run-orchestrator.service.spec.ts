import { Test } from "@nestjs/testing";
import { RunOrchestratorService } from "./run-orchestrator.service";
import { RunsService } from "./runs.service";
import { GatesService } from "../gates/gates.service";
import { ArtifactsService } from "../artifacts/artifacts.service";
import { GitHubCheckService } from "../github/github-check.service";
import { DatabaseService } from "../database/database.service";

// ============================================================
// Run Orchestrator — Unit Tests
// Techniques: EP, decision tree, structural, primary path
// ============================================================

describe("RunOrchestratorService", () => {
  let service: RunOrchestratorService;
  let mockDb: { query: jest.Mock };
  let mockRuns: { update: jest.Mock; findById: jest.Mock };
  let mockGates: { evaluateGatesForRun: jest.Mock };
  let mockArtifacts: { saveJson: jest.Mock; saveBuffer: jest.Mock };
  let mockGithub: { reportGateResults: jest.Mock; reportCommitStatus: jest.Mock };

  const mockRun = {
    id: "run-1",
    project_id: "p-1",
    status: "running",
    config: { url: "https://example.com" },
    metrics: null,
    created_at: new Date(),
  };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    mockRuns = {
      update: jest.fn(),
      findById: jest.fn(),
    };
    mockGates = {
      evaluateGatesForRun: jest.fn().mockResolvedValue([]),
    };
    mockArtifacts = {
      saveJson: jest.fn().mockResolvedValue("run-1/lighthouse.json"),
      saveBuffer: jest.fn().mockResolvedValue("run-1/trace.zip"),
    };
    mockGithub = {
      reportGateResults: jest.fn().mockResolvedValue({ checkRunId: 123, posted: true }),
      reportCommitStatus: jest.fn().mockResolvedValue(true),
    };

    const module = await Test.createTestingModule({
      providers: [
        RunOrchestratorService,
        { provide: RunsService, useValue: mockRuns },
        { provide: GatesService, useValue: mockGates },
        { provide: ArtifactsService, useValue: mockArtifacts },
        { provide: GitHubCheckService, useValue: mockGithub },
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(RunOrchestratorService);
  });

  // -- claimNextRun --
  describe("claimNextRun", () => {
    it("returns run when queue has items (primary path)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockRun] });
      const result = await service.claimNextRun();
      expect(result).toEqual(mockRun);
      expect(mockDb.query.mock.calls[0][0]).toContain("FOR UPDATE SKIP LOCKED");
    });

    it("returns null when queue is empty (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.claimNextRun();
      expect(result).toBeNull();
    });
  });

  // -- completeRun --
  describe("completeRun", () => {
    it("stores artifacts, updates run, evaluates gates on success (primary path)", async () => {
      const metrics = { lcp_ms: 2000, fcp_ms: 1000 };
      const completedRun = { ...mockRun, status: "completed", metrics };
      mockRuns.update.mockResolvedValue(completedRun);

      const gateOutcomes = [
        { gate_id: "g-1", gate_name: "LCP", status: "passed", policy: "warn" },
      ];
      mockGates.evaluateGatesForRun.mockResolvedValue(gateOutcomes);

      const result = await service.completeRun({
        run_id: "run-1",
        success: true,
        metrics,
        lighthouse_report: { audits: {} },
        har: { log: {} },
      });

      expect(mockArtifacts.saveJson).toHaveBeenCalledTimes(2); // lighthouse + har
      expect(mockRuns.update).toHaveBeenCalledWith("run-1", expect.objectContaining({
        status: "completed",
        metrics,
      }));
      expect(mockGates.evaluateGatesForRun).toHaveBeenCalledWith("p-1", "run-1", metrics);
      expect(result.gateResults).toEqual(gateOutcomes);
    });

    it("sets status to 'failed' on unsuccessful run (decision tree)", async () => {
      const failedRun = { ...mockRun, status: "failed", error: "Timeout" };
      mockRuns.update.mockResolvedValue(failedRun);

      const result = await service.completeRun({
        run_id: "run-1",
        success: false,
        error: "Timeout",
      });

      expect(mockRuns.update).toHaveBeenCalledWith("run-1", expect.objectContaining({
        status: "failed",
        error: "Timeout",
      }));
      // Gates should NOT be evaluated on failure
      expect(mockGates.evaluateGatesForRun).not.toHaveBeenCalled();
      expect(result.gateResults).toEqual([]);
    });

    it("skips artifact storage when no artifacts provided (EP: no artifacts)", async () => {
      mockRuns.update.mockResolvedValue({ ...mockRun, status: "completed", metrics: { lcp_ms: 1500 } });

      await service.completeRun({
        run_id: "run-1",
        success: true,
        metrics: { lcp_ms: 1500 },
      });

      expect(mockArtifacts.saveJson).not.toHaveBeenCalled();
    });

    it("handles artifact save failure gracefully (structural: error path)", async () => {
      mockArtifacts.saveJson.mockRejectedValue(new Error("disk full"));
      mockRuns.update.mockResolvedValue({ ...mockRun, status: "completed", metrics: { lcp_ms: 2000 } });

      // Should not throw
      const result = await service.completeRun({
        run_id: "run-1",
        success: true,
        metrics: { lcp_ms: 2000 },
        lighthouse_report: { audits: {} },
      });

      expect(result.run.status).toBe("completed");
    });

    it("handles gate evaluation failure gracefully (structural: error path)", async () => {
      mockRuns.update.mockResolvedValue({ ...mockRun, status: "completed", metrics: { lcp_ms: 2000 } });
      mockGates.evaluateGatesForRun.mockRejectedValue(new Error("DB error"));

      const result = await service.completeRun({
        run_id: "run-1",
        success: true,
        metrics: { lcp_ms: 2000 },
      });

      expect(result.gateResults).toEqual([]);
    });
  });

  // -- getGateResultsForRun --
  describe("getGateResultsForRun", () => {
    it("returns gate results joined with gate info (primary path)", async () => {
      const mockResults = [
        { id: "gr-1", gate_name: "LCP Gate", status: "passed", policy: "warn" },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: mockResults });

      const results = await service.getGateResultsForRun("run-1");
      expect(results).toEqual(mockResults);
      expect(mockDb.query.mock.calls[0][0]).toContain("JOIN gates");
    });

    it("returns empty array when no results (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const results = await service.getGateResultsForRun("run-1");
      expect(results).toEqual([]);
    });
  });
});
