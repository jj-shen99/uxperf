import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ProjectsService, CreateProjectDto, ProjectRow } from "./projects.service";
import { DatabaseService } from "../database/database.service";

// ============================================================
// Mock DatabaseService
// ============================================================

const mockDb = {
  query: jest.fn(),
};

const sampleProject: ProjectRow = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "test-project",
  owner_team: "platform",
  description: "A test project",
  environment_configs: {},
  quota: { max_runs_per_day: 100 },
  domain_allowlist: [],
  created_at: new Date("2024-01-01"),
  updated_at: new Date("2024-01-01"),
};

describe("ProjectsService", () => {
  let service: ProjectsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  // ==========================================================
  // findAll — Primary Path Coverage
  // ==========================================================

  describe("findAll", () => {
    it("returns all projects (primary path)", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleProject] });
      const result = await service.findAll();
      expect(result).toEqual([sampleProject]);
      expect(mockDb.query).toHaveBeenCalledWith(
        "SELECT * FROM projects ORDER BY created_at DESC"
      );
    });

    it("returns empty array when no projects exist", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      const result = await service.findAll();
      expect(result).toEqual([]);
    });
  });

  // ==========================================================
  // findById — Decision Tree
  //   found → return project
  //   not found → throw NotFoundException
  // ==========================================================

  describe("findById — Decision Tree", () => {
    it("returns project when found", async () => {
      mockDb.query.mockResolvedValue({ rows: [sampleProject] });
      const result = await service.findById(sampleProject.id);
      expect(result).toEqual(sampleProject);
    });

    it("throws NotFoundException when not found", async () => {
      mockDb.query.mockResolvedValue({ rows: [] });
      await expect(service.findById("nonexistent")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  // ==========================================================
  // create — Equivalence Partitions + Boundary Conditions
  // Valid partition: all required fields present
  // Optional fields: description, environment_configs, domain_allowlist
  // ==========================================================

  describe("create — Equivalence Partitions", () => {
    it("creates with all required fields (valid partition)", async () => {
      const dto: CreateProjectDto = {
        name: "new-project",
        owner_team: "eng",
      };
      mockDb.query.mockResolvedValue({ rows: [{ ...sampleProject, ...dto }] });

      const result = await service.create(dto);
      expect(result.name).toBe("new-project");
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO projects"),
        ["new-project", "eng", null, "{}", []]
      );
    });

    it("creates with all optional fields populated", async () => {
      const dto: CreateProjectDto = {
        name: "full-project",
        owner_team: "eng",
        description: "Full project",
        environment_configs: { staging: { url: "https://staging.example.com" } },
        domain_allowlist: ["example.com"],
      };
      mockDb.query.mockResolvedValue({ rows: [{ ...sampleProject, ...dto }] });

      const result = await service.create(dto);
      expect(result.name).toBe("full-project");
      // Verify environment_configs serialized as JSON
      const callArgs = mockDb.query.mock.calls[0][1];
      expect(callArgs[3]).toBe(JSON.stringify(dto.environment_configs));
      expect(callArgs[4]).toEqual(["example.com"]);
    });

    it("passes null for missing optional fields (boundary)", async () => {
      const dto: CreateProjectDto = { name: "minimal", owner_team: "t" };
      mockDb.query.mockResolvedValue({ rows: [{ ...sampleProject, ...dto }] });

      await service.create(dto);
      const callArgs = mockDb.query.mock.calls[0][1];
      expect(callArgs[2]).toBeNull(); // description
      expect(callArgs[3]).toBe("{}"); // environment_configs default
      expect(callArgs[4]).toEqual([]); // domain_allowlist default
    });
  });

  // ==========================================================
  // delete — Decision Tree
  //   rowCount > 0 → success (void)
  //   rowCount === 0 → throw NotFoundException
  // ==========================================================

  describe("delete — Decision Tree", () => {
    it("succeeds when project exists", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });
      await expect(service.delete(sampleProject.id)).resolves.toBeUndefined();
    });

    it("throws NotFoundException when project does not exist", async () => {
      mockDb.query.mockResolvedValue({ rowCount: 0 });
      await expect(service.delete("nonexistent")).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
