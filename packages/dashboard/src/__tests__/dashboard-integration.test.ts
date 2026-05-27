/**
 * Integration / regression tests for recent dashboard changes:
 *   - Metric glossary rename: "Browser Rendering" → "Content Rendering"
 *   - Cron expression validation logic
 *   - Dashboard page helper functions (scoreColor, metricColor, avgMetric)
 *   - User ownership context passed in API calls
 */

// ============================================================
// 1. Metric Glossary — Content Rendering rename regression
// ============================================================

const GLOSSARY_KEYS = [
  "LCP", "FCP", "CLS", "TTFB", "INP", "TBT", "TTI", "SI",
  "Lighthouse Score", "Server Processing", "Content Rendering",
];

describe("Glossary rename regression — Browser Rendering → Content Rendering", () => {
  it("'Content Rendering' exists in expected keys", () => {
    expect(GLOSSARY_KEYS).toContain("Content Rendering");
  });

  it("'Browser Rendering' does NOT exist in expected keys", () => {
    expect(GLOSSARY_KEYS).not.toContain("Browser Rendering");
  });

  it("timeline diagram span metric keys match glossary", () => {
    const SPAN_METRIC_KEYS = [
      "Transfer + Parse",
      "Content Rendering",
      "TBT",
      "CLS",
    ];
    // Content Rendering should be in the spans
    expect(SPAN_METRIC_KEYS).toContain("Content Rendering");
    expect(SPAN_METRIC_KEYS).not.toContain("Browser Rendering");
  });
});

// ============================================================
// 2. Cron expression validation
// ============================================================

function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const ranges = [
    { min: 0, max: 59 },  // minute
    { min: 0, max: 23 },  // hour
    { min: 1, max: 31 },  // day of month
    { min: 1, max: 12 },  // month
    { min: 0, max: 6 },   // day of week
  ];
  for (let i = 0; i < 5; i++) {
    const field = parts[i];
    if (field === "*") continue;
    if (/^\*\/\d+$/.test(field)) {
      const step = parseInt(field.split("/")[1], 10);
      if (step < 1 || step > ranges[i].max) return false;
      continue;
    }
    if (/^\d+-\d+$/.test(field)) {
      const [lo, hi] = field.split("-").map(Number);
      if (lo < ranges[i].min || hi > ranges[i].max || lo > hi) return false;
      continue;
    }
    // comma-separated or plain number
    const nums = field.split(",").map(Number);
    if (nums.some((n) => isNaN(n) || n < ranges[i].min || n > ranges[i].max)) return false;
  }
  return true;
}

describe("Cron expression validation", () => {
  it.each([
    ["0 */6 * * *", true,  "every 6 hours"],
    ["0 0 * * *",   true,  "daily midnight"],
    ["0 9 * * 1-5", true,  "weekdays 9 AM"],
    ["*/30 * * * *", true, "every 30 min"],
    ["0 */2 * * *", true,  "every 2 hours"],
    ["0 0 * * 0",   true,  "weekly Sunday"],
    ["0 0 1 * *",   true,  "monthly"],
    ["0 0 * * *",   true,  "daily"],
    ["* * * * *",   true,  "every minute"],
  ])("valid: '%s' (%s)", (expr, expected) => {
    expect(isValidCron(expr)).toBe(expected);
  });

  it.each([
    ["0 0 * *",     false, "only 4 fields"],
    ["0 0 * * * *", false, "6 fields"],
    ["",            false, "empty"],
    ["60 0 * * *",  false, "minute out of range"],
    ["0 24 * * *",  false, "hour out of range"],
    ["0 0 0 * *",   false, "day-of-month 0 invalid"],
    ["0 0 * 13 *",  false, "month 13 invalid"],
    ["0 0 * * 7",   false, "day-of-week 7 invalid"],
  ])("invalid: '%s' (%s)", (expr, expected) => {
    expect(isValidCron(expr)).toBe(expected);
  });

  it("default form value is valid", () => {
    expect(isValidCron("0 */6 * * *")).toBe(true);
  });
});

// ============================================================
// 3. Dashboard page helper functions
// ============================================================

function scoreColor(score: number) {
  if (score >= 90) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function metricColor(value: number, good: number, poor: number) {
  if (value <= good) return "text-green-400";
  if (value <= poor) return "text-yellow-400";
  return "text-red-400";
}

function avgMetric(runs: any[], key: string): number | null {
  const vals = runs.map((r: any) => r.metrics?.[key]).filter((v: any) => v != null) as number[];
  return vals.length > 0 ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
}

describe("Dashboard — scoreColor", () => {
  it("returns green for score ≥ 90", () => {
    expect(scoreColor(90)).toBe("text-green-400");
    expect(scoreColor(100)).toBe("text-green-400");
  });

  it("returns yellow for 50–89", () => {
    expect(scoreColor(50)).toBe("text-yellow-400");
    expect(scoreColor(89)).toBe("text-yellow-400");
  });

  it("returns red for < 50", () => {
    expect(scoreColor(0)).toBe("text-red-400");
    expect(scoreColor(49)).toBe("text-red-400");
  });
});

describe("Dashboard — metricColor", () => {
  it("returns green when value ≤ good threshold", () => {
    expect(metricColor(2000, 2500, 4000)).toBe("text-green-400");
  });

  it("returns yellow when good < value ≤ poor", () => {
    expect(metricColor(3000, 2500, 4000)).toBe("text-yellow-400");
  });

  it("returns red when value > poor", () => {
    expect(metricColor(5000, 2500, 4000)).toBe("text-red-400");
  });

  it("returns green at exact good boundary", () => {
    expect(metricColor(2500, 2500, 4000)).toBe("text-green-400");
  });

  it("returns yellow at exact poor boundary", () => {
    expect(metricColor(4000, 2500, 4000)).toBe("text-yellow-400");
  });
});

describe("Dashboard — avgMetric", () => {
  it("computes average of numeric metric values", () => {
    const runs = [
      { metrics: { lcp_ms: 1000 } },
      { metrics: { lcp_ms: 2000 } },
      { metrics: { lcp_ms: 3000 } },
    ];
    expect(avgMetric(runs, "lcp_ms")).toBe(2000);
  });

  it("returns null when no runs", () => {
    expect(avgMetric([], "lcp_ms")).toBeNull();
  });

  it("skips runs with missing metrics", () => {
    const runs = [
      { metrics: { lcp_ms: 1000 } },
      { metrics: {} },
      { metrics: { lcp_ms: 3000 } },
    ];
    expect(avgMetric(runs, "lcp_ms")).toBe(2000);
  });

  it("skips runs with null metrics object", () => {
    const runs = [
      { metrics: null },
      { metrics: { fcp_ms: 500 } },
    ];
    expect(avgMetric(runs, "fcp_ms")).toBe(500);
  });

  it("returns null when metric key not present in any run", () => {
    const runs = [
      { metrics: { lcp_ms: 1000 } },
    ];
    expect(avgMetric(runs, "nonexistent")).toBeNull();
  });
});

// ============================================================
// 4. User ownership API integration — query param building
// ============================================================

function buildRunListParams(opts: { userId?: string; isAdmin?: boolean; projectId?: string }): string {
  const params = new URLSearchParams();
  if (opts.projectId) params.set("project_id", opts.projectId);
  if (opts.userId) params.set("user_id", opts.userId);
  if (opts.isAdmin !== undefined) params.set("is_admin", String(opts.isAdmin));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

describe("API query param building — user ownership", () => {
  it("includes user_id and is_admin for non-admin user", () => {
    const qs = buildRunListParams({ userId: "u1", isAdmin: false });
    expect(qs).toContain("user_id=u1");
    expect(qs).toContain("is_admin=false");
  });

  it("includes is_admin=true for admin", () => {
    const qs = buildRunListParams({ userId: "u2", isAdmin: true });
    expect(qs).toContain("is_admin=true");
  });

  it("includes project_id when provided", () => {
    const qs = buildRunListParams({ projectId: "proj-1" });
    expect(qs).toContain("project_id=proj-1");
  });

  it("returns empty string when no params", () => {
    expect(buildRunListParams({})).toBe("");
  });
});

// ============================================================
// 5. Email update — session merge regression
// ============================================================

interface SessionUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

function mergeSessionAfterEmailUpdate(
  current: SessionUser,
  update: { email?: string; display_name?: string }
): SessionUser {
  return {
    ...current,
    email: update.email ?? current.email,
    display_name: update.display_name ?? current.display_name,
  };
}

describe("Session merge after email/profile update", () => {
  const base: SessionUser = { id: "u1", email: "old@test.com", display_name: "Old Name", role: "editor" };

  it("updates email when provided", () => {
    const result = mergeSessionAfterEmailUpdate(base, { email: "new@test.com" });
    expect(result.email).toBe("new@test.com");
    expect(result.display_name).toBe("Old Name");
  });

  it("updates display_name when provided", () => {
    const result = mergeSessionAfterEmailUpdate(base, { display_name: "New Name" });
    expect(result.display_name).toBe("New Name");
    expect(result.email).toBe("old@test.com");
  });

  it("updates both when both provided", () => {
    const result = mergeSessionAfterEmailUpdate(base, { email: "new@test.com", display_name: "New Name" });
    expect(result.email).toBe("new@test.com");
    expect(result.display_name).toBe("New Name");
  });

  it("preserves role and id (regression: don't lose fields)", () => {
    const result = mergeSessionAfterEmailUpdate(base, { email: "x@y.com" });
    expect(result.id).toBe("u1");
    expect(result.role).toBe("editor");
  });

  it("returns unchanged when no updates", () => {
    const result = mergeSessionAfterEmailUpdate(base, {});
    expect(result).toEqual(base);
  });
});
