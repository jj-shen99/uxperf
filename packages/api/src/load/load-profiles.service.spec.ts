import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { LoadProfilesService } from "./load-profiles.service";
import { DatabaseService } from "../database/database.service";

describe("LoadProfilesService", () => {
  let service: LoadProfilesService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        LoadProfilesService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(LoadProfilesService);
  });

  describe("findAll", () => {
    it("returns profiles for project", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "lp-1", name: "ramp-50" }] });
      const result = await service.findAll("p-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("findById", () => {
    it("returns profile", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "lp-1" }] });
      expect((await service.findById("lp-1")).id).toBe("lp-1");
    });

    it("throws NotFoundException", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findById("nope")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("creates a load profile", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "lp-1", name: "ramp-50", target_vus: 50 }],
      });
      const result = await service.create({
        project_id: "p-1",
        name: "ramp-50",
        stages: [{ duration_s: 60, target_vus: 50 }],
        target_vus: 50,
      });
      expect(result.target_vus).toBe(50);
    });
  });

  describe("create with script_id", () => {
    it("passes script_id through to INSERT", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "lp-2", name: "journey-profile", script_id: "sc-1", target_vus: 10 }],
      });
      const result = await service.create({
        project_id: "p-1",
        name: "journey-profile",
        stages: [{ duration_s: 60, target_vus: 10 }],
        target_vus: 10,
        script_id: "sc-1",
      });
      // Verify script_id is the 11th param ($11)
      const insertParams = mockDb.query.mock.calls[0][1];
      expect(insertParams[10]).toBe("sc-1");
      expect(result.script_id).toBe("sc-1");
    });

    it("passes null when script_id omitted", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "lp-3", name: "no-script", script_id: null }],
      });
      await service.create({
        project_id: "p-1",
        name: "no-script",
        stages: [{ duration_s: 60, target_vus: 10 }],
        target_vus: 10,
      });
      const insertParams = mockDb.query.mock.calls[0][1];
      expect(insertParams[10]).toBeNull();
    });
  });

  describe("update with script_id", () => {
    it("passes script_id through to UPDATE", async () => {
      // findById
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "lp-1" }] });
      // update
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "lp-1", script_id: "sc-new" }] });

      const result = await service.update("lp-1", { script_id: "sc-new" });
      const updateParams = mockDb.query.mock.calls[1][1];
      expect(updateParams[8]).toBe("sc-new"); // $9 = script_id
      expect(result.script_id).toBe("sc-new");
    });
  });

  describe("delete", () => {
    it("deletes profile", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.delete("lp-1")).resolves.toBeUndefined();
    });

    it("throws on missing", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.delete("x")).rejects.toThrow(NotFoundException);
    });
  });

  describe("helpers", () => {
    it("computes total duration", () => {
      expect(service.totalDuration([
        { duration_s: 30, target_vus: 10 },
        { duration_s: 60, target_vus: 50 },
        { duration_s: 30, target_vus: 0 },
      ])).toBe(120);
    });

    it("computes peak VUs", () => {
      expect(service.peakVus([
        { duration_s: 30, target_vus: 10 },
        { duration_s: 60, target_vus: 50 },
        { duration_s: 30, target_vus: 0 },
      ])).toBe(50);
    });

    it("validates cache state", () => {
      expect(service.validateCacheState("cold").valid).toBe(true);
      expect(service.validateCacheState("warm").valid).toBe(true);
      expect(service.validateCacheState("production_replay").valid).toBe(true);
      expect(service.validateCacheState("invalid").valid).toBe(false);
    });
  });
});
