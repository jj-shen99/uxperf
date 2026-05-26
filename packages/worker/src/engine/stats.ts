import type { SingleRunResult, AggregatedMetrics } from "./types";

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
