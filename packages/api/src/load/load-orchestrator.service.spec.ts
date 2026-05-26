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
});
