import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { RunsService, CreateRunDto, UpdateRunDto, RunRow } from "./runs.service";
import { DatabaseService } from "../database/database.service";

const mockDb = { query: jest.fn() };

const sampleRun: RunRow = {
  id: "00000000-0000-0000-0000-000000000010",
  script_id: null,
  project_id: "00000000-0000-0000-0000-000000000001",
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
  created_at: new Date("2024-01-01"),
  error: null,
  logs: null,
};

describe("RunsService", () => {
  let service: RunsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get<RunsService>(RunsService);
  });

  // ==========================================================
  // findAll — Decision Tree
  //   projectId provided → filter by project
  //   projectId absent → return all
  // ==========================================================

  describe("findAll — Decision Tree", () => {
    it("filters by projectId when provided", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await service.findAll("proj-1");
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("WHERE project_id = $1"),
        ["proj-1"]
      );
    });

    it("returns all when no projectId", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await service.findAll();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY created_at DESC"),
        []
      );
    });

    it("returns empty array when no runs exist", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      const result = await service.findAll();
      expect(result).toEqual([]);
    });
  });

  // ==========================================================
  // findAll — user_id ownership filtering (Regression)
  // ==========================================================

  describe("findAll — user_id ownership filtering", () => {
    it("filters by user_id for non-admin (regression: user sees own runs)", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await service.findAll(undefined, "user-1", false);
      const sql = mockDb.query.mock.calls[0][0] as string;
      const args = mockDb.query.mock.calls[0][1];
      expect(sql).toContain("user_id = $");
      expect(args).toContain("user-1");
    });

    it("does NOT filter by user_id for admin (regression: admin sees all)", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await service.findAll(undefined, "admin-1", true);
      const sql = mockDb.query.mock.calls[0][0] as string;
      expect(sql).not.toContain("user_id");
    });

    it("combines project_id and user_id filters for non-admin", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await service.findAll("proj-1", "user-1", false);
      const sql = mockDb.query.mock.calls[0][0] as string;
      expect(sql).toContain("project_id = $");
      expect(sql).toContain("user_id = $");
    });

    it("skips user_id filter when userId is undefined", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await service.findAll(undefined, undefined, false);
      const sql = mockDb.query.mock.calls[0][0] as string;
      expect(sql).not.toContain("user_id");
    });
  });

  // ==========================================================
  // create — user_id ownership (Regression)
  // ==========================================================

  describe("create — user_id ownership", () => {
    it("stores user_id when provided (regression: run ownership)", async () => {
      const dto: CreateRunDto = {
        project_id: "proj-1",
        config: { url: "https://example.com" },
        user_id: "user-1",
      };
      mockDb.query.mockResolvedValue({ rows: [{ ...sampleRun, user_id: "user-1" }] });
      const result = await service.create(dto);
      expect(result.user_id).toBe("user-1");
      const args = mockDb.query.mock.calls[0][1];
      expect(args).toContain("user-1");
    });

    it("stores null user_id when not provided", async () => {
      const dto: CreateRunDto = {
        project_id: "proj-1",
        config: { url: "https://example.com" },
      };
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      await service.create(dto);
      const args = mockDb.query.mock.calls[0][1];
      // user_id is the last param (index 7)
      expect(args[7]).toBeNull();
    });
  });

  // ==========================================================
  // findById — Boundary (found vs not-found)
  // ==========================================================

  describe("findById", () => {
    it("returns run when found", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      const result = await service.findById(sampleRun.id);
      expect(result.id).toBe(sampleRun.id);
    });

    it("throws NotFoundException when not found", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      await expect(service.findById("missing")).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // create — Equivalence Partitions
  //   Valid: minimal required fields
  //   Valid: all optional fields provided
  //   Default values: mode, engine, environment fallback
  // ==========================================================

  describe("create — Equivalence Partitions", () => {
    it("creates with minimal required fields (valid partition)", async () => {
      const dto: CreateRunDto = {
        project_id: "proj-1",
        config: { url: "https://example.com" },
      };
      mockDb.query.mockResolvedValue({ rows: [{ ...sampleRun, ...dto }] });
      const result = await service.create(dto);
      expect(result.project_id).toBe("proj-1");

      const args = mockDb.query.mock.calls[0][1];
      expect(args[1]).toBeNull();        // script_id defaults to null
      expect(args[2]).toBeNull();        // schedule_id defaults to null
      expect(args[3]).toBe("stability"); // mode default
      expect(args[4]).toBe("playwright_lighthouse"); // engine default
      expect(args[5]).toBe("staging");   // environment default
    });

    it("creates with all optional fields", async () => {
      const dto: CreateRunDto = {
        project_id: "proj-1",
        script_id: "script-1",
        mode: "load",
        engine: "k6_browser",
        environment: "production",
        config: { url: "https://prod.example.com", n_runs: 5 },
      };
      mockDb.query.mockResolvedValue({ rows: [{ ...sampleRun, ...dto }] });
      const result = await service.create(dto);

      const args = mockDb.query.mock.calls[0][1];
      expect(args[1]).toBe("script-1");
      expect(args[2]).toBeNull();         // schedule_id
      expect(args[3]).toBe("load");
      expect(args[4]).toBe("k6_browser");
      expect(args[5]).toBe("production");
    });

    // Regression: Launch from /runs with script selector should pass script_id
    it("passes script_id to DB when launching from script selector", async () => {
      const dto: CreateRunDto = {
        project_id: "proj-1",
        script_id: "script-abc",
        config: { url: "https://example.com", n_runs: 5 },
      };
      mockDb.query.mockResolvedValue({ rows: [{ ...sampleRun, script_id: "script-abc" }] });
      const result = await service.create(dto);
      expect(result.script_id).toBe("script-abc");

      const args = mockDb.query.mock.calls[0][1];
      expect(args[0]).toBe("proj-1");   // project_id
      expect(args[1]).toBe("script-abc"); // script_id
    });

    it("stores n_runs in config JSON", async () => {
      const dto: CreateRunDto = {
        project_id: "proj-1",
        config: { url: "https://example.com", n_runs: 10 },
      };
      mockDb.query.mockResolvedValue({ rows: [{ ...sampleRun, config: dto.config }] });
      await service.create(dto);

      const args = mockDb.query.mock.calls[0][1];
      const configJson = JSON.parse(args[6]);
      expect(configJson.n_runs).toBe(10);
    });
  });

  // ==========================================================
  // update — Decision Tree + Structural Coverage
  // Each field in UpdateRunDto is an independent decision:
  //   present → include in SET clause
  //   absent → skip
  // Full structural coverage: test each field individually and combined
  // ==========================================================

  describe("update — Decision Tree (field presence)", () => {
    it("updates only status when only status provided", async () => {
      mockDb.query.mockResolvedValue({
        rows: [{ ...sampleRun, status: "running" }],
      });
      const result = await service.update(sampleRun.id, { status: "running" });
      expect(result.status).toBe("running");

      const sql = mockDb.query.mock.calls[0][0] as string;
      expect(sql).toContain("status = $1");
      expect(sql).not.toContain("metrics");
    });

    it("updates only metrics when only metrics provided", async () => {
      const metrics = { lcp_ms: 2000 };
      mockDb.query.mockResolvedValue({
        rows: [{ ...sampleRun, metrics }],
      });
      await service.update(sampleRun.id, { metrics });

      const sql = mockDb.query.mock.calls[0][0] as string;
      expect(sql).toContain("metrics = $1");
      expect(sql).not.toContain("status");
    });

    it("updates multiple fields simultaneously", async () => {
      const dto: UpdateRunDto = {
        status: "completed",
        metrics: { lcp_ms: 1500 },
        started_at: "2024-01-01T00:00:00Z",
        finished_at: "2024-01-01T00:05:00Z",
      };
      mockDb.query.mockResolvedValue({
        rows: [{ ...sampleRun, ...dto }],
      });
      await service.update(sampleRun.id, dto);

      const sql = mockDb.query.mock.calls[0][0] as string;
      expect(sql).toContain("status = $1");
      expect(sql).toContain("metrics = $2");
      expect(sql).toContain("started_at = $3");
      expect(sql).toContain("finished_at = $4");
    });

    it("returns existing run when no fields provided (empty update)", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleRun] });
      const result = await service.update(sampleRun.id, {});
      expect(result).toEqual(sampleRun);
      // Should call findById, not UPDATE
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT"),
        [sampleRun.id]
      );
    });

    it("throws NotFoundException when update targets non-existent run", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      await expect(
        service.update("missing", { status: "running" })
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==========================================================
  // update — Structural Coverage: each UpdateRunDto field
  // Ensure every optional field path is exercised
  // ==========================================================

  describe("update — Structural Coverage (every field)", () => {
    const fields: Array<{ field: keyof UpdateRunDto; value: unknown; sqlSnippet: string }> = [
      { field: "status", value: "running", sqlSnippet: "status = $1" },
      { field: "metrics", value: { lcp_ms: 100 }, sqlSnippet: "metrics = $1" },
      { field: "lighthouse_report_path", value: "/reports/r.json", sqlSnippet: "lighthouse_report_path = $1" },
      { field: "trace_path", value: "/traces/t.zip", sqlSnippet: "trace_path = $1" },
      { field: "har_path", value: "/har/h.har", sqlSnippet: "har_path = $1" },
      { field: "cost_actual", value: 1.5, sqlSnippet: "cost_actual = $1" },
      { field: "started_at", value: "2024-01-01T00:00:00Z", sqlSnippet: "started_at = $1" },
      { field: "finished_at", value: "2024-01-01T00:01:00Z", sqlSnippet: "finished_at = $1" },
      { field: "error", value: "timeout", sqlSnippet: "error = $1" },
    ];

    it.each(fields)(
      "handles $field field in UPDATE SET clause",
      async ({ field, value, sqlSnippet }) => {
        mockDb.query.mockResolvedValue({
          rows: [{ ...sampleRun, [field]: value }],
        });

        await service.update(sampleRun.id, { [field]: value } as UpdateRunDto);

        const sql = mockDb.query.mock.calls[0][0] as string;
        expect(sql).toContain(sqlSnippet);
      }
    );
  });

  // ==========================================================
  // delete — Regression (empty body response bug)
  //   Successful delete: rowCount > 0 → returns void
  //   Missing run: rowCount === 0 → throws NotFoundException
  // ==========================================================

  describe("delete — Regression", () => {
    it("deletes an existing run (returns void, not JSON)", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });
      const result = await service.delete(sampleRun.id);
      expect(result).toBeUndefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        "DELETE FROM runs WHERE id = $1",
        [sampleRun.id]
      );
    });

    it("throws NotFoundException for non-existent run", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 0 });
      await expect(service.delete("missing-id")).rejects.toThrow(NotFoundException);
    });

    it("passes the correct id parameter to DELETE query", async () => {
      const testId = "00000000-0000-0000-0000-000000000099";
      mockDb.query.mockResolvedValue({ rowCount: 1 });
      await service.delete(testId);
      expect(mockDb.query.mock.calls[0][1]).toEqual([testId]);
    });
  });

  // ==========================================================
  // appendLog — Regression (worker console log streaming)
  //   Appends text to the runs.logs column via SQL concatenation.
  //   Throws NotFoundException if run does not exist.
  // ==========================================================

  describe("appendLog — Regression", () => {
    it("appends lines to an existing run", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });
      await service.appendLog(sampleRun.id, "[2026-01-01T00:00:00Z] Starting run\n");

      expect(mockDb.query).toHaveBeenCalledWith(
        `UPDATE runs SET logs = COALESCE(logs, '') || $1 WHERE id = $2`,
        ["[2026-01-01T00:00:00Z] Starting run\n", sampleRun.id]
      );
    });

    it("throws NotFoundException for non-existent run", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 0 });
      await expect(service.appendLog("missing-id", "line\n")).rejects.toThrow(NotFoundException);
    });

    it("returns void on success (no body)", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });
      const result = await service.appendLog(sampleRun.id, "test\n");
      expect(result).toBeUndefined();
    });

    it("concatenates multiple append calls in SQL", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });
      await service.appendLog(sampleRun.id, "line 1\n");
      await service.appendLog(sampleRun.id, "line 2\n");
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      // Both calls use COALESCE concatenation — DB handles ordering
      for (const call of mockDb.query.mock.calls) {
        expect(call[0]).toContain("COALESCE(logs, '') || $1");
      }
    });
  });

  // ==========================================================
  // State transition tests — Regression
  // Common valid transitions: queued→running→completed
  //                           queued→running→failed
  //                           queued→cancelled
  // ==========================================================

  describe("State transitions — Regression", () => {
    const transitions = [
      { from: "queued", to: "running" },
      { from: "running", to: "completed" },
      { from: "running", to: "failed" },
      { from: "queued", to: "cancelled" },
    ];

    it.each(transitions)(
      "allows $from → $to transition",
      async ({ from, to }) => {
        mockDb.query.mockResolvedValue({
          rows: [{ ...sampleRun, status: to }],
        });
        const result = await service.update(sampleRun.id, { status: to });
        expect(result.status).toBe(to);
      }
    );
  });
});
