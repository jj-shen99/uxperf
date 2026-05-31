/**
 * Variance-Aware Run Aggregation Tests (E-43)
 *
 * Book Ch 5, p82–85: "Report median and IQR from N runs.
 * Compare using confidence intervals, not raw deltas."
 */
import {
  median,
  percentile,
  varianceStats,
  compareMetric,
} from "./stats";

describe("median", () => {
  it("returns 0 for empty array", () => {
    expect(median([])).toBe(0);
  });

  it("returns the single value for one element", () => {
    expect(median([42])).toBe(42);
  });

  it("returns median of odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("returns mean of two middle values for even-length array", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it("returns the single value for one element", () => {
    expect(percentile([99], 0.75)).toBe(99);
  });

  it("computes p50 correctly", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
  });

  it("computes p75 with interpolation", () => {
    const result = percentile([100, 200, 300, 400, 500], 0.75);
    expect(result).toBe(400);
  });

  it("handles unsorted input", () => {
    expect(percentile([50, 10, 40, 20, 30], 0.5)).toBe(30);
  });
});

describe("varianceStats (E-43)", () => {
  it("returns zeros for empty array", () => {
    const s = varianceStats([]);
    expect(s.n).toBe(0);
    expect(s.median).toBe(0);
    expect(s.iqr).toBe(0);
  });

  it("computes full stats for a sample", () => {
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const s = varianceStats(values);
    expect(s.n).toBe(10);
    expect(s.median).toBe(550);
    expect(s.min).toBe(100);
    expect(s.max).toBe(1000);
    expect(s.mean).toBe(550);
    expect(s.p25).toBeGreaterThan(200);
    expect(s.p75).toBeLessThan(900);
    expect(s.iqr).toBe(s.p75 - s.p25);
    expect(s.stddev).toBeGreaterThan(0);
  });

  it("handles single value", () => {
    const s = varianceStats([42]);
    expect(s.median).toBe(42);
    expect(s.mean).toBe(42);
    expect(s.stddev).toBe(0);
    expect(s.iqr).toBe(0);
  });
});

describe("compareMetric (E-43)", () => {
  it("detects significant regression (latency: lower is better)", () => {
    const before = [100, 110, 105, 108, 102, 107, 103, 109, 104, 106];
    const after = [200, 210, 205, 208, 202, 207, 203, 209, 204, 206];
    const result = compareMetric("lcp_ms", before, after);
    expect(result.is_significant).toBe(true);
    expect(result.direction).toBe("regressed");
    expect(result.delta).toBeGreaterThan(0);
    expect(result.delta_pct).toBeGreaterThan(50);
  });

  it("detects significant improvement (latency: lower is better)", () => {
    const before = [200, 210, 205, 208, 202, 207, 203, 209, 204, 206];
    const after = [100, 110, 105, 108, 102, 107, 103, 109, 104, 106];
    const result = compareMetric("lcp_ms", before, after);
    expect(result.is_significant).toBe(true);
    expect(result.direction).toBe("improved");
    expect(result.delta).toBeLessThan(0);
  });

  it("marks overlapping distributions as unchanged", () => {
    const before = [100, 110, 105, 108, 102, 107, 103, 109, 104, 106];
    const after = [103, 113, 108, 111, 105, 110, 106, 112, 107, 109];
    const result = compareMetric("lcp_ms", before, after);
    expect(result.is_significant).toBe(false);
    expect(result.direction).toBe("unchanged");
  });

  it("respects higherIsBetter flag (e.g. scores)", () => {
    const before = [70, 72, 71, 73, 69, 74, 68, 75, 67, 76];
    const after = [90, 92, 91, 93, 89, 94, 88, 95, 87, 96];
    const result = compareMetric("perf_score", before, after, true);
    expect(result.is_significant).toBe(true);
    expect(result.direction).toBe("improved"); // higher score = better
  });

  it("treats tiny deltas as unchanged even if IQRs don't overlap", () => {
    // Two distributions right next to each other with very tight IQR
    const before = [100.0, 100.0, 100.0, 100.0, 100.0];
    const after = [100.5, 100.5, 100.5, 100.5, 100.5];
    const result = compareMetric("lcp_ms", before, after);
    // delta_pct = 0.5% which is < 1% threshold
    expect(result.direction).toBe("unchanged");
  });

  it("includes full variance stats in result", () => {
    const before = [100, 200, 300];
    const after = [400, 500, 600];
    const result = compareMetric("fcp_ms", before, after);
    expect(result.before.n).toBe(3);
    expect(result.after.n).toBe(3);
    expect(result.before.median).toBe(200);
    expect(result.after.median).toBe(500);
    expect(result.metric).toBe("fcp_ms");
  });

  it("handles empty before set", () => {
    const result = compareMetric("lcp_ms", [], [100, 200]);
    expect(result.before.n).toBe(0);
    expect(result.delta_pct).toBe(0); // division by zero guard
  });
});
