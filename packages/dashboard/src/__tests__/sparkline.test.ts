/**
 * E-19: Dashboard trend sparklines — unit tests for data extraction,
 * SVG point generation, and trend detection.
 */

import {
  extractSparklineData,
  sparklinePoints,
  sparklineTrend,
} from "../lib/sparkline-utils";

// =============================================================
// extractSparklineData
// =============================================================

describe("extractSparklineData", () => {
  it("extracts metric values from runs", () => {
    const runs = [
      { metrics: { lcp_ms: 2000 } },
      { metrics: { lcp_ms: 2500 } },
      { metrics: { lcp_ms: 1800 } },
    ];
    expect(extractSparklineData(runs, "lcp_ms")).toEqual([2000, 2500, 1800]);
  });

  it("filters out runs without the metric", () => {
    const runs = [
      { metrics: { lcp_ms: 2000 } },
      { metrics: {} },
      { metrics: { lcp_ms: 1800 } },
    ];
    expect(extractSparklineData(runs, "lcp_ms")).toEqual([2000, 1800]);
  });

  it("returns empty array when no runs have the metric", () => {
    const runs = [{ metrics: {} }, { metrics: { fcp_ms: 500 } }];
    expect(extractSparklineData(runs, "lcp_ms")).toEqual([]);
  });

  it("returns empty array for empty runs", () => {
    expect(extractSparklineData([], "lcp_ms")).toEqual([]);
  });

  it("limits to last N entries", () => {
    const runs = Array.from({ length: 30 }, (_, i) => ({
      metrics: { lcp_ms: 1000 + i * 100 },
    }));
    const result = extractSparklineData(runs, "lcp_ms", 5);
    expect(result).toHaveLength(5);
    expect(result[0]).toBe(3500); // 1000 + 25*100
    expect(result[4]).toBe(3900); // 1000 + 29*100
  });

  it("returns all if fewer than count", () => {
    const runs = [
      { metrics: { cls: 0.1 } },
      { metrics: { cls: 0.05 } },
    ];
    expect(extractSparklineData(runs, "cls", 20)).toEqual([0.1, 0.05]);
  });
});

// =============================================================
// sparklinePoints
// =============================================================

describe("sparklinePoints", () => {
  it("returns empty string for fewer than 2 values", () => {
    expect(sparklinePoints([], 80, 24)).toBe("");
    expect(sparklinePoints([42], 80, 24)).toBe("");
  });

  it("generates correct points for 2 values", () => {
    const pts = sparklinePoints([0, 100], 80, 24, 0);
    // x: [0, 80], y: [24 (min at bottom), 0 (max at top)]
    const coords = pts.split(" ");
    expect(coords).toHaveLength(2);
    expect(coords[0]).toBe("0.0,24.0"); // value 0 = min = bottom
    expect(coords[1]).toBe("80.0,0.0"); // value 100 = max = top
  });

  it("handles equal values (range = 0, uses fallback 1)", () => {
    const pts = sparklinePoints([50, 50, 50], 80, 24, 2);
    expect(pts).not.toBe("");
    // All points should be at the same Y (middle)
    const yValues = pts.split(" ").map((p) => parseFloat(p.split(",")[1]));
    expect(new Set(yValues).size).toBe(1);
  });

  it("scales within padding", () => {
    const pts = sparklinePoints([10, 20], 100, 40, 5);
    const coords = pts.split(" ");
    const x0 = parseFloat(coords[0].split(",")[0]);
    const x1 = parseFloat(coords[1].split(",")[0]);
    expect(x0).toBe(5); // left padding
    expect(x1).toBe(95); // 100 - 5
  });
});

// =============================================================
// sparklineTrend
// =============================================================

describe("sparklineTrend", () => {
  it("returns flat for single value", () => {
    expect(sparklineTrend([100])).toBe("flat");
  });

  it("returns flat for empty array", () => {
    expect(sparklineTrend([])).toBe("flat");
  });

  it("detects upward trend", () => {
    expect(sparklineTrend([100, 110, 120, 130, 140, 200])).toBe("up");
  });

  it("detects downward trend", () => {
    expect(sparklineTrend([200, 180, 160, 140, 120, 100])).toBe("down");
  });

  it("returns flat for stable values (<3% change)", () => {
    expect(sparklineTrend([100, 101, 100, 99, 100, 101])).toBe("flat");
  });

  it("handles two values with significant change", () => {
    expect(sparklineTrend([100, 200])).toBe("up");
    expect(sparklineTrend([200, 100])).toBe("down");
  });

  it("handles two identical values", () => {
    expect(sparklineTrend([100, 100])).toBe("flat");
  });

  it("handles values starting at zero", () => {
    // avgFirst = 0, pctChange uses (avgFirst || 1) to avoid division by zero
    expect(sparklineTrend([0, 0, 10, 20, 30])).toBe("up");
  });
});
