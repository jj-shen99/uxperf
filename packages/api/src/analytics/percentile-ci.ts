/**
 * Percentile Confidence Intervals (E-42).
 *
 * Book: Appendix G, p233–235.
 * "A percentile estimated from a sample has more uncertainty than
 * almost anyone assumes."
 *
 * Uses the distribution-free binomial rank method to compute
 * confidence intervals on percentiles without assuming normality.
 */

export interface PercentileCI {
  /** The point estimate at the requested percentile */
  estimate: number;
  /** Lower bound of the confidence interval */
  lower: number;
  /** Upper bound of the confidence interval */
  upper: number;
  /** The percentile requested (e.g. 0.75) */
  percentile: number;
  /** The confidence level (e.g. 0.95) */
  confidence_level: number;
  /** Number of samples used */
  sample_size: number;
  /** Whether the CI is trustworthy (enough samples for this percentile) */
  is_reliable: boolean;
}

/**
 * Compute a distribution-free confidence interval for a percentile.
 *
 * The rank bounds come from Binomial(n, p):
 *   center = n * p
 *   half   = z * sqrt(n * p * (1 - p))
 *   lower_rank = floor(center - half)
 *   upper_rank = ceil(center + half)
 *
 * @param samples - Raw (unsorted) numeric samples
 * @param p - Percentile to estimate (0 to 1, e.g. 0.75 for p75)
 * @param confidenceLevel - Confidence level (default 0.95)
 */
export function percentileCI(
  samples: number[],
  p: number,
  confidenceLevel = 0.95,
): PercentileCI {
  if (samples.length === 0) {
    return {
      estimate: 0, lower: 0, upper: 0,
      percentile: p, confidence_level: confidenceLevel,
      sample_size: 0, is_reliable: false,
    };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  // Point estimate using linear interpolation
  const estimate = interpolatedPercentile(sorted, p);

  if (n < 3) {
    return {
      estimate, lower: sorted[0], upper: sorted[n - 1],
      percentile: p, confidence_level: confidenceLevel,
      sample_size: n, is_reliable: false,
    };
  }

  // z-score for the confidence level
  const z = zScore(confidenceLevel);

  // Binomial rank bounds
  const center = n * p;
  const half = z * Math.sqrt(n * p * (1 - p));

  const rawLowerRank = Math.floor(center - half);
  const rawUpperRank = Math.ceil(center + half);
  const lowerRank = Math.max(0, rawLowerRank);
  const upperRank = Math.min(n - 1, rawUpperRank);

  // Reliability: the raw (unclamped) ranks must fall within the sample
  // For high percentiles with small samples, ranks run off the ends
  const is_reliable = rawLowerRank >= 0 && rawUpperRank <= n - 1 && (upperRank - lowerRank) < n;

  return {
    estimate,
    lower: sorted[lowerRank],
    upper: sorted[upperRank],
    percentile: p,
    confidence_level: confidenceLevel,
    sample_size: n,
    is_reliable,
  };
}

/**
 * Compute CIs for multiple percentiles at once.
 */
export function multiPercentileCI(
  samples: number[],
  percentiles: number[] = [0.5, 0.75, 0.9, 0.95, 0.99],
  confidenceLevel = 0.95,
): Record<string, PercentileCI> {
  const result: Record<string, PercentileCI> = {};
  for (const p of percentiles) {
    const label = `p${Math.round(p * 100)}`;
    result[label] = percentileCI(samples, p, confidenceLevel);
  }
  return result;
}

/**
 * Check if two percentile CIs are significantly different
 * (i.e., their intervals do not overlap).
 *
 * Book: App G, p234: "If last week's p75 and this week's p75 both
 * fall inside each other's intervals, you have not detected a regression."
 */
export function areSignificantlyDifferent(
  a: PercentileCI,
  b: PercentileCI,
): boolean {
  // Intervals don't overlap → significantly different
  return a.upper < b.lower || b.upper < a.lower;
}

/**
 * Minimum sample size needed for a reliable CI at a given percentile.
 *
 * Rule of thumb from App G: high percentiles need big samples.
 * For p99, you need ~10,000 for a tight CI.
 */
export function minimumSampleSize(
  percentile: number,
  confidenceLevel = 0.95,
  relativeWidth = 0.1, // CI width as fraction of the estimate
): number {
  const z = zScore(confidenceLevel);
  // From the binomial formula: half = z * sqrt(n * p * (1-p))
  // We want (2 * half) / n ≤ relativeWidth
  // Solving: n ≥ (2 * z)^2 * p * (1-p) / relativeWidth^2
  const minN = Math.ceil(
    (4 * z * z * percentile * (1 - percentile)) / (relativeWidth * relativeWidth),
  );
  return Math.max(minN, 3);
}

// ── Helpers ──────────────────────────────────────────────────────

function interpolatedPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const frac = idx - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

/**
 * Approximate z-score for common confidence levels.
 * Uses the rational approximation of the inverse normal CDF.
 */
function zScore(confidenceLevel: number): number {
  // Common cases for speed
  if (confidenceLevel === 0.95) return 1.96;
  if (confidenceLevel === 0.99) return 2.576;
  if (confidenceLevel === 0.9) return 1.645;

  // Rational approximation (Abramowitz & Stegun 26.2.23)
  const alpha = (1 - confidenceLevel) / 2;
  const t = Math.sqrt(-2 * Math.log(alpha));
  const c0 = 2.515517, c1 = 0.802853, c2 = 0.010328;
  const d1 = 1.432788, d2 = 0.189269, d3 = 0.001308;
  return t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);
}
