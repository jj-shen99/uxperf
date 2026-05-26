import { Test, TestingModule } from "@nestjs/testing";
import { ProjectsController } from "./projects.controller";
import { ProjectsService, ProjectRow } from "./projects.service";
import { DatabaseService } from "../database/database.service";

// ============================================================
// ProjectsController — Integration Tests (controller ↔ service)
// Tests HTTP method routing and delegation
// ============================================================

const sampleProject: ProjectRow = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "test",
  owner_team: "eng",
  description: null,
  environment_configs: {},
  quota: {},
  domain_allowlist: [],
  created_at: new Date(),
  updated_at: new Date(),
};

const mockDb = { query: jest.fn() };

describe("ProjectsController", () => {
  let controller: ProjectsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        ProjectsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  // ==========================================================
  // Primary Path Coverage: CRUD operations
  // ==========================================================

  describe("findAll (GET /projects)", () => {
    it("returns list of projects", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleProject] });
      const result = await controller.findAll();
      expect(result).toEqual([sampleProject]);
    });
  });

  describe("findOne (GET /projects/:id)", () => {
    it("returns a single project", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleProject] });
      const result = await controller.findOne(sampleProject.id);
      expect(result.id).toBe(sampleProject.id);
    });
  });

  describe("create (POST /projects)", () => {
    it("creates and returns a new project", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleProject] });
      const result = await controller.create({
        name: "test",
        owner_team: "eng",
      });
      expect(result).toEqual(sampleProject);
    });
  });

  describe("remove (DELETE /projects/:id)", () => {
    it("deletes a project", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });
      await expect(
        controller.remove(sampleProject.id)
      ).resolves.toBeUndefined();
    });
  });
});
