/**
 * E-66: On-call rotation management tests.
 */
import { OnCallRotationService } from "./oncall-rotation.service";

const mockDb = { query: jest.fn() };

describe("OnCallRotationService", () => {
  let service: OnCallRotationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OnCallRotationService(mockDb as any);
  });

  const twoMembers = [
    { user_id: "u1", display_name: "Alice", email: "alice@co.com", team: "frontend" },
    { user_id: "u2", display_name: "Bob", email: "bob@co.com", team: "backend" },
  ];

  // === CRUD ===

  describe("create / list / get / delete", () => {
    it("creates a rotation with members", () => {
      const rotation = service.create({ name: "Perf On-Call", members: twoMembers });
      expect(rotation.name).toBe("Perf On-Call");
      expect(rotation.members).toHaveLength(2);
      expect(rotation.current_index).toBe(0);
      expect(rotation.rotation_interval_days).toBe(7);
    });

    it("lists all rotations", () => {
      service.create({ name: "R1", members: twoMembers });
      service.create({ name: "R2", members: twoMembers });
      expect(service.list()).toHaveLength(2);
    });

    it("gets by id", () => {
      const r = service.create({ name: "R1", members: twoMembers });
      expect(service.get(r.id)).toBeTruthy();
      expect(service.get("nonexistent")).toBeNull();
    });

    it("deletes by id", () => {
      const r = service.create({ name: "R1", members: twoMembers });
      expect(service.delete(r.id)).toBe(true);
      expect(service.list()).toHaveLength(0);
      expect(service.delete("nonexistent")).toBe(false);
    });
  });

  // === Rotation ===

  describe("rotate", () => {
    it("advances to next member", () => {
      const r = service.create({ name: "R", members: twoMembers });
      const next = service.rotate(r.id);
      expect(next?.display_name).toBe("Bob");
    });

    it("wraps around to first member", () => {
      const r = service.create({ name: "R", members: twoMembers });
      service.rotate(r.id); // Alice→Bob
      const next = service.rotate(r.id); // Bob→Alice
      expect(next?.display_name).toBe("Alice");
    });

    it("returns null for unknown rotation", () => {
      expect(service.rotate("invalid")).toBeNull();
    });
  });

  // === Current On-Call ===

  describe("getCurrentOnCall", () => {
    it("returns first member initially", () => {
      const r = service.create({ name: "R", members: twoMembers });
      const current = service.getCurrentOnCall(r.id);
      expect(current?.display_name).toBe("Alice");
    });

    it("returns null for empty rotation", () => {
      const r = service.create({ name: "Empty", members: [] });
      expect(service.getCurrentOnCall(r.id)).toBeNull();
    });

    it("returns null for unknown rotation", () => {
      expect(service.getCurrentOnCall("invalid")).toBeNull();
    });

    it("respects active override", () => {
      const r = service.create({ name: "R", members: twoMembers });
      service.addOverride({
        rotation_id: r.id,
        user_id: "u2",
        display_name: "Bob",
        start_at: new Date(Date.now() - 3600000).toISOString(),
        end_at: new Date(Date.now() + 3600000).toISOString(),
        reason: "Alice on vacation",
      });
      const current = service.getCurrentOnCall(r.id);
      expect(current?.display_name).toBe("Bob");
    });

    it("ignores expired override", () => {
      const r = service.create({ name: "R", members: twoMembers });
      service.addOverride({
        rotation_id: r.id,
        user_id: "u2",
        display_name: "Bob",
        start_at: new Date(Date.now() - 7200000).toISOString(),
        end_at: new Date(Date.now() - 3600000).toISOString(), // ended 1h ago
        reason: "Past override",
      });
      const current = service.getCurrentOnCall(r.id);
      expect(current?.display_name).toBe("Alice"); // falls back to rotation
    });
  });

  // === Overrides ===

  describe("overrides", () => {
    it("lists active/upcoming overrides", () => {
      const r = service.create({ name: "R", members: twoMembers });
      service.addOverride({
        rotation_id: r.id,
        user_id: "u2",
        display_name: "Bob",
        start_at: new Date(Date.now() + 86400000).toISOString(),
        end_at: new Date(Date.now() + 172800000).toISOString(),
        reason: "Scheduled coverage",
      });
      expect(service.listOverrides(r.id)).toHaveLength(1);
    });

    it("removes an override", () => {
      const r = service.create({ name: "R", members: twoMembers });
      const o = service.addOverride({
        rotation_id: r.id,
        user_id: "u2",
        display_name: "Bob",
        start_at: new Date().toISOString(),
        end_at: new Date(Date.now() + 3600000).toISOString(),
        reason: "Test",
      });
      expect(service.removeOverride(o.id)).toBe(true);
      expect(service.listOverrides(r.id)).toHaveLength(0);
    });
  });

  // === Paging Policy ===

  describe("paging policy", () => {
    it("returns default paging action", () => {
      const r = service.create({ name: "R", members: twoMembers });
      expect(service.getPageAction(r.id, "critical")).toBe("page");
      expect(service.getPageAction(r.id, "warning")).toBe("notify");
      expect(service.getPageAction(r.id, "info")).toBe("silent");
    });

    it("respects custom paging policy", () => {
      const r = service.create({
        name: "R",
        members: twoMembers,
        paging_policy: { warning: "page" },
      });
      expect(service.getPageAction(r.id, "warning")).toBe("page");
    });

    it("updates paging policy", () => {
      const r = service.create({ name: "R", members: twoMembers });
      service.updatePagingPolicy(r.id, { info: "notify" });
      expect(service.getPageAction(r.id, "info")).toBe("notify");
    });

    it("returns notify for unknown rotation", () => {
      expect(service.getPageAction("invalid", "critical")).toBe("notify");
    });
  });

  // === Events ===

  describe("events", () => {
    it("records and retrieves events", () => {
      const r = service.create({ name: "R", members: twoMembers });
      service.recordEvent({
        rotation_id: r.id,
        user_id: "u1",
        severity: "critical",
        action: "paged",
        message: "LCP regression detected",
      });
      const events = service.getEvents(r.id);
      expect(events).toHaveLength(1);
      expect(events[0].severity).toBe("critical");
      expect(events[0].action).toBe("paged");
    });
  });
});
