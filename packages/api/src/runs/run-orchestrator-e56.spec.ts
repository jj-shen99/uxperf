/**
 * Run Orchestrator E-56 Tests
 *
 * E-56: Change-point → anomaly auto-creation wiring
 * When a run completes, the orchestrator runs change-point detection
 * and auto-creates anomalies via AnomaliesService.analyzeProject.
 */
import { Test } from "@nestjs/testing";
import { RunOrchestratorService } from "./run-orchestrator.service";
import { RunsService } from "./runs.service";
import { GatesService } from "../gates/gates.service";
import { ArtifactsService } from "../artifacts/artifacts.service";
import { GitHubCheckService } from "../github/github-check.service";
import { BaselinesService } from "../baselines/baselines.service";
import { NotificationsService } from "../notifications/notifications.service";
import { AnomaliesService } from "../analytics/anomalies.service";
import { DatabaseService } from "../database/database.service";

describe("RunOrchestratorService — E-56 anomaly wiring", () => {
  let service: RunOrchestratorService;
  let mockRuns: Record<string, jest.Mock>;
  let mockGates: Record<string, jest.Mock>;
  let mockArtifacts: Record<string, jest.Mock>;
  let mockGithub: Record<string, jest.Mock>;
  let mockBaselines: Record<string, jest.Mock>;
  let mockDb: { query: jest.Mock };
  let mockNotifications: { dispatch: jest.Mock };
  let mockAnomalies: { analyzeProject: jest.Mock };

  const mockRun = {
    id: "run-1",
    project_id: "p-1",
    script_id: "s-1",
    status: "running",
    environment: "staging",
  };

  beforeEach(async () => {
    mockRuns = {
      findById: jest.fn().mockResolvedValue(mockRun),
      update: jest.fn().mockResolvedValue(mockRun),
    };
    mockGates = {
      evaluateGatesForRun: jest.fn().mockResolvedValue([]),
    };
    mockArtifacts = {
      saveJson: jest.fn().mockResolvedValue("artifact-path"),
    };
    mockGithub = {
      reportGateResults: jest.fn().mockResolvedValue(undefined),
    };
    mockBaselines = {
      refreshBaselines: jest.fn().mockResolvedValue([]),
    };
    mockDb = { query: jest.fn() };
    mockNotifications = { dispatch: jest.fn().mockResolvedValue(1) };
    mockAnomalies = { analyzeProject: jest.fn().mockResolvedValue([]) };

    const module = await Test.createTestingModule({
      providers: [
        RunOrchestratorService,
        { provide: RunsService, useValue: mockRuns },
        { provide: GatesService, useValue: mockGates },
        { provide: ArtifactsService, useValue: mockArtifacts },
        { provide: GitHubCheckService, useValue: mockGithub },
        { provide: BaselinesService, useValue: mockBaselines },
        { provide: DatabaseService, useValue: mockDb },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: AnomaliesService, useValue: mockAnomalies },
      ],
    }).compile();

    service = module.get(RunOrchestratorService);
  });

  it("calls analyzeProject on successful run with metrics", async () => {
    await service.completeRun({
      run_id: "run-1",
      success: true,
      metrics: { lcp_ms: 2000 },
    });

    expect(mockAnomalies.analyzeProject).toHaveBeenCalledTimes(1);
    expect(mockAnomalies.analyzeProject).toHaveBeenCalledWith("p-1", "staging");
  });

  it("does not call analyzeProject on failed run", async () => {
    await service.completeRun({
      run_id: "run-1",
      success: false,
      error: "timeout",
    });

    expect(mockAnomalies.analyzeProject).not.toHaveBeenCalled();
  });

  it("does not call analyzeProject when metrics are empty", async () => {
    await service.completeRun({
      run_id: "run-1",
      success: true,
      metrics: undefined,
    });

    expect(mockAnomalies.analyzeProject).not.toHaveBeenCalled();
  });

  it("logs anomalies when detected", async () => {
    mockAnomalies.analyzeProject.mockResolvedValue([
      {
        id: "a-1",
        metric: "lcp_ms",
        severity: "critical",
        description: "LCP spiked",
      },
    ]);

    // Should not throw
    await service.completeRun({
      run_id: "run-1",
      success: true,
      metrics: { lcp_ms: 5000 },
    });

    expect(mockAnomalies.analyzeProject).toHaveBeenCalledTimes(1);
  });

  it("does not throw if analyzeProject fails", async () => {
    mockAnomalies.analyzeProject.mockRejectedValue(
      new Error("DB connection lost"),
    );

    // Should not throw — error is caught internally
    await expect(
      service.completeRun({
        run_id: "run-1",
        success: true,
        metrics: { lcp_ms: 2000 },
      }),
    ).resolves.toBeDefined();
  });

  it("runs anomaly detection after baselines are refreshed", async () => {
    const callOrder: string[] = [];
    mockBaselines.refreshBaselines.mockImplementation(async () => {
      callOrder.push("baselines");
      return [];
    });
    mockAnomalies.analyzeProject.mockImplementation(async () => {
      callOrder.push("anomalies");
      return [];
    });

    await service.completeRun({
      run_id: "run-1",
      success: true,
      metrics: { lcp_ms: 2000 },
    });

    expect(callOrder).toEqual(["baselines", "anomalies"]);
  });
});
