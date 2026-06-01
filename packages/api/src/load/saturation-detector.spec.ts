import { Test } from "@nestjs/testing";
import { SaturationDetectorService, DegradationPoint } from "./saturation-detector.service";
import { DatabaseService } from "../database/database.service";

describe("SaturationDetectorService (E-54)", () => {
  let service: SaturationDetectorService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        SaturationDetectorService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(SaturationDetectorService);
  });

  describe("detectLatencyThreshold", () => {
    it("detects when p95 crosses threshold", () => {
      const points: DegradationPoint[] = [
        { vus: 10, p50_ms: 500, p95_ms: 1000, throughput_rps: 50, error_rate: 0, cpu_percent: 30 },
        { vus: 20, p50_ms: 800, p95_ms: 2000, throughput_rps: 90, error_rate: 0, cpu_percent: 50 },
        { vus: 30, p50_ms: 1500, p95_ms: 3500, throughput_rps: 100, error_rate: 0.01, cpu_percent: 75 },
      ];
      const knee = service.detectLatencyThreshold(points, 3000);
      expect(knee).not.toBeNull();
      expect(knee!.vus).toBe(30);
      expect(knee!.metric).toBe("p95_ms");
    });

    it("returns null when threshold not crossed", () => {
      const points: DegradationPoint[] = [
        { vus: 10, p50_ms: 500, p95_ms: 1000, throughput_rps: null, error_rate: null, cpu_percent: null },
        { vus: 20, p50_ms: 700, p95_ms: 1500, throughput_rps: null, error_rate: null, cpu_percent: null },
      ];
      const knee = service.detectLatencyThreshold(points, 3000);
      expect(knee).toBeNull();
    });
  });

  describe("detectCpuSaturation", () => {
    it("detects when CPU exceeds threshold", () => {
      const points: DegradationPoint[] = [
        { vus: 10, p50_ms: null, p95_ms: null, throughput_rps: null, error_rate: null, cpu_percent: 40 },
        { vus: 20, p50_ms: null, p95_ms: null, throughput_rps: null, error_rate: null, cpu_percent: 70 },
        { vus: 30, p50_ms: null, p95_ms: null, throughput_rps: null, error_rate: null, cpu_percent: 85 },
      ];
      const knee = service.detectCpuSaturation(points, 80);
      expect(knee).not.toBeNull();
      expect(knee!.vus).toBe(30);
      expect(knee!.metric).toBe("cpu_percent");
    });
  });

  describe("detectThroughputPlateau", () => {
    it("detects throughput plateau", () => {
      const points: DegradationPoint[] = [
        { vus: 10, p50_ms: null, p95_ms: null, throughput_rps: 50, error_rate: null, cpu_percent: null },
        { vus: 20, p50_ms: null, p95_ms: null, throughput_rps: 95, error_rate: null, cpu_percent: null },
        { vus: 30, p50_ms: null, p95_ms: null, throughput_rps: 100, error_rate: null, cpu_percent: null },
        { vus: 40, p50_ms: null, p95_ms: null, throughput_rps: 101, error_rate: null, cpu_percent: null },
      ];
      const knee = service.detectThroughputPlateau(points, {
        latency_threshold_ms: 3000,
        cpu_threshold_percent: 80,
        error_rate_threshold: 0.05,
        throughput_plateau_pct: 5,
        min_data_points: 3,
        slope_change_threshold: 2.0,
      });
      expect(knee).not.toBeNull();
      expect(knee!.metric).toBe("throughput_rps");
    });

    it("returns null for steadily increasing throughput", () => {
      const points: DegradationPoint[] = [
        { vus: 10, p50_ms: null, p95_ms: null, throughput_rps: 50, error_rate: null, cpu_percent: null },
        { vus: 20, p50_ms: null, p95_ms: null, throughput_rps: 100, error_rate: null, cpu_percent: null },
        { vus: 30, p50_ms: null, p95_ms: null, throughput_rps: 150, error_rate: null, cpu_percent: null },
      ];
      const knee = service.detectThroughputPlateau(points, {
        latency_threshold_ms: 3000,
        cpu_threshold_percent: 80,
        error_rate_threshold: 0.05,
        throughput_plateau_pct: 5,
        min_data_points: 3,
        slope_change_threshold: 2.0,
      });
      expect(knee).toBeNull();
    });
  });

  describe("detectErrorRate", () => {
    it("detects error rate spike", () => {
      const points: DegradationPoint[] = [
        { vus: 10, p50_ms: null, p95_ms: null, throughput_rps: null, error_rate: 0, cpu_percent: null },
        { vus: 20, p50_ms: null, p95_ms: null, throughput_rps: null, error_rate: 0.02, cpu_percent: null },
        { vus: 30, p50_ms: null, p95_ms: null, throughput_rps: null, error_rate: 0.08, cpu_percent: null },
      ];
      const knee = service.detectErrorRate(points, 0.05);
      expect(knee).not.toBeNull();
      expect(knee!.vus).toBe(30);
    });
  });

  describe("analyze", () => {
    it("returns low confidence for insufficient data", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const result = await service.analyze("lr-1", { min_data_points: 5 });
      expect(result.confidence).toBe("low");
      expect(result.saturation_point_vus).toBeNull();
      expect(result.recommendation).toContain("Insufficient");
    });

    it("detects latency-based saturation from DB data", async () => {
      mockDb.query
        // getDataPoints
        .mockResolvedValueOnce({
          rows: [
            { vus: 10, p50_ms: 500, p95_ms: 1000, throughput_rps: 50, error_rate: 0, cpu_percent: 30 },
            { vus: 20, p50_ms: 800, p95_ms: 2000, throughput_rps: 100, error_rate: 0, cpu_percent: 50 },
            { vus: 30, p50_ms: 1200, p95_ms: 2800, throughput_rps: 150, error_rate: 0, cpu_percent: 65 },
            { vus: 40, p50_ms: 2000, p95_ms: 4000, throughput_rps: 200, error_rate: 0.01, cpu_percent: 78 },
            { vus: 50, p50_ms: 3000, p95_ms: 6000, throughput_rps: 250, error_rate: 0.03, cpu_percent: 92 },
          ],
        })
        // persistWarnings
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.analyze("lr-1", { min_data_points: 5, latency_threshold_ms: 3000 });
      expect(result.saturation_point_vus).toBe(40);
      expect(result.saturation_type).toBe("latency");
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.recommendation).toContain("VUs");
    });

    it("picks earliest saturation point from multiple signals", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { vus: 10, p50_ms: 500, p95_ms: 1000, throughput_rps: 50, error_rate: 0, cpu_percent: 30 },
            { vus: 20, p50_ms: 700, p95_ms: 1500, throughput_rps: 100, error_rate: 0, cpu_percent: 50 },
            { vus: 30, p50_ms: 900, p95_ms: 2000, throughput_rps: 150, error_rate: 0, cpu_percent: 85 },
            { vus: 40, p50_ms: 1500, p95_ms: 3500, throughput_rps: 200, error_rate: 0.02, cpu_percent: 92 },
            { vus: 50, p50_ms: 2500, p95_ms: 5000, throughput_rps: 250, error_rate: 0.06, cpu_percent: 95 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.analyze("lr-1", {
        min_data_points: 5,
        latency_threshold_ms: 3000,
        cpu_threshold_percent: 80,
      });

      // CPU crosses 80% at VU=30, latency crosses 3000ms at VU=40
      // Should pick CPU (earlier)
      expect(result.saturation_point_vus).toBe(30);
      expect(result.saturation_type).toBe("cpu");
    });

    it("generates recommendation for safe capacity", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { vus: 10, p50_ms: 500, p95_ms: 1000, throughput_rps: 50, error_rate: 0, cpu_percent: 30 },
            { vus: 20, p50_ms: 800, p95_ms: 2000, throughput_rps: 100, error_rate: 0, cpu_percent: 50 },
            { vus: 30, p50_ms: 1200, p95_ms: 2800, throughput_rps: 150, error_rate: 0, cpu_percent: 65 },
            { vus: 40, p50_ms: 2000, p95_ms: 3500, throughput_rps: 200, error_rate: 0, cpu_percent: 78 },
            { vus: 50, p50_ms: 3000, p95_ms: 5000, throughput_rps: 250, error_rate: 0, cpu_percent: 90 },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.analyze("lr-1", { min_data_points: 5 });
      // Should detect latency crossing default 3000ms threshold
      expect(result.saturation_point_vus).not.toBeNull();
      expect(result.recommendation).toContain("VUs");
    });
  });
});
