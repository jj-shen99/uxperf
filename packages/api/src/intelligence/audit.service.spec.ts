import { Test } from "@nestjs/testing";
import { AuditService } from "./audit.service";
import { DatabaseService } from "../database/database.service";

describe("AuditService", () => {
  let service: AuditService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  describe("log", () => {
    it("records an audit entry", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "audit-1" }] });
      const id = await service.log({
        user_id: "u-1",
        action: "create",
        resource_type: "project",
        resource_id: "p-1",
        project_id: "p-1",
        details: { name: "My Project" },
      });
      expect(id).toBe("audit-1");
    });
  });

  describe("query", () => {
    it("returns entries for project", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: "a-1", action: "create", resource_type: "run" },
          { id: "a-2", action: "delete", resource_type: "gate" },
        ],
      });
      const result = await service.query({ project_id: "p-1" });
      expect(result).toHaveLength(2);
    });

    it("filters by action", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "a-1", action: "create" }] });
      const result = await service.query({ action: "create" });
      expect(result).toHaveLength(1);
    });
  });

  describe("summary", () => {
    it("returns action counts", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { action: "create", count: "15" },
          { action: "update", count: "8" },
        ],
      });
      const result = await service.summary("p-1");
      expect(result[0].count).toBe(15);
      expect(result[1].count).toBe(8);
    });
  });
});
