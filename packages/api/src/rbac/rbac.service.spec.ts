import { Test } from "@nestjs/testing";
import { NotFoundException, ForbiddenException } from "@nestjs/common";
import { RbacService } from "./rbac.service";
import { DatabaseService } from "../database/database.service";

describe("RbacService", () => {
  let service: RbacService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(RbacService);
  });

  // -- Users --
  describe("findAllUsers", () => {
    it("returns all users", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", email: "a@b.com" }] });
      const users = await service.findAllUsers();
      expect(users).toHaveLength(1);
    });
  });

  describe("findUserById", () => {
    it("returns user when found", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1" }] });
      const user = await service.findUserById("u-1");
      expect(user.id).toBe("u-1");
    });

    it("throws NotFoundException when not found", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findUserById("u-missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("createUser", () => {
    it("creates user with default viewer role", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", role: "viewer" }] });
      const user = await service.createUser({ email: "a@b.com", display_name: "Alice" });
      expect(user.role).toBe("viewer");
      expect(mockDb.query.mock.calls[0][1][2]).toBe("viewer");
    });

    it("creates user with explicit role", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", role: "admin" }] });
      const user = await service.createUser({ email: "a@b.com", display_name: "Admin", role: "admin" });
      expect(user.role).toBe("admin");
    });
  });

  describe("updateUser", () => {
    it("returns existing user if no fields changed", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1" }] });
      const user = await service.updateUser("u-1", {});
      expect(user.id).toBe("u-1");
    });

    it("updates specified fields", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", role: "editor" }] });
      const user = await service.updateUser("u-1", { role: "editor" });
      expect(user.role).toBe("editor");
    });
  });

  describe("deleteUser", () => {
    it("deletes existing user", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.deleteUser("u-1")).resolves.toBeUndefined();
    });

    it("throws NotFoundException when not found", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.deleteUser("u-missing")).rejects.toThrow(NotFoundException);
    });
  });

  // -- Project Members --
  describe("getProjectMembers", () => {
    it("returns members for project", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: "u-1", role: "editor" }] });
      const members = await service.getProjectMembers("p-1");
      expect(members).toHaveLength(1);
    });
  });

  describe("addProjectMember", () => {
    it("adds member with default viewer role", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: "u-1", role: "viewer" }] });
      const member = await service.addProjectMember({ project_id: "p-1", user_id: "u-1" });
      expect(member.role).toBe("viewer");
    });
  });

  // -- Authorization --
  describe("checkProjectAccess", () => {
    it("allows admin access to any project", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", role: "admin" }] });
      await expect(service.checkProjectAccess("u-1", "p-1", "owner")).resolves.toBeUndefined();
    });

    it("allows editor access when user is editor", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "u-1", role: "editor" }] }) // findUserById
        .mockResolvedValueOnce({ rows: [{ role: "editor" }] }); // project_members
      await expect(service.checkProjectAccess("u-1", "p-1", "editor")).resolves.toBeUndefined();
    });

    it("denies owner-level access when user is viewer", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "u-1", role: "viewer" }] })
        .mockResolvedValueOnce({ rows: [{ role: "viewer" }] });
      await expect(service.checkProjectAccess("u-1", "p-1", "owner")).rejects.toThrow(ForbiddenException);
    });

    it("denies access when user is not a member", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "u-1", role: "viewer" }] })
        .mockResolvedValueOnce({ rows: [] });
      await expect(service.checkProjectAccess("u-1", "p-1", "viewer")).rejects.toThrow(ForbiddenException);
    });

    it("allows admin full access without project membership", async () => {
      // Admin should bypass membership check entirely — only 1 DB call
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-admin", role: "admin" }] });
      await service.checkProjectAccess("u-admin", "p-any", "owner");
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it("requires membership lookup for non-admin users", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "u-1", role: "editor" }] })
        .mockResolvedValueOnce({ rows: [{ role: "viewer" }] });
      await expect(service.checkProjectAccess("u-1", "p-1", "viewer")).resolves.toBeUndefined();
      expect(mockDb.query).toHaveBeenCalledTimes(2);
    });

    it("denies editor-level access to viewer member", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "u-1", role: "viewer" }] })
        .mockResolvedValueOnce({ rows: [{ role: "viewer" }] });
      await expect(service.checkProjectAccess("u-1", "p-1", "editor")).rejects.toThrow(ForbiddenException);
    });

    it("allows owner-level access to owner member", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{ id: "u-1", role: "viewer" }] })
        .mockResolvedValueOnce({ rows: [{ role: "owner" }] });
      await expect(service.checkProjectAccess("u-1", "p-1", "owner")).resolves.toBeUndefined();
    });
  });

  // -- Role transitions --
  describe("role transitions", () => {
    it("promotes viewer to admin", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", role: "admin", display_name: "Alice" }] });
      const user = await service.updateUser("u-1", { role: "admin" });
      expect(user.role).toBe("admin");
      expect(mockDb.query.mock.calls[0][1]).toContain("admin");
    });

    it("demotes admin to viewer", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", role: "viewer" }] });
      const user = await service.updateUser("u-1", { role: "viewer" });
      expect(user.role).toBe("viewer");
    });

    it("deactivates a user", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", is_active: false }] });
      const user = await service.updateUser("u-1", { is_active: false });
      expect(user.is_active).toBe(false);
    });

    it("reactivates a user", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", is_active: true }] });
      const user = await service.updateUser("u-1", { is_active: true });
      expect(user.is_active).toBe(true);
    });

    it("updates multiple fields at once", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", display_name: "Bob", role: "editor", is_active: true }] });
      const user = await service.updateUser("u-1", { display_name: "Bob", role: "editor", is_active: true });
      expect(user.display_name).toBe("Bob");
      expect(user.role).toBe("editor");
      // Should have 4 params: 3 fields + id
      expect(mockDb.query.mock.calls[0][1]).toHaveLength(4);
    });

    it("throws NotFoundException when updating non-existent user", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.updateUser("u-missing", { role: "admin" })).rejects.toThrow(NotFoundException);
    });
  });

  // -- findUserByEmail --
  describe("findUserByEmail", () => {
    it("returns user when email matches", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", email: "alice@test.com" }] });
      const user = await service.findUserByEmail("alice@test.com");
      expect(user?.id).toBe("u-1");
    });

    it("returns null when email not found", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const user = await service.findUserByEmail("nobody@test.com");
      expect(user).toBeNull();
    });
  });

  // -- Project member role override --
  describe("addProjectMember with role override", () => {
    it("upserts member role on conflict", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: "u-1", role: "editor" }] });
      const member = await service.addProjectMember({ project_id: "p-1", user_id: "u-1", role: "editor" });
      expect(member.role).toBe("editor");
      expect(mockDb.query.mock.calls[0][0]).toContain("ON CONFLICT");
    });
  });

  // -- removeProjectMember --
  describe("removeProjectMember", () => {
    it("removes a member", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.removeProjectMember("p-1", "u-1")).resolves.toBeUndefined();
      expect(mockDb.query.mock.calls[0][1]).toEqual(["p-1", "u-1"]);
    });
  });
});
