import { Test, TestingModule } from "@nestjs/testing";
import { RunsController } from "./runs.controller";
import { RunsService, RunRow } from "./runs.service";
import { RunOrchestratorService } from "./run-orchestrator.service";
import { DatabaseService } from "../database/database.service";

const sampleRun: RunRow = {
  id: "run-1",
  script_id: null,
  project_id: "proj-1",
  mode: "stability",
  engine: "playwright_lighthouse",
  environment: "staging",
  status: "queued",
  config: { url: "https://example.com" },
  metrics: null,
  lighthouse_report_path: null,
  trace_path: null,
  har_path: null,
  cost_estimate: null,
  cost_actual: null,
  started_at: null,
  finished_at: null,
  created_at: new Date(),
  error: null,
};

const mockDb = { query: jest.fn() };
const mockOrchestrator = {
  claimNextRun: jest.fn(),
  completeRun: jest.fn(),
  getGateResultsForRun: jest.fn(),
};

describe("RunsController", () => {
  let controller: RunsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RunsController],
      providers: [
        RunsService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: RunOrchestratorService, useValue: mockOrchestrator },
      ],
    }).compile();

    controller = module.get<RunsController>(RunsController);
  });

  // ==========================================================
  // Primary Path Coverage
  // ==========================================================

  describe("findAll (GET /runs)", () => {
    it("returns runs without filter", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      const result = await controller.findAll();
      expect(result).toEqual([sampleRun]);
    });

    it("passes project_id filter when provided", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await controller.findAll("proj-1");
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE project_id"),
        ["proj-1"]
      );
    });
  });

  describe("findOne (GET /runs/:id)", () => {
    it("returns a single run", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      const result = await controller.findOne(sampleRun.id);
      expect(result.id).toBe(sampleRun.id);
    });
  });

  describe("create (POST /runs)", () => {
    it("creates and returns a run", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      const result = await controller.create({
        project_id: "proj-1",
        config: { url: "https://example.com" },
      });
      expect(result).toEqual(sampleRun);
    });
  });

  describe("update (PATCH /runs/:id)", () => {
    it("updates and returns the run", async () => {
      const updated = { ...sampleRun, status: "running" };
      mockDb.query.mockResolvedValue({ rows: [updated] });
      const result = await controller.update(sampleRun.id, {
        status: "running",
      });
      expect(result.status).toBe("running");
    });
  });
});
