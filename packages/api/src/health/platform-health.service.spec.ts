/**
 * E-65: Platform health self-monitoring tests.
 */
import { PlatformHealthService } from "./platform-health.service";

const mockDb = {
  query: jest.fn(),
};

describe("PlatformHealthService", () => {
  let service: PlatformHealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlatformHealthService(mockDb as any);
  });

  // === Configuration ===

  describe("configure", () => {
    it("returns default config", () => {
      const config = service.getConfig();
      expect(config.run_staleness_minutes).toBe(60);
      expect(config.worker_staleness_minutes).toBe(15);
      expect(config.alert_on_degraded).toBe(true);
    });

    it("merges partial config updates", () => {
      const updated = service.configure({ run_staleness_minutes: 120 });
      expect(updated.run_staleness_minutes).toBe(120);
      expect(updated.worker_staleness_minutes).toBe(15); // unchanged
    });

    it("persists config across calls", () => {
      service.configure({ worker_staleness_minutes: 30 });
      expect(service.getConfig().worker_staleness_minutes).toBe(30);
    });
  });

  // === Gate Policy ===

  describe("gate policy", () => {
    it("defaults to enforce when platform healthy", async () => {
      // Mock all checks as healthy
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] }) // database check SELECT 1
        .mockResolvedValueOnce({ rows: [{ last_completed: new Date().toISOString(), queued_count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ last_activity: new Date().toISOString() }] })
        .mockResolvedValueOnce({ rows: [{ total: "0", overdue: "0" }] });

      const policy = await service.getGatePolicy();
      expect(policy).toBe("enforce");
    });

    it("respects manual override", async () => {
      service.setGatePolicy("pause");
      const policy = await service.getGatePolicy();
      expect(policy).toBe("pause");
    });

    it("clears override when set to null", async () => {
      service.setGatePolicy("pause");
      service.setGatePolicy(null);
      // Now it will auto-detect, so we need mocks
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{ last_completed: new Date().toISOString(), queued_count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ last_activity: new Date().toISOString() }] })
        .mockResolvedValueOnce({ rows: [{ total: "0", overdue: "0" }] });

      const policy = await service.getGatePolicy();
      expect(policy).toBe("enforce");
    });
  });

  // === Health Check ===

  describe("check", () => {
    it("returns healthy when all components are fine", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{ last_completed: new Date().toISOString(), queued_count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ last_activity: new Date().toISOString() }] })
        .mockResolvedValueOnce({ rows: [{ total: "2", overdue: "0" }] });

      const report = await service.check();
      expect(report.overall).toBe("healthy");
      expect(report.checks).toHaveLength(4);
      expect(report.gate_policy).toBe("enforce");
      expect(report.checked_at).toBeDefined();
    });

    it("returns degraded when runs are stale", async () => {
      const staleDate = new Date(Date.now() - 120 * 60000).toISOString(); // 120 min ago
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{ last_completed: staleDate, queued_count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ last_activity: new Date().toISOString() }] })
        .mockResolvedValueOnce({ rows: [{ total: "0", overdue: "0" }] });

      const report = await service.check();
      expect(report.overall).toBe("degraded");
      expect(report.gate_policy).toBe("pause");
    });

    it("returns down when runs stale AND queued runs exist", async () => {
      const staleDate = new Date(Date.now() - 120 * 60000).toISOString();
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{ last_completed: staleDate, queued_count: "5" }] })
        .mockResolvedValueOnce({ rows: [{ last_activity: new Date().toISOString() }] })
        .mockResolvedValueOnce({ rows: [{ total: "0", overdue: "0" }] });

      const report = await service.check();
      expect(report.overall).toBe("down");
      const runCheck = report.checks.find((c) => c.component === "run_pipeline");
      expect(runCheck?.status).toBe("down");
    });

    it("returns down when database is unreachable", async () => {
      mockDb.query
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValueOnce({ rows: [{ last_completed: null, queued_count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ last_activity: null }] })
        .mockResolvedValueOnce({ rows: [{ total: "0", overdue: "0" }] });

      const report = await service.check();
      expect(report.overall).toBe("down");
      const dbCheck = report.checks.find((c) => c.component === "database");
      expect(dbCheck?.status).toBe("down");
      expect(dbCheck?.message).toContain("ECONNREFUSED");
    });

    it("detects overdue schedules", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{ last_completed: new Date().toISOString(), queued_count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ last_activity: new Date().toISOString() }] })
        .mockResolvedValueOnce({ rows: [{ total: "5", overdue: "2" }] });

      const report = await service.check();
      const schedCheck = report.checks.find((c) => c.component === "schedules");
      expect(schedCheck?.status).toBe("degraded");
      expect(schedCheck?.message).toContain("2 of 5");
    });

    it("detects worker staleness", async () => {
      const staleDate = new Date(Date.now() - 30 * 60000).toISOString(); // 30min ago
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{ last_completed: new Date().toISOString(), queued_count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ last_activity: staleDate }] })
        .mockResolvedValueOnce({ rows: [{ total: "0", overdue: "0" }] });

      const report = await service.check();
      const workerCheck = report.checks.find((c) => c.component === "worker");
      expect(workerCheck?.status).toBe("degraded");
    });

    it("handles no completed runs gracefully", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [{}] })
        .mockResolvedValueOnce({ rows: [{ last_completed: null, queued_count: "0" }] })
        .mockResolvedValueOnce({ rows: [{ last_activity: null }] })
        .mockResolvedValueOnce({ rows: [{ total: "0", overdue: "0" }] });

      const report = await service.check();
      const runCheck = report.checks.find((c) => c.component === "run_pipeline");
      expect(runCheck?.status).toBe("degraded");
      expect(runCheck?.message).toContain("No completed runs");
    });
  });
});
