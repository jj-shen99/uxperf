import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { SchedulesService, computeNextRun } from "./schedules.service";
import { DatabaseService } from "../database/database.service";

// ============================================================
// Schedules Service — Unit Tests
// Techniques: EP, boundary, decision tree, structural, MC/DC
// ============================================================

describe("computeNextRun", () => {
  // EP: every-minute cron → next minute
  it("returns next minute for * * * * *", () => {
    const after = new Date("2024-01-15T10:30:00Z");
    const next = computeNextRun("* * * * *", after);
    expect(next.getTime()).toBe(new Date("2024-01-15T10:31:00Z").getTime());
  });

  // EP: specific minute
  it("returns next occurrence of minute 0", () => {
    const after = new Date("2024-01-15T10:30:00Z");
    const next = computeNextRun("0 * * * *", after);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCHours()).toBe(11);
  });

  // EP: specific hour and minute
  it("returns next occurrence for 30 14 * * *", () => {
    const after = new Date("2024-01-15T10:00:00Z");
    const next = computeNextRun("30 14 * * *", after);
    expect(next.getUTCHours()).toBe(14);
    expect(next.getUTCMinutes()).toBe(30);
  });

  // EP: specific day-of-week (0 = Sunday)
  it("returns next Sunday for 0 0 * * 0", () => {
    const after = new Date("2024-01-15T00:00:00Z"); // Monday
    const next = computeNextRun("0 0 * * 0", after);
    expect(next.getUTCDay()).toBe(0);
  });

  // Boundary: already at matching time → next occurrence
  it("advances past current time even if it matches", () => {
    const after = new Date("2024-01-15T10:30:00Z");
    const next = computeNextRun("30 10 * * *", after);
    // Should NOT return the same time, should be next day
    expect(next.getTime()).toBeGreaterThan(after.getTime());
  });

  // Boundary: invalid cron expression
  it("throws on invalid cron expression (wrong field count)", () => {
    expect(() => computeNextRun("* * *", new Date())).toThrow("Invalid cron");
  });

  // EP: day-of-month
  it("returns correct day for 0 0 15 * *", () => {
    const after = new Date("2024-01-15T01:00:00Z");
    const next = computeNextRun("0 0 15 * *", after);
    expect(next.getUTCDate()).toBe(15);
  });

  // Structural: all wildcards
  it("handles all-wildcard cron", () => {
    const after = new Date("2024-06-15T23:59:00Z");
    const next = computeNextRun("* * * * *", after);
    expect(next.getTime()).toBeGreaterThan(after.getTime());
  });
});

describe("SchedulesService", () => {
  let service: SchedulesService;
  let mockDb: { query: jest.Mock };

  const mockSchedule = {
    id: "sch-1",
    project_id: "p-1",
    script_id: null,
    name: "Nightly LCP",
    cron_expression: "0 0 * * *",
    enabled: true,
    config: { url: "https://example.com" },
    environment: "staging",
    last_run_at: null,
    next_run_at: new Date("2024-01-16T00:00:00Z"),
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(SchedulesService);
  });

  // -- CRUD primary paths --
  describe("findAll", () => {
    it("returns all schedules", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockSchedule] });
      const result = await service.findAll();
      expect(result).toHaveLength(1);
    });

    it("filters by projectId", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.findAll("p-1");
      expect(mockDb.query.mock.calls[0][1]).toEqual(["p-1"]);
    });
  });

  describe("findById", () => {
    it("returns schedule when found", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockSchedule] });
      const result = await service.findById("sch-1");
      expect(result).toEqual(mockSchedule);
    });

    it("throws NotFoundException when not found", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.findById("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("creates schedule and computes next_run_at", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockSchedule] });
      const result = await service.create({
        project_id: "p-1",
        name: "Nightly",
        cron_expression: "0 0 * * *",
        config: { url: "https://example.com" },
      });
      expect(result).toEqual(mockSchedule);
      // Verify next_run_at was passed as a parameter
      const args = mockDb.query.mock.calls[0][1];
      expect(args[7]).toBeDefined(); // next_run_at ISO string
    });
  });

  describe("update", () => {
    it("updates cron and recomputes next_run_at", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockSchedule] });
      await service.update("sch-1", { cron_expression: "0 6 * * *" });
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("cron_expression");
      expect(sql).toContain("next_run_at");
    });

    it("returns existing schedule when no changes (boundary)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockSchedule] });
      const result = await service.update("sch-1", {});
      expect(result).toEqual(mockSchedule);
    });

    it("throws on missing schedule", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await expect(service.update("missing", { name: "X" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("delete", () => {
    it("deletes existing schedule", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 1 });
      await expect(service.delete("sch-1")).resolves.toBeUndefined();
    });

    it("throws on missing schedule", async () => {
      mockDb.query.mockResolvedValueOnce({ rowCount: 0 });
      await expect(service.delete("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("findDueSchedules", () => {
    it("returns schedules where next_run_at <= now", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [mockSchedule] });
      const result = await service.findDueSchedules();
      expect(result).toHaveLength(1);
      const sql = mockDb.query.mock.calls[0][0];
      expect(sql).toContain("enabled = true");
      expect(sql).toContain("next_run_at <= now()");
    });
  });

  describe("markExecuted", () => {
    it("updates last_run_at and next_run_at", async () => {
      // findById
      mockDb.query.mockResolvedValueOnce({ rows: [mockSchedule] });
      // update
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await service.markExecuted("sch-1");
      expect(mockDb.query).toHaveBeenCalledTimes(2);
      const updateArgs = mockDb.query.mock.calls[1][1];
      expect(updateArgs[0]).toBeDefined(); // last_run_at
      expect(updateArgs[1]).toBeDefined(); // next_run_at
    });
  });
});
