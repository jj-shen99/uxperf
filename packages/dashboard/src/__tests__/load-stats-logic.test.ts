/**
 * Regression tests for load page summary statistics, run filtering,
 * completed-run metric aggregation, and settings project sorting.
 */

// --- Load run stats computation ---

interface LoadRun {
  id: string;
  status: string;
  vu_minutes?: number;
  cost_estimate?: { total_cost: number };
  created_at: string;
  metrics?: Record<string, number>;
}

function computeRunStats(loadRuns: LoadRun[]) {
  const active = loadRuns.filter((r) => ["queued", "warming", "running"].includes(r.status)).length;
  const completed = loadRuns.filter((r) => r.status === "completed").length;
  const failed = loadRuns.filter((r) => r.status === "failed").length;
  const totalVUMin = loadRuns.reduce((s, r) => s + (Number(r.vu_minutes) || 0), 0);
  const totalCost = loadRuns.reduce((s, r) => s + (r.cost_estimate?.total_cost ?? 0), 0);
  return { total: loadRuns.length, active, completed, failed, totalVUMin, totalCost };
}

describe("Load page — Run stats computation", () => {
  const runs: LoadRun[] = [
    { id: "1", status: "running", vu_minutes: 10, cost_estimate: { total_cost: 1.5 }, created_at: "2025-01-01T00:00:00Z" },
    { id: "2", status: "completed", vu_minutes: 20, cost_estimate: { total_cost: 3.0 }, created_at: "2025-01-02T00:00:00Z" },
    { id: "3", status: "failed", vu_minutes: 5, cost_estimate: { total_cost: 0.5 }, created_at: "2025-01-03T00:00:00Z" },
    { id: "4", status: "queued", created_at: "2025-01-04T00:00:00Z" },
    { id: "5", status: "completed", vu_minutes: 15, cost_estimate: { total_cost: 2.0 }, created_at: "2025-01-05T00:00:00Z" },
  ];

  it("counts total runs", () => {
    expect(computeRunStats(runs).total).toBe(5);
  });

  it("counts active runs (queued + running)", () => {
    expect(computeRunStats(runs).active).toBe(2);
  });

  it("counts completed runs", () => {
    expect(computeRunStats(runs).completed).toBe(2);
  });

  it("counts failed runs", () => {
    expect(computeRunStats(runs).failed).toBe(1);
  });

  it("sums VU-minutes, treating missing as 0", () => {
    expect(computeRunStats(runs).totalVUMin).toBe(50);
  });

  it("sums cost estimates, treating missing as 0", () => {
    expect(computeRunStats(runs).totalCost).toBe(7.0);
  });

  it("handles empty run list", () => {
    const stats = computeRunStats([]);
    expect(stats.total).toBe(0);
    expect(stats.active).toBe(0);
    expect(stats.totalVUMin).toBe(0);
    expect(stats.totalCost).toBe(0);
  });
});

// --- Run filtering by status ---

function filterRuns(runs: LoadRun[], statusFilter: string): LoadRun[] {
  const list = statusFilter === "all" ? runs : runs.filter((r) => r.status === statusFilter);
  return [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

describe("Load page — Run filtering", () => {
  const runs: LoadRun[] = [
    { id: "1", status: "running", created_at: "2025-01-01T00:00:00Z" },
    { id: "2", status: "completed", created_at: "2025-01-03T00:00:00Z" },
    { id: "3", status: "failed", created_at: "2025-01-02T00:00:00Z" },
  ];

  it("'all' returns all runs sorted by date desc", () => {
    const filtered = filterRuns(runs, "all");
    expect(filtered).toHaveLength(3);
    expect(filtered[0].id).toBe("2"); // Jan 3
    expect(filtered[1].id).toBe("3"); // Jan 2
    expect(filtered[2].id).toBe("1"); // Jan 1
  });

  it("filters by 'completed' status", () => {
    const filtered = filterRuns(runs, "completed");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("completed");
  });

  it("filters by 'failed' status", () => {
    const filtered = filterRuns(runs, "failed");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].status).toBe("failed");
  });

  it("returns empty for non-matching status", () => {
    expect(filterRuns(runs, "queued")).toHaveLength(0);
  });
});

// --- Completed run metric aggregation ---

function aggregateCompletedMetrics(runs: LoadRun[]) {
  const completed = runs.filter((r) => r.status === "completed" && r.metrics);
  if (completed.length === 0) return null;
  const metricKeys = ["lcp", "fcp", "cls", "ttfb", "inp", "tbt"];
  return metricKeys
    .map((m) => {
      const vals = completed.map((r) => Number(r.metrics?.[m])).filter((v) => !isNaN(v) && v > 0);
      if (vals.length === 0) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return { metric: m, avg, min, max, count: vals.length };
    })
    .filter(Boolean);
}

describe("Load page — Completed run metrics", () => {
  it("returns null when no completed runs", () => {
    const runs: LoadRun[] = [{ id: "1", status: "running", created_at: "2025-01-01T00:00:00Z" }];
    expect(aggregateCompletedMetrics(runs)).toBeNull();
  });

  it("computes avg/min/max for a single completed run", () => {
    const runs: LoadRun[] = [
      { id: "1", status: "completed", created_at: "2025-01-01T00:00:00Z", metrics: { lcp: 2500, fcp: 1200 } },
    ];
    const result = aggregateCompletedMetrics(runs)!;
    const lcp = result.find((m: any) => m.metric === "lcp")!;
    expect(lcp).toEqual({ metric: "lcp", avg: 2500, min: 2500, max: 2500, count: 1 });
  });

  it("averages across multiple completed runs", () => {
    const runs: LoadRun[] = [
      { id: "1", status: "completed", created_at: "2025-01-01T00:00:00Z", metrics: { lcp: 2000 } },
      { id: "2", status: "completed", created_at: "2025-01-02T00:00:00Z", metrics: { lcp: 4000 } },
    ];
    const result = aggregateCompletedMetrics(runs)!;
    const lcp = result.find((m: any) => m.metric === "lcp")!;
    expect((lcp as any).avg).toBe(3000);
    expect((lcp as any).min).toBe(2000);
    expect((lcp as any).max).toBe(4000);
    expect((lcp as any).count).toBe(2);
  });

  it("skips metrics with 0 or NaN values", () => {
    const runs: LoadRun[] = [
      { id: "1", status: "completed", created_at: "2025-01-01T00:00:00Z", metrics: { lcp: 0, fcp: 1500 } },
    ];
    const result = aggregateCompletedMetrics(runs)!;
    const lcp = result.find((m: any) => m.metric === "lcp");
    expect(lcp).toBeUndefined(); // 0 is filtered out
    const fcp = result.find((m: any) => m.metric === "fcp");
    expect(fcp).not.toBeNull();
  });

  it("ignores non-completed runs", () => {
    const runs: LoadRun[] = [
      { id: "1", status: "failed", created_at: "2025-01-01T00:00:00Z", metrics: { lcp: 5000 } },
      { id: "2", status: "completed", created_at: "2025-01-02T00:00:00Z", metrics: { lcp: 2000 } },
    ];
    const result = aggregateCompletedMetrics(runs)!;
    const lcp = result.find((m: any) => m.metric === "lcp")!;
    expect((lcp as any).count).toBe(1);
    expect((lcp as any).avg).toBe(2000);
  });
});

// --- Project sorting logic (Settings page) ---

interface Project {
  id: string;
  name: string;
  created_at: string;
}

type SortKey = "name" | "id" | "created_at";

function sortProjects(projects: Project[], key: SortKey, dir: "asc" | "desc"): Project[] {
  return [...projects].sort((a, b) => {
    const aVal = (a[key] ?? "").toString().toLowerCase();
    const bVal = (b[key] ?? "").toString().toLowerCase();
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

describe("Settings — Project sorting", () => {
  const projects: Project[] = [
    { id: "c-id", name: "Charlie", created_at: "2025-03-01" },
    { id: "a-id", name: "Alpha", created_at: "2025-01-01" },
    { id: "b-id", name: "Bravo", created_at: "2025-02-01" },
  ];

  it("sorts by name ascending", () => {
    const sorted = sortProjects(projects, "name", "asc");
    expect(sorted.map((p) => p.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by name descending", () => {
    const sorted = sortProjects(projects, "name", "desc");
    expect(sorted.map((p) => p.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("sorts by id ascending", () => {
    const sorted = sortProjects(projects, "id", "asc");
    expect(sorted.map((p) => p.id)).toEqual(["a-id", "b-id", "c-id"]);
  });

  it("sorts by created_at ascending", () => {
    const sorted = sortProjects(projects, "created_at", "asc");
    expect(sorted.map((p) => p.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("sorts by created_at descending", () => {
    const sorted = sortProjects(projects, "created_at", "desc");
    expect(sorted.map((p) => p.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("handles empty list", () => {
    expect(sortProjects([], "name", "asc")).toEqual([]);
  });
});

// --- User sorting logic ---

interface UserEntry {
  display_name: string;
  email: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
}

type UserSortKey = "display_name" | "email" | "role" | "is_active" | "last_login_at";

function sortUsers(users: UserEntry[], key: UserSortKey, dir: "asc" | "desc"): UserEntry[] {
  return [...users].sort((a, b) => {
    const aVal = String(a[key] ?? "").toLowerCase();
    const bVal = String(b[key] ?? "").toLowerCase();
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return dir === "asc" ? cmp : -cmp;
  });
}

describe("Users — Sorting", () => {
  const users: UserEntry[] = [
    { display_name: "Charlie", email: "c@test.io", role: "viewer", is_active: true, last_login_at: "2025-03-01" },
    { display_name: "Alice", email: "a@test.io", role: "admin", is_active: false, last_login_at: "2025-01-01" },
    { display_name: "Bob", email: "b@test.io", role: "editor", is_active: true, last_login_at: null },
  ];

  it("sorts by display_name asc", () => {
    const sorted = sortUsers(users, "display_name", "asc");
    expect(sorted.map((u) => u.display_name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts by email desc", () => {
    const sorted = sortUsers(users, "email", "desc");
    expect(sorted.map((u) => u.email)).toEqual(["c@test.io", "b@test.io", "a@test.io"]);
  });

  it("sorts by role asc", () => {
    const sorted = sortUsers(users, "role", "asc");
    expect(sorted.map((u) => u.role)).toEqual(["admin", "editor", "viewer"]);
  });

  it("handles null last_login_at in sorting", () => {
    const sorted = sortUsers(users, "last_login_at", "asc");
    // null becomes empty string, sorts first
    expect(sorted[0].display_name).toBe("Bob");
  });
});
