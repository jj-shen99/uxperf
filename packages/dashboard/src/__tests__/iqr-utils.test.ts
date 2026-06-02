/**
 * E-63: Tests for IQR utility functions (error bars on metric charts).
 *
 * Covers: computeRollingIQR, attachIQRBands
 * Techniques: equivalence partitioning, boundary value analysis, decision tables
 */

import { computeRollingIQR, attachIQRBands, IQR_WINDOW } from "@/lib/iqr-utils";

describe("computeRollingIQR", () => {
  // ====== Equivalence Partitioning ======

  describe("EP: normal data series", () => {
    it("should compute IQR bands for a uniform series", () => {
      const data = Array.from({ length: 10 }, (_, i) => ({ val: 100 + i * 10 }));
      const result = computeRollingIQR(data, "val");
      expect(result).toHaveLength(10);
      result.forEach((r) => {
        expect(r.lower).not.toBeNull();
        expect(r.upper).not.toBeNull();
        expect(r.upper!).toBeGreaterThanOrEqual(r.lower!);
      });
    });

    it("should compute IQR for a constant series (lower === upper)", () => {
      const data = Array.from({ length: 6 }, () => ({ val: 42 }));
      const result = computeRollingIQR(data, "val");
      result.forEach((r) => {
        expect(r.lower).toBe(42);
        expect(r.upper).toBe(42);
      });
    });
  });

  // ====== Boundary Value Analysis ======

  describe("BVA: edge sizes", () => {
    it("should return null for empty data", () => {
      const result = computeRollingIQR([], "val");
      expect(result).toEqual([]);
    });

    it("should return null lower/upper for single point", () => {
      const result = computeRollingIQR([{ val: 5 }], "val");
      expect(result).toEqual([{ lower: null, upper: null }]);
    });

    it("should handle exactly 2 data points", () => {
      const data = [{ val: 10 }, { val: 20 }];
      const result = computeRollingIQR(data, "val");
      expect(result).toHaveLength(2);
      result.forEach((r) => {
        expect(r.lower).not.toBeNull();
        expect(r.upper).not.toBeNull();
      });
    });

    it("should handle window size = 1", () => {
      const data = Array.from({ length: 5 }, (_, i) => ({ val: i * 10 }));
      const result = computeRollingIQR(data, "val", 1);
      // With window=1 each point only sees itself → need >=2 for valid IQR
      result.forEach((r) => {
        expect(r.lower).toBeNull();
        expect(r.upper).toBeNull();
      });
    });

    it("should handle window size larger than data", () => {
      const data = [{ val: 1 }, { val: 2 }, { val: 3 }];
      const result = computeRollingIQR(data, "val", 100);
      // All points see the full dataset
      expect(result[0]).toEqual(result[1]);
      expect(result[1]).toEqual(result[2]);
    });
  });

  // ====== Null handling ======

  describe("null metric values", () => {
    it("should skip null values in computation", () => {
      const data = [
        { val: 10 },
        { val: null },
        { val: 30 },
        { val: 40 },
        { val: 50 },
      ];
      const result = computeRollingIQR(data, "val");
      expect(result).toHaveLength(5);
      // Should still compute something from non-null neighbors
      expect(result[0].lower).not.toBeNull();
    });

    it("should return null when all values in window are null", () => {
      const data = [{ val: null }, { val: null }, { val: null }];
      const result = computeRollingIQR(data, "val");
      result.forEach((r) => {
        expect(r.lower).toBeNull();
        expect(r.upper).toBeNull();
      });
    });
  });

  // ====== Missing key ======

  describe("missing metric key", () => {
    it("should treat missing keys as null", () => {
      const data = [{ other: 10 }, { other: 20 }];
      const result = computeRollingIQR(data, "val");
      result.forEach((r) => {
        expect(r.lower).toBeNull();
        expect(r.upper).toBeNull();
      });
    });
  });
});

describe("attachIQRBands", () => {
  it("should attach _iqr fields to data points", () => {
    const data = Array.from({ length: 6 }, (_, i) => ({
      lcp: 1000 + i * 100,
      fcp: 500 + i * 50,
    }));
    attachIQRBands(data, ["lcp", "fcp"]);

    data.forEach((d: any) => {
      expect("lcp_iqr" in d).toBe(true);
      expect("fcp_iqr" in d).toBe(true);
    });
  });

  it("should set _iqr to [lower, upper] array when valid", () => {
    const data = Array.from({ length: 6 }, (_, i) => ({ val: i * 10 }));
    attachIQRBands(data, ["val"]);

    const mid = data[3] as any;
    expect(Array.isArray(mid.val_iqr)).toBe(true);
    expect(mid.val_iqr).toHaveLength(2);
    expect(mid.val_iqr[0]).toBeLessThanOrEqual(mid.val_iqr[1]);
  });

  it("should set _iqr to null when insufficient data", () => {
    const data = [{ val: 42 }];
    attachIQRBands(data, ["val"]);
    expect((data[0] as any).val_iqr).toBeNull();
  });

  it("should handle multiple metric keys", () => {
    const data = Array.from({ length: 5 }, (_, i) => ({
      a: i,
      b: i * 2,
      c: i * 3,
    }));
    attachIQRBands(data, ["a", "b", "c"]);

    data.forEach((d: any) => {
      expect("a_iqr" in d).toBe(true);
      expect("b_iqr" in d).toBe(true);
      expect("c_iqr" in d).toBe(true);
    });
  });

  it("should handle empty metric keys array", () => {
    const data = [{ val: 1 }, { val: 2 }];
    attachIQRBands(data, []);
    expect((data[0] as any).val_iqr).toBeUndefined();
  });

  it("should use custom window size", () => {
    const data = Array.from({ length: 10 }, (_, i) => ({ val: i }));
    attachIQRBands(data, ["val"], 3);
    // Should complete without error and produce bands
    expect((data[5] as any).val_iqr).not.toBeNull();
  });
});
