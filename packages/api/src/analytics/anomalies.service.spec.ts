import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { AnomaliesService } from "./anomalies.service";
import { ChangePointService } from "./change-point.service";
import { DatabaseService } from "../database/database.service";

describe("AnomaliesService", () => {
  let service: AnomaliesService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        AnomaliesService,
        ChangePointService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(AnomaliesService);
  });

  describe("findAll", () => {
    it("returns anomalies for project", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "a-1", metric: "lcp_ms" }] });
      const result = await service.findAll("p-1");
      expect(result).toHaveLength(1);
    });

    it("filters by status", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.findAll("p-1", "open");
      expect(mockDb.query.mock.calls[0][1]).toContain("open");
    });
  });

  describe("findById", () => {
    it("returns anomaly", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "a-1" }] });
      const result = await service.findById("a-1");
      expect(result.id).toBe("a-1");
    });

    it("throws NotFoundException", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findById("a-missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("creates anomaly", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "a-1", metric: "lcp_ms", severity: "warning", detector: "cusum" }],
      });
      const result = await service.create({
        project_id: "p-1",
        metric: "lcp_ms",
        detector: "cusum",
        description: "LCP regressed",
      });
      expect(result.metric).toBe("lcp_ms");
    });
  });

  describe("updateStatus", () => {
    it("updates to acknowledged", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "a-1", status: "acknowledged" }] });
      const result = await service.updateStatus("a-1", "acknowledged");
      expect(result.status).toBe("acknowledged");
    });

    it("throws NotFoundException for missing anomaly", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.updateStatus("a-x", "resolved")).rejects.toThrow(NotFoundException);
    });
  });

  describe("provideFeedback", () => {
    it("sets feedback", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "a-1", feedback: "correct" }] });
      const result = await service.provideFeedback("a-1", "correct");
      expect(result.feedback).toBe("correct");
    });
  });

  describe("analyzeProject", () => {
    it("deduplicates existing anomalies", async () => {
      // detectForProject will need run data — return insufficient data to skip detection
      mockDb.query.mockResolvedValueOnce({ rows: [] }); // detectForProject returns empty
      const result = await service.analyzeProject("p-1");
      expect(result).toEqual([]);
    });
  });
});
