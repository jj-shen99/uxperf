import { Test, TestingModule } from "@nestjs/testing";
import { RbacService } from "./rbac.service";
import { DatabaseService } from "../database/database.service";

const mockDb = { query: jest.fn() };

describe("RbacService - Demo Users & User Scoping", () => {
  let service: RbacService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RbacService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get<RbacService>(RbacService);
  });

  describe("createUser (demo user seeding)", () => {
    it("creates admin demo user with admin role", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-1", email: "admin@perftest.io", display_name: "Admin User", role: "admin", is_active: true, created_at: new Date(), updated_at: new Date() }],
      });
      const user = await service.createUser({ email: "admin@perftest.io", display_name: "Admin User", role: "admin" });
      expect(user.role).toBe("admin");
      expect(user.email).toBe("admin@perftest.io");
    });

    it("creates viewer demo user with viewer role", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-2", email: "viewer@perftest.io", display_name: "Bob Viewer", role: "viewer", is_active: true, created_at: new Date(), updated_at: new Date() }],
      });
      const user = await service.createUser({ email: "viewer@perftest.io", display_name: "Bob Viewer", role: "viewer" });
      expect(user.role).toBe("viewer");
    });

    it("defaults to viewer role when not specified", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-3", email: "test@test.com", display_name: "Test", role: "viewer", is_active: true, created_at: new Date(), updated_at: new Date() }],
      });
      const user = await service.createUser({ email: "test@test.com", display_name: "Test" });
      expect(user.role).toBe("viewer");
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.any(String),
        ["test@test.com", "Test", "viewer"],
      );
    });
  });

  describe("findAllUsers", () => {
    it("returns all users for admin visibility", async () => {
      const mockUsers = [
        { id: "u-1", email: "admin@perftest.io", display_name: "Admin", role: "admin" },
        { id: "u-2", email: "viewer@perftest.io", display_name: "Viewer", role: "viewer" },
        { id: "u-3", email: "editor@perftest.io", display_name: "Editor", role: "editor" },
      ];
      mockDb.query.mockResolvedValueOnce({ rows: mockUsers });
      const users = await service.findAllUsers();
      expect(users).toHaveLength(3);
      expect(users[0].role).toBe("admin");
    });
  });

  describe("checkProjectAccess - user scoping", () => {
    it("admin bypasses project membership check", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-admin", role: "admin" }],
      });
      await expect(service.checkProjectAccess("u-admin", "p-1", "viewer")).resolves.toBeUndefined();
    });

    it("non-admin needs project membership", async () => {
      // findUserById
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-viewer", role: "viewer" }],
      });
      // project_members query
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.checkProjectAccess("u-viewer", "p-1", "viewer")).rejects.toThrow("Not a member");
    });

    it("non-admin with membership passes access check", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-viewer", role: "viewer" }],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [{ project_id: "p-1", user_id: "u-viewer", role: "viewer" }],
      });
      await expect(service.checkProjectAccess("u-viewer", "p-1", "viewer")).resolves.toBeUndefined();
    });

    it("non-admin with insufficient role is rejected", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "u-viewer", role: "viewer" }],
      });
      mockDb.query.mockResolvedValueOnce({
        rows: [{ project_id: "p-1", user_id: "u-viewer", role: "viewer" }],
      });
      await expect(service.checkProjectAccess("u-viewer", "p-1", "editor")).rejects.toThrow("Requires editor");
    });
  });
});
