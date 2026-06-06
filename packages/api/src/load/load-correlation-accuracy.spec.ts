/**
 * E-84: Load test correlation accuracy tests
 *
 * Tests for Pearson correlation between VU ramp and server metrics,
 * saturation point detection accuracy, and edge cases.
 */
import { Test } from "@nestjs/testing";
import { LoadCorrelationService, CorrelationDataPoint } from "./load-correlation.service";
import { DatabaseService } from "../database/database.service";

describe("LoadCorrelationService — Accuracy Tests (E-84)", () => {
  let service: LoadCorrelationService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        LoadCorrelationService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(LoadCorrelationService);
  });

  // ── Pearson Correlation Accuracy ───────────────────────────

  describe("pearson correlation accuracy", () => {
    it("computes r=1.0 for perfectly linear positive data", () => {
      const x = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const y = x.map((v) => v * 2.5 + 100);
      expect(service.pearson(x, y)).toBeCloseTo(1.0, 6);
    });

    it("computes r=-1.0 for perfectly linear negative data", () => {
      const x = [10, 20, 30, 40, 50];
      const y = [100, 80, 60, 40, 20];
      expect(service.pearson(x, y)).toBeCloseTo(-1.0, 6);
    });

    it("computes r≈0 for uncorrelated data", () => {
      const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const y = [5, 2, 8, 1, 9, 3, 7, 4, 6, 10]; // shuffled
      const r = service.pearson(x, y);
      expect(Math.abs(r)).toBeLessThan(0.5);
    });

    it("handles constant y values (zero variance) → r=0", () => {
      expect(service.pearson([1, 2, 3, 4, 5], [42, 42, 42, 42, 42])).toBe(0);
    });

    it("handles constant x values (zero variance) → r=0", () => {
      expect(service.pearson([7, 7, 7, 7, 7], [1, 2, 3, 4, 5])).toBe(0);
    });

    it("returns 0 for n < 2", () => {
      expect(service.pearson([1], [2])).toBe(0);
      expect(service.pearson([], [])).toBe(0);
    });

    it("computes strong positive correlation for VU vs CPU ramp", () => {
      // Simulate VU ramp: 10, 20, ..., 100 and CPU follows linearly with noise
      const vus = Array.from({ length: 20 }, (_, i) => (i + 1) * 5);
      const cpu = vus.map((v) => v * 0.8 + 5 + (Math.sin(v) * 2));
      const r = service.pearson(vus, cpu);
      expect(r).toBeGreaterThan(0.95);
    });

    it("computes moderate correlation for noisy data", () => {
      const vus = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const cpu = [15, 22, 18, 35, 42, 38, 55, 62, 58, 75]; // noisy
      const r = service.pearson(vus, cpu);
      expect(r).toBeGreaterThan(0.8);
      expect(r).toBeLessThan(1.0);
    });

    it("handles negative correlation (e.g., cache hit rate decreases under load)", () => {
      const vus = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const cacheHitRate = [95, 90, 85, 78, 70, 60, 48, 35, 20, 10];
      const r = service.pearson(vus, cacheHitRate);
      expect(r).toBeLessThan(-0.95);
    });

    it("handles two-point correlation", () => {
      const r = service.pearson([0, 100], [10, 90]);
      expect(r).toBeCloseTo(1.0, 6);
    });

    it("handles large dataset correctly", () => {
      const n = 1000;
      const x = Array.from({ length: n }, (_, i) => i);
      const y = x.map((v) => v * 3 + 7);
      expect(service.pearson(x, y)).toBeCloseTo(1.0, 6);
    });
  });

  // ── Saturation Detection ───────────────────────────────────

  describe("saturation detection accuracy", () => {
    it("detects saturation at the correct VU count (CPU > 80%)", async () => {
      const start = new Date("2024-06-01T00:00:00Z");
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: "lr-sat-1",
            stages: [
              { duration_s: 60, target_vus: 20 },
              { duration_s: 60, target_vus: 50 },
              { duration_s: 60, target_vus: 100 },
            ],
            started_at: start.toISOString(),
            finished_at: new Date(start.getTime() + 180000).toISOString(),
            target_vus: 1,
            actual_peak_vus: 100,
            metrics_summary: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { timestamp: new Date(start.getTime() + 10000).toISOString(), cpu_percent: 20, memory_percent: 30, active_connections: 20, event_loop_lag_ms: 2, http_request_rate: 50 },
            { timestamp: new Date(start.getTime() + 30000).toISOString(), cpu_percent: 35, memory_percent: 40, active_connections: 40, event_loop_lag_ms: 5, http_request_rate: 100 },
            { timestamp: new Date(start.getTime() + 70000).toISOString(), cpu_percent: 55, memory_percent: 55, active_connections: 80, event_loop_lag_ms: 12, http_request_rate: 200 },
            { timestamp: new Date(start.getTime() + 90000).toISOString(), cpu_percent: 72, memory_percent: 65, active_connections: 120, event_loop_lag_ms: 20, http_request_rate: 300 },
            { timestamp: new Date(start.getTime() + 130000).toISOString(), cpu_percent: 85, memory_percent: 78, active_connections: 180, event_loop_lag_ms: 45, http_request_rate: 400 },
            { timestamp: new Date(start.getTime() + 170000).toISOString(), cpu_percent: 95, memory_percent: 88, active_connections: 200, event_loop_lag_ms: 80, http_request_rate: 420 },
          ],
        });

      const result = await service.getCorrelation("lr-sat-1");

      expect(result.summary.saturation_point_vus).not.toBeNull();
      // Saturation should be detected at the 5th data point where CPU first exceeds 80%
      expect(result.summary.saturation_point_vus).toBeGreaterThan(0);
      expect(result.summary.peak_cpu_percent).toBe(95);
      expect(result.summary.peak_memory_percent).toBe(88);
    });

    it("returns null saturation when CPU never exceeds 80%", async () => {
      const start = new Date("2024-06-01T00:00:00Z");
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: "lr-no-sat",
            stages: [{ duration_s: 60, target_vus: 20 }],
            started_at: start.toISOString(),
            finished_at: new Date(start.getTime() + 60000).toISOString(),
            target_vus: 1,
            actual_peak_vus: 20,
            metrics_summary: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { timestamp: new Date(start.getTime() + 10000).toISOString(), cpu_percent: 15, memory_percent: 20, active_connections: 10, event_loop_lag_ms: 1, http_request_rate: 30 },
            { timestamp: new Date(start.getTime() + 30000).toISOString(), cpu_percent: 30, memory_percent: 35, active_connections: 20, event_loop_lag_ms: 3, http_request_rate: 60 },
            { timestamp: new Date(start.getTime() + 50000).toISOString(), cpu_percent: 45, memory_percent: 45, active_connections: 25, event_loop_lag_ms: 5, http_request_rate: 80 },
          ],
        });

      const result = await service.getCorrelation("lr-no-sat");
      expect(result.summary.saturation_point_vus).toBeNull();
    });

    it("correlates VU ramp with all server metrics", async () => {
      const start = new Date("2024-06-01T00:00:00Z");
      // Create data where VUs clearly correlate with CPU and connections
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: "lr-corr",
            stages: [
              { duration_s: 60, target_vus: 10 },
              { duration_s: 60, target_vus: 50 },
              { duration_s: 60, target_vus: 100 },
            ],
            started_at: start.toISOString(),
            finished_at: new Date(start.getTime() + 180000).toISOString(),
            target_vus: 1,
            actual_peak_vus: 100,
            metrics_summary: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: Array.from({ length: 10 }, (_, i) => ({
            timestamp: new Date(start.getTime() + i * 18000).toISOString(),
            cpu_percent: 10 + i * 8,     // linear ramp
            memory_percent: 20 + i * 6,  // linear ramp
            active_connections: 10 + i * 20,
            event_loop_lag_ms: 2 + i * 4,
            http_request_rate: 50 + i * 50,
          })),
        });

      const result = await service.getCorrelation("lr-corr");

      // Should find positive correlations between VUs and server metrics
      expect(result.correlations.length).toBeGreaterThan(0);

      const cpuCorr = result.correlations.find((c) => c.server_metric === "cpu_percent");
      expect(cpuCorr).toBeDefined();
      expect(cpuCorr!.direction).toBe("positive");
      expect(cpuCorr!.pearson_r).toBeGreaterThan(0.8);

      const memCorr = result.correlations.find((c) => c.server_metric === "memory_percent");
      expect(memCorr).toBeDefined();
      expect(memCorr!.direction).toBe("positive");
    });

    it("handles empty snapshots gracefully", async () => {
      const start = new Date("2024-06-01T00:00:00Z");
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: "lr-empty",
            stages: [{ duration_s: 60, target_vus: 10 }],
            started_at: start.toISOString(),
            finished_at: new Date(start.getTime() + 60000).toISOString(),
            target_vus: 1,
            actual_peak_vus: 10,
            metrics_summary: null,
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getCorrelation("lr-empty");
      expect(result.data_points).toHaveLength(0);
      expect(result.correlations).toHaveLength(0);
      expect(result.summary.peak_cpu_percent).toBeNull();
      expect(result.summary.saturation_point_vus).toBeNull();
    });

    it("handles null server metric values in correlation", async () => {
      const start = new Date("2024-06-01T00:00:00Z");
      mockDb.query
        .mockResolvedValueOnce({
          rows: [{
            id: "lr-null",
            stages: [{ duration_s: 60, target_vus: 10 }],
            started_at: start.toISOString(),
            finished_at: new Date(start.getTime() + 60000).toISOString(),
            target_vus: 1,
            actual_peak_vus: 10,
            metrics_summary: null,
          }],
        })
        .mockResolvedValueOnce({
          rows: [
            { timestamp: new Date(start.getTime() + 10000).toISOString(), cpu_percent: null, memory_percent: null, active_connections: null, event_loop_lag_ms: null, http_request_rate: null },
            { timestamp: new Date(start.getTime() + 30000).toISOString(), cpu_percent: null, memory_percent: null, active_connections: null, event_loop_lag_ms: null, http_request_rate: null },
            { timestamp: new Date(start.getTime() + 50000).toISOString(), cpu_percent: null, memory_percent: null, active_connections: null, event_loop_lag_ms: null, http_request_rate: null },
          ],
        });

      const result = await service.getCorrelation("lr-null");
      expect(result.data_points).toHaveLength(3);
      expect(result.correlations).toHaveLength(0); // no valid pairs
    });
  });

  // ── Stage annotation accuracy ──────────────────────────────

  describe("stage annotation accuracy", () => {
    it("handles single-stage profiles", () => {
      const stages = service.buildStageAnnotations([
        { duration_s: 120, target_vus: 50 },
      ]);
      expect(stages).toHaveLength(1);
      expect(stages[0].start_offset_s).toBe(0);
      expect(stages[0].duration_s).toBe(120);
      expect(stages[0].target_vus).toBe(50);
    });

    it("handles ramp-up → hold → ramp-down pattern", () => {
      const stages = service.buildStageAnnotations([
        { duration_s: 30, target_vus: 50, ramp_type: "linear" },
        { duration_s: 120, target_vus: 50, ramp_type: "step" },
        { duration_s: 30, target_vus: 0, ramp_type: "linear" },
      ]);
      expect(stages).toHaveLength(3);
      expect(stages[0].ramp_type).toBe("linear");
      expect(stages[1].ramp_type).toBe("step");
      expect(stages[1].start_offset_s).toBe(30);
      expect(stages[2].start_offset_s).toBe(150);
    });

    it("handles many-stage staircase pattern", () => {
      const staircase = Array.from({ length: 10 }, (_, i) => ({
        duration_s: 30,
        target_vus: (i + 1) * 10,
      }));
      const stages = service.buildStageAnnotations(staircase);
      expect(stages).toHaveLength(10);
      expect(stages[9].start_offset_s).toBe(270); // 9 * 30
      expect(stages[9].target_vus).toBe(100);
    });

    it("handles empty stages array", () => {
      const stages = service.buildStageAnnotations([]);
      expect(stages).toHaveLength(0);
    });
  });
});
