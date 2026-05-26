import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ScriptVersionsService } from "./script-versions.service";
import { DatabaseService } from "../database/database.service";

describe("ScriptVersionsService", () => {
  let service: ScriptVersionsService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ScriptVersionsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(ScriptVersionsService);
  });

  describe("listVersions", () => {
    it("returns versions for a script", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: "v-2", version_number: 2 },
          { id: "v-1", version_number: 1 },
        ],
      });
      const versions = await service.listVersions("s-1");
      expect(versions).toHaveLength(2);
      expect(versions[0].version_number).toBe(2);
    });
  });

  describe("getVersion", () => {
    it("returns specific version", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "v-1", version_number: 1 }] });
      const version = await service.getVersion("s-1", 1);
      expect(version.version_number).toBe(1);
    });

    it("throws NotFoundException when not found", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.getVersion("s-1", 99)).rejects.toThrow(NotFoundException);
    });
  });

  describe("createVersion", () => {
    it("auto-increments version_number", async () => {
      // max version query
      mockDb.query.mockResolvedValueOnce({ rows: [{ max_ver: 3 }] });
      // INSERT
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "v-4", version_number: 4, script_id: "s-1" }],
      });

      const version = await service.createVersion({
        script_id: "s-1",
        canonical_json: { steps: [] },
        commit_sha: "abc123",
        commit_message: "Update script",
      });

      expect(version.version_number).toBe(4);
      // Verify INSERT params
      const insertParams = mockDb.query.mock.calls[1][1];
      expect(insertParams[1]).toBe(4); // version_number
      expect(insertParams[3]).toBe("abc123"); // commit_sha
    });

    it("starts at version 1 when no prior versions", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ max_ver: 0 }] });
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "v-1", version_number: 1 }],
      });

      const version = await service.createVersion({
        script_id: "s-1",
        canonical_json: { steps: [] },
      });

      expect(version.version_number).toBe(1);
    });
  });

  describe("diffVersions", () => {
    it("returns both versions", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "v-1", version_number: 1, canonical_json: { old: true } }] })
        .mockResolvedValueOnce({ rows: [{ id: "v-2", version_number: 2, canonical_json: { new: true } }] });

      const diff = await service.diffVersions("s-1", 1, 2);
      expect(diff.from.version_number).toBe(1);
      expect(diff.to.version_number).toBe(2);
    });
  });
});
