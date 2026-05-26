import { Test, TestingModule } from "@nestjs/testing";
import { RbacController } from "./rbac.controller";
import { RbacService } from "./rbac.service";
import { DatabaseService } from "../database/database.service";

const mockDb = { query: jest.fn() };

describe("RbacController", () => {
  let controller: RbacController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RbacController],
      providers: [
        RbacService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    controller = module.get<RbacController>(RbacController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("listUsers (GET /rbac/users)", () => {
    it("delegates to service.findAllUsers", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", email: "a@b.com" }] });
      const result = await controller.listUsers();
      expect(result).toHaveLength(1);
    });
  });

  describe("getUser (GET /rbac/users/:id)", () => {
    it("returns user by id", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1" }] });
      const result = await controller.getUser("u-1");
      expect(result.id).toBe("u-1");
    });
  });

  describe("createUser (POST /rbac/users)", () => {
    it("creates user", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", email: "a@b.com", role: "viewer" }] });
      const result = await controller.createUser({ email: "a@b.com", display_name: "Alice" });
      expect(result.email).toBe("a@b.com");
    });
  });

  describe("updateUser (PATCH /rbac/users/:id)", () => {
    it("updates user", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "u-1", role: "editor" }] });
      const result = await controller.updateUser("u-1", { role: "editor" });
      expect(result.role).toBe("editor");
    });
  });

  describe("deleteUser (DELETE /rbac/users/:id)", () => {
    it("deletes user", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(controller.deleteUser("u-1")).resolves.toBeUndefined();
    });
  });

  describe("getProjectMembers (GET /rbac/projects/:id/members)", () => {
    it("returns project members", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: "u-1", role: "editor" }] });
      const result = await controller.getProjectMembers("p-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("addProjectMember (POST /rbac/projects/:id/members)", () => {
    it("adds member", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ user_id: "u-1", role: "viewer" }] });
      const result = await controller.addProjectMember("p-1", { user_id: "u-1" });
      expect(result.role).toBe("viewer");
    });
  });

  describe("removeProjectMember (DELETE /rbac/projects/:id/members/:uid)", () => {
    it("removes member", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(controller.removeProjectMember("p-1", "u-1")).resolves.toBeUndefined();
    });
  });
});
