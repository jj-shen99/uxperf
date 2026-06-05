/**
 * Unit tests for load page data structures and utility logic.
 * Tests stage preview data generation, status styles, correlation bar data mapping,
 * and quick-run stage generation without needing a full React render.
 */

interface Stage {
  duration_s: number;
  target_vus: number;
  ramp_type?: "linear" | "step";
}

const STATUS_STYLES: Record<string, string> = {
  queued:    "bg-gray-700/40 text-gray-300",
  warming:   "bg-yellow-900/40 text-yellow-300",
  running:   "bg-blue-900/40 text-blue-300",
  cooling:   "bg-indigo-900/40 text-indigo-300",
  completed: "bg-green-900/40 text-green-300",
  failed:    "bg-red-900/40 text-red-300",
  cancelled: "bg-gray-800/40 text-gray-500",
};

const CACHE_OPTIONS = ["warm", "cold", "production_replay"] as const;
const ENGINE_OPTIONS = ["k6_browser", "playwright_lighthouse", "wpt", "sitespeed"] as const;

function buildStagePoints(stages: Stage[]) {
  const points: { time: number; vus: number }[] = [];
  let elapsed = 0;
  let prevVus = 0;
  for (const stage of stages) {
    points.push({ time: elapsed, vus: prevVus });
    elapsed += stage.duration_s;
    points.push({ time: elapsed, vus: stage.target_vus });
    prevVus = stage.target_vus;
  }
  return points;
}

function buildQuickRunStages(vus: number, duration: number): Stage[] {
  return [
    { duration_s: Math.round(duration * 0.2), target_vus: vus, ramp_type: "linear" },
    { duration_s: Math.round(duration * 0.6), target_vus: vus },
    { duration_s: Math.round(duration * 0.2), target_vus: 0, ramp_type: "linear" },
  ];
}

function buildCorrelationBarData(correlations: any[]) {
  return correlations.map((c: any) => ({
    name: c.server_metric,
    r: Math.round(c.pearson_r * 100) / 100,
    fill: c.direction === "positive" ? "#f87171" : c.direction === "negative" ? "#34d399" : "#6b7280",
  }));
}

describe("Load Test — Status Styles", () => {
  it("covers all expected statuses", () => {
    const expected = ["queued", "warming", "running", "cooling", "completed", "failed", "cancelled"];
    for (const status of expected) {
      expect(STATUS_STYLES[status]).toBeTruthy();
    }
  });

  it("completed status contains green", () => {
    expect(STATUS_STYLES["completed"]).toContain("green");
  });

  it("failed status contains red", () => {
    expect(STATUS_STYLES["failed"]).toContain("red");
  });
});

describe("Load Test — Cache & Engine Options", () => {
  it("has 3 cache options", () => {
    expect(CACHE_OPTIONS).toHaveLength(3);
    expect(CACHE_OPTIONS).toContain("warm");
    expect(CACHE_OPTIONS).toContain("cold");
    expect(CACHE_OPTIONS).toContain("production_replay");
  });

  it("has 4 engine options", () => {
    expect(ENGINE_OPTIONS).toHaveLength(4);
    expect(ENGINE_OPTIONS).toContain("k6_browser");
  });
});

describe("Load Test — Stage Preview Points", () => {
  it("produces correct points for a simple ramp-up / steady / ramp-down", () => {
    const stages: Stage[] = [
      { duration_s: 30, target_vus: 10, ramp_type: "linear" },
      { duration_s: 60, target_vus: 10 },
      { duration_s: 30, target_vus: 0, ramp_type: "linear" },
    ];
    const points = buildStagePoints(stages);
    expect(points).toHaveLength(6); // 2 points per stage
    // starts at 0 VUs
    expect(points[0]).toEqual({ time: 0, vus: 0 });
    // ramps up to 10 VUs at 30s
    expect(points[1]).toEqual({ time: 30, vus: 10 });
    // steady at 10 VUs from 30s to 90s
    expect(points[2]).toEqual({ time: 30, vus: 10 });
    expect(points[3]).toEqual({ time: 90, vus: 10 });
    // ramps down to 0 VUs at 120s
    expect(points[4]).toEqual({ time: 90, vus: 10 });
    expect(points[5]).toEqual({ time: 120, vus: 0 });
  });

  it("returns empty array for empty stages", () => {
    expect(buildStagePoints([])).toHaveLength(0);
  });

  it("handles single stage", () => {
    const points = buildStagePoints([{ duration_s: 60, target_vus: 5 }]);
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual({ time: 0, vus: 0 });
    expect(points[1]).toEqual({ time: 60, vus: 5 });
  });
});

describe("Load Test — Quick Run Stages", () => {
  it("generates 3 stages (ramp-up, steady, ramp-down)", () => {
    const stages = buildQuickRunStages(10, 60);
    expect(stages).toHaveLength(3);
  });

  it("total duration equals original duration", () => {
    const stages = buildQuickRunStages(10, 100);
    const total = stages.reduce((s, st) => s + st.duration_s, 0);
    expect(total).toBe(100);
  });

  it("ramp-up and ramp-down each take 20% of the duration", () => {
    const stages = buildQuickRunStages(10, 100);
    expect(stages[0].duration_s).toBe(20);
    expect(stages[2].duration_s).toBe(20);
    expect(stages[1].duration_s).toBe(60);
  });

  it("ramp-down target VUs is 0", () => {
    const stages = buildQuickRunStages(50, 60);
    expect(stages[2].target_vus).toBe(0);
  });

  it("ramp-up and steady use target VUs", () => {
    const stages = buildQuickRunStages(25, 60);
    expect(stages[0].target_vus).toBe(25);
    expect(stages[1].target_vus).toBe(25);
  });
});

/* ─── buildLinearStages ─── */

function buildLinearStages(vus: number, rampUp: number, duration: number): Stage[] {
  const holdDuration = Math.max(duration - rampUp * 2, 0);
  return [
    { duration_s: rampUp, target_vus: vus, ramp_type: "linear" },
    ...(holdDuration > 0 ? [{ duration_s: holdDuration, target_vus: vus, ramp_type: "linear" as const }] : []),
    { duration_s: rampUp, target_vus: 0, ramp_type: "linear" },
  ];
}

function stageMaxVUs(stages: Stage[]): number {
  return Math.max(0, ...stages.map((s) => s.target_vus));
}

describe("Load Test — buildLinearStages", () => {
  it("generates ramp-up, hold, ramp-down with correct durations", () => {
    const stages = buildLinearStages(10, 30, 120);
    expect(stages).toHaveLength(3);
    expect(stages[0]).toEqual({ duration_s: 30, target_vus: 10, ramp_type: "linear" });
    expect(stages[1]).toEqual({ duration_s: 60, target_vus: 10, ramp_type: "linear" });
    expect(stages[2]).toEqual({ duration_s: 30, target_vus: 0, ramp_type: "linear" });
  });

  it("total duration matches the requested duration", () => {
    const stages = buildLinearStages(20, 15, 90);
    const total = stages.reduce((s, st) => s + st.duration_s, 0);
    expect(total).toBe(90);
  });

  it("omits hold stage when rampUp*2 equals duration", () => {
    const stages = buildLinearStages(5, 30, 60);
    // rampUp (30) + rampDown (30) = 60 = duration, hold = 0
    expect(stages).toHaveLength(2);
    expect(stages[0]).toEqual({ duration_s: 30, target_vus: 5, ramp_type: "linear" });
    expect(stages[1]).toEqual({ duration_s: 30, target_vus: 0, ramp_type: "linear" });
  });

  it("omits hold stage when rampUp*2 exceeds duration", () => {
    const stages = buildLinearStages(5, 60, 60);
    // rampUp (60) + rampDown (60) > 60, hold = 0
    expect(stages).toHaveLength(2);
    expect(stages[0].duration_s).toBe(60);
    expect(stages[1].duration_s).toBe(60);
  });

  it("handles zero ramp-up (instant jump)", () => {
    const stages = buildLinearStages(10, 0, 60);
    expect(stages).toHaveLength(3);
    expect(stages[0].duration_s).toBe(0);
    expect(stages[1]).toEqual({ duration_s: 60, target_vus: 10, ramp_type: "linear" });
    expect(stages[2].duration_s).toBe(0);
  });

  it("peak VU in stages matches the requested VUs", () => {
    const stages = buildLinearStages(50, 10, 120);
    expect(stageMaxVUs(stages)).toBe(50);
  });

  it("ramp-down always targets 0 VUs", () => {
    const stages = buildLinearStages(100, 20, 200);
    const lastStage = stages[stages.length - 1];
    expect(lastStage.target_vus).toBe(0);
  });

  it("all stages have ramp_type linear", () => {
    const stages = buildLinearStages(10, 30, 120);
    for (const s of stages) {
      expect(s.ramp_type).toBe("linear");
    }
  });
});

describe("Load Test — stageMaxVUs", () => {
  it("returns the maximum target_vus across all stages", () => {
    const stages: Stage[] = [
      { duration_s: 30, target_vus: 5 },
      { duration_s: 60, target_vus: 20 },
      { duration_s: 30, target_vus: 0 },
    ];
    expect(stageMaxVUs(stages)).toBe(20);
  });

  it("returns 0 for empty stages", () => {
    expect(stageMaxVUs([])).toBe(0);
  });

  it("returns 0 when all stages target 0", () => {
    const stages: Stage[] = [
      { duration_s: 30, target_vus: 0 },
      { duration_s: 30, target_vus: 0 },
    ];
    expect(stageMaxVUs(stages)).toBe(0);
  });

  it("handles single stage", () => {
    expect(stageMaxVUs([{ duration_s: 60, target_vus: 42 }])).toBe(42);
  });

  it("detects mismatch when peak differs from target_vus", () => {
    const targetVus = 10;
    const stages: Stage[] = [
      { duration_s: 30, target_vus: 5 },
      { duration_s: 60, target_vus: 5 },
      { duration_s: 30, target_vus: 0 },
    ];
    // Peak is 5, but target_vus is 10 → mismatch
    expect(stageMaxVUs(stages)).not.toBe(targetVus);
  });

  it("confirms match when peak equals target_vus", () => {
    const targetVus = 10;
    const stages = buildLinearStages(targetVus, 30, 120);
    expect(stageMaxVUs(stages)).toBe(targetVus);
  });
});

describe("Load Test — Correlation Bar Data", () => {
  it("maps positive direction to red fill", () => {
    const data = buildCorrelationBarData([
      { server_metric: "cpu_percent", pearson_r: 0.85, direction: "positive" },
    ]);
    expect(data).toHaveLength(1);
    expect(data[0].fill).toBe("#f87171");
    expect(data[0].name).toBe("cpu_percent");
    expect(data[0].r).toBe(0.85);
  });

  it("maps negative direction to green fill", () => {
    const data = buildCorrelationBarData([
      { server_metric: "response_time", pearson_r: -0.62, direction: "negative" },
    ]);
    expect(data[0].fill).toBe("#34d399");
    expect(data[0].r).toBe(-0.62);
  });

  it("maps neutral direction to gray fill", () => {
    const data = buildCorrelationBarData([
      { server_metric: "disk_io", pearson_r: 0.05, direction: "neutral" },
    ]);
    expect(data[0].fill).toBe("#6b7280");
  });

  it("rounds pearson_r to 2 decimal places", () => {
    const data = buildCorrelationBarData([
      { server_metric: "mem", pearson_r: 0.777777, direction: "positive" },
    ]);
    expect(data[0].r).toBe(0.78);
  });

  it("handles empty correlations", () => {
    expect(buildCorrelationBarData([])).toHaveLength(0);
  });
});
