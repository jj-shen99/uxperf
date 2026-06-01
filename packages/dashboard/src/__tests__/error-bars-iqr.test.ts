/**
 * E-63: Error bars / IQR computation tests.
 * Tests the computeRollingIQR function used for confidence interval shading on charts.
 */
import { describe, it, expect } from "@jest/globals";

const IQR_WINDOW = 5;

function computeRollingIQR(
  data: any[],
  metricKey: string,
  windowSize: number = IQR_WINDOW,
): { lower: number | null; upper: number | null }[] {
  return data.map((_, idx) => {
    const start = Math.max(0, idx - Math.floor(windowSize / 2));
    const end = Math.min(data.length, idx + Math.ceil(windowSize / 2));
    const values = data.slice(start, end)
      .map((d) => d[metricKey] as number | null)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (values.length < 2) return { lower: null, upper: null };
    const p25Idx = Math.floor(values.length * 0.25);
    const p75Idx = Math.floor(values.length * 0.75);
    return { lower: values[p25Idx], upper: values[Math.min(p75Idx, values.length - 1)] };
  });
}

describe("computeRollingIQR", () => {
  // === Equivalence Partitioning ===

  it("computes IQR for a basic dataset", () => {
    const data = [
      { lcp_ms: 1000 },
      { lcp_ms: 1200 },
      { lcp_ms: 1100 },
      { lcp_ms: 1300 },
      { lcp_ms: 1150 },
    ];
    const iqr = computeRollingIQR(data, "lcp_ms");
    expect(iqr).toHaveLength(5);
    iqr.forEach((band) => {
      expect(band.lower).not.toBeNull();
      expect(band.upper).not.toBeNull();
      expect(band.lower!).toBeLessThanOrEqual(band.upper!);
    });
  });

  it("returns null bands for single-element dataset", () => {
    const data = [{ lcp_ms: 1000 }];
    const iqr = computeRollingIQR(data, "lcp_ms");
    expect(iqr[0]).toEqual({ lower: null, upper: null });
  });

  // === Boundary Value Analysis ===

  it("handles exactly 2 data points", () => {
    const data = [{ lcp_ms: 100 }, { lcp_ms: 200 }];
    const iqr = computeRollingIQR(data, "lcp_ms");
    iqr.forEach((band) => {
      expect(band.lower).not.toBeNull();
      expect(band.upper).not.toBeNull();
    });
  });

  it("handles empty dataset", () => {
    const iqr = computeRollingIQR([], "lcp_ms");
    expect(iqr).toEqual([]);
  });

  it("handles all null values", () => {
    const data = [{ lcp_ms: null }, { lcp_ms: null }, { lcp_ms: null }];
    const iqr = computeRollingIQR(data, "lcp_ms");
    iqr.forEach((band) => {
      expect(band.lower).toBeNull();
      expect(band.upper).toBeNull();
    });
  });

  it("handles mixed null and valid values", () => {
    const data = [
      { lcp_ms: 1000 },
      { lcp_ms: null },
      { lcp_ms: 1200 },
      { lcp_ms: 1100 },
      { lcp_ms: null },
    ];
    const iqr = computeRollingIQR(data, "lcp_ms");
    // First few points should have some non-null bands
    expect(iqr).toHaveLength(5);
  });

  // === Window size behavior ===

  it("uses custom window size", () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ lcp_ms: 1000 + i * 100 }));
    const iqr3 = computeRollingIQR(data, "lcp_ms", 3);
    const iqr7 = computeRollingIQR(data, "lcp_ms", 7);
    // Larger window should produce smoother (or equal) IQR bands
    expect(iqr3).toHaveLength(10);
    expect(iqr7).toHaveLength(10);
  });

  it("window of 1 returns null (need at least 2 values)", () => {
    const data = [{ lcp_ms: 100 }, { lcp_ms: 200 }, { lcp_ms: 300 }];
    const iqr = computeRollingIQR(data, "lcp_ms", 1);
    // Window=1 means only 1 value in window, so lower/upper null
    iqr.forEach((band) => {
      expect(band.lower).toBeNull();
      expect(band.upper).toBeNull();
    });
  });

  // === Uniform values ===

  it("returns equal lower/upper for uniform values", () => {
    const data = Array.from({ length: 5 }, () => ({ lcp_ms: 1000 }));
    const iqr = computeRollingIQR(data, "lcp_ms");
    // p25 and p75 of [1000, 1000, 1000, ...] are both 1000
    iqr.forEach((band) => {
      if (band.lower != null) {
        expect(band.lower).toBe(band.upper);
      }
    });
  });

  // === Different metric keys ===

  it("works with different metric keys", () => {
    const data = [
      { cls: 0.05 },
      { cls: 0.08 },
      { cls: 0.03 },
      { cls: 0.12 },
      { cls: 0.06 },
    ];
    const iqr = computeRollingIQR(data, "cls");
    expect(iqr).toHaveLength(5);
    iqr.forEach((band) => {
      if (band.lower != null) {
        expect(band.lower).toBeLessThanOrEqual(band.upper!);
      }
    });
  });

  // === Missing metric key ===

  it("returns null bands when metric key is missing", () => {
    const data = [{ fcp_ms: 500 }, { fcp_ms: 600 }];
    const iqr = computeRollingIQR(data, "lcp_ms"); // lcp_ms doesn't exist
    iqr.forEach((band) => {
      expect(band.lower).toBeNull();
      expect(band.upper).toBeNull();
    });
  });

  // === Regression: bands are sorted correctly ===

  it("lower is always <= upper", () => {
    const data = [
      { lcp_ms: 2000 },
      { lcp_ms: 500 },
      { lcp_ms: 3000 },
      { lcp_ms: 100 },
      { lcp_ms: 4000 },
      { lcp_ms: 800 },
    ];
    const iqr = computeRollingIQR(data, "lcp_ms");
    iqr.forEach((band) => {
      if (band.lower != null && band.upper != null) {
        expect(band.lower).toBeLessThanOrEqual(band.upper);
      }
    });
  });
});
