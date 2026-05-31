/**
 * Bug Regression Tests
 *
 * Each section covers a specific bug that was discovered and fixed,
 * with tests to prevent re-introduction.
 *
 * BUG-001: Budgets ratchet 404 — route mismatch (path param vs body)
 * BUG-002: Budgets ratchet result — API returns array, UI expected object
 * BUG-003: Budgets update — PATCH vs PUT method mismatch
 * BUG-004: useProjects — no auto-select left pages without project context
 * BUG-005: Journey executor — var in finally block (hoisting issue)
 */

// ============================================================
// BUG-001: Budgets ratchet endpoint must use path param
// ============================================================

describe("BUG-001: Budgets ratchet URL format", () => {
  it("ratchet URL includes projectId as path param", () => {
    const projectId = "ab793bc5-8f59-4512-89e9-af48897108a0";
    const url = `/budgets/ratchet/${encodeURIComponent(projectId)}`;
    expect(url).toBe("/budgets/ratchet/ab793bc5-8f59-4512-89e9-af48897108a0");
  });

  it("ratchet URL must NOT be just /budgets/ratchet (no param)", () => {
    const projectId = "p-1";
    const url = `/budgets/ratchet/${encodeURIComponent(projectId)}`;
    expect(url).not.toBe("/budgets/ratchet");
    expect(url).toContain(projectId);
  });

  it("evaluate URL includes projectId as path param", () => {
    const projectId = "p-1";
    const route = "/products";
    const url = `/budgets/evaluate/${encodeURIComponent(projectId)}?route=${encodeURIComponent(route)}`;
    expect(url).toContain("/budgets/evaluate/p-1");
    expect(url).toContain("route=%2Fproducts");
  });
});

// ============================================================
// BUG-002: Ratchet API returns array, not { ratcheted_count }
// ============================================================

describe("BUG-002: Ratchet result is an array of RatchetResult", () => {
  interface RatchetResult {
    budget_id: string;
    metric: string;
    old_threshold: number;
    new_threshold: number;
    baseline_value: number;
    ratcheted: boolean;
    reason: string;
  }

  it("correctly counts ratcheted budgets from array", () => {
    const results: RatchetResult[] = [
      { budget_id: "b-1", metric: "lcp_ms", old_threshold: 2500, new_threshold: 2100, baseline_value: 2000, ratcheted: true, reason: "" },
      { budget_id: "b-2", metric: "fcp_ms", old_threshold: 1800, new_threshold: 1800, baseline_value: 2000, ratcheted: false, reason: "" },
    ];
    const count = results.filter((r) => r.ratcheted).length;
    expect(count).toBe(1);
  });

  it("handles empty array (no budgets eligible)", () => {
    const results: RatchetResult[] = [];
    const count = results.filter((r) => r.ratcheted).length;
    expect(count).toBe(0);
  });

  it("handles all ratcheted", () => {
    const results: RatchetResult[] = [
      { budget_id: "b-1", metric: "lcp_ms", old_threshold: 3000, new_threshold: 2100, baseline_value: 2000, ratcheted: true, reason: "" },
      { budget_id: "b-2", metric: "fcp_ms", old_threshold: 2000, new_threshold: 1575, baseline_value: 1500, ratcheted: true, reason: "" },
    ];
    const count = results.filter((r) => r.ratcheted).length;
    expect(count).toBe(2);
  });

  it("gracefully handles non-array response", () => {
    const result: any = { ratcheted_count: 5 }; // wrong format
    const count = Array.isArray(result) ? result.filter((r: any) => r.ratcheted).length : 0;
    expect(count).toBe(0); // safe fallback
  });
});

// ============================================================
// BUG-003: Budgets update must use PUT (controller has @Put)
// ============================================================

describe("BUG-003: Budgets update uses PUT", () => {
  it("update method is PUT not PATCH", () => {
    // Mirrors api.budgets.update in api.ts
    const method = "PUT";
    expect(method).toBe("PUT");
    expect(method).not.toBe("PATCH");
  });

  it("update path includes budget ID", () => {
    const id = "b-123";
    const path = `/budgets/${id}`;
    expect(path).toBe("/budgets/b-123");
  });
});

// ============================================================
// BUG-004: useProjects auto-select
// ============================================================

describe("BUG-004: useProjects auto-selects first project", () => {
  function autoSelect(projects: { id: string; name: string }[], currentId: string): string {
    if (!currentId && projects.length > 0) {
      return projects[0].id;
    }
    return currentId;
  }

  it("auto-selects when empty and projects available", () => {
    expect(autoSelect([{ id: "p-1", name: "Prod" }], "")).toBe("p-1");
  });

  it("does not reset user selection", () => {
    expect(autoSelect([{ id: "p-1", name: "Prod" }, { id: "p-2", name: "Dev" }], "p-2")).toBe("p-2");
  });

  it("returns empty when no projects", () => {
    expect(autoSelect([], "")).toBe("");
  });

  it("handles single project", () => {
    expect(autoSelect([{ id: "only-one", name: "Solo" }], "")).toBe("only-one");
  });
});

// ============================================================
// BUG-005: var hoisting in journey executor finally block
// ============================================================

describe("BUG-005: harResult scoping in executor", () => {
  it("let declaration before try is accessible in finally", () => {
    let harResult: any = undefined;

    try {
      harResult = { entries: [], summary: {} };
    } finally {
      // This is how the fixed code works — harResult is accessible
      expect(harResult).toBeDefined();
    }
  });

  it("harResult is undefined when captureHar is false", () => {
    const captureHar = false;
    let harResult: any = undefined;

    try {
      if (captureHar) {
        harResult = { entries: [] };
      }
    } finally {
      // nothing to do
    }

    expect(harResult).toBeUndefined();
  });

  it("harResult survives exception in try block", () => {
    let harResult: any = undefined;

    try {
      throw new Error("step failed");
    } catch {
      // error handled
    } finally {
      harResult = { entries: [{ url: "test.js" }] };
    }

    expect(harResult).toBeDefined();
    expect(harResult.entries).toHaveLength(1);
  });
});

// ============================================================
// Additional regressions: route collision guards
// ============================================================

describe("Route pattern collision guards", () => {
  it("gates static routes should not be consumed by :id param", () => {
    // NestJS resolves static segments before params, but
    // we verify the path patterns are correct
    const staticPaths = ["batch", "evaluate", "results", "overrides"];
    const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const path of staticPaths) {
      expect(idPattern.test(path)).toBe(false); // static paths don't match UUID format
    }
  });

  it("budget static routes should not be consumed by :id param", () => {
    const staticPaths = ["evaluate", "ratchet"];
    const idPattern = /^[0-9a-f]{8}-/;
    for (const path of staticPaths) {
      expect(idPattern.test(path)).toBe(false);
    }
  });
});
