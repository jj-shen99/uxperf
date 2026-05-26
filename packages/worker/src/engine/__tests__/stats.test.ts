import { describe, it, expect } from "vitest";
import { median, aggregateResults } from "../stats";
import type { SingleRunResult } from "../types";

// ============================================================
// Helper: build a SingleRunResult with minimal fields
// ============================================================
function makeRun(overrides: Partial<SingleRunResult> = {}): SingleRunResult {
  return {
    run_index: 0,
    web_vitals: {},
    lighthouse_scores: {},
    lighthouse_timings: {},
    total_requests: 0,
    total_transfer_size_bytes: 0,
    ...overrides,
  };
}

// ============================================================
// median() — Boundary Condition Testing
// Boundaries: 0 elements, 1 element, 2 elements (even), 3 (odd)
// ============================================================

describe("median — Boundary Conditions", () => {
  it("returns 0 for empty array (boundary: 0 elements)", () => {
    expect(median([])).toBe(0);
  });

  it("returns the single value for 1-element array (boundary: 1 element)", () => {
    expect(median([42])).toBe(42);
  });

  it("returns average of two elements for 2-element array (boundary: even)", () => {
    expect(median([10, 20])).toBe(15);
  });

  it("returns middle value for 3-element array (boundary: odd)", () => {
    expect(median([10, 20, 30])).toBe(20);
  });

  it("returns average of middle two for 4-element array (even)", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  it("returns middle for 5-element array (odd)", () => {
    expect(median([10, 20, 30, 40, 50])).toBe(30);
  });
});

// ============================================================
// median() — Equivalence Partition Testing
// Partitions: all positive, all negative, mixed, zeros,
//             fractional, already sorted, reverse sorted, duplicates
// ============================================================

describe("median — Equivalence Partitions", () => {
  it("all positive values", () => {
    expect(median([100, 200, 300])).toBe(200);
  });

  it("all negative values", () => {
    expect(median([-30, -20, -10])).toBe(-20);
  });

  it("mixed positive and negative", () => {
    expect(median([-10, 0, 10])).toBe(0);
  });

  it("all zeros", () => {
    expect(median([0, 0, 0])).toBe(0);
  });

  it("fractional values", () => {
    expect(median([0.1, 0.5, 0.9])).toBe(0.5);
  });

  it("already sorted input", () => {
    expect(median([1, 2, 3, 4, 5])).toBe(3);
  });

  it("reverse sorted input", () => {
    expect(median([5, 4, 3, 2, 1])).toBe(3);
  });

  it("all duplicate values", () => {
    expect(median([7, 7, 7, 7])).toBe(7);
  });

  it("large values", () => {
    expect(median([1e9, 2e9, 3e9])).toBe(2e9);
  });

  it("very small fractional values", () => {
    expect(median([0.001, 0.002, 0.003])).toBe(0.002);
  });
});

// ============================================================
// median() — Structural Tests (primary path + edge paths)
// Ensure the sort is not mutating input and handles unsorted input
// ============================================================

describe("median — Structural Tests", () => {
  it("does not mutate the original array", () => {
    const arr = [3, 1, 2];
    median(arr);
    expect(arr).toEqual([3, 1, 2]);
  });

  it("handles unsorted input correctly", () => {
    expect(median([50, 10, 40, 20, 30])).toBe(30);
  });

  it("handles two identical values", () => {
    expect(median([5, 5])).toBe(5);
  });
});

// ============================================================
// aggregateResults() — Decision Tree Testing
// Decision: for each metric, choose web_vitals vs lighthouse_timings
//   Case 1: web_vitals present → use web_vitals
//   Case 2: web_vitals absent, lighthouse present → use lighthouse
//   Case 3: both absent → undefined
// ============================================================

describe("aggregateResults — Decision Tree (metric source selection)", () => {
  it("Case 1: prefers web_vitals when both sources present", () => {
    const runs = [
      makeRun({
        web_vitals: { lcp_ms: 100, fcp_ms: 50 },
        lighthouse_timings: { lcp_ms: 999, fcp_ms: 999 },
      }),
    ];
    const result = aggregateResults(runs);
    expect(result.lcp_ms).toBe(100);
    expect(result.fcp_ms).toBe(50);
  });

  it("Case 2: falls back to lighthouse_timings when web_vitals absent", () => {
    const runs = [
      makeRun({
        web_vitals: {},
        lighthouse_timings: { lcp_ms: 200, fcp_ms: 80 },
      }),
    ];
    const result = aggregateResults(runs);
    expect(result.lcp_ms).toBe(200);
    expect(result.fcp_ms).toBe(80);
  });

  it("Case 3: returns undefined when both sources absent", () => {
    const runs = [makeRun({ web_vitals: {}, lighthouse_timings: {} })];
    const result = aggregateResults(runs);
    expect(result.lcp_ms).toBeUndefined();
    expect(result.fcp_ms).toBeUndefined();
  });

  it("returns undefined for all metrics on empty runs array", () => {
    const result = aggregateResults([]);
    expect(result.lcp_ms).toBeUndefined();
    expect(result.fcp_ms).toBeUndefined();
    expect(result.cls).toBeUndefined();
    expect(result.ttfb_ms).toBeUndefined();
    expect(result.si_ms).toBeUndefined();
    expect(result.lighthouse_performance_score).toBeUndefined();
  });
});

// ============================================================
// aggregateResults() — MC/DC (Modified Condition/Decision Coverage)
// Compound condition in pick(): v !== undefined && v !== null
// Toggle each condition independently:
//   (T, T) → included
//   (F, T) → excluded (v is undefined)
//   (T, F) → excluded (v is null — though TS makes this rare)
// Also: fallback condition: web_vitals.X ?? lighthouse_timings.X
//   (web defined) → use web
//   (web undefined, lh defined) → use lh
//   (both undefined) → filter out
// ============================================================

describe("aggregateResults — MC/DC Coverage", () => {
  it("includes value when both conditions true (defined and non-null)", () => {
    const runs = [makeRun({ web_vitals: { lcp_ms: 100 } })];
    expect(aggregateResults(runs).lcp_ms).toBe(100);
  });

  it("excludes value when undefined (first condition false)", () => {
    const runs = [makeRun({ web_vitals: {} })];
    // lcp_ms is undefined in web_vitals, and no lighthouse fallback
    expect(aggregateResults(runs).lcp_ms).toBeUndefined();
  });

  it("fallback: web_vitals defined → lighthouse ignored", () => {
    const runs = [
      makeRun({
        web_vitals: { cls: 0.05 },
        lighthouse_timings: { cls: 0.99 },
      }),
    ];
    expect(aggregateResults(runs).cls).toBe(0.05);
  });

  it("fallback: web_vitals undefined → lighthouse used", () => {
    const runs = [
      makeRun({
        web_vitals: {},
        lighthouse_timings: { cls: 0.12 },
      }),
    ];
    expect(aggregateResults(runs).cls).toBe(0.12);
  });

  it("fallback: both undefined → result is undefined", () => {
    const runs = [makeRun({})];
    expect(aggregateResults(runs).cls).toBeUndefined();
  });
});

// ============================================================
// aggregateResults() — Primary Path Coverage
// Happy path: multiple runs, all metrics populated, median computed
// ============================================================

describe("aggregateResults — Primary Path Coverage", () => {
  it("computes correct medians across 3 runs with full data", () => {
    const runs = [
      makeRun({
        run_index: 0,
        web_vitals: { lcp_ms: 2000, fcp_ms: 1000, cls: 0.1, ttfb_ms: 200, inp_ms: 100 },
        lighthouse_scores: { performance: 0.8, accessibility: 0.9, best_practices: 0.85, seo: 0.95 },
        lighthouse_timings: { si_ms: 3000, tti_ms: 4000, tbt_ms: 300 },
        total_requests: 50,
        total_transfer_size_bytes: 500000,
        dom_content_loaded_ms: 1500,
        load_event_ms: 3000,
      }),
      makeRun({
        run_index: 1,
        web_vitals: { lcp_ms: 2500, fcp_ms: 1200, cls: 0.15, ttfb_ms: 250, inp_ms: 150 },
        lighthouse_scores: { performance: 0.75, accessibility: 0.85, best_practices: 0.80, seo: 0.90 },
        lighthouse_timings: { si_ms: 3500, tti_ms: 4500, tbt_ms: 350 },
        total_requests: 55,
        total_transfer_size_bytes: 550000,
        dom_content_loaded_ms: 1700,
        load_event_ms: 3200,
      }),
      makeRun({
        run_index: 2,
        web_vitals: { lcp_ms: 2200, fcp_ms: 1100, cls: 0.12, ttfb_ms: 220, inp_ms: 120 },
        lighthouse_scores: { performance: 0.85, accessibility: 0.92, best_practices: 0.88, seo: 0.93 },
        lighthouse_timings: { si_ms: 3200, tti_ms: 4200, tbt_ms: 320 },
        total_requests: 52,
        total_transfer_size_bytes: 520000,
        dom_content_loaded_ms: 1600,
        load_event_ms: 3100,
      }),
    ];

    const result = aggregateResults(runs);

    // Median of 3 = middle value (sorted)
    expect(result.lcp_ms).toBe(2200);
    expect(result.fcp_ms).toBe(1100);
    expect(result.cls).toBe(0.12);
    expect(result.ttfb_ms).toBe(220);
    expect(result.inp_ms).toBe(120);
    expect(result.si_ms).toBe(3200);
    expect(result.tti_ms).toBe(4200);
    expect(result.tbt_ms).toBe(320);
    expect(result.lighthouse_performance_score).toBe(0.8);
    expect(result.lighthouse_accessibility_score).toBe(0.9);
    expect(result.lighthouse_best_practices_score).toBe(0.85);
    expect(result.lighthouse_seo_score).toBe(0.93);
    expect(result.total_requests).toBe(52);
    expect(result.total_transfer_size_bytes).toBe(520000);
    expect(result.dom_content_loaded_ms).toBe(1600);
    expect(result.load_event_ms).toBe(3100);
  });

  it("handles single run (returns exact values)", () => {
    const runs = [
      makeRun({
        web_vitals: { lcp_ms: 1500 },
        lighthouse_scores: { performance: 0.9 },
        lighthouse_timings: { si_ms: 2500 },
        total_requests: 40,
        total_transfer_size_bytes: 400000,
      }),
    ];
    const result = aggregateResults(runs);
    expect(result.lcp_ms).toBe(1500);
    expect(result.lighthouse_performance_score).toBe(0.9);
    expect(result.si_ms).toBe(2500);
  });
});

// ============================================================
// aggregateResults() — Regression Tests
// Ensure specific bugs cannot recur
// ============================================================

describe("aggregateResults — Regression Tests", () => {
  it("handles CLS = 0 without treating it as falsy", () => {
    const runs = [makeRun({ web_vitals: { cls: 0 } })];
    const result = aggregateResults(runs);
    // CLS=0 is a valid metric (perfect score). Should NOT be undefined.
    expect(result.cls).toBe(0);
  });

  it("handles mixed populated and empty runs", () => {
    const runs = [
      makeRun({ web_vitals: { lcp_ms: 1000 } }),
      makeRun({ web_vitals: {} }),
      makeRun({ web_vitals: { lcp_ms: 3000 } }),
    ];
    // Only 2 values: median of [1000, 3000] = 2000
    const result = aggregateResults(runs);
    expect(result.lcp_ms).toBe(2000);
  });

  it("lighthouse-only metrics (si, tti, tbt) not affected by web_vitals", () => {
    const runs = [
      makeRun({
        web_vitals: { lcp_ms: 100 },
        lighthouse_timings: { si_ms: 2000, tti_ms: 3000, tbt_ms: 400 },
      }),
    ];
    const result = aggregateResults(runs);
    expect(result.si_ms).toBe(2000);
    expect(result.tti_ms).toBe(3000);
    expect(result.tbt_ms).toBe(400);
    // inp is web_vitals only, not in lighthouse_timings
    expect(result.inp_ms).toBeUndefined();
  });
});
