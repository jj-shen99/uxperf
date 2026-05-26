import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { DatabaseService } from "../database/database.service";

describe("NotificationsService", () => {
  let service: NotificationsService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  describe("findChannels", () => {
    it("returns all channels when no projectId", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "c-1" }] });
      const channels = await service.findChannels();
      expect(channels).toHaveLength(1);
    });

    it("filters by projectId", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "c-1" }] });
      const channels = await service.findChannels("p-1");
      expect(mockDb.query.mock.calls[0][1]).toEqual(["p-1"]);
      expect(channels).toHaveLength(1);
    });
  });

  describe("findChannelById", () => {
    it("returns channel when found", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "c-1" }] });
      const channel = await service.findChannelById("c-1");
      expect(channel.id).toBe("c-1");
    });

    it("throws NotFoundException when not found", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findChannelById("c-missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("createChannel", () => {
    it("creates channel with defaults", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "c-1", channel_type: "slack", events: ["gate_failed", "run_completed"] }],
      });
      const ch = await service.createChannel({
        project_id: "p-1",
        channel_type: "slack",
        name: "Perf Alerts",
        config: { webhook_url: "https://hooks.slack.com/..." },
      });
      expect(ch.channel_type).toBe("slack");
    });
  });

  describe("deleteChannel", () => {
    it("deletes existing channel", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.deleteChannel("c-1")).resolves.toBeUndefined();
    });

    it("throws NotFoundException when not found", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.deleteChannel("c-missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("dispatch", () => {
    it("returns 0 when no matching channels", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const sent = await service.dispatch({
        event: "gate_failed",
        project_id: "p-1",
        title: "Test",
        message: "Test message",
      });
      expect(sent).toBe(0);
    });

    it("sends to slack channel via webhook", async () => {
      const mockChannel = {
        id: "c-1",
        channel_type: "slack",
        name: "Alerts",
        config: { webhook_url: "https://hooks.slack.com/test" },
        events: ["gate_failed"],
        enabled: true,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [mockChannel] });

      // Mock global fetch
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({ ok: true } as any);

      const sent = await service.dispatch({
        event: "gate_failed",
        project_id: "p-1",
        title: "Gate Failed",
        message: "LCP gate failed",
      });

      expect(sent).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/test",
        expect.objectContaining({ method: "POST" }),
      );

      global.fetch = originalFetch;
    });

    it("handles fetch error gracefully", async () => {
      const mockChannel = {
        id: "c-1",
        channel_type: "slack",
        name: "Alerts",
        config: { webhook_url: "https://hooks.slack.com/test" },
        events: ["run_completed"],
        enabled: true,
      };
      mockDb.query.mockResolvedValueOnce({ rows: [mockChannel] });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockRejectedValue(new Error("network error"));

      const sent = await service.dispatch({
        event: "run_completed",
        project_id: "p-1",
        title: "Run Done",
        message: "Run completed",
      });

      expect(sent).toBe(0); // Failed, but didn't throw

      global.fetch = originalFetch;
    });
  });
});
