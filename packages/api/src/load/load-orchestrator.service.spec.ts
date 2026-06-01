import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { LoadOrchestratorService } from "./load-orchestrator.service";
import { LoadProfilesService } from "./load-profiles.service";
import { DatabaseService } from "../database/database.service";

describe("LoadOrchestratorService", () => {
  let service: LoadOrchestratorService;
  let mockDb: { query: jest.Mock };
  let mockProfiles: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    mockProfiles = {
      findById: jest.fn(),
      validateCacheState: jest.fn().mockReturnValue({ valid: true, errors: [] }),
      totalDuration: jest.fn().mockReturnValue(120),
      peakVus: jest.fn().mockReturnValue(50),
    };
    const module = await Test.createTestingModule({
      providers: [
        LoadOrchestratorService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: LoadProfilesService, useValue: mockProfiles },
      ],
    }).compile();
    service = module.get(LoadOrchestratorService);
  });

  describe("createLoadRun", () => {
    it("creates a load run with quota and concurrency checks", async () => {
      // validatePreRun: project caps
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ engine_concurrency_caps: { k6_browser: 5 }, load_quota: { max_concurrent_load_runs: 3 } }] })
        // active count for engine
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        // total active
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        // checkQuota: project quota
        .mockResolvedValueOnce({ rows: [{ load_quota: { max_vu_minutes_per_day: 10000 } }] })
        // used today
        .mockResolvedValueOnce({ rows: [{ total: "0" }] })
        // insert
        .mockResolvedValueOnce({ rows: [{ id: "lr-1", status: "queued", target_vus: 10 }] });

      const result = await service.createLoadRun({
        project_id: "p-1",
        target_vus: 10,
        stages: [{ duration_s: 60, target_vus: 10 }],
      });
      expect(result.status).toBe("queued");
    });

    it("rejects when concurrency cap exceeded", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ engine_concurrency_caps: { k6_browser: 2 }, load_quota: { max_concurrent_load_runs: 5 } }] })
        .mockResolvedValueOnce({ rows: [{ count: "2" }] }); // at cap

      await expect(
        service.createLoadRun({ project_id: "p-1", target_vus: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects invalid cache state", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ engine_concurrency_caps: {}, load_quota: { max_concurrent_load_runs: 5 } }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] });

      mockProfiles.validateCacheState.mockReturnValueOnce({ valid: false, errors: ["bad state"] });

      await expect(
        service.createLoadRun({ project_id: "p-1", cache_state: "invalid" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("passes script_id through to INSERT", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ engine_concurrency_caps: {}, load_quota: { max_concurrent_load_runs: 3 } }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ load_quota: { max_vu_minutes_per_day: 10000 } }] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] })
        .mockResolvedValueOnce({ rows: [{ id: "lr-2", status: "queued", script_id: "sc-1" }] });

      const result = await service.createLoadRun({
        project_id: "p-1",
        target_vus: 5,
        stages: [{ duration_s: 30, target_vus: 5 }],
        script_id: "sc-1",
      });

      // Verify script_id was in the INSERT params (4th positional param)
      const insertCall = mockDb.query.mock.calls[5];
      expect(insertCall[1][3]).toBe("sc-1"); // $4 = script_id
      expect(result.script_id).toBe("sc-1");
    });

    it("inherits script_id from load profile when not explicitly provided", async () => {
      (mockProfiles.findById as jest.Mock).mockResolvedValueOnce({
        id: "lp-1",
        stages: [{ duration_s: 60, target_vus: 10 }],
        target_vus: 10,
        cache_state: "warm",
        script_id: "sc-profile",
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ engine_concurrency_caps: {}, load_quota: { max_concurrent_load_runs: 3 } }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ load_quota: { max_vu_minutes_per_day: 10000 } }] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] })
        .mockResolvedValueOnce({ rows: [{ id: "lr-3", status: "queued", script_id: "sc-profile" }] });

      await service.createLoadRun({
        project_id: "p-1",
        load_profile_id: "lp-1",
      });

      const insertCall = mockDb.query.mock.calls[5];
      expect(insertCall[1][3]).toBe("sc-profile");
    });

    it("explicit script_id overrides profile script_id", async () => {
      (mockProfiles.findById as jest.Mock).mockResolvedValueOnce({
        id: "lp-1",
        stages: [{ duration_s: 60, target_vus: 10 }],
        target_vus: 10,
        cache_state: "warm",
        script_id: "sc-profile",
      });

      mockDb.query
        .mockResolvedValueOnce({ rows: [{ engine_concurrency_caps: {}, load_quota: { max_concurrent_load_runs: 3 } }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ load_quota: { max_vu_minutes_per_day: 10000 } }] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] })
        .mockResolvedValueOnce({ rows: [{ id: "lr-4", status: "queued", script_id: "sc-explicit" }] });

      await service.createLoadRun({
        project_id: "p-1",
        load_profile_id: "lp-1",
        script_id: "sc-explicit",
      });

      const insertCall = mockDb.query.mock.calls[5];
      expect(insertCall[1][3]).toBe("sc-explicit");
    });

    it("passes null script_id when none provided", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ engine_concurrency_caps: {}, load_quota: { max_concurrent_load_runs: 3 } }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ load_quota: { max_vu_minutes_per_day: 10000 } }] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] })
        .mockResolvedValueOnce({ rows: [{ id: "lr-5", status: "queued", script_id: null }] });

      await service.createLoadRun({
        project_id: "p-1",
        target_vus: 5,
        stages: [{ duration_s: 30, target_vus: 5 }],
      });

      const insertCall = mockDb.query.mock.calls[5];
      expect(insertCall[1][3]).toBeNull();
    });
  });

  describe("estimateCost", () => {
    it("computes VU-minutes from stages", () => {
      const cost = service.estimateCost(
        [
          { duration_s: 60, target_vus: 10 },
          { duration_s: 120, target_vus: 50 },
          { duration_s: 60, target_vus: 0 },
        ],
        0,
      );
      expect(cost.vu_minutes).toBeGreaterThan(0);
      expect(cost.currency).toBe("USD");
    });

    it("returns zero for empty stages", () => {
      const cost = service.estimateCost([], 0);
      expect(cost.vu_minutes).toBe(0);
    });
  });

  describe("findAll", () => {
    it("returns load runs", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "lr-1" }] });
      const result = await service.findAll("p-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("updateStatus", () => {
    it("transitions status", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "lr-1", status: "running" }] });
      const result = await service.updateStatus("lr-1", "running");
      expect(result.status).toBe("running");
    });
  });

  describe("cancel", () => {
    it("cancels a load run", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "lr-1", status: "cancelled" }] });
      const result = await service.cancel("lr-1");
      expect(result.status).toBe("cancelled");
    });
  });

  describe("claimLoadRun", () => {
    it("claims the next queued load run and enriches with project URL", async () => {
      mockDb.query
        // UPDATE ... RETURNING *
        .mockResolvedValueOnce({
          rows: [{ id: "lr-10", project_id: "p-1", status: "running", target_vus: 20, engine: "k6_browser" }],
        })
        // SELECT environment_configs FROM projects
        .mockResolvedValueOnce({
          rows: [{ environment_configs: { staging: { url: "https://staging.example.com" } } }],
        });

      const result = await service.claimLoadRun();
      expect(result).not.toBeNull();
      expect(result!.id).toBe("lr-10");
      expect(result!.url).toBe("https://staging.example.com");
    });

    it("returns null when no queued load runs", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.claimLoadRun();
      expect(result).toBeNull();
    });

    it("falls back to production URL when staging not set", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: "lr-11", project_id: "p-2", status: "running", target_vus: 5 }],
        })
        .mockResolvedValueOnce({
          rows: [{ environment_configs: { production: { url: "https://prod.example.com" } } }],
        });

      const result = await service.claimLoadRun();
      expect(result!.url).toBe("https://prod.example.com");
    });

    it("returns empty URL when no environment_configs", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: "lr-12", project_id: "p-3", status: "running", target_vus: 1 }],
        })
        .mockResolvedValueOnce({
          rows: [{ environment_configs: {} }],
        });

      const result = await service.claimLoadRun();
      expect(result!.url).toBe("");
    });
  });

  describe("createLoadRun with url", () => {
    it("passes url through to INSERT when provided", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ engine_concurrency_caps: {}, load_quota: { max_concurrent_load_runs: 3 } }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ load_quota: { max_vu_minutes_per_day: 10000 } }] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] })
        .mockResolvedValueOnce({ rows: [{ id: "lr-url-1", status: "queued", url: "https://test.com" }] });

      const result = await service.createLoadRun({
        project_id: "p-1",
        target_vus: 5,
        stages: [{ duration_s: 30, target_vus: 5 }],
        url: "https://test.com",
      });

      const insertCall = mockDb.query.mock.calls[5];
      expect(insertCall[1][4]).toBe("https://test.com"); // $5 = url
      expect(result.url).toBe("https://test.com");
    });

    it("passes null url when not provided", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ engine_concurrency_caps: {}, load_quota: { max_concurrent_load_runs: 3 } }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ load_quota: { max_vu_minutes_per_day: 10000 } }] })
        .mockResolvedValueOnce({ rows: [{ total: "0" }] })
        .mockResolvedValueOnce({ rows: [{ id: "lr-url-2", status: "queued", url: null }] });

      await service.createLoadRun({
        project_id: "p-1",
        target_vus: 5,
        stages: [{ duration_s: 30, target_vus: 5 }],
      });

      const insertCall = mockDb.query.mock.calls[5];
      expect(insertCall[1][4]).toBeNull(); // $5 = url
    });
  });

  describe("claimLoadRun url precedence", () => {
    it("uses load run's own url when set (no project lookup)", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: "lr-20", project_id: "p-1", status: "running", target_vus: 5, url: "https://mysite.com" }],
        });
      // Should NOT call project query since url is already set

      const result = await service.claimLoadRun();
      expect(result!.url).toBe("https://mysite.com");
      // Only 1 query (UPDATE), no project SELECT
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it("falls back to project environment_configs when url is null", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: "lr-21", project_id: "p-1", status: "running", target_vus: 5, url: null }],
        })
        .mockResolvedValueOnce({
          rows: [{ environment_configs: { staging: { url: "https://staging.example.com" } } }],
        });

      const result = await service.claimLoadRun();
      expect(result!.url).toBe("https://staging.example.com");
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it("falls back to project environment_configs when url is empty string", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{ id: "lr-22", project_id: "p-1", status: "running", target_vus: 5, url: "" }],
        })
        .mockResolvedValueOnce({
          rows: [{ environment_configs: { production: { url: "https://prod.example.com" } } }],
        });

      const result = await service.claimLoadRun();
      expect(result!.url).toBe("https://prod.example.com");
    });
  });

  describe("deleteLoadRun", () => {
    it("deletes an existing load run", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.deleteLoadRun("lr-del-1")).resolves.toBeUndefined();
      expect(mockDb.query).toHaveBeenCalledWith(
        "DELETE FROM load_runs WHERE id = $1",
        ["lr-del-1"],
      );
    });

    it("throws NotFoundException when load run does not exist", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.deleteLoadRun("lr-nonexistent")).rejects.toThrow("not found");
    });
  });

  describe("completeLoadRun", () => {
    it("completes a successful load run", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "lr-10", status: "completed", metrics_summary: { lcp_ms: 1500 } }],
      });
      const result = await service.completeLoadRun("lr-10", {
        success: true,
        metrics_summary: { lcp_ms: 1500 },
        actual_peak_vus: 20,
        vu_minutes: 30,
        duration_s: 120,
      });
      expect(result.status).toBe("completed");
    });

    it("fails a load run with error", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "lr-10", status: "failed", error: "k6 crashed" }],
      });
      const result = await service.completeLoadRun("lr-10", {
        success: false,
        error: "k6 crashed",
      });
      expect(result.status).toBe("failed");
    });
  });
});
