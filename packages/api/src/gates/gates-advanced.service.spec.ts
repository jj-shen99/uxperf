import { Test } from "@nestjs/testing";
import { GatesService, GateDefinition, VuTier } from "./gates.service";
import { DatabaseService } from "../database/database.service";
import { BaselinesService } from "../baselines/baselines.service";

/**
 * Advanced Gate Types — Unit Tests (E-11, E-12, E-13)
 *
 * E-11: VU-tiered gates — different thresholds at different VU levels
 * E-12: Resource floor gates — fail if server resources drop below minimum
 * E-13: Capacity floor gates — fail if system can't sustain minimum throughput
 */

describe("GatesService — Advanced Gate Types", () => {
  let service: GatesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        GatesService,
        { provide: DatabaseService, useValue: { query: jest.fn() } },
        { provide: BaselinesService, useValue: {} },
      ],
    }).compile();
    service = module.get(GatesService);
  });

  // ── E-11: VU-tiered gates ──

  describe("evaluateVuTiered (E-11)", () => {
    const tiers: VuTier[] = [
      { max_vus: 10, threshold: 200 },
      { max_vus: 100, threshold: 500 },
      { max_vus: 1000, threshold: 1500 },
    ];

    const def: GateDefinition = {
      type: "vu_tiered",
      metric: "lcp_ms",
      vu_tiers: tiers,
    };

    it("applies lowest tier threshold for low VU count", () => {
      const result = service.evaluateVuTiered(def, 150, { vus: 5 });
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(200);
      expect(result.matchedTier?.max_vus).toBe(10);
    });

    it("fails when metric exceeds tier threshold", () => {
      const result = service.evaluateVuTiered(def, 300, { vus: 5 });
      expect(result.passed).toBe(false);
      expect(result.computedThreshold).toBe(200);
    });

    it("applies middle tier for medium VU count", () => {
      const result = service.evaluateVuTiered(def, 400, { vus: 50 });
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(500);
    });

    it("applies highest tier for high VU count", () => {
      const result = service.evaluateVuTiered(def, 1200, { vus: 800 });
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(1500);
    });

    it("uses highest tier when VUs exceed all tiers", () => {
      const result = service.evaluateVuTiered(def, 1400, { vus: 5000 });
      expect(result.passed).toBe(true);
      expect(result.computedThreshold).toBe(1500);
    });

    it("passes when actual value is undefined (no data)", () => {
      const result = service.evaluateVuTiered(def, undefined, { vus: 50 });
      expect(result.passed).toBe(true);
    });

    it("falls back to basic threshold when no tiers defined", () => {
      const noTiers: GateDefinition = {
        type: "vu_tiered",
        metric: "lcp_ms",
        threshold: 2500,
        operator: "lte",
      };
      const result = service.evaluateVuTiered(noTiers, 2000, { vus: 10 });
      expect(result.passed).toBe(true);
    });

    it("reads VU count from alternative metric keys", () => {
      const result = service.evaluateVuTiered(def, 150, { virtual_users: 8 });
      expect(result.matchedTier?.max_vus).toBe(10);
    });

    it("respects per-tier operator override", () => {
      const gteThreshold: VuTier[] = [
        { max_vus: 100, threshold: 500, operator: "gte" },
      ];
      const d: GateDefinition = { type: "vu_tiered", metric: "rps", vu_tiers: gteThreshold };
      // 600 >= 500 → pass
      expect(service.evaluateVuTiered(d, 600, { vus: 50 }).passed).toBe(true);
      // 400 >= 500 → fail
      expect(service.evaluateVuTiered(d, 400, { vus: 50 }).passed).toBe(false);
    });
  });

  // ── E-12: Resource floor gates ──

  describe("evaluateResourceFloor (E-12)", () => {
    it("passes when CPU is above floor", () => {
      const def: GateDefinition = {
        type: "resource_floor",
        metric: "cpu",
        resource_metric: "cpu_pct",
        floor_value: 20,
      };
      const result = service.evaluateResourceFloor(def, { cpu_available_pct: 45 });
      expect(result.passed).toBe(true);
      expect(result.actualValue).toBe(45);
    });

    it("fails when CPU drops below floor", () => {
      const def: GateDefinition = {
        type: "resource_floor",
        metric: "cpu",
        resource_metric: "cpu_pct",
        floor_value: 20,
      };
      const result = service.evaluateResourceFloor(def, { cpu_available_pct: 12 });
      expect(result.passed).toBe(false);
      expect(result.computedThreshold).toBe(20);
    });

    it("passes when memory is above floor", () => {
      const def: GateDefinition = {
        type: "resource_floor",
        metric: "memory",
        resource_metric: "memory_pct",
        floor_value: 15,
      };
      const result = service.evaluateResourceFloor(def, { memory_available_pct: 30 });
      expect(result.passed).toBe(true);
    });

    it("fails when memory is below floor", () => {
      const def: GateDefinition = {
        type: "resource_floor",
        metric: "memory",
        resource_metric: "memory_pct",
        floor_value: 25,
      };
      const result = service.evaluateResourceFloor(def, { memory_free_pct: 10 });
      expect(result.passed).toBe(false);
    });

    it("passes (skips) when metric not found in data", () => {
      const def: GateDefinition = {
        type: "resource_floor",
        metric: "disk",
        resource_metric: "disk_io_pct",
        floor_value: 10,
      };
      const result = service.evaluateResourceFloor(def, { lcp_ms: 2000 });
      expect(result.passed).toBe(true);
    });

    it("uses default floor of 20 when not specified", () => {
      const def: GateDefinition = {
        type: "resource_floor",
        metric: "cpu",
        resource_metric: "cpu_pct",
      };
      const result = service.evaluateResourceFloor(def, { cpu_idle_pct: 19 });
      expect(result.passed).toBe(false);
      expect(result.computedThreshold).toBe(20);
    });

    it("tries alternative metric keys", () => {
      const def: GateDefinition = {
        type: "resource_floor",
        metric: "cpu",
        resource_metric: "cpu_pct",
        floor_value: 10,
      };
      // cpu_idle_pct (2nd alternative) = 25
      const result = service.evaluateResourceFloor(def, { cpu_idle_pct: 25 });
      expect(result.passed).toBe(true);
      expect(result.actualValue).toBe(25);
    });
  });

  // ── E-13: Capacity floor gates ──

  describe("evaluateCapacityFloor (E-13)", () => {
    it("passes when RPS exceeds minimum", () => {
      const def: GateDefinition = {
        type: "capacity_floor",
        metric: "throughput",
        capacity_metric: "rps",
        min_capacity: 500,
      };
      const result = service.evaluateCapacityFloor(def, { requests_per_second: 750 });
      expect(result.passed).toBe(true);
      expect(result.actualValue).toBe(750);
    });

    it("fails when RPS is below minimum", () => {
      const def: GateDefinition = {
        type: "capacity_floor",
        metric: "throughput",
        capacity_metric: "rps",
        min_capacity: 500,
      };
      const result = service.evaluateCapacityFloor(def, { rps: 320 });
      expect(result.passed).toBe(false);
      expect(result.computedThreshold).toBe(500);
    });

    it("evaluates concurrent users capacity", () => {
      const def: GateDefinition = {
        type: "capacity_floor",
        metric: "users",
        capacity_metric: "concurrent_users",
        min_capacity: 200,
      };
      const result = service.evaluateCapacityFloor(def, { concurrent_users: 250 });
      expect(result.passed).toBe(true);
    });

    it("evaluates throughput capacity", () => {
      const def: GateDefinition = {
        type: "capacity_floor",
        metric: "bandwidth",
        capacity_metric: "throughput_mbps",
        min_capacity: 100,
      };
      const result = service.evaluateCapacityFloor(def, { throughput_mbps: 85 });
      expect(result.passed).toBe(false);
    });

    it("passes when metric not found", () => {
      const def: GateDefinition = {
        type: "capacity_floor",
        metric: "throughput",
        capacity_metric: "rps",
        min_capacity: 500,
      };
      const result = service.evaluateCapacityFloor(def, { lcp_ms: 2000 });
      expect(result.passed).toBe(true);
    });

    it("uses default min_capacity of 100", () => {
      const def: GateDefinition = {
        type: "capacity_floor",
        metric: "throughput",
        capacity_metric: "rps",
      };
      const result = service.evaluateCapacityFloor(def, { rps: 50 });
      expect(result.passed).toBe(false);
      expect(result.computedThreshold).toBe(100);
    });

    it("passes at exact boundary", () => {
      const def: GateDefinition = {
        type: "capacity_floor",
        metric: "throughput",
        capacity_metric: "rps",
        min_capacity: 500,
      };
      const result = service.evaluateCapacityFloor(def, { rps: 500 });
      expect(result.passed).toBe(true);
    });
  });
});
