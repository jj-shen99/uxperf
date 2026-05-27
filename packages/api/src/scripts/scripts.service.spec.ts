import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ScriptsService } from "./scripts.service";
import { DatabaseService } from "../database/database.service";

// ============================================================
// Scripts Service — Unit Tests
// Techniques: EP, boundary, decision tree, primary path
// ============================================================

describe("ScriptsService", () => {
  let service: ScriptsService;
  let mockDb: { query: jest.Mock };

  const mockScript = {
    id: "s-1",
    project_id: "p-1",
    user_id: null,
    name: "Homepage Test",
    canonical_json: { steps: [] },
    source_prompt: null,
    version_ref: null,
    authoring_mode: "manual",
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ScriptsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(ScriptsService);
  });

  // -- findAll --
  describe("findAll", () => {
    it("returns all scripts without filter (primary path)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      const result = await service.findAll();
      expect(result).toEqual([mockScript]);
    });

    it("filters by projectId (EP: with filter)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.findAll("p-1");
      expect(mockDb.query.mock.calls[0][1]).toEqual(["p-1"]);
    });

    it("returns empty array when no scripts (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.findAll();
      expect(result).toEqual([]);
    });
  });

  // -- findById --
  describe("findById", () => {
    it("returns script when found (primary path)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      const result = await service.findById("s-1");
      expect(result).toEqual(mockScript);
    });

    it("throws NotFoundException when not found (decision tree)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findById("missing")).rejects.toThrow(NotFoundException);
    });
  });

  // -- create --
  describe("create", () => {
    it("creates script with required fields (primary path)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      const result = await service.create({
        project_id: "p-1",
        name: "Homepage Test",
        canonical_json: { steps: [] },
      });
      expect(result).toEqual(mockScript);
    });

    it("uses defaults for optional fields (EP: no optionals)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.create({
        project_id: "p-1",
        name: "Test",
        canonical_json: {},
      });
      const args = mockDb.query.mock.calls[0][1];
      expect(args[3]).toBeNull(); // source_prompt
      expect(args[4]).toBeNull(); // version_ref
      expect(args[5]).toBe("manual"); // authoring_mode
    });

    it("passes optional fields when provided (EP: with optionals)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.create({
        project_id: "p-1",
        name: "Test",
        canonical_json: {},
        source_prompt: "Load homepage",
        version_ref: "abc123",
        authoring_mode: "describe",
      });
      const args = mockDb.query.mock.calls[0][1];
      expect(args[3]).toBe("Load homepage");
      expect(args[4]).toBe("abc123");
      expect(args[5]).toBe("describe");
    });

    // Regression: "nl_authored" is NOT a valid Postgres enum value.
    // Valid values are: record, template, describe, manual.
    // NL-authored scripts should use "describe" mode.
    it.each(["record", "template", "describe", "manual"])(
      "accepts valid authoring_mode '%s' (regression: enum validation)",
      async (mode) => {
        mockDb.query.mockResolvedValueOnce({ rows: [{ ...mockScript, authoring_mode: mode }] });
        const result = await service.create({
          project_id: "p-1",
          name: "Test",
          canonical_json: {},
          authoring_mode: mode,
        });
        expect(result.authoring_mode).toBe(mode);
        const args = mockDb.query.mock.calls[0][1];
        expect(args[5]).toBe(mode);
      }
    );
  });

  // -- update --
  describe("update", () => {
    it("updates name (structural: single field)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ ...mockScript, name: "Updated" }] });
      const result = await service.update("s-1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });

    it("updates multiple fields at once", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.update("s-1", { name: "New", canonical_json: { steps: [{ intent: "click" }] } });
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("name = $1");
      expect(sql).toContain("canonical_json = $2");
    });

    it("returns existing script when no fields provided (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      const result = await service.update("s-1", {});
      expect(result).toEqual(mockScript);
    });

    it("throws NotFoundException on missing script (decision tree)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.update("missing", { name: "X" })).rejects.toThrow(NotFoundException);
    });
  });

  // -- findAll with user_id ownership (regression) --
  describe("findAll — user_id ownership filtering", () => {
    it("filters by user_id when non-admin (regression: user sees only own scripts)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.findAll(undefined, "user-1", false);
      const sql = mockDb.query.mock.calls[0][0];
      const args = mockDb.query.mock.calls[0][1];
      expect(sql).toContain("user_id = $");
      expect(args).toContain("user-1");
    });

    it("does NOT filter by user_id when admin (regression: admin sees all)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.findAll(undefined, "admin-1", true);
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).not.toContain("user_id");
    });

    it("filters by both project_id and user_id for non-admin", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.findAll("p-1", "user-1", false);
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("project_id = $");
      expect(sql).toContain("user_id = $");
    });

    it("filters only by project_id for admin", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.findAll("p-1", "admin-1", true);
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("project_id = $");
      expect(sql).not.toContain("user_id");
    });

    it("returns all when no filters and no userId", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.findAll();
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).not.toContain("WHERE");
    });
  });

  // -- create with user_id --
  describe("create — user_id ownership", () => {
    it("stores user_id when provided (regression: script ownership)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ ...mockScript, user_id: "user-1" }] });
      const result = await service.create({
        project_id: "p-1",
        name: "My Script",
        canonical_json: { steps: [] },
        user_id: "user-1",
      });
      expect(result.user_id).toBe("user-1");
      const args = mockDb.query.mock.calls[0][1];
      expect(args).toContain("user-1");
    });

    it("stores null user_id when not provided", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockScript] });
      await service.create({
        project_id: "p-1",
        name: "Anon Script",
        canonical_json: {},
      });
      const args = mockDb.query.mock.calls[0][1];
      // user_id is the last param (index 6)
      expect(args[6]).toBeNull();
    });
  });

  // -- delete --
  describe("delete", () => {
    it("deletes existing script (primary path)", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.delete("s-1")).resolves.toBeUndefined();
    });

    it("throws NotFoundException for missing script (decision tree)", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.delete("missing")).rejects.toThrow(NotFoundException);
    });
  });
});
