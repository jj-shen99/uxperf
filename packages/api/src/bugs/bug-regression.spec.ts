/**
 * Regression tests for bugs discovered during Phase 1 audit.
 * Each test documents a specific bug with root cause and fix.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ArtifactsService } from "../artifacts/artifacts.service";
import { GatesService } from "../gates/gates.service";

// ============================================================
// Bug 1: gates.controller.ts getRunResults returned all gates
// instead of gate results for a specific run.
// Root cause: called findAll() instead of getResultsForRun(runId)
// ============================================================
describe("Bug 1 regression: GatesService.getResultsForRun", () => {
  let service: GatesService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    const { Test } = require("@nestjs/testing");
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        GatesService,
        { provide: require("../database/database.service").DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(GatesService);
  });

  it("queries gate_results by run_id, not gates table", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "gr-1", gate_name: "LCP Gate", status: "passed" }],
    });
    const results = await service.getResultsForRun("run-123");
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toContain("gate_results");
    expect(sql).toContain("run_id = $1");
    expect(mockDb.query.mock.calls[0][1]).toEqual(["run-123"]);
  });

  it("returns empty array when no results exist", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const results = await service.getResultsForRun("nonexistent");
    expect(results).toEqual([]);
  });
});

// ============================================================
// Bug 2: Port mismatch (API default 3001 vs dashboard 4000)
// Root cause: main.ts used port 3001 while api.ts client used 4000
// Fix: Aligned API to port 4000
// ============================================================
describe("Bug 2 regression: API default port", () => {
  it("main.ts defaults to port 4000 matching dashboard client", () => {
    const mainContent = fs.readFileSync(
      path.join(__dirname, "../main.ts"),
      "utf-8"
    );
    expect(mainContent).toContain("process.env.PORT || 4000");
    expect(mainContent).not.toContain("|| 3001");
  });
});

// ============================================================
// Bug 3: ArtifactsService path traversal vulnerability
// Root cause: runId was passed directly to path.join without sanitization
// Fix: Added safePath() validation
// ============================================================
describe("Bug 3 regression: ArtifactsService path traversal", () => {
  let service: ArtifactsService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "artifacts-bug3-"));
    process.env.ARTIFACTS_DIR = tmpDir;
    service = new ArtifactsService();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ARTIFACTS_DIR;
  });

  it("rejects traversal in runId for saveJson", async () => {
    await expect(
      service.saveJson("../../etc", "passwd", { hacked: true })
    ).rejects.toThrow(/traversal/i);
  });

  it("rejects traversal in filename for saveJson", async () => {
    await expect(
      service.saveJson("run-1", "../../etc/passwd", { hacked: true })
    ).rejects.toThrow(/traversal/i);
  });

  it("rejects traversal in readJson", async () => {
    await expect(
      service.readJson("../../etc/passwd")
    ).rejects.toThrow(/traversal/i);
  });

  it("exists() returns false for traversal paths instead of throwing", () => {
    expect(service.exists("../../etc/passwd")).toBe(false);
  });

  it("listForRun returns empty for traversal runId", async () => {
    const result = await service.listForRun("../../etc");
    expect(result).toEqual([]);
  });

  it("getAbsolutePath rejects traversal", () => {
    expect(() => service.getAbsolutePath("../../etc/passwd")).toThrow(/traversal/i);
  });

  it("allows legitimate paths", async () => {
    await service.saveJson("run-abc-123", "report.json", { ok: true });
    expect(service.exists("run-abc-123/report.json")).toBe(true);
  });
});

// ============================================================
// Bug 4: Missing schedule_id in RunsService.create
// Root cause: INSERT query didn't include schedule_id column
// Fix: Added schedule_id to DTO and INSERT
// ============================================================
describe("Bug 4 regression: schedule_id in RunsService.create", () => {
  it("RunsService source includes schedule_id in INSERT", () => {
    const serviceSource = fs.readFileSync(
      path.join(__dirname, "../runs/runs.service.ts"),
      "utf-8"
    );
    expect(serviceSource).toContain("schedule_id?: string");
    expect(serviceSource).toMatch(/INSERT INTO runs.*schedule_id/);
  });
});

// ============================================================
// Bug 5: Route ordering in RunsController
// Root cause: @Post("claim") after @Get(":id") could cause
// NestJS to route GET /runs/claim through findOne(id="claim")
// Fix: Static routes before parameterized routes
// ============================================================
describe("Bug 5 regression: route ordering in RunsController", () => {
  it("claim route is declared before :id route", () => {
    const controllerSource = fs.readFileSync(
      path.join(__dirname, "../runs/runs.controller.ts"),
      "utf-8"
    );
    const claimPos = controllerSource.indexOf("Post(\"claim\")");
    const getIdPos = controllerSource.indexOf("Get(\":id\")");
    const getIdGatesPos = controllerSource.indexOf("Get(\":id/gates\")");

    expect(claimPos).toBeGreaterThan(-1);
    expect(getIdPos).toBeGreaterThan(-1);
    expect(getIdGatesPos).toBeGreaterThan(-1);

    // Static routes before parameterized
    expect(claimPos).toBeLessThan(getIdPos);
    // Sub-resource routes before catch-all
    expect(getIdGatesPos).toBeLessThan(getIdPos);
  });
});
