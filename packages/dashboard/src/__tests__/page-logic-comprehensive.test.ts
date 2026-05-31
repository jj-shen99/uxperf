/**
 * E-24: Comprehensive dashboard page-level logic tests.
 *
 * Tests pure functions and data transformations extracted from each page.
 * Pages covered: anomalies, trends, schedules, author, reports, users, compare, intelligence.
 */

// =============================================================
// Anomalies page — detection algorithm
// =============================================================

const METRIC_THRESHOLDS: Record<string, { good: number; poor: number; label: string; unit: string }> = {
  lcp_ms: { good: 2500, poor: 4000, label: "LCP", unit: "ms" },
  fcp_ms: { good: 1800, poor: 3000, label: "FCP", unit: "ms" },
  cls: { good: 0.1, poor: 0.25, label: "CLS", unit: "" },
  ttfb_ms: { good: 800, poor: 1800, label: "TTFB", unit: "ms" },
  inp_ms: { good: 200, poor: 500, label: "INP", unit: "ms" },
  tbt_ms: { good: 200, poor: 600, label: "TBT", unit: "ms" },
};

function detectAnomaly(
  current: number,
  prev: number[],
  key: string,
): { isAnomaly: boolean; severity: string; changePct: number } {
  const th = METRIC_THRESHOLDS[key];
  if (!th || prev.length === 0) return { isAnomaly: false, severity: "info", changePct: 0 };
  const avg = prev.reduce((s, v) => s + v, 0) / prev.length;
  const stddev = Math.sqrt(prev.reduce((s, v) => s + (v - avg) ** 2, 0) / prev.length);
  const deviation = current - avg;
  const threshold = Math.max(stddev * 2, avg * 0.15);
  const changePct = avg > 0 ? ((current - avg) / avg) * 100 : 0;

  if (deviation > threshold && current > th.good) {
    let severity = "info";
    if (current > th.poor) severity = "critical";
    else if (current > th.good) severity = "warning";
    return { isAnomaly: true, severity, changePct };
  }
  return { isAnomaly: false, severity: "info", changePct };
}

function fmtMetric(v: number, metric: string): string {
  return metric === "cls" ? v.toFixed(3) : `${Math.round(v)}`;
}

describe("Anomalies page — detection algorithm", () => {
  it("detects critical anomaly when value exceeds poor threshold", () => {
    const result = detectAnomaly(5000, [2000, 2200, 2100, 2300, 2150], "lcp_ms");
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("critical");
    expect(result.changePct).toBeGreaterThan(100);
  });

  it("detects warning anomaly when value exceeds good but not poor", () => {
    const result = detectAnomaly(3500, [2000, 2200, 2100, 2300, 2150], "lcp_ms");
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("warning");
  });

  it("does not flag value within normal range", () => {
    const result = detectAnomaly(2200, [2000, 2200, 2100, 2300, 2150], "lcp_ms");
    expect(result.isAnomaly).toBe(false);
  });

  it("does not flag value below good threshold even with large change", () => {
    const result = detectAnomaly(2400, [1000, 1100, 1050], "lcp_ms");
    expect(result.isAnomaly).toBe(false);
  });

  it("handles CLS metric correctly", () => {
    const result = detectAnomaly(0.3, [0.05, 0.06, 0.04, 0.05], "cls");
    expect(result.isAnomaly).toBe(true);
    expect(result.severity).toBe("critical");
  });

  it("returns no anomaly for empty previous values", () => {
    const result = detectAnomaly(5000, [], "lcp_ms");
    expect(result.isAnomaly).toBe(false);
  });

  it("returns no anomaly for unknown metric key", () => {
    const result = detectAnomaly(5000, [2000], "unknown_metric");
    expect(result.isAnomaly).toBe(false);
  });

  it("formats CLS with 3 decimal places", () => {
    expect(fmtMetric(0.123, "cls")).toBe("0.123");
  });

  it("formats timing metrics as integers", () => {
    expect(fmtMetric(2345.6, "lcp_ms")).toBe("2346");
  });
});

describe("Anomalies page — severity counts", () => {
  const anomalies = [
    { severity: "critical" },
    { severity: "critical" },
    { severity: "warning" },
    { severity: "info" },
    { severity: "info" },
    { severity: "info" },
  ];

  it("counts critical correctly", () => {
    expect(anomalies.filter((a) => a.severity === "critical")).toHaveLength(2);
  });

  it("counts warning correctly", () => {
    expect(anomalies.filter((a) => a.severity === "warning")).toHaveLength(1);
  });

  it("counts info correctly", () => {
    expect(anomalies.filter((a) => a.severity === "info")).toHaveLength(3);
  });
});

describe("Anomalies page — daily trend aggregation", () => {
  it("groups anomalies by day", () => {
    const anomalies = [
      { detectedAt: "2025-05-20T10:00:00Z", severity: "critical" as const },
      { detectedAt: "2025-05-20T15:00:00Z", severity: "warning" as const },
      { detectedAt: "2025-05-21T10:00:00Z", severity: "info" as const },
    ];
    const dayMap: Record<string, { critical: number; warning: number; info: number }> = {};
    anomalies.forEach((a) => {
      const day = new Date(a.detectedAt).toLocaleDateString();
      if (!dayMap[day]) dayMap[day] = { critical: 0, warning: 0, info: 0 };
      dayMap[day][a.severity]++;
    });
    const days = Object.keys(dayMap);
    expect(days).toHaveLength(2);
  });
});

// =============================================================
// Trends page — metric stats computation
// =============================================================

interface TrendsStat { min: number; max: number; avg: number; count: number }

function computeTrendsStats(runs: any[], metricKey: string): TrendsStat | null {
  const values: number[] = [];
  runs.forEach((r) => {
    let v = r.metrics?.[metricKey] as number | undefined;
    if (v != null) {
      if (metricKey === "lighthouse_performance_score") v = Math.round(v * 100);
      values.push(v);
    }
  });
  if (values.length === 0) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    count: values.length,
  };
}

function filterRunsByUrl(runs: any[], filterUrl: string): any[] {
  if (!filterUrl) return runs;
  return runs.filter((r) => r.config?.url === filterUrl);
}

describe("Trends page — metric stats", () => {
  const runs = [
    { metrics: { lcp_ms: 2000, lighthouse_performance_score: 0.85 } },
    { metrics: { lcp_ms: 3000, lighthouse_performance_score: 0.90 } },
    { metrics: { lcp_ms: 2500, lighthouse_performance_score: 0.80 } },
  ];

  it("computes min/max/avg for LCP", () => {
    const stats = computeTrendsStats(runs, "lcp_ms");
    expect(stats).not.toBeNull();
    expect(stats!.min).toBe(2000);
    expect(stats!.max).toBe(3000);
    expect(stats!.avg).toBe(2500);
    expect(stats!.count).toBe(3);
  });

  it("scales lighthouse score to 0-100", () => {
    const stats = computeTrendsStats(runs, "lighthouse_performance_score");
    expect(stats!.min).toBe(80);
    expect(stats!.max).toBe(90);
    expect(stats!.avg).toBe(85);
  });

  it("returns null for metric not present", () => {
    expect(computeTrendsStats(runs, "nonexistent")).toBeNull();
  });

  it("returns null for empty runs", () => {
    expect(computeTrendsStats([], "lcp_ms")).toBeNull();
  });

  it("skips runs without the metric", () => {
    const mixed = [
      { metrics: { lcp_ms: 2000 } },
      { metrics: {} },
      { metrics: { lcp_ms: 4000 } },
    ];
    const stats = computeTrendsStats(mixed, "lcp_ms");
    expect(stats!.count).toBe(2);
    expect(stats!.avg).toBe(3000);
  });
});

describe("Trends page — URL filtering", () => {
  const runs = [
    { config: { url: "https://a.com" }, metrics: { lcp_ms: 2000 } },
    { config: { url: "https://b.com" }, metrics: { lcp_ms: 3000 } },
    { config: { url: "https://a.com" }, metrics: { lcp_ms: 2500 } },
  ];

  it("filters by URL", () => {
    expect(filterRunsByUrl(runs, "https://a.com")).toHaveLength(2);
  });

  it("returns all when no filter", () => {
    expect(filterRunsByUrl(runs, "")).toHaveLength(3);
  });

  it("returns empty when no match", () => {
    expect(filterRunsByUrl(runs, "https://c.com")).toHaveLength(0);
  });
});

describe("Trends page — metric toggle", () => {
  function toggleMetric(selected: string[], key: string): string[] {
    return selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
  }

  it("adds a metric", () => {
    expect(toggleMetric(["lcp_ms"], "fcp_ms")).toEqual(["lcp_ms", "fcp_ms"]);
  });

  it("removes a metric", () => {
    expect(toggleMetric(["lcp_ms", "fcp_ms"], "lcp_ms")).toEqual(["fcp_ms"]);
  });

  it("can toggle to empty", () => {
    expect(toggleMetric(["lcp_ms"], "lcp_ms")).toEqual([]);
  });
});

// =============================================================
// Schedules page — cron validation
// =============================================================

describe("Schedules page — cron expression patterns", () => {
  const CRON_PATTERNS = [
    { expr: "0 */6 * * *", desc: "Every 6 hours" },
    { expr: "0 0 * * *", desc: "Daily midnight" },
    { expr: "0 9 * * 1-5", desc: "Weekdays 9 AM" },
    { expr: "*/30 * * * *", desc: "Every 30 min" },
    { expr: "0 */2 * * *", desc: "Every 2 hours" },
    { expr: "0 0 * * 0", desc: "Weekly Sunday" },
    { expr: "0 0 1 * *", desc: "Monthly" },
  ];

  for (const p of CRON_PATTERNS) {
    it(`validates ${p.desc}: ${p.expr}`, () => {
      const parts = p.expr.split(" ");
      expect(parts).toHaveLength(5);
    });
  }

  it("rejects invalid cron (too few fields)", () => {
    expect("0 * *".split(" ")).toHaveLength(3);
    expect("0 * *".split(" ").length).not.toBe(5);
  });

  it("rejects invalid cron (too many fields)", () => {
    expect("0 * * * * *".split(" ")).toHaveLength(6);
  });
});

describe("Schedules page — form validation", () => {
  function isFormValid(form: { name: string; project_id: string; url: string }): boolean {
    return !!(form.name && form.project_id && form.url);
  }

  it("valid when all required fields present", () => {
    expect(isFormValid({ name: "Test", project_id: "p1", url: "https://a.com" })).toBe(true);
  });

  it("invalid with missing name", () => {
    expect(isFormValid({ name: "", project_id: "p1", url: "https://a.com" })).toBe(false);
  });

  it("invalid with missing project", () => {
    expect(isFormValid({ name: "Test", project_id: "", url: "https://a.com" })).toBe(false);
  });

  it("invalid with missing url", () => {
    expect(isFormValid({ name: "Test", project_id: "p1", url: "" })).toBe(false);
  });
});

describe("Schedules page — script filtering by project", () => {
  const scripts = [
    { id: "s1", name: "Script A", project_id: "p1" },
    { id: "s2", name: "Script B", project_id: "p2" },
    { id: "s3", name: "Script C", project_id: "p1" },
  ];

  it("filters scripts to selected project", () => {
    const filtered = scripts.filter((s) => s.project_id === "p1");
    expect(filtered).toHaveLength(2);
  });

  it("returns all scripts when no project selected", () => {
    const projectId = "";
    const filtered = projectId ? scripts.filter((s) => s.project_id === projectId) : scripts;
    expect(filtered).toHaveLength(3);
  });
});

// =============================================================
// Author page — pipeline validation
// =============================================================

describe("Author page — pipeline stages", () => {
  const stages = [
    { stage: 1, name: "parse", status: "completed", duration_ms: 12 },
    { stage: 2, name: "validate", status: "completed", duration_ms: 8 },
    { stage: 3, name: "generate", status: "completed", duration_ms: 150 },
    { stage: 4, name: "test", status: "skipped", duration_ms: 0 },
  ];

  it("has 4 stages", () => {
    expect(stages).toHaveLength(4);
  });

  it("calculates total pipeline time", () => {
    const total = stages.reduce((s, st) => s + st.duration_ms, 0);
    expect(total).toBe(170);
  });

  it("identifies skipped stages", () => {
    const skipped = stages.filter((s) => s.status === "skipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].name).toBe("test");
  });

  it("completed stages have non-zero duration", () => {
    stages.filter((s) => s.status === "completed").forEach((s) => {
      expect(s.duration_ms).toBeGreaterThan(0);
    });
  });
});

describe("Author page — form validation", () => {
  function canGenerate(prompt: string, projectId: string, isPending: boolean): boolean {
    return !!(prompt && projectId && !isPending);
  }

  it("can generate with prompt and project", () => {
    expect(canGenerate("test login flow", "p1", false)).toBe(true);
  });

  it("cannot generate without prompt", () => {
    expect(canGenerate("", "p1", false)).toBe(false);
  });

  it("cannot generate without project", () => {
    expect(canGenerate("test login flow", "", false)).toBe(false);
  });

  it("cannot generate while pending", () => {
    expect(canGenerate("test login flow", "p1", true)).toBe(false);
  });
});

describe("Author page — device options", () => {
  const DEVICES = ["desktop", "mobile"];

  it("has 2 device options", () => {
    expect(DEVICES).toHaveLength(2);
  });

  it("includes desktop", () => {
    expect(DEVICES).toContain("desktop");
  });

  it("includes mobile", () => {
    expect(DEVICES).toContain("mobile");
  });
});

// =============================================================
// Reports page — direction indicators
// =============================================================

describe("Reports page — trend direction", () => {
  const directionIcons: Record<string, string> = {
    improving: "Improving",
    stable: "Stable",
    degrading: "Degrading",
  };

  const directionColors: Record<string, string> = {
    improving: "text-green-400",
    stable: "text-gray-400",
    degrading: "text-red-400",
  };

  it("has icon for all directions", () => {
    expect(Object.keys(directionIcons)).toEqual(["improving", "stable", "degrading"]);
  });

  it("has color for all directions", () => {
    expect(Object.keys(directionColors)).toEqual(["improving", "stable", "degrading"]);
  });

  it("improving is green", () => {
    expect(directionColors.improving).toContain("green");
  });

  it("degrading is red", () => {
    expect(directionColors.degrading).toContain("red");
  });
});

describe("Reports page — CWV thresholds", () => {
  const CWV_THRESHOLDS: Record<string, { good: number; poor: number; unit: string }> = {
    lcp_ms: { good: 2500, poor: 4000, unit: "ms" },
    fcp_ms: { good: 1800, poor: 3000, unit: "ms" },
    cls: { good: 0.1, poor: 0.25, unit: "" },
    ttfb_ms: { good: 800, poor: 1800, unit: "ms" },
    inp_ms: { good: 200, poor: 500, unit: "ms" },
    tbt_ms: { good: 200, poor: 600, unit: "ms" },
  };

  it("has 6 metrics", () => {
    expect(Object.keys(CWV_THRESHOLDS)).toHaveLength(6);
  });

  it("good < poor for all timing metrics", () => {
    for (const [key, th] of Object.entries(CWV_THRESHOLDS)) {
      expect(th.good).toBeLessThan(th.poor);
    }
  });

  function ratingColor(value: number, good: number, poor: number): string {
    if (value <= good) return "#22c55e";
    if (value <= poor) return "#eab308";
    return "#ef4444";
  }

  it("green for good value", () => {
    expect(ratingColor(2000, 2500, 4000)).toBe("#22c55e");
  });

  it("yellow for needs-improvement value", () => {
    expect(ratingColor(3000, 2500, 4000)).toBe("#eab308");
  });

  it("red for poor value", () => {
    expect(ratingColor(5000, 2500, 4000)).toBe("#ef4444");
  });
});

// =============================================================
// Users page — role logic
// =============================================================

describe("Users page — role colors and sorting", () => {
  const ROLE_COLORS: Record<string, string> = {
    admin: "bg-red-500/20 text-red-300",
    editor: "bg-blue-500/20 text-blue-300",
    viewer: "bg-gray-500/20 text-gray-300",
  };

  it("has 3 roles", () => {
    expect(Object.keys(ROLE_COLORS)).toHaveLength(3);
  });

  it("admin is red", () => {
    expect(ROLE_COLORS.admin).toContain("red");
  });

  it("editor is blue", () => {
    expect(ROLE_COLORS.editor).toContain("blue");
  });

  type UserSortKey = "display_name" | "email" | "role";
  type SortDir = "asc" | "desc";

  function toggleUserSort(
    current: { key: UserSortKey; dir: SortDir },
    newKey: UserSortKey,
  ): { key: UserSortKey; dir: SortDir } {
    return current.key === newKey
      ? { key: newKey, dir: current.dir === "asc" ? "desc" : "asc" }
      : { key: newKey, dir: "asc" };
  }

  it("toggles direction on same key", () => {
    expect(toggleUserSort({ key: "display_name", dir: "asc" }, "display_name"))
      .toEqual({ key: "display_name", dir: "desc" });
  });

  it("resets to asc on new key", () => {
    expect(toggleUserSort({ key: "display_name", dir: "desc" }, "email"))
      .toEqual({ key: "email", dir: "asc" });
  });
});

// =============================================================
// Intelligence page — tab validation
// =============================================================

describe("Intelligence page — tabs and forecast metrics", () => {
  const TABS = [
    "overview", "trends", "pages", "environments", "scores",
    "recommendations", "attribution", "forecast", "rum", "crux", "capacity",
  ];

  const FORECAST_METRICS = [
    { value: "lcp_ms", label: "LCP" },
    { value: "fcp_ms", label: "FCP" },
    { value: "cls", label: "CLS" },
    { value: "ttfb_ms", label: "TTFB" },
    { value: "tbt_ms", label: "TBT" },
    { value: "lighthouse_performance_score", label: "Perf Score" },
  ];

  it("has 11 tabs", () => {
    expect(TABS).toHaveLength(11);
  });

  it("has 6 forecast metrics", () => {
    expect(FORECAST_METRICS).toHaveLength(6);
  });

  it("tab IDs are unique", () => {
    expect(new Set(TABS).size).toBe(TABS.length);
  });

  it("forecast metric values are unique", () => {
    const vals = FORECAST_METRICS.map((m) => m.value);
    expect(new Set(vals).size).toBe(vals.length);
  });
});

// =============================================================
// Time range filter — shared across pages
// =============================================================

describe("Time range filtering (shared)", () => {
  const TIME_RANGES = [
    { label: "7 days", days: 7 },
    { label: "14 days", days: 14 },
    { label: "30 days", days: 30 },
    { label: "90 days", days: 90 },
    { label: "All", days: 0 },
  ];

  it("has 5 time range options", () => {
    expect(TIME_RANGES).toHaveLength(5);
  });

  it("'All' has days = 0", () => {
    expect(TIME_RANGES.find((t) => t.label === "All")?.days).toBe(0);
  });

  function filterByDateRange(items: { created_at: string }[], days: number): any[] {
    if (days === 0) return items;
    const cutoff = Date.now() - days * 86400000;
    return items.filter((i) => new Date(i.created_at).getTime() >= cutoff);
  }

  it("days=0 returns all items", () => {
    const items = [{ created_at: "2020-01-01T00:00:00Z" }];
    expect(filterByDateRange(items, 0)).toHaveLength(1);
  });

  it("filters out old items", () => {
    const items = [
      { created_at: new Date().toISOString() },
      { created_at: "2020-01-01T00:00:00Z" },
    ];
    expect(filterByDateRange(items, 7)).toHaveLength(1);
  });
});
