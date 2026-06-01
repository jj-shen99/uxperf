/**
 * E-55: Load + Synthetic + RUM Correlation View — logic tests
 */

describe("LoadCorrelationView logic (E-55)", () => {
  // Helper: simulate the disagreement calculation from the component
  function calcDisagreement(syntheticMedian: number, rumP75: number) {
    const delta = Math.abs(rumP75 - syntheticMedian);
    const pct = (delta / Math.max(syntheticMedian, 1)) * 100;
    if (pct < 15) return { level: "none" as const, pct };
    if (pct < 40) return { level: "mild" as const, pct };
    return { level: "severe" as const, pct };
  }

  // Helper: simulate degradation ratio
  function calcDegradation(syntheticMedian: number, loadPeakP95: number) {
    return loadPeakP95 / Math.max(syntheticMedian, 1);
  }

  describe("Lab vs Field disagreement", () => {
    it("reports 'none' for close agreement (<15%)", () => {
      const result = calcDisagreement(2000, 2200);
      expect(result.level).toBe("none");
      expect(result.pct).toBe(10);
    });

    it("reports 'mild' for moderate disagreement (15-40%)", () => {
      const result = calcDisagreement(2000, 2600);
      expect(result.level).toBe("mild");
      expect(result.pct).toBe(30);
    });

    it("reports 'severe' for large disagreement (>40%)", () => {
      const result = calcDisagreement(2000, 3200);
      expect(result.level).toBe("severe");
      expect(result.pct).toBe(60);
    });

    it("handles zero synthetic median without NaN", () => {
      const result = calcDisagreement(0, 500);
      expect(result.level).toBe("severe");
      expect(isFinite(result.pct)).toBe(true);
    });
  });

  describe("Load degradation ratio", () => {
    it("calculates ratio of peak load p95 to synthetic median", () => {
      expect(calcDegradation(1000, 3000)).toBe(3);
    });

    it("returns 1x for identical values", () => {
      expect(calcDegradation(1000, 1000)).toBe(1);
    });

    it("handles zero synthetic median safely", () => {
      const ratio = calcDegradation(0, 1000);
      expect(isFinite(ratio)).toBe(true);
    });
  });

  describe("Summary card data extraction", () => {
    it("computes synthetic summary from values", () => {
      const values = [1800, 2000, 2200, 2400, 2600];
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      expect(median).toBe(2200);
      expect(p95).toBe(2600);
    });

    it("computes RUM weighted average", () => {
      const rumData = [
        { p75: 2500, count: 100 },
        { p75: 3000, count: 200 },
      ];
      const totalCount = rumData.reduce((s, d) => s + d.count, 0);
      const avgP75 = rumData.reduce((s, d) => s + d.p75 * d.count, 0) / totalCount;
      expect(avgP75).toBeCloseTo(2833.33, 0);
    });

    it("identifies saturation in load data", () => {
      const loadData = [
        { vus: 10, p95_ms: 1000 },
        { vus: 20, p95_ms: 2000 },
        { vus: 30, p95_ms: 4000 },
      ];
      const saturationVus = 25;
      const saturated = loadData.filter((d) => d.vus >= saturationVus);
      expect(saturated).toHaveLength(1);
      expect(saturated[0].vus).toBe(30);
    });
  });

  describe("Format helpers", () => {
    function fmtMs(v: number | null | undefined): string {
      if (v == null) return "—";
      return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`;
    }

    it("formats milliseconds", () => {
      expect(fmtMs(500)).toBe("500ms");
      expect(fmtMs(1500)).toBe("1.50s");
      expect(fmtMs(null)).toBe("—");
      expect(fmtMs(undefined)).toBe("—");
    });
  });
});
