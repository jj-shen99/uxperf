import { Test, TestingModule } from "@nestjs/testing";
import { PerRequestController } from "./per-request.controller";
import { PerRequestService } from "./per-request.service";
import { DatabaseService } from "../database/database.service";

const mockDb = { query: jest.fn() };

describe("PerRequestController", () => {
  let controller: PerRequestController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PerRequestController],
      providers: [
        PerRequestService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    controller = module.get<PerRequestController>(PerRequestController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("ingest (POST /per-request/ingest)", () => {
    it("returns ingested count", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await controller.ingest({
        run_id: "r-1",
        requests: [
          { request_url: "https://a.com/js", resource_type: "script" },
        ],
      });
      expect(result).toEqual({ ingested: 1 });
    });

    it("returns 0 for empty requests", async () => {
      const result = await controller.ingest({ run_id: "r-1", requests: [] });
      expect(result).toEqual({ ingested: 0 });
    });
  });

  describe("findByRun (GET /per-request/:runId)", () => {
    it("returns per-request data", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "pr-1" }] });
      const result = await controller.findByRun("r-1");
      expect(result).toHaveLength(1);
    });

    it("passes limit param", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await controller.findByRun("r-1", "100");
      expect(mockDb.query.mock.calls[0][1][1]).toBe(100);
    });
  });

  describe("summarize (GET /per-request/:runId/summary)", () => {
    it("returns summary", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ resource_type: "script", count: 5 }],
      });
      const result = await controller.summarize("r-1");
      expect(result).toHaveLength(1);
      expect(result[0].resource_type).toBe("script");
    });
  });
});
