import { Test } from "@nestjs/testing";
import { LoadController } from "./load.controller";
import { LoadProfilesService } from "./load-profiles.service";
import { LoadOrchestratorService } from "./load-orchestrator.service";
import { ServerTelemetryService } from "./server-telemetry.service";
import { LoadCorrelationService } from "./load-correlation.service";
import { LoadGatesService } from "./load-gates.service";

describe("LoadController", () => {
  let controller: LoadController;
  const mockProfiles: Record<string, jest.Mock> = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({ id: "lp-1" }),
    create: jest.fn().mockResolvedValue({ id: "lp-1" }),
    update: jest.fn().mockResolvedValue({ id: "lp-1" }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  const mockOrch: Record<string, jest.Mock> = {
    findAll: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue({ id: "lr-1" }),
    createLoadRun: jest.fn().mockResolvedValue({ id: "lr-1", status: "queued" }),
    updateStatus: jest.fn().mockResolvedValue({ id: "lr-1", status: "running" }),
    cancel: jest.fn().mockResolvedValue({ id: "lr-1", status: "cancelled" }),
    deleteLoadRun: jest.fn().mockResolvedValue(undefined),
    claimLoadRun: jest.fn().mockResolvedValue({ id: "lr-1", url: "https://example.com" }),
    completeLoadRun: jest.fn().mockResolvedValue({ id: "lr-1", status: "completed" }),
    timeoutStaleRuns: jest.fn().mockResolvedValue(2),
    estimateCost: jest.fn().mockReturnValue({ vu_minutes: 10 }),
  };
  const mockTelemetry: Record<string, jest.Mock> = {
    getSnapshots: jest.fn().mockResolvedValue([]),
    getSummary: jest.fn().mockResolvedValue([]),
    recordSnapshot: jest.fn().mockResolvedValue(undefined),
    recordBatch: jest.fn().mockResolvedValue(3),
  };
  const mockCorrelation: Record<string, jest.Mock> = {
    getCorrelation: jest.fn().mockResolvedValue({ data_points: [] }),
  };
  const mockGates: Record<string, jest.Mock> = {
    evaluateForLoadRun: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [LoadController],
      providers: [
        { provide: LoadProfilesService, useValue: mockProfiles },
        { provide: LoadOrchestratorService, useValue: mockOrch },
        { provide: ServerTelemetryService, useValue: mockTelemetry },
        { provide: LoadCorrelationService, useValue: mockCorrelation },
        { provide: LoadGatesService, useValue: mockGates },
      ],
    }).compile();
    controller = module.get(LoadController);
  });

  it("lists profiles", async () => {
    await controller.listProfiles("p-1");
    expect(mockProfiles.findAll).toHaveBeenCalledWith("p-1");
  });

  it("creates load run", async () => {
    const result = await controller.createLoadRun({ project_id: "p-1" });
    expect(result.status).toBe("queued");
  });

  it("gets correlation", async () => {
    await controller.getCorrelation("lr-1");
    expect(mockCorrelation.getCorrelation).toHaveBeenCalledWith("lr-1");
  });

  it("evaluates load gates", async () => {
    await controller.evaluateLoadGates({
      load_run_id: "lr-1",
      actual_vus: 25,
      metrics_summary: { browser_lcp_p95: 2000 },
    });
    expect(mockGates.evaluateForLoadRun).toHaveBeenCalled();
  });

  it("deletes a load run", async () => {
    await controller.deleteLoadRun("lr-1");
    expect(mockOrch.deleteLoadRun).toHaveBeenCalledWith("lr-1");
  });

  it("claims a load run", async () => {
    const result = await controller.claimLoadRun();
    expect(result).toEqual({ id: "lr-1", url: "https://example.com" });
    expect(mockOrch.claimLoadRun).toHaveBeenCalled();
  });

  it("completes a load run", async () => {
    const result = await controller.completeLoadRun("lr-1", { success: true });
    expect(result.status).toBe("completed");
    expect(mockOrch.completeLoadRun).toHaveBeenCalledWith("lr-1", { success: true });
  });

  it("times out stale runs", async () => {
    const result = await controller.timeoutStaleRuns();
    expect(result).toEqual({ timed_out: 2 });
  });
});
