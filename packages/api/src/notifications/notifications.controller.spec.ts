import { Test, TestingModule } from "@nestjs/testing";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { DatabaseService } from "../database/database.service";

const mockDb = { query: jest.fn() };

describe("NotificationsController", () => {
  let controller: NotificationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationsService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    controller = module.get<NotificationsController>(NotificationsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("listChannels (GET /notifications/channels)", () => {
    it("returns channels", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "c-1", name: "Slack" }] });
      const result = await controller.listChannels();
      expect(result).toHaveLength(1);
    });

    it("filters by project_id", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await controller.listChannels("p-1");
      expect(result).toEqual([]);
      expect(mockDb.query.mock.calls[0][1]).toEqual(["p-1"]);
    });
  });

  describe("getChannel (GET /notifications/channels/:id)", () => {
    it("returns channel by id", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "c-1" }] });
      const result = await controller.getChannel("c-1");
      expect(result.id).toBe("c-1");
    });
  });

  describe("createChannel (POST /notifications/channels)", () => {
    it("creates channel", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "c-1", channel_type: "slack", name: "Alerts" }],
      });
      const result = await controller.createChannel({
        project_id: "p-1",
        channel_type: "slack",
        name: "Alerts",
        config: { webhook_url: "https://hooks.slack.com/test" },
      });
      expect(result.channel_type).toBe("slack");
    });
  });

  describe("updateChannel (PATCH /notifications/channels/:id)", () => {
    it("updates channel", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "c-1", name: "Updated" }] });
      const result = await controller.updateChannel("c-1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });
  });

  describe("deleteChannel (DELETE /notifications/channels/:id)", () => {
    it("deletes channel", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(controller.deleteChannel("c-1")).resolves.toBeUndefined();
    });
  });
});
