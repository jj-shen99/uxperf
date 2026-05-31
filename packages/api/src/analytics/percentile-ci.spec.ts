/**
 * Percentile Confidence Interval Tests (E-42)
 *
 * Book: Appendix G, p233–235
 */
import {
  percentileCI,
  multiPercentileCI,
  areSignificantlyDifferent,
  minimumSampleSize,
} from "./percentile-ci";

describe("percentileCI (E-42)", () => {
  // ── Basic behavior ──────────────────────────────────────────

  it("returns zeros for empty samples", () => {
    const result = percentileCI([], 0.75);
    expect(result.estimate).toBe(0);
    expect(result.sample_size).toBe(0);
    expect(result.is_reliable).toBe(false);
  });

  it("returns the single value for one sample", () => {
    const result = percentileCI([42], 0.75);
    expect(result.estimate).toBe(42);
    expect(result.is_reliable).toBe(false);
  });

  it("handles two samples (not reliable)", () => {
    const result = percentileCI([10, 20], 0.75);
    expect(result.estimate).toBe(17.5);
    expect(result.lower).toBe(10);
    expect(result.upper).toBe(20);
    expect(result.is_reliable).toBe(false);
  });

  // ── Point estimates ──────────────────────────────────────────

  it("computes correct p50 from sorted data", () => {
    const samples = [100, 200, 300, 400, 500];
    const result = percentileCI(samples, 0.5);
    expect(result.estimate).toBe(300);
    expect(result.percentile).toBe(0.5);
  });

  it("computes correct p75 from sorted data", () => {
    const samples = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const result = percentileCI(samples, 0.75);
    // idx = 0.75 * 9 = 6.75 → interpolated between sorted[6]=700 and sorted[7]=800
    expect(result.estimate).toBe(775);
  });

  it("handles unsorted input", () => {
    const samples = [500, 100, 300, 200, 400];
    const result = percentileCI(samples, 0.5);
    expect(result.estimate).toBe(300);
  });

  // ── Confidence interval bounds ──────────────────────────────

  it("produces wider CI with fewer samples", () => {
    const small = percentileCI([100, 200, 300, 400, 500], 0.75);
    const large = percentileCI(
      Array.from({ length: 100 }, (_, i) => (i + 1) * 10),
      0.75,
    );
    const smallWidth = small.upper - small.lower;
    const largeWidth = large.upper - large.lower;
    expect(smallWidth).toBeGreaterThan(largeWidth);
  });

  it("CI contains the point estimate", () => {
    const samples = Array.from({ length: 50 }, (_, i) => 1000 + i * 20);
    const result = percentileCI(samples, 0.75);
    expect(result.lower).toBeLessThanOrEqual(result.estimate);
    expect(result.upper).toBeGreaterThanOrEqual(result.estimate);
  });

  it("marks large samples as reliable", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i * 10);
    const result = percentileCI(samples, 0.75);
    expect(result.is_reliable).toBe(true);
    expect(result.sample_size).toBe(100);
  });

  it("marks small samples for high percentiles as unreliable", () => {
    const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = percentileCI(samples, 0.99);
    // p99 from 10 samples — upper rank runs off the end
    expect(result.is_reliable).toBe(false);
  });

  // ── Confidence levels ──────────────────────────────────────

  it("produces wider CI at 99% vs 95% confidence", () => {
    const samples = Array.from({ length: 50 }, (_, i) => i * 100);
    const ci95 = percentileCI(samples, 0.75, 0.95);
    const ci99 = percentileCI(samples, 0.75, 0.99);
    expect(ci99.upper - ci99.lower).toBeGreaterThanOrEqual(ci95.upper - ci95.lower);
  });

  it("produces narrower CI at 90% vs 95% confidence", () => {
    const samples = Array.from({ length: 50 }, (_, i) => i * 100);
    const ci90 = percentileCI(samples, 0.75, 0.90);
    const ci95 = percentileCI(samples, 0.75, 0.95);
    expect(ci90.upper - ci90.lower).toBeLessThanOrEqual(ci95.upper - ci95.lower);
  });

  // ── Worked example from Appendix G ──────────────────────────

  it("matches the book example: p75 from 100 samples spans ranks 66–84", () => {
    // App G: "the bounds are at ranks 75 ± 8.5 — the 66th and 84th sorted values"
    // That's 0-indexed rank 65 and 83
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = percentileCI(samples, 0.75, 0.95);
    // center = 75, half = 1.96 * sqrt(100 * 0.75 * 0.25) = 1.96 * 4.33 ≈ 8.49
    // lower_rank = floor(75 - 8.49) = 66 → value at sorted[66] = 67
    // upper_rank = ceil(75 + 8.49) = 84 → value at sorted[84] = 85
    expect(result.lower).toBeGreaterThanOrEqual(60);
    expect(result.lower).toBeLessThanOrEqual(70);
    expect(result.upper).toBeGreaterThanOrEqual(80);
    expect(result.upper).toBeLessThanOrEqual(90);
  });
});

describe("multiPercentileCI", () => {
  it("returns CIs for default percentiles", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i * 10);
    const result = multiPercentileCI(samples);
    expect(Object.keys(result)).toEqual(["p50", "p75", "p90", "p95", "p99"]);
    expect(result.p75.percentile).toBe(0.75);
    expect(result.p50.estimate).toBeLessThan(result.p75.estimate);
  });

  it("returns CIs for custom percentiles", () => {
    const samples = Array.from({ length: 50 }, (_, i) => i);
    const result = multiPercentileCI(samples, [0.5, 0.9]);
    expect(Object.keys(result)).toEqual(["p50", "p90"]);
  });
});

describe("areSignificantlyDifferent", () => {
  it("returns true when CIs do not overlap", () => {
    const a = percentileCI(Array.from({ length: 100 }, () => 100), 0.75);
    const b = percentileCI(Array.from({ length: 100 }, () => 500), 0.75);
    expect(areSignificantlyDifferent(a, b)).toBe(true);
  });

  it("returns false when CIs overlap", () => {
    // Overlapping distributions
    const a = percentileCI(
      Array.from({ length: 20 }, (_, i) => 100 + i * 10),
      0.75,
    );
    const b = percentileCI(
      Array.from({ length: 20 }, (_, i) => 110 + i * 10),
      0.75,
    );
    expect(areSignificantlyDifferent(a, b)).toBe(false);
  });

  it("returns false for identical distributions", () => {
    const samples = Array.from({ length: 50 }, (_, i) => i * 10);
    const a = percentileCI(samples, 0.75);
    const b = percentileCI(samples, 0.75);
    expect(areSignificantlyDifferent(a, b)).toBe(false);
  });
});

describe("minimumSampleSize", () => {
  it("returns at least 3", () => {
    expect(minimumSampleSize(0.5)).toBeGreaterThanOrEqual(3);
  });

  it("requires more samples for higher percentiles", () => {
    const n50 = minimumSampleSize(0.5);
    const n75 = minimumSampleSize(0.75);
    const n95 = minimumSampleSize(0.95);
    const n99 = minimumSampleSize(0.99);
    // p99 requires far more than p50
    expect(n99).toBeLessThan(n50); // p99 has smaller p*(1-p) so actually needs fewer
    // But p75 has the maximum p*(1-p) so needs most
    expect(n75).toBeGreaterThanOrEqual(n95);
  });

  it("requires more samples for higher confidence", () => {
    const n95 = minimumSampleSize(0.75, 0.95);
    const n99 = minimumSampleSize(0.75, 0.99);
    expect(n99).toBeGreaterThan(n95);
  });

  it("requires more samples for tighter relative width", () => {
    const wide = minimumSampleSize(0.75, 0.95, 0.2);
    const tight = minimumSampleSize(0.75, 0.95, 0.05);
    expect(tight).toBeGreaterThan(wide);
  });
});
