/**
 * E-57 to E-62: Logic tests for Attribution Panel, Investigation View,
 * Decision Dashboard, Mobile Segment, and Multi-Geo View.
 */

// ── E-57: Attribution Panel logic ──

describe("E-57: Attribution Panel — SHAP feature ranking", () => {
  function rankFeatures(
    features: { feature: string; shap_value: number }[],
  ) {
    return [...features].sort(
      (a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value),
    );
  }

  it("ranks features by absolute SHAP value", () => {
    const features = [
      { feature: "fcp_ms", shap_value: 0.1 },
      { feature: "ttfb_ms", shap_value: -0.5 },
      { feature: "cls", shap_value: 0.3 },
    ];
    const ranked = rankFeatures(features);
    expect(ranked[0].feature).toBe("ttfb_ms");
    expect(ranked[1].feature).toBe("cls");
    expect(ranked[2].feature).toBe("fcp_ms");
  });

  it("handles negative SHAP values correctly", () => {
    const features = [
      { feature: "a", shap_value: -1.0 },
      { feature: "b", shap_value: 0.5 },
    ];
    const ranked = rankFeatures(features);
    expect(ranked[0].feature).toBe("a");
    expect(Math.abs(ranked[0].shap_value)).toBeGreaterThan(
      Math.abs(ranked[1].shap_value),
    );
  });

  it("returns empty for empty input", () => {
    expect(rankFeatures([])).toEqual([]);
  });

  function magnitudeLabel(absValue: number): "high" | "medium" | "low" {
    if (absValue > 0.5) return "high";
    if (absValue > 0.2) return "medium";
    return "low";
  }

  it("classifies magnitude correctly", () => {
    expect(magnitudeLabel(0.8)).toBe("high");
    expect(magnitudeLabel(0.3)).toBe("medium");
    expect(magnitudeLabel(0.1)).toBe("low");
  });
});

// ── E-58: Investigation View — timeline logic ──

describe("E-58: Investigation View — timeline construction", () => {
  function buildTimeline(
    runs: { id: string; created_at: string; metrics: Record<string, number> | null; status: string }[],
    changeRunId: string,
    metric: string,
  ) {
    const idx = runs.findIndex((r) => r.id === changeRunId);
    if (idx < 0) return [];
    const start = Math.max(0, idx - 5);
    const end = Math.min(runs.length, idx + 3);
    return runs
      .slice(start, end)
      .filter((r) => r.status === "completed" && r.metrics)
      .map((r) => ({
        id: r.id,
        value: r.metrics?.[metric] ?? null,
        isChangePoint: r.id === changeRunId,
      }));
  }

  const runs = [
    { id: "r1", created_at: "2026-01-01", metrics: { lcp_ms: 2000 }, status: "completed" },
    { id: "r2", created_at: "2026-01-02", metrics: { lcp_ms: 2100 }, status: "completed" },
    { id: "r3", created_at: "2026-01-03", metrics: { lcp_ms: 2050 }, status: "completed" },
    { id: "r4", created_at: "2026-01-04", metrics: { lcp_ms: 3500 }, status: "completed" },
    { id: "r5", created_at: "2026-01-05", metrics: { lcp_ms: 3600 }, status: "completed" },
    { id: "r6", created_at: "2026-01-06", metrics: null, status: "failed" },
  ];

  it("builds timeline around change point", () => {
    const tl = buildTimeline(runs, "r4", "lcp_ms");
    expect(tl.length).toBeGreaterThanOrEqual(3);
    const cp = tl.find((t) => t.isChangePoint);
    expect(cp).toBeDefined();
    expect(cp!.value).toBe(3500);
  });

  it("filters out non-completed runs", () => {
    const tl = buildTimeline(runs, "r5", "lcp_ms");
    expect(tl.every((t) => t.value !== null || t.isChangePoint)).toBe(true);
  });

  it("returns empty for unknown run id", () => {
    expect(buildTimeline(runs, "unknown", "lcp_ms")).toEqual([]);
  });

  it("handles change point at start of array", () => {
    const tl = buildTimeline(runs, "r1", "lcp_ms");
    expect(tl.length).toBeGreaterThan(0);
    expect(tl[0].isChangePoint).toBe(true);
  });
});

// ── E-60: Decision Dashboard — delta computation ──

describe("E-60: Decision Dashboard — metric deltas", () => {
  function computeDelta(current: number[], previous: number[]): { current: number; previous: number; delta: number; pct: number } {
    const curAvg = current.length > 0 ? current.reduce((a, b) => a + b, 0) / current.length : 0;
    const prevAvg = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : 0;
    const delta = curAvg - prevAvg;
    const pct = prevAvg > 0 ? (delta / prevAvg) * 100 : 0;
    return { current: curAvg, previous: prevAvg, delta, pct };
  }

  it("computes positive delta (degradation)", () => {
    const result = computeDelta([3000, 3200], [2500, 2600]);
    expect(result.delta).toBeGreaterThan(0);
    expect(result.pct).toBeGreaterThan(0);
  });

  it("computes negative delta (improvement)", () => {
    const result = computeDelta([2000, 2100], [2500, 2600]);
    expect(result.delta).toBeLessThan(0);
    expect(result.pct).toBeLessThan(0);
  });

  it("handles empty previous period", () => {
    const result = computeDelta([2000], []);
    expect(result.previous).toBe(0);
    expect(result.pct).toBe(0);
  });

  it("handles empty current period", () => {
    const result = computeDelta([], [2500]);
    expect(result.current).toBe(0);
    expect(result.delta).toBeLessThan(0);
  });

  function classifyTrend(values: number[]): "improving" | "stable" | "degrading" {
    if (values.length < 4) return "stable";
    const half = Math.floor(values.length / 2);
    const firstAvg = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const secondAvg = values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half);
    const pct = ((secondAvg - firstAvg) / Math.max(firstAvg, 1)) * 100;
    if (pct < -10) return "improving";
    if (pct > 10) return "degrading";
    return "stable";
  }

  it("detects improving trend", () => {
    expect(classifyTrend([3000, 2900, 2200, 2100])).toBe("improving");
  });

  it("detects degrading trend", () => {
    expect(classifyTrend([2000, 2100, 3000, 3200])).toBe("degrading");
  });

  it("detects stable trend", () => {
    expect(classifyTrend([2500, 2500, 2500, 2500])).toBe("stable");
  });

  it("returns stable for insufficient data", () => {
    expect(classifyTrend([2500])).toBe("stable");
  });
});

// ── E-61: Mobile Segment — device detection and thresholds ──

describe("E-61: Mobile Segment — device detection", () => {
  function detectDevice(config: { device?: string; formFactor?: string }): "desktop" | "mobile" {
    const device = (config.device ?? config.formFactor ?? "desktop").toLowerCase();
    return device.includes("mobile") || device.includes("phone") || device.includes("moto") || device.includes("nexus")
      ? "mobile"
      : "desktop";
  }

  it("detects mobile device", () => {
    expect(detectDevice({ device: "mobile" })).toBe("mobile");
    expect(detectDevice({ device: "Moto G4" })).toBe("mobile");
    expect(detectDevice({ formFactor: "phone" })).toBe("mobile");
  });

  it("detects desktop device", () => {
    expect(detectDevice({ device: "desktop" })).toBe("desktop");
    expect(detectDevice({})).toBe("desktop");
    expect(detectDevice({ device: "Desktop Chrome" })).toBe("desktop");
  });

  function ratingFor(
    value: number,
    metric: string,
    device: "desktop" | "mobile",
  ): "good" | "needs-improvement" | "poor" {
    const thresholds: Record<string, Record<string, { good: number; poor: number }>> = {
      lcp_ms: { desktop: { good: 2500, poor: 4000 }, mobile: { good: 3000, poor: 5000 } },
      fcp_ms: { desktop: { good: 1800, poor: 3000 }, mobile: { good: 2200, poor: 3500 } },
    };
    const t = thresholds[metric]?.[device];
    if (!t) return "good";
    return value <= t.good ? "good" : value <= t.poor ? "needs-improvement" : "poor";
  }

  it("uses relaxed mobile thresholds", () => {
    expect(ratingFor(2800, "lcp_ms", "desktop")).toBe("needs-improvement");
    expect(ratingFor(2800, "lcp_ms", "mobile")).toBe("good");
  });

  it("rates poor for very high values", () => {
    expect(ratingFor(5500, "lcp_ms", "mobile")).toBe("poor");
    expect(ratingFor(4500, "lcp_ms", "desktop")).toBe("poor");
  });

  function mobileGap(desktopLcp: number, mobileLcp: number): number {
    return Math.round(((mobileLcp - desktopLcp) / desktopLcp) * 100);
  }

  it("computes mobile gap percentage", () => {
    expect(mobileGap(2000, 3000)).toBe(50);
    expect(mobileGap(2000, 2000)).toBe(0);
    expect(mobileGap(3000, 2000)).toBe(-33);
  });
});

// ── E-62: Multi-Geo — physics floor and comparison ──

describe("E-62: Multi-Geo — TTFB physics floor", () => {
  function physicsFloorMs(distanceKm: number): number {
    return Math.round((2 * distanceKm / 200_000) * 1000);
  }

  it("calculates US-East to EU-West floor", () => {
    const floor = physicsFloorMs(5550);
    expect(floor).toBe(56); // ~56ms minimum RTT
  });

  it("calculates US-East to APAC floor", () => {
    const floor = physicsFloorMs(15300);
    expect(floor).toBe(153);
  });

  it("returns 0 for zero distance", () => {
    expect(physicsFloorMs(0)).toBe(0);
  });

  function compareRegions(
    results: { location: string; metrics: Record<string, number> }[],
    metric: string,
  ): { best: string; worst: string; range: number } | null {
    const entries = results
      .filter((r) => r.metrics[metric] != null)
      .map((r) => ({ loc: r.location, val: r.metrics[metric] }));
    if (entries.length < 2) return null;
    entries.sort((a, b) => a.val - b.val);
    return {
      best: entries[0].loc,
      worst: entries[entries.length - 1].loc,
      range: entries[entries.length - 1].val - entries[0].val,
    };
  }

  it("identifies best and worst region", () => {
    const results = [
      { location: "us-east-1", metrics: { ttfb_ms: 200 } },
      { location: "eu-west-1", metrics: { ttfb_ms: 350 } },
      { location: "ap-southeast-1", metrics: { ttfb_ms: 500 } },
    ];
    const comparison = compareRegions(results, "ttfb_ms");
    expect(comparison).not.toBeNull();
    expect(comparison!.best).toBe("us-east-1");
    expect(comparison!.worst).toBe("ap-southeast-1");
    expect(comparison!.range).toBe(300);
  });

  it("returns null for single region", () => {
    const results = [{ location: "us-east-1", metrics: { ttfb_ms: 200 } }];
    expect(compareRegions(results, "ttfb_ms")).toBeNull();
  });

  it("returns null for missing metric", () => {
    const results = [
      { location: "us-east-1", metrics: {} },
      { location: "eu-west-1", metrics: {} },
    ];
    expect(compareRegions(results, "ttfb_ms")).toBeNull();
  });
});
