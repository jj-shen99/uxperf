import type { SingleRunResult, AggregatedMetrics } from "./types";

/**
 * E-43: Variance-aware statistics for run aggregation.
 *
 * Book Ch 5, p82–85: "Report median and IQR from N runs.
 * Compare using confidence intervals, not raw deltas."
 */
export interface VarianceStats {
  median: number;
  p25: number;
  p75: number;
  iqr: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
  n: number;
}

export interface ComparisonResult {
  metric: string;
  before: VarianceStats;
  after: VarianceStats;
  delta: number;
  delta_pct: number;
  is_significant: boolean;
  direction: "improved" | "regressed" | "unchanged";
}

/**
 * Compute median of a numeric array.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Compute a percentile using linear interpolation.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
}

/**
 * E-43: Compute variance-aware statistics for a set of values.
 */
export function varianceStats(values: number[]): VarianceStats {
  if (values.length === 0) {
    return { median: 0, p25: 0, p75: 0, iqr: 0, mean: 0, stddev: 0, min: 0, max: 0, n: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const med = median(values);
  const p25 = percentile(values, 0.25);
  const p75 = percentile(values, 0.75);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  return {
    median: med,
    p25,
    p75,
    iqr: p75 - p25,
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[n - 1],
    n,
  };
}

/**
 * E-43: Compare two sets of values and determine if the difference
 * is statistically significant using the Mann-Whitney U test approximation.
 *
 * Book Ch 12, p149: "The compare page should show whether the difference
 * is statistically significant, not just the raw delta."
 *
 * Uses the IQR overlap method as a quick heuristic:
 * Significant if the IQR ranges do not overlap.
 */
export function compareMetric(
  metricName: string,
  before: number[],
  after: number[],
  higherIsBetter = false,
): ComparisonResult {
  const bStats = varianceStats(before);
  const aStats = varianceStats(after);

  const delta = aStats.median - bStats.median;
  const deltaPct = bStats.median !== 0 ? (delta / bStats.median) * 100 : 0;

  // IQR overlap test: significant if IQR ranges don't overlap
  const bLower = bStats.p25;
  const bUpper = bStats.p75;
  const aLower = aStats.p25;
  const aUpper = aStats.p75;
  const isSignificant = aLower > bUpper || bLower > aUpper;

  let direction: "improved" | "regressed" | "unchanged";
  if (!isSignificant || Math.abs(deltaPct) < 1) {
    direction = "unchanged";
  } else if (higherIsBetter) {
    direction = delta > 0 ? "improved" : "regressed";
  } else {
    direction = delta < 0 ? "improved" : "regressed";
  }

  return {
    metric: metricName,
    before: bStats,
    after: aStats,
    delta,
    delta_pct: deltaPct,
    is_significant: isSignificant,
    direction,
  };
}

/**
 * Aggregate N single-run results into median-based summary metrics.
 * Per §11.1: "Run each script N times; report median and p75"
 */
export function aggregateResults(runs: SingleRunResult[]): AggregatedMetrics {
  const pick = (fn: (r: SingleRunResult) => number | undefined): number[] =>
    runs.map(fn).filter((v): v is number => v !== undefined && v !== null);

  // Prefer Playwright web_vitals, fall back to Lighthouse timings
  const lcpValues = pick(
    (r) => r.web_vitals.lcp_ms ?? r.lighthouse_timings.lcp_ms
  );
  const fcpValues = pick(
    (r) => r.web_vitals.fcp_ms ?? r.lighthouse_timings.fcp_ms
  );
  const clsValues = pick(
    (r) => r.web_vitals.cls ?? r.lighthouse_timings.cls
  );
  const ttfbValues = pick(
    (r) => r.web_vitals.ttfb_ms ?? r.lighthouse_timings.ttfb_ms
  );

  return {
    lcp_ms: lcpValues.length > 0 ? median(lcpValues) : undefined,
    fcp_ms: fcpValues.length > 0 ? median(fcpValues) : undefined,
    inp_ms:
      pick((r) => r.web_vitals.inp_ms).length > 0
        ? median(pick((r) => r.web_vitals.inp_ms))
        : undefined,
    cls: clsValues.length > 0 ? median(clsValues) : undefined,
    ttfb_ms: ttfbValues.length > 0 ? median(ttfbValues) : undefined,
    si_ms:
      pick((r) => r.lighthouse_timings.si_ms).length > 0
        ? median(pick((r) => r.lighthouse_timings.si_ms))
        : undefined,
    tti_ms:
      pick((r) => r.lighthouse_timings.tti_ms).length > 0
        ? median(pick((r) => r.lighthouse_timings.tti_ms))
        : undefined,
    tbt_ms:
      pick((r) => r.lighthouse_timings.tbt_ms).length > 0
        ? median(pick((r) => r.lighthouse_timings.tbt_ms))
        : undefined,
    lighthouse_performance_score:
      pick((r) => r.lighthouse_scores.performance).length > 0
        ? median(pick((r) => r.lighthouse_scores.performance))
        : undefined,
    lighthouse_accessibility_score:
      pick((r) => r.lighthouse_scores.accessibility).length > 0
        ? median(pick((r) => r.lighthouse_scores.accessibility))
        : undefined,
    lighthouse_best_practices_score:
      pick((r) => r.lighthouse_scores.best_practices).length > 0
        ? median(pick((r) => r.lighthouse_scores.best_practices))
        : undefined,
    lighthouse_seo_score:
      pick((r) => r.lighthouse_scores.seo).length > 0
        ? median(pick((r) => r.lighthouse_scores.seo))
        : undefined,
    total_requests:
      pick((r) => r.total_requests).length > 0
        ? median(pick((r) => r.total_requests))
        : undefined,
    total_transfer_size_bytes:
      pick((r) => r.total_transfer_size_bytes).length > 0
        ? median(pick((r) => r.total_transfer_size_bytes))
        : undefined,
    dom_content_loaded_ms:
      pick((r) => r.dom_content_loaded_ms).length > 0
        ? median(pick((r) => r.dom_content_loaded_ms))
        : undefined,
    load_event_ms:
      pick((r) => r.load_event_ms).length > 0
        ? median(pick((r) => r.load_event_ms))
        : undefined,
  };
}
