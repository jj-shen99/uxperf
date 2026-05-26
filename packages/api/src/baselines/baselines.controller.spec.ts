import { Test, TestingModule } from "@nestjs/testing";
import { BaselinesController } from "./baselines.controller";
import { BaselinesService } from "./baselines.service";
import { DatabaseService } from "../database/database.service";

const mockDb = { query: jest.fn() };

describe("BaselinesController", () => {
  let controller: BaselinesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BaselinesController],
      providers: [
        BaselinesService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    controller = module.get<BaselinesController>(BaselinesController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("findAll (GET /baselines)", () => {
    it("returns baselines", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "b-1", metric: "lcp" }] });
      const result = await controller.findAll();
      expect(result).toHaveLength(1);
    });

    it("filters by project_id", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await controller.findAll("p-1");
      expect(mockDb.query.mock.calls[0][1]).toEqual(["p-1"]);
    });
  });

  describe("findActive (GET /baselines/active)", () => {
    it("returns active baseline", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "b-1", is_active: true }] });
      const result = await controller.findActive("p-1", "lcp");
      expect(result).toBeDefined();
    });

    it("returns null when no active baseline", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await controller.findActive("p-1", "unknown_metric");
      expect(result).toBeNull();
    });
  });

  describe("findById (GET /baselines/:id)", () => {
    it("returns baseline by id", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "b-1" }] });
      const result = await controller.findById("b-1");
      expect(result.id).toBe("b-1");
    });
  });

  describe("remove (DELETE /baselines/:id)", () => {
    it("deletes baseline", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(controller.remove("b-1")).resolves.toBeUndefined();
    });
  });
});
