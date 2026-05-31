import { Test } from "@nestjs/testing";
import { EnvironmentsService } from "./environments.service";
import { DatabaseService } from "../database/database.service";

describe("EnvironmentsService", () => {
  let service: EnvironmentsService;

  beforeEach(async () => {
    const mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        EnvironmentsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(EnvironmentsService);
  });

  describe("findAll", () => {
    it("returns default environments", async () => {
      const envs = await service.findAll();
      expect(envs).toHaveLength(6);
      expect(envs.map((e) => e.slug)).toEqual([
        "staging", "production", "development", "qa", "uat", "performance",
      ]);
    });

    it("each default environment has required fields", async () => {
      const envs = await service.findAll();
      for (const env of envs) {
        expect(env.id).toBeDefined();
        expect(env.name).toBeTruthy();
        expect(env.slug).toBeTruthy();
        expect(env.description).toBeTruthy();
        expect(env.created_at).toBeInstanceOf(Date);
      }
    });
  });

  describe("create", () => {
    it("adds a new environment and returns it", async () => {
      const env = await service.create({
        name: "Canary",
        slug: "canary",
        description: "Canary release environment",
      });
      expect(env.name).toBe("Canary");
      expect(env.slug).toBe("canary");
      expect(env.description).toBe("Canary release environment");
      expect(env.id).toBeDefined();

      const all = await service.findAll();
      expect(all).toHaveLength(7);
    });

    it("sanitizes slug to lowercase alphanumeric", async () => {
      const env = await service.create({
        name: "Test Env",
        slug: "Test ENV!! @#$",
      });
      expect(env.slug).toBe("testenv");
    });

    it("defaults description to empty string", async () => {
      const env = await service.create({ name: "No Desc", slug: "no-desc" });
      expect(env.description).toBe("");
    });
  });

  describe("delete", () => {
    it("removes an existing environment", async () => {
      const envs = await service.findAll();
      const first = envs[0];
      await service.delete(first.id);

      const after = await service.findAll();
      expect(after).toHaveLength(5);
      expect(after.find((e) => e.id === first.id)).toBeUndefined();
    });

    it("throws when deleting non-existent environment", async () => {
      await expect(service.delete("env-nonexistent")).rejects.toThrow(
        "Environment env-nonexistent not found"
      );
    });
  });
});
