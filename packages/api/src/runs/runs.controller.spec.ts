import { Test, TestingModule } from "@nestjs/testing";
import { RunsController } from "./runs.controller";
import { RunsService, RunRow } from "./runs.service";
import { RunOrchestratorService } from "./run-orchestrator.service";
import { DatabaseService } from "../database/database.service";
import { RbacService } from "../rbac/rbac.service";

const sampleRun: RunRow = {
  id: "run-1",
  script_id: null,
  project_id: "proj-1",
  user_id: null,
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
  logs: null,
};

const mockDb = { query: jest.fn() };
const mockOrchestrator = {
  claimNextRun: jest.fn(),
  completeRun: jest.fn(),
  getGateResultsForRun: jest.fn(),
};
const mockRbac = {
  findUserById: jest.fn().mockResolvedValue({ id: "u-1", role: "viewer" }),
  findAllUsers: jest.fn(),
  findUserByEmail: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
  getProjectMembers: jest.fn(),
  addProjectMember: jest.fn(),
  removeProjectMember: jest.fn(),
  checkProjectAccess: jest.fn(),
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
        { provide: RbacService, useValue: mockRbac },
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

  // ==========================================================
  // Admin role server-validation (Security regression)
  // ==========================================================

  describe("findAll — admin role server-validation", () => {
    it("looks up user role from DB instead of trusting is_admin param (security)", async () => {
      mockRbac.findUserById.mockResolvedValueOnce({ id: "u-1", role: "viewer" });
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      // Pass is_admin=true but user is viewer — should still filter by user_id
      await controller.findAll("proj-1", "u-1", "true");
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("user_id = $");
    });

    it("skips user_id filter when user is actually admin", async () => {
      mockRbac.findUserById.mockResolvedValueOnce({ id: "u-admin", role: "admin" });
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await controller.findAll(undefined, "u-admin");
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).not.toContain("user_id");
    });

    it("treats unknown user_id as non-admin", async () => {
      mockRbac.findUserById.mockRejectedValueOnce(new Error("Not found"));
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await controller.findAll(undefined, "u-unknown");
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("user_id = $");
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

  // ==========================================================
  // appendLog (POST /runs/:id/log) — Regression
  //   Route must not 404. Worker posts log lines here.
  //   Verifies the controller delegates to RunsService.appendLog.
  // ==========================================================

  describe("appendLog (POST /runs/:id/log)", () => {
    it("delegates to runsService.appendLog with correct args", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });
      await controller.appendLog("run-1", { lines: "[ts] Starting run\n" });
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("COALESCE(logs, '') || $1"),
        ["[ts] Starting run\n", "run-1"]
      );
    });

    it("method exists on the controller (route not 404)", () => {
      expect(typeof controller.appendLog).toBe("function");
    });
  });

  // ==========================================================
  // logs field — Regression
  //   RunRow includes logs field; GET /runs/:id returns it.
  // ==========================================================

  describe("logs field in run response", () => {
    it("GET /runs/:id includes logs field", async () => {
      const runWithLogs = { ...sampleRun, logs: "[ts] test line\n" };
      mockDb.query.mockResolvedValue({ rows: [runWithLogs] });
      const result = await controller.findOne(sampleRun.id);
      expect(result.logs).toBe("[ts] test line\n");
    });

    it("logs defaults to null for new runs", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      const result = await controller.findOne(sampleRun.id);
      expect(result.logs).toBeNull();
    });
  });
});
