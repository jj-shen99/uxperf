/**
 * Unit tests for Results page chart data transformation logic
 * Tests the pure functions used to build chart data from run metrics
 */

// Replicate the chart-building logic from results/page.tsx for testing
const METRIC_META: Record<string, { label: string; unit: string; good: number; poor: number }> = {
  lcp_ms:  { label: "LCP",  unit: "ms", good: 2500, poor: 4000 },
  fcp_ms:  { label: "FCP",  unit: "ms", good: 1800, poor: 3000 },
  cls:     { label: "CLS",  unit: "",   good: 0.1,  poor: 0.25 },
  ttfb_ms: { label: "TTFB", unit: "ms", good: 800,  poor: 1800 },
  inp_ms:  { label: "INP",  unit: "ms", good: 200,  poor: 500 },
  tbt_ms:  { label: "TBT",  unit: "ms", good: 200,  poor: 600 },
  si_ms:   { label: "SI",   unit: "ms", good: 3400, poor: 5800 },
  tti_ms:  { label: "TTI",  unit: "ms", good: 3800, poor: 7300 },
};

function ratingColor(value: number, good: number, poor: number) {
  if (value <= good) return "#22c55e";
  if (value <= poor) return "#eab308";
  return "#ef4444";
}

function scoreRating(score: number) {
  if (score >= 0.9) return "#22c55e";
  if (score >= 0.5) return "#eab308";
  return "#ef4444";
}

function buildWebVitalsData(metrics: Record<string, number>) {
  return Object.entries(METRIC_META)
    .filter(([key]) => metrics[key] != null)
    .map(([key, meta]) => ({
      name: meta.label,
      value: Math.round(meta.unit === "ms" ? metrics[key] : metrics[key] * 1000) / (meta.unit === "ms" ? 1 : 1000),
      fill: ratingColor(metrics[key], meta.good, meta.poor),
      unit: meta.unit,
    }));
}

describe("Results page chart logic", () => {
  describe("ratingColor", () => {
    it("returns green for good values", () => {
      expect(ratingColor(1500, 2500, 4000)).toBe("#22c55e");
    });

    it("returns yellow for needs-improvement", () => {
      expect(ratingColor(3000, 2500, 4000)).toBe("#eab308");
    });

    it("returns red for poor values", () => {
      expect(ratingColor(5000, 2500, 4000)).toBe("#ef4444");
    });
  });

  describe("scoreRating", () => {
    it("green for >= 0.9", () => {
      expect(scoreRating(0.95)).toBe("#22c55e");
    });

    it("yellow for 0.5 - 0.89", () => {
      expect(scoreRating(0.7)).toBe("#eab308");
    });

    it("red for < 0.5", () => {
      expect(scoreRating(0.3)).toBe("#ef4444");
    });
  });

  describe("buildWebVitalsData", () => {
    it("converts metrics to chart-ready data", () => {
      const metrics = {
        lcp_ms: 2100,
        fcp_ms: 1500,
        cls: 0.05,
        ttfb_ms: 600,
      };
      const data = buildWebVitalsData(metrics);
      expect(data).toHaveLength(4);
      expect(data[0]).toEqual({ name: "LCP", value: 2100, fill: "#22c55e", unit: "ms" });
      expect(data[1]).toEqual({ name: "FCP", value: 1500, fill: "#22c55e", unit: "ms" });
      expect(data[2]).toEqual({ name: "CLS", value: 0.05, fill: "#22c55e", unit: "" });
    });

    it("skips missing metrics", () => {
      const data = buildWebVitalsData({ lcp_ms: 2500 });
      expect(data).toHaveLength(1);
    });

    it("flags poor LCP correctly", () => {
      const data = buildWebVitalsData({ lcp_ms: 5000 });
      expect(data[0].fill).toBe("#ef4444");
    });

    it("handles all 8 metrics when present", () => {
      const metrics = {
        lcp_ms: 2500, fcp_ms: 1800, cls: 0.1, ttfb_ms: 800,
        inp_ms: 200, tbt_ms: 200, si_ms: 3400, tti_ms: 3800,
      };
      const data = buildWebVitalsData(metrics);
      expect(data).toHaveLength(8);
      // All should be green at exactly the good threshold
      data.forEach((d) => expect(d.fill).toBe("#22c55e"));
    });
  });
});

// ── Results page — project filtering and historyRuns scoping ──

describe("Results page — project and script filtering", () => {
  const allRuns = [
    { id: "r1", status: "completed", project_id: "p1", script_id: "s1", config: { url: "https://a.com" }, metrics: { lighthouse_performance_score: 0.92 } },
    { id: "r2", status: "completed", project_id: "p1", script_id: "s1", config: { url: "https://a.com" }, metrics: { lighthouse_performance_score: 0.88 } },
    { id: "r3", status: "completed", project_id: "p1", script_id: "s2", config: { url: "https://b.com" }, metrics: { lighthouse_performance_score: 0.72 } },
    { id: "r4", status: "completed", project_id: "p2", script_id: null, config: { url: "https://c.com" }, metrics: { lighthouse_performance_score: 0.55 } },
    { id: "r5", status: "completed", project_id: "p2", script_id: null, config: { url: "https://c.com" }, metrics: { lighthouse_performance_score: 0.60 } },
    { id: "r6", status: "queued", project_id: "p1", script_id: "s1", config: { url: "https://a.com" }, metrics: null },
  ];

  function filterByProject(runs: any[], projectId?: string) {
    return runs.filter((r: any) => r.status === "completed" && (!projectId || r.project_id === projectId));
  }

  function filterHistory(completedRuns: any[], selectedRunId?: string) {
    if (!selectedRunId) return completedRuns;
    const selected = completedRuns.find((r: any) => r.id === selectedRunId);
    if (!selected) return completedRuns;
    if (selected.script_id) {
      return completedRuns.filter((r: any) => r.script_id === selected.script_id);
    }
    return completedRuns.filter((r: any) => !r.script_id && r.config?.url === selected.config?.url);
  }

  describe("project filtering", () => {
    it("returns all completed runs when no project selected", () => {
      const result = filterByProject(allRuns);
      expect(result).toHaveLength(5);
    });

    it("filters to project p1 only", () => {
      const result = filterByProject(allRuns, "p1");
      expect(result).toHaveLength(3);
      expect(result.every((r: any) => r.project_id === "p1")).toBe(true);
    });

    it("excludes queued runs", () => {
      const result = filterByProject(allRuns, "p1");
      expect(result.find((r: any) => r.id === "r6")).toBeUndefined();
    });
  });

  describe("history filtering by script_id", () => {
    const p1Runs = filterByProject(allRuns, "p1");

    it("returns all completed runs when no run selected", () => {
      expect(filterHistory(p1Runs)).toHaveLength(3);
    });

    it("filters to same script_id when run with script is selected", () => {
      const result = filterHistory(p1Runs, "r1");
      expect(result).toHaveLength(2);
      expect(result.every((r: any) => r.script_id === "s1")).toBe(true);
    });

    it("filters to different script when different run selected", () => {
      const result = filterHistory(p1Runs, "r3");
      expect(result).toHaveLength(1);
      expect(result[0].script_id).toBe("s2");
    });
  });

  describe("history filtering by URL (no script)", () => {
    const p2Runs = filterByProject(allRuns, "p2");

    it("filters to same URL when run without script is selected", () => {
      const result = filterHistory(p2Runs, "r4");
      expect(result).toHaveLength(2);
      expect(result.every((r: any) => r.config.url === "https://c.com")).toBe(true);
    });

    it("returns all when selectedRunId not found", () => {
      const result = filterHistory(p2Runs, "nonexistent");
      expect(result).toHaveLength(2);
    });
  });
});
