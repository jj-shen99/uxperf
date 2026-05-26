import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { DigestService } from "./digest.service";
import { NotificationsService } from "./notifications.service";
import { DatabaseService } from "../database/database.service";

describe("DigestService", () => {
  let service: DigestService;
  let mockDb: { query: jest.Mock };
  let mockNotifications: { dispatch: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    mockNotifications = { dispatch: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [
        DigestService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();
    service = module.get(DigestService);
  });

  describe("findAll", () => {
    it("returns digests for project", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "d-1", digest_type: "weekly" }],
      });
      const result = await service.findAll("p-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("findById", () => {
    it("returns digest by id", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "d-1" }] });
      const result = await service.findById("d-1");
      expect(result.id).toBe("d-1");
    });

    it("throws NotFoundException", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findById("x")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("creates digest schedule", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "d-1", digest_type: "weekly", cron_expression: "0 9 * * 1" }],
      });
      const result = await service.create({
        project_id: "p-1",
        channel_id: "c-1",
        digest_type: "weekly",
        cron_expression: "0 9 * * 1",
      });
      expect(result.digest_type).toBe("weekly");
    });
  });

  describe("delete", () => {
    it("deletes digest schedule", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.delete("d-1")).resolves.toBeUndefined();
    });

    it("throws NotFoundException for missing", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.delete("x")).rejects.toThrow(NotFoundException);
    });
  });

  describe("processDueDigests", () => {
    it("sends due digests and updates schedule", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: "d-1",
            project_id: "p-1",
            channel_id: "c-1",
            digest_type: "daily",
            cron_expression: "0 9 * * *",
            config: {},
            enabled: true,
          }],
        })
        // buildDigestContent query
        .mockResolvedValueOnce({
          rows: [{ total_runs: "5", completed: "4", failed: "1", avg_lcp: "2100" }],
        })
        // update next_send_at
        .mockResolvedValueOnce({ rows: [] });

      const sent = await service.processDueDigests();
      expect(sent).toBe(1);
      expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
    });

    it("returns 0 when no due digests", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const sent = await service.processDueDigests();
      expect(sent).toBe(0);
    });
  });
});
