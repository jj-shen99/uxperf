/**
 * E-64: Audit checklist page logic tests.
 * Tests scoring, per-category computation, and checklist data integrity.
 *
 * Imports shared logic from @/lib/audit-data.
 */
import { describe, it, expect } from "@jest/globals";
import {
  AUDIT_CATEGORIES,
  CHECKLIST_ITEMS,
  computeAuditScore,
  computeCategoryScores,
  autoEvaluate,
  type AuditStatus,
} from "@/lib/audit-data";

describe("Audit Checklist Data", () => {
  it("has items for every category", () => {
    for (const cat of AUDIT_CATEGORIES) {
      const items = CHECKLIST_ITEMS.filter((i) => i.category === cat.key);
      expect(items.length).toBeGreaterThan(0);
    }
  });

  it("all items have unique IDs", () => {
    const ids = CHECKLIST_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all items have required fields", () => {
    for (const item of CHECKLIST_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.category).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.description).toBeTruthy();
      expect(["critical", "important", "advisory"]).toContain(item.severity);
    }
  });

  it("has at least 25 checklist items", () => {
    expect(CHECKLIST_ITEMS.length).toBeGreaterThanOrEqual(25);
  });

  it("has 7 categories", () => {
    expect(AUDIT_CATEGORIES).toHaveLength(7);
  });
});

describe("computeAuditScore", () => {
  it("returns 0 with no statuses", () => {
    expect(computeAuditScore({})).toBe(0);
  });

  it("returns 100 when all items pass", () => {
    const statuses: Record<string, AuditStatus> = {};
    for (const item of CHECKLIST_ITEMS) {
      statuses[item.id] = "pass";
    }
    expect(computeAuditScore(statuses)).toBe(100);
  });

  it("returns 0 when all items fail", () => {
    const statuses: Record<string, AuditStatus> = {};
    for (const item of CHECKLIST_ITEMS) {
      statuses[item.id] = "fail";
    }
    expect(computeAuditScore(statuses)).toBe(0);
  });

  it("returns 50 when all items are partial", () => {
    const statuses: Record<string, AuditStatus> = {};
    for (const item of CHECKLIST_ITEMS) {
      statuses[item.id] = "partial";
    }
    expect(computeAuditScore(statuses)).toBe(50);
  });

  it("weights critical items more heavily", () => {
    // Pass one critical item only vs pass one advisory item only
    const criticalItem = CHECKLIST_ITEMS.find((i) => i.severity === "critical")!;
    const advisoryItem = CHECKLIST_ITEMS.find((i) => i.severity === "advisory")!;

    const scoreCritical = computeAuditScore({ [criticalItem.id]: "pass" });
    const scoreAdvisory = computeAuditScore({ [advisoryItem.id]: "pass" });
    expect(scoreCritical).toBeGreaterThan(scoreAdvisory);
  });

  it("treats not_checked as fail (0 credit)", () => {
    const statuses: Record<string, AuditStatus> = {};
    for (const item of CHECKLIST_ITEMS) {
      statuses[item.id] = "not_checked";
    }
    expect(computeAuditScore(statuses)).toBe(0);
  });

  it("handles mixed statuses", () => {
    const items = CHECKLIST_ITEMS.slice(0, 4);
    const statuses: Record<string, AuditStatus> = {
      [items[0].id]: "pass",
      [items[1].id]: "fail",
      [items[2].id]: "partial",
      [items[3].id]: "not_checked",
    };
    const score = computeAuditScore(statuses);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});

describe("computeCategoryScores", () => {
  it("returns scores for all categories", () => {
    const scores = computeCategoryScores({});
    for (const cat of AUDIT_CATEGORIES) {
      expect(scores[cat.key]).toBeDefined();
      expect(scores[cat.key].total).toBeGreaterThan(0);
      expect(scores[cat.key].score).toBe(0);
      expect(scores[cat.key].pass).toBe(0);
    }
  });

  it("returns 100% for category when all pass", () => {
    const statuses: Record<string, AuditStatus> = {};
    const measureItems = CHECKLIST_ITEMS.filter((i) => i.category === "measurement");
    for (const item of measureItems) {
      statuses[item.id] = "pass";
    }
    const scores = computeCategoryScores(statuses);
    expect(scores.measurement.score).toBe(100);
    expect(scores.measurement.pass).toBe(measureItems.length);
  });

  it("only affects the relevant category", () => {
    const statuses: Record<string, AuditStatus> = {};
    const loadItems = CHECKLIST_ITEMS.filter((i) => i.category === "load");
    for (const item of loadItems) {
      statuses[item.id] = "pass";
    }
    const scores = computeCategoryScores(statuses);
    expect(scores.load.score).toBe(100);
    expect(scores.measurement.score).toBe(0); // other categories unaffected
  });

  it("counts pass items correctly", () => {
    const budgetItems = CHECKLIST_ITEMS.filter((i) => i.category === "budgets");
    const statuses: Record<string, AuditStatus> = {
      [budgetItems[0].id]: "pass",
    };
    const scores = computeCategoryScores(statuses);
    expect(scores.budgets.pass).toBe(1);
    expect(scores.budgets.total).toBe(budgetItems.length);
  });
});

describe("autoEvaluate", () => {
  it("returns all fail/not_checked with empty project data", () => {
    const result = autoEvaluate([], [], [], [], [], [], [], []);
    expect(result.mh_3).toBe("not_checked");
    expect(result.lt_1).toBe("fail");
    expect(result.lt_3).toBe("fail");
    expect(result.rt_1).toBe("fail");
    expect(result.rt_2).toBe("fail");
    expect(result.rt_3).toBe("fail");
    expect(result.bg_1).toBe("fail");
    expect(result.bg_2).toBe("fail");
  });

  it("returns pass for items with matching data", () => {
    const runs = [
      { status: "completed", metrics: { lcp_ms: 1200, fcp_ms: 800, cls: 0.05, ttfb_ms: 200 }, config: { n_runs: 5 } },
    ];
    const result = autoEvaluate(
      runs,
      [{ metric: "lcp_ms", threshold: 2500 }],
      [],
      [{ id: "b1" }],
      [{ id: "a1" }],
      [{ id: "lp1" }],
      [{ id: "ch1" }],
      [{ id: "bud1" }],
    );
    expect(result.mh_3).toBe("pass");
    expect(result.mh_6).toBe("pass");
    expect(result.lt_1).toBe("pass");
    expect(result.rt_1).toBe("pass");
    expect(result.rt_2).toBe("pass");
    expect(result.rt_3).toBe("pass");
    expect(result.bg_1).toBe("pass");
    expect(result.bg_2).toBe("pass");
  });

  it("returns partial for mh_3 when some runs have n_runs < 3", () => {
    const runs = [
      { status: "completed", metrics: { lcp_ms: 1200 }, config: { n_runs: 5 } },
      { status: "completed", metrics: { lcp_ms: 1300 }, config: { n_runs: 1 } },
    ];
    const result = autoEvaluate(runs, [], [], [], [], [], [], []);
    expect(result.mh_3).toBe("partial");
  });

  it("returns fail for mh_3 when all runs have n_runs < 3", () => {
    const runs = [
      { status: "completed", metrics: { lcp_ms: 1200 }, config: { n_runs: 1 } },
    ];
    const result = autoEvaluate(runs, [], [], [], [], [], [], []);
    expect(result.mh_3).toBe("fail");
  });

  it("returns partial for mh_6 when some CWV metrics missing", () => {
    const runs = [
      { status: "completed", metrics: { lcp_ms: 1200, fcp_ms: 800 } },
    ];
    const result = autoEvaluate(runs, [], [], [], [], [], [], []);
    expect(result.mh_6).toBe("partial");
  });

  it("detects load runs by engine=k6_browser", () => {
    const runs = [{ engine: "k6_browser", status: "completed", metrics: {} }];
    const result = autoEvaluate(runs, [], [], [], [], [], [], []);
    expect(result.lt_3).toBe("pass");
  });

  it("saved statuses override auto-evaluated ones", () => {
    const auto = autoEvaluate([], [], [], [], [], [], [], []);
    expect(auto.lt_1).toBe("fail");
    // When merged with saved: { lt_1: "pass" }, saved wins
    const merged = { ...auto, lt_1: "pass" as AuditStatus };
    expect(merged.lt_1).toBe("pass");
    // Score should be non-zero now
    expect(computeAuditScore(merged)).toBeGreaterThan(0);
  });

  it("overall score is non-zero when auto-eval finds passing items", () => {
    const result = autoEvaluate(
      [{ status: "completed", metrics: { lcp_ms: 1200, fcp_ms: 800, cls: 0.05, ttfb_ms: 200 }, config: { n_runs: 5 } }],
      [{ metric: "lcp_ms" }],
      [],
      [{ id: "b1" }],
      [{ id: "a1" }],
      [{ id: "lp1" }],
      [{ id: "ch1" }],
      [{ id: "bud1" }],
    );
    const score = computeAuditScore(result);
    expect(score).toBeGreaterThan(0);
  });
});
