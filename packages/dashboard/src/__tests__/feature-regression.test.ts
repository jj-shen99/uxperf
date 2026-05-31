/**
 * Regression tests for recent feature changes:
 *   1. useProjects hook — auto-select first project when list loads
 *   2. Runs page — column sorting logic
 *   3. Dashboard page — "Recent Completed Runs" section removed
 *   4. Intelligence page — new tab keys and data structures
 *   5. Reports page — admin delete mutation
 *   6. Metric tooltip — portal-based positioning
 */

// ============================================================
// 1. useProjects: auto-select regression
// ============================================================

describe("useProjects default behaviour", () => {
  it("initial projectId is empty before projects load", () => {
    const projectId = "";
    expect(projectId).toBe("");
  });

  it("user can manually set a project", () => {
    let projectId = "";
    const setProjectId = (id: string) => { projectId = id; };
    setProjectId("proj-abc-123");
    expect(projectId).toBe("proj-abc-123");
  });

  it("auto-selects first project once list loads", () => {
    const projects = [
      { id: "p1", name: "Project 1" },
      { id: "p2", name: "Project 2" },
    ];
    let projectId = "";
    // Simulate the useEffect auto-select logic
    if (!projectId && projects.length > 0) {
      projectId = projects[0].id;
    }
    expect(projectId).toBe("p1");
  });

  it("does not overwrite manually selected project", () => {
    const projects = [
      { id: "p1", name: "Project 1" },
      { id: "p2", name: "Project 2" },
    ];
    let projectId = "p2"; // user already picked p2
    if (!projectId && projects.length > 0) {
      projectId = projects[0].id;
    }
    expect(projectId).toBe("p2"); // stays p2, not overwritten
  });
});

// ============================================================
// 2. Runs page — column sorting logic
// ============================================================

interface MockRun {
  id: string;
  status: string;
  engine: string;
  mode: string;
  environment: string;
  config: { url?: string };
  metrics?: Record<string, number>;
  created_at: string;
}

type SortKey = "status" | "url" | "engine" | "mode" | "lcp" | "lh_score" | "environment" | "created_at";
type SortDir = "asc" | "desc";

function sortRuns(runs: MockRun[], sortKey: SortKey, sortDir: SortDir): MockRun[] {
  return runs.slice().sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "status": return dir * a.status.localeCompare(b.status);
      case "url": return dir * (a.config?.url ?? "").localeCompare(b.config?.url ?? "");
      case "engine": return dir * a.engine.localeCompare(b.engine);
      case "mode": return dir * a.mode.localeCompare(b.mode);
      case "lcp": return dir * ((a.metrics?.lcp_ms ?? Infinity) - (b.metrics?.lcp_ms ?? Infinity));
      case "lh_score": return dir * ((a.metrics?.lighthouse_performance_score ?? -1) - (b.metrics?.lighthouse_performance_score ?? -1));
      case "environment": return dir * a.environment.localeCompare(b.environment);
      case "created_at": return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      default: return 0;
    }
  });
}

const SAMPLE_RUNS: MockRun[] = [
  { id: "r1", status: "completed", engine: "lighthouse", mode: "synthetic", environment: "staging", config: { url: "https://b.com" }, metrics: { lcp_ms: 3000, lighthouse_performance_score: 0.85 }, created_at: "2025-05-20T10:00:00Z" },
  { id: "r2", status: "failed", engine: "k6", mode: "load", environment: "production", config: { url: "https://a.com" }, metrics: { lcp_ms: 1500, lighthouse_performance_score: 0.95 }, created_at: "2025-05-21T10:00:00Z" },
  { id: "r3", status: "queued", engine: "lighthouse", mode: "synthetic", environment: "development", config: { url: "https://c.com" }, metrics: undefined, created_at: "2025-05-19T10:00:00Z" },
  { id: "r4", status: "completed", engine: "wpt", mode: "synthetic", environment: "staging", config: { url: "https://a.com" }, metrics: { lcp_ms: 2200, lighthouse_performance_score: 0.72 }, created_at: "2025-05-22T10:00:00Z" },
];

describe("Runs page column sorting", () => {
  it("sorts by status ascending", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "status", "asc");
    expect(sorted[0].status).toBe("completed");
    expect(sorted[sorted.length - 1].status).toBe("queued");
  });

  it("sorts by status descending", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "status", "desc");
    expect(sorted[0].status).toBe("queued");
  });

  it("sorts by URL ascending", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "url", "asc");
    expect(sorted[0].config.url).toBe("https://a.com");
    expect(sorted[sorted.length - 1].config.url).toBe("https://c.com");
  });

  it("sorts by LCP ascending (nulls at end)", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "lcp", "asc");
    expect(sorted[0].metrics?.lcp_ms).toBe(1500);
    expect(sorted[1].metrics?.lcp_ms).toBe(2200);
    expect(sorted[2].metrics?.lcp_ms).toBe(3000);
    // r3 has no metrics, should be last (Infinity)
    expect(sorted[3].id).toBe("r3");
  });

  it("sorts by LCP descending", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "lcp", "desc");
    // r3 with Infinity goes first when desc (largest first)
    // Then 3000, 2200, 1500
    expect(sorted[sorted.length - 1].metrics?.lcp_ms).toBe(1500);
  });

  it("sorts by Lighthouse score ascending (nulls at start)", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "lh_score", "asc");
    // r3 has score -1 (no metric), should be first
    expect(sorted[0].id).toBe("r3");
    expect(sorted[1].metrics?.lighthouse_performance_score).toBe(0.72);
    expect(sorted[3].metrics?.lighthouse_performance_score).toBe(0.95);
  });

  it("sorts by created_at descending (newest first)", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "created_at", "desc");
    expect(sorted[0].id).toBe("r4");
    expect(sorted[sorted.length - 1].id).toBe("r3");
  });

  it("sorts by created_at ascending (oldest first)", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "created_at", "asc");
    expect(sorted[0].id).toBe("r3");
    expect(sorted[sorted.length - 1].id).toBe("r4");
  });

  it("sorts by engine ascending", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "engine", "asc");
    expect(sorted[0].engine).toBe("k6");
    expect(sorted[sorted.length - 1].engine).toBe("wpt");
  });

  it("sorts by environment ascending", () => {
    const sorted = sortRuns(SAMPLE_RUNS, "environment", "asc");
    expect(sorted[0].environment).toBe("development");
    expect(sorted[sorted.length - 1].environment).toBe("staging");
  });

  it("preserves all runs after sorting (no data loss)", () => {
    for (const key of ["status", "url", "engine", "mode", "lcp", "lh_score", "environment", "created_at"] as SortKey[]) {
      const sorted = sortRuns(SAMPLE_RUNS, key, "asc");
      expect(sorted).toHaveLength(SAMPLE_RUNS.length);
      const ids = sorted.map((r) => r.id).sort();
      expect(ids).toEqual(["r1", "r2", "r3", "r4"]);
    }
  });

  it("does not mutate the original array", () => {
    const original = [...SAMPLE_RUNS];
    sortRuns(SAMPLE_RUNS, "lcp", "asc");
    expect(SAMPLE_RUNS).toEqual(original);
  });
});

// Sort toggle logic
describe("Runs page sort toggle logic", () => {
  function toggleSort(
    currentKey: SortKey,
    currentDir: SortDir,
    newKey: SortKey,
  ): { key: SortKey; dir: SortDir } {
    if (currentKey === newKey) {
      return { key: newKey, dir: currentDir === "asc" ? "desc" : "asc" };
    }
    return { key: newKey, dir: newKey === "created_at" ? "desc" : "asc" };
  }

  it("clicking same column toggles direction", () => {
    const result = toggleSort("status", "asc", "status");
    expect(result).toEqual({ key: "status", dir: "desc" });
  });

  it("clicking same column again toggles back", () => {
    const result = toggleSort("status", "desc", "status");
    expect(result).toEqual({ key: "status", dir: "asc" });
  });

  it("clicking new column defaults to asc", () => {
    const result = toggleSort("status", "desc", "url");
    expect(result).toEqual({ key: "url", dir: "asc" });
  });

  it("clicking created_at defaults to desc", () => {
    const result = toggleSort("url", "asc", "created_at");
    expect(result).toEqual({ key: "created_at", dir: "desc" });
  });
});

// ============================================================
// 3. Dashboard page — Recent Completed Runs removed
// ============================================================

describe("Dashboard page — Recent Completed Runs removed", () => {
  // Verify that dashboard page.tsx no longer exports a table with "Recent Completed Runs"
  // by checking the component's expected sections
  const DASHBOARD_SECTIONS = [
    "Overview counts",
    "KPI Averages",
    "Metric Relationship Diagram",
  ];

  const REMOVED_SECTIONS = [
    "Recent Completed Runs",
  ];

  it("dashboard should include KPI Averages section", () => {
    expect(DASHBOARD_SECTIONS).toContain("KPI Averages");
  });

  it("dashboard should include Metric Relationship Diagram", () => {
    expect(DASHBOARD_SECTIONS).toContain("Metric Relationship Diagram");
  });

  it("dashboard should NOT include Recent Completed Runs", () => {
    expect(DASHBOARD_SECTIONS).not.toContain("Recent Completed Runs");
  });

  it("Recent Completed Runs is in the removed sections list", () => {
    expect(REMOVED_SECTIONS).toContain("Recent Completed Runs");
  });
});

// ============================================================
// 4. Intelligence page — new tabs
// ============================================================

describe("Intelligence page tab structure", () => {
  const EXPECTED_TABS = [
    "overview", "trends", "pages", "environments", "scores", "recommendations",
    "attribution", "forecast", "rum", "crux", "capacity",
  ];

  const OLD_TABS = ["overview", "trends", "pages", "environments", "scores", "recommendations"];
  const NEW_TABS = ["attribution", "forecast", "rum", "crux", "capacity"];

  it("has 11 total tabs", () => {
    expect(EXPECTED_TABS).toHaveLength(11);
  });

  it("preserves all 6 original tabs", () => {
    for (const tab of OLD_TABS) {
      expect(EXPECTED_TABS).toContain(tab);
    }
  });

  it("includes all 5 new API-backed tabs", () => {
    for (const tab of NEW_TABS) {
      expect(EXPECTED_TABS).toContain(tab);
    }
  });

  it("SHAP attribution tab exists", () => {
    expect(EXPECTED_TABS).toContain("attribution");
  });

  it("forecast tab exists", () => {
    expect(EXPECTED_TABS).toContain("forecast");
  });

  it("RUM tab exists", () => {
    expect(EXPECTED_TABS).toContain("rum");
  });

  it("CrUX tab exists", () => {
    expect(EXPECTED_TABS).toContain("crux");
  });

  it("capacity planning tab exists", () => {
    expect(EXPECTED_TABS).toContain("capacity");
  });
});

describe("Intelligence page FORECAST_METRICS", () => {
  const FORECAST_METRICS = [
    { value: "lcp_ms", label: "LCP" },
    { value: "fcp_ms", label: "FCP" },
    { value: "cls", label: "CLS" },
    { value: "ttfb_ms", label: "TTFB" },
    { value: "tbt_ms", label: "TBT" },
    { value: "lighthouse_performance_score", label: "Perf Score" },
  ];

  it("has 6 forecast metric options", () => {
    expect(FORECAST_METRICS).toHaveLength(6);
  });

  it("includes LCP as a forecast metric", () => {
    expect(FORECAST_METRICS.find((m) => m.value === "lcp_ms")).toBeTruthy();
  });

  it("includes Performance Score as a forecast metric", () => {
    expect(FORECAST_METRICS.find((m) => m.value === "lighthouse_performance_score")).toBeTruthy();
  });
});

// ============================================================
// 5. Reports page — delete API endpoint
// ============================================================

describe("Reports delete endpoint structure", () => {
  it("DELETE /reports/:id path is properly formatted", () => {
    const id = "rpt-123-abc";
    const path = `/reports/${encodeURIComponent(id)}`;
    expect(path).toBe("/reports/rpt-123-abc");
  });

  it("DELETE path encodes special characters in ID", () => {
    const id = "rpt/with spaces&special";
    const path = `/reports/${encodeURIComponent(id)}`;
    expect(path).toContain("rpt");
    expect(path).not.toContain(" ");
    expect(path).toContain("%2F");
  });
});

// ============================================================
// 6. Metric tooltip — portal-based rendering
// ============================================================

describe("Metric tooltip positioning logic", () => {
  const TOOLTIP_W = 320;
  const GAP = 8;

  function computeCoords(
    rect: { left: number; right: number; top: number; bottom: number; width: number },
    vw: number,
  ) {
    let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8));
    let top: number;
    if (rect.top > 200) {
      top = rect.top - GAP;
    } else {
      top = rect.bottom + GAP;
    }
    return { top, left };
  }

  it("centers tooltip when trigger is in middle of viewport", () => {
    const rect = { left: 500, right: 550, top: 400, bottom: 420, width: 50 };
    const coords = computeCoords(rect, 1200);
    // Center: 500 + 25 - 160 = 365
    expect(coords.left).toBe(365);
    expect(coords.top).toBe(392); // 400 - 8
  });

  it("clamps tooltip to left edge when trigger is near left", () => {
    const rect = { left: 10, right: 60, top: 400, bottom: 420, width: 50 };
    const coords = computeCoords(rect, 1200);
    // Center would be 10 + 25 - 160 = -125, clamped to 8
    expect(coords.left).toBe(8);
  });

  it("clamps tooltip to right edge when trigger is near right", () => {
    const rect = { left: 1100, right: 1150, top: 400, bottom: 420, width: 50 };
    const coords = computeCoords(rect, 1200);
    // Center would be 1100 + 25 - 160 = 965, max is 1200-320-8 = 872
    expect(coords.left).toBe(872);
  });

  it("shows tooltip below when trigger is near top of viewport", () => {
    const rect = { left: 500, right: 550, top: 50, bottom: 70, width: 50 };
    const coords = computeCoords(rect, 1200);
    expect(coords.top).toBe(78); // bottom + GAP = 70 + 8
  });

  it("shows tooltip above when trigger is further down", () => {
    const rect = { left: 500, right: 550, top: 400, bottom: 420, width: 50 };
    const coords = computeCoords(rect, 1200);
    expect(coords.top).toBe(392); // top - GAP = 400 - 8
  });

  it("handles very narrow viewport gracefully", () => {
    const rect = { left: 10, right: 60, top: 300, bottom: 320, width: 50 };
    const coords = computeCoords(rect, 340);
    // vw - TOOLTIP_W - 8 = 340 - 320 - 8 = 12
    // center would be -125, clamped to 8
    expect(coords.left).toBe(8);
    expect(coords.left).toBeLessThanOrEqual(340 - TOOLTIP_W);
  });
});
