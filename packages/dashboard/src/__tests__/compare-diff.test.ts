/**
 * E-18: Compare page — diff computation, summary, formatting, and bar logic tests.
 */

import {
  computeDiffRow,
  computeDiffSummary,
  formatValue,
  diffBarWidth,
} from "../lib/compare-utils";

const METRIC_LCP = { key: "lcp_ms", label: "LCP (ms)", good: 2500, unit: "ms", lowerIsBetter: true };
const METRIC_PERF = { key: "lighthouse_performance_score", label: "Perf Score", good: 0.9, unit: "", lowerIsBetter: false };
const METRIC_CLS = { key: "cls", label: "CLS", good: 0.1, unit: "", lowerIsBetter: true };

// =============================================================
// computeDiffRow
// =============================================================

describe("computeDiffRow", () => {
  it("detects regression for lower-is-better metric (LCP went up)", () => {
    const row = computeDiffRow(METRIC_LCP, { lcp_ms: 2000 }, { lcp_ms: 3000 });
    expect(row.diff).toBe(1000);
    expect(row.pct).toBeCloseTo(50);
    expect(row.regressed).toBe(true);
    expect(row.improved).toBe(false);
  });

  it("detects improvement for lower-is-better metric (LCP went down)", () => {
    const row = computeDiffRow(METRIC_LCP, { lcp_ms: 3000 }, { lcp_ms: 2000 });
    expect(row.diff).toBe(-1000);
    expect(row.pct).toBeCloseTo(-33.33, 1);
    expect(row.regressed).toBe(false);
    expect(row.improved).toBe(true);
  });

  it("detects improvement for higher-is-better metric (score went up)", () => {
    const row = computeDiffRow(METRIC_PERF, { lighthouse_performance_score: 0.7 }, { lighthouse_performance_score: 0.9 });
    expect(row.diff).toBeCloseTo(0.2);
    expect(row.improved).toBe(true);
    expect(row.regressed).toBe(false);
  });

  it("detects regression for higher-is-better metric (score went down)", () => {
    const row = computeDiffRow(METRIC_PERF, { lighthouse_performance_score: 0.9 }, { lighthouse_performance_score: 0.7 });
    expect(row.diff).toBeCloseTo(-0.2);
    expect(row.improved).toBe(false);
    expect(row.regressed).toBe(true);
  });

  it("handles zero diff", () => {
    const row = computeDiffRow(METRIC_LCP, { lcp_ms: 2000 }, { lcp_ms: 2000 });
    expect(row.diff).toBe(0);
    expect(row.pct).toBe(0);
    expect(row.improved).toBe(false);
    expect(row.regressed).toBe(false);
  });

  it("handles missing metric in run A", () => {
    const row = computeDiffRow(METRIC_LCP, {}, { lcp_ms: 2000 });
    expect(row.a).toBeUndefined();
    expect(row.diff).toBeNull();
    expect(row.pct).toBeNull();
    expect(row.improved).toBeNull();
    expect(row.regressed).toBeNull();
  });

  it("handles missing metric in run B", () => {
    const row = computeDiffRow(METRIC_LCP, { lcp_ms: 2000 }, {});
    expect(row.b).toBeUndefined();
    expect(row.diff).toBeNull();
  });

  it("handles both metrics missing", () => {
    const row = computeDiffRow(METRIC_LCP, {}, {});
    expect(row.diff).toBeNull();
  });

  it("handles zero baseline value (avoids division by zero)", () => {
    const row = computeDiffRow(METRIC_CLS, { cls: 0 }, { cls: 0.05 });
    expect(row.diff).toBe(0.05);
    expect(row.pct).toBeNull(); // a is 0, can't compute pct
  });
});

// =============================================================
// computeDiffSummary
// =============================================================

describe("computeDiffSummary", () => {
  it("counts regressions and improvements", () => {
    const rows = [
      computeDiffRow(METRIC_LCP, { lcp_ms: 2000 }, { lcp_ms: 3000 }),   // regression
      computeDiffRow(METRIC_CLS, { cls: 0.2 }, { cls: 0.05 }),           // improvement
      computeDiffRow(METRIC_PERF, { lighthouse_performance_score: 0.9 }, { lighthouse_performance_score: 0.9 }), // unchanged
    ];
    const summary = computeDiffSummary(rows);
    expect(summary.regressions).toHaveLength(1);
    expect(summary.improvements).toHaveLength(1);
    expect(summary.unchanged).toHaveLength(1);
    expect(summary.total).toBe(3);
  });

  it("handles all regressions", () => {
    const rows = [
      computeDiffRow(METRIC_LCP, { lcp_ms: 2000 }, { lcp_ms: 3000 }),
      computeDiffRow(METRIC_CLS, { cls: 0.05 }, { cls: 0.2 }),
    ];
    const summary = computeDiffSummary(rows);
    expect(summary.regressions).toHaveLength(2);
    expect(summary.improvements).toHaveLength(0);
  });

  it("handles no data", () => {
    const rows = [
      computeDiffRow(METRIC_LCP, {}, {}),
    ];
    const summary = computeDiffSummary(rows);
    expect(summary.noData).toHaveLength(1);
    expect(summary.regressions).toHaveLength(0);
  });
});

// =============================================================
// formatValue
// =============================================================

describe("formatValue", () => {
  it("formats CLS with 3 decimal places", () => {
    expect(formatValue(0.123, "cls")).toBe("0.123");
  });

  it("formats lighthouse score as percentage", () => {
    expect(formatValue(0.92, "lighthouse_performance_score")).toBe("92");
  });

  it("formats timing metrics as integers", () => {
    expect(formatValue(2345.6, "lcp_ms")).toBe("2346");
  });

  it("returns dash for undefined", () => {
    expect(formatValue(undefined, "lcp_ms")).toBe("—");
  });

  it("returns dash for null (cast)", () => {
    expect(formatValue(null as any, "lcp_ms")).toBe("—");
  });
});

// =============================================================
// diffBarWidth
// =============================================================

describe("diffBarWidth", () => {
  it("returns 0 for null", () => {
    expect(diffBarWidth(null)).toBe(0);
  });

  it("returns absolute value for positive pct", () => {
    expect(diffBarWidth(25)).toBe(25);
  });

  it("returns absolute value for negative pct", () => {
    expect(diffBarWidth(-30)).toBe(30);
  });

  it("caps at 100", () => {
    expect(diffBarWidth(150)).toBe(100);
    expect(diffBarWidth(-200)).toBe(100);
  });

  it("returns 0 for 0%", () => {
    expect(diffBarWidth(0)).toBe(0);
  });
});
