import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { GateOverridesService, GateOverrideRow } from "./gate-overrides.service";
import { DatabaseService } from "../database/database.service";

/**
 * Gate Overrides Service — Unit Tests (E-34)
 *
 * Ch 12, p155 / Ch 13, p168: override with audit trail.
 */

const makeOverride = (overrides?: Partial<GateOverrideRow>): GateOverrideRow => ({
  id: "ov-1",
  gate_id: "g-1",
  gate_name: "LCP Gate",
  run_id: "run-1",
  project_id: "p-1",
  requested_by: "alice",
  approved_by: null,
  justification: "Known regression from feature flag rollout",
  status: "pending",
  expires_at: new Date(Date.now() + 86400000), // +24h
  created_at: new Date(),
  resolved_at: null,
  ...overrides,
});

describe("GateOverridesService", () => {
  let service: GateOverridesService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        GateOverridesService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(GateOverridesService);
  });

  describe("create", () => {
    it("creates an override with default 24h TTL", async () => {
      const created = makeOverride();
      mockDb.query.mockResolvedValueOnce({ rows: [created] });

      const result = await service.create({
        gate_id: "g-1",
        gate_name: "LCP Gate",
        run_id: "run-1",
        project_id: "p-1",
        requested_by: "alice",
        justification: "Known regression from feature flag rollout",
      });

      expect(result.status).toBe("pending");
      expect(result.requested_by).toBe("alice");
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it("uses custom TTL when provided", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeOverride()] });

      await service.create({
        gate_id: "g-1",
        gate_name: "LCP Gate",
        run_id: "run-1",
        project_id: "p-1",
        requested_by: "bob",
        justification: "Testing",
        ttl_hours: 48,
      });

      // Verify TTL param passed
      expect(mockDb.query.mock.calls[0][1]).toContain("48");
    });
  });

  describe("decide", () => {
    it("approves a pending override", async () => {
      const pending = makeOverride({ status: "pending" });
      const approved = makeOverride({ status: "approved", approved_by: "bob", resolved_at: new Date() });

      mockDb.query
        .mockResolvedValueOnce({ rows: [pending] }) // findById
        .mockResolvedValueOnce({ rows: [approved] }); // update

      const result = await service.decide("ov-1", {
        decided_by: "bob",
        decision: "approved",
      });

      expect(result.status).toBe("approved");
      expect(result.approved_by).toBe("bob");
    });

    it("rejects a pending override", async () => {
      const pending = makeOverride({ status: "pending" });
      const rejected = makeOverride({ status: "rejected", approved_by: "charlie" });

      mockDb.query
        .mockResolvedValueOnce({ rows: [pending] })
        .mockResolvedValueOnce({ rows: [rejected] });

      const result = await service.decide("ov-1", {
        decided_by: "charlie",
        decision: "rejected",
        reason: "Not justified",
      });

      expect(result.status).toBe("rejected");
    });

    it("rejects decision on already-decided override", async () => {
      const approved = makeOverride({ status: "approved" });
      mockDb.query.mockResolvedValueOnce({ rows: [approved] });

      await expect(
        service.decide("ov-1", { decided_by: "bob", decision: "approved" }),
      ).rejects.toThrow("already approved");
    });

    it("rejects decision on expired override", async () => {
      const expired = makeOverride({
        status: "pending",
        expires_at: new Date(Date.now() - 1000), // already expired
      });
      mockDb.query
        .mockResolvedValueOnce({ rows: [expired] }) // findById
        .mockResolvedValueOnce({ rows: [] });        // expire update

      await expect(
        service.decide("ov-1", { decided_by: "bob", decision: "approved" }),
      ).rejects.toThrow("expired");
    });
  });

  describe("findById", () => {
    it("returns override by ID", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [makeOverride()] });
      const result = await service.findById("ov-1");
      expect(result.id).toBe("ov-1");
    });

    it("throws NotFoundException for missing override", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findById("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("findForRun", () => {
    it("returns all overrides for a run", async () => {
      const overrides = [makeOverride(), makeOverride({ id: "ov-2", gate_name: "FCP Gate" })];
      mockDb.query.mockResolvedValueOnce({ rows: overrides });

      const result = await service.findForRun("run-1");
      expect(result).toHaveLength(2);
    });
  });

  describe("hasActiveOverride", () => {
    it("returns true for approved, non-expired override", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "ov-1" }] });
      expect(await service.hasActiveOverride("g-1", "run-1")).toBe(true);
    });

    it("returns false when no active override exists", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      expect(await service.hasActiveOverride("g-1", "run-1")).toBe(false);
    });
  });

  describe("expireStale", () => {
    it("expires pending overrides past TTL", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 3 });
      const count = await service.expireStale();
      expect(count).toBe(3);
    });

    it("returns 0 when nothing to expire", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      const count = await service.expireStale();
      expect(count).toBe(0);
    });
  });

  describe("getAuditTrail", () => {
    it("returns ordered audit trail for a project", async () => {
      const trail = [
        makeOverride({ status: "approved" }),
        makeOverride({ id: "ov-2", status: "rejected" }),
        makeOverride({ id: "ov-3", status: "expired" }),
      ];
      mockDb.query.mockResolvedValueOnce({ rows: trail });

      const result = await service.getAuditTrail("p-1");
      expect(result).toHaveLength(3);
    });
  });
});
