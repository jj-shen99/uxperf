import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ApiKeysService } from "./api-keys.service";
import { DatabaseService } from "../database/database.service";
import { createHash } from "crypto";

describe("ApiKeysService", () => {
  let service: ApiKeysService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(ApiKeysService);
  });

  describe("create", () => {
    it("creates an API key with prefix", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "key-1" }] });
      const result = await service.create({
        project_id: "p-1",
        name: "CI Pipeline",
        scopes: ["read", "write"],
      });
      expect(result.key).toMatch(/^pfk_/);
      expect(result.key_prefix).toHaveLength(12);
      expect(result.scopes).toEqual(["read", "write"]);
    });
  });

  describe("validate", () => {
    it("validates a valid key", async () => {
      const rawKey = "pfk_test1234567890abcdef12345678901234567890abcdef";
      const keyHash = createHash("sha256").update(rawKey).digest("hex");

      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: "key-1",
            project_id: "p-1",
            name: "Test",
            key_prefix: "pfk_test1234",
            scopes: ["read"],
            rate_limit_rpm: 60,
            rate_limit_rpd: 10000,
            is_active: true,
            expires_at: null,
            last_used_at: null,
            created_at: "2024-01-01",
          }],
        })
        .mockResolvedValueOnce({ rowCount: 1 }); // update last_used_at

      const result = await service.validate(rawKey);
      expect(result).not.toBeNull();
      expect(result!.id).toBe("key-1");
    });

    it("returns null for unknown key", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.validate("pfk_unknown");
      expect(result).toBeNull();
    });

    it("returns null for inactive key", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "key-1", is_active: false }],
      });
      const result = await service.validate("pfk_inactive");
      expect(result).toBeNull();
    });

    it("returns null for expired key", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: "key-1",
          is_active: true,
          expires_at: "2020-01-01T00:00:00Z",
        }],
      });
      const result = await service.validate("pfk_expired");
      expect(result).toBeNull();
    });
  });

  describe("hasScope", () => {
    it("checks scope presence", () => {
      const key = { scopes: ["read", "write"] } as any;
      expect(service.hasScope(key, "read")).toBe(true);
      expect(service.hasScope(key, "admin")).toBe(false);
    });

    it("admin scope grants all", () => {
      const key = { scopes: ["admin"] } as any;
      expect(service.hasScope(key, "read")).toBe(true);
      expect(service.hasScope(key, "write")).toBe(true);
    });
  });

  describe("revoke", () => {
    it("revokes a key", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.revoke("key-1")).resolves.toBeUndefined();
    });

    it("throws on missing key", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.revoke("x")).rejects.toThrow(NotFoundException);
    });
  });
});
