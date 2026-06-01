import { Test } from "@nestjs/testing";
import { StagingSmokeService } from "./staging-smoke.service";
import { DatabaseService } from "../database/database.service";

describe("StagingSmokeService (E-52)", () => {
  let service: StagingSmokeService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        StagingSmokeService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(StagingSmokeService);
  });

  describe("createSmokeTest", () => {
    it("creates a smoke test run", async () => {
      // Script count query
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: "3" }] })
        // Insert query
        .mockResolvedValueOnce({
          rows: [{
            id: "st-1",
            project_id: "proj-1",
            staging_url: "https://staging.example.com",
            deploy_sha: "abc123def456",
            status: "running",
            scripts_total: 3,
            scripts_passed: 0,
            scripts_failed: 0,
            gate_results: [],
            started_at: new Date().toISOString(),
            finished_at: null,
            duration_s: null,
            error: null,
            created_at: new Date().toISOString(),
          }],
        });

      const result = await service.createSmokeTest({
        project_id: "proj-1",
        staging_url: "https://staging.example.com",
        deploy_sha: "abc123def456",
      });

      expect(result.status).toBe("running");
      expect(result.scripts_total).toBe(3);
    });

    it("uses specific script IDs when provided", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ count: "2" }] })
        .mockResolvedValueOnce({
          rows: [{
            id: "st-2", project_id: "proj-1", staging_url: "https://staging.example.com",
            deploy_sha: "abc123", status: "running", scripts_total: 2,
            scripts_passed: 0, scripts_failed: 0, gate_results: [],
            started_at: new Date().toISOString(), finished_at: null,
            duration_s: null, error: null, created_at: new Date().toISOString(),
          }],
        });

      const result = await service.createSmokeTest({
        project_id: "proj-1",
        staging_url: "https://staging.example.com",
        deploy_sha: "abc123",
        scripts: ["script-1", "script-2"],
      });

      expect(result.scripts_total).toBe(2);
      const scriptQuery = mockDb.query.mock.calls[0][0];
      expect(scriptQuery).toContain("ANY($2::uuid[])");
    });
  });

  describe("completeSmokeTest", () => {
    it("marks smoke test as passed when all gates pass", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: "st-1", status: "passed", scripts_passed: 3, scripts_failed: 0,
          gate_results: [], finished_at: new Date().toISOString(), duration_s: 45,
        }],
      });

      const result = await service.completeSmokeTest("st-1", {
        scripts_passed: 3,
        scripts_failed: 0,
        gate_results: [
          { script_name: "smoke", metric: "lcp", actual_value: 2000, threshold: 2500, operator: "lte", status: "passed" },
        ],
      });

      expect(result.status).toBe("passed");
    });

    it("marks smoke test as failed when a gate fails", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: "st-1", status: "failed", scripts_passed: 2, scripts_failed: 1,
          gate_results: [], finished_at: new Date().toISOString(), duration_s: 60,
        }],
      });

      const result = await service.completeSmokeTest("st-1", {
        scripts_passed: 2,
        scripts_failed: 1,
        gate_results: [
          { script_name: "smoke", metric: "lcp", actual_value: 3000, threshold: 2500, operator: "lte", status: "failed" },
        ],
      });

      expect(result.status).toBe("failed");
    });
  });

  describe("evaluateSmokeGates", () => {
    it("evaluates metrics against thresholds", () => {
      const results = service.evaluateSmokeGates(
        { lcp: 2000, fcp: 1500, cls: 0.15 },
        {
          lcp: { operator: "lte", value: 2500 },
          fcp: { operator: "lte", value: 1800 },
          cls: { operator: "lte", value: 0.1 },
        },
      );

      expect(results).toHaveLength(3);
      expect(results.find((r) => r.metric === "lcp")?.status).toBe("passed");
      expect(results.find((r) => r.metric === "fcp")?.status).toBe("passed");
      expect(results.find((r) => r.metric === "cls")?.status).toBe("failed");
    });

    it("handles gte operator", () => {
      const results = service.evaluateSmokeGates(
        { lighthouse_performance: 0.85 },
        { lighthouse_performance: { operator: "gte", value: 0.9 } },
      );
      expect(results[0].status).toBe("failed");
    });
  });

  describe("timeoutStale", () => {
    it("times out stale smoke tests", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "st-old" }] });
      const count = await service.timeoutStale(30);
      expect(count).toBe(1);
    });

    it("handles missing table", async () => {
      mockDb.query.mockRejectedValueOnce({ code: "42P01" });
      const count = await service.timeoutStale();
      expect(count).toBe(0);
    });
  });

  describe("findAll", () => {
    it("returns smoke tests for a project", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "st-1" }, { id: "st-2" }] });
      const results = await service.findAll("proj-1");
      expect(results).toHaveLength(2);
    });
  });
});
