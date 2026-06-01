/**
 * E-64: Audit checklist page logic tests.
 * Tests scoring, per-category computation, and checklist data integrity.
 *
 * Pure logic duplicated from audit/page.tsx to avoid JSX parsing issues in Jest.
 */
import { describe, it, expect } from "@jest/globals";

type AuditStatus = "pass" | "fail" | "partial" | "not_checked";

interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: "critical" | "important" | "advisory";
  bookRef?: string;
}

const AUDIT_CATEGORIES = [
  { key: "measurement", label: "Measurement Hygiene", icon: "📏" },
  { key: "load", label: "Load Testing", icon: "⚡" },
  { key: "runtime", label: "Runtime & Monitoring", icon: "📊" },
  { key: "memory", label: "Memory & Resources", icon: "💾" },
  { key: "network", label: "Network & Assets", icon: "🌐" },
  { key: "budgets", label: "Budgets & Gates", icon: "🎯" },
  { key: "culture", label: "Culture & Process", icon: "👥" },
] as const;

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: "mh_1", category: "measurement", title: "Consistent test environment", description: "Tests run on dedicated hardware.", severity: "critical" },
  { id: "mh_2", category: "measurement", title: "Warm-up runs discarded", description: "First runs discarded.", severity: "important" },
  { id: "mh_3", category: "measurement", title: "Sufficient sample size", description: "n >= 3.", severity: "critical" },
  { id: "mh_4", category: "measurement", title: "Confidence intervals reported", description: "IQR or CIs.", severity: "important" },
  { id: "mh_5", category: "measurement", title: "RUM and synthetic both active", description: "Lab + field.", severity: "critical" },
  { id: "mh_6", category: "measurement", title: "All Core Web Vitals tracked", description: "LCP/FCP/CLS/INP/TTFB.", severity: "critical" },
  { id: "lt_1", category: "load", title: "Load profiles defined", description: "Ramp stages.", severity: "critical" },
  { id: "lt_2", category: "load", title: "Saturation point documented", description: "VU degradation known.", severity: "important" },
  { id: "lt_3", category: "load", title: "Load tests run regularly", description: "Monthly or CI.", severity: "important" },
  { id: "lt_4", category: "load", title: "Server metrics correlated", description: "CPU/mem vs VU.", severity: "important" },
  { id: "rt_1", category: "runtime", title: "Anomaly detection enabled", description: "Change-point detection.", severity: "critical" },
  { id: "rt_2", category: "runtime", title: "Notification channels tested", description: "Alerts verified.", severity: "critical" },
  { id: "rt_3", category: "runtime", title: "Baselines regularly updated", description: "Periodic recompute.", severity: "important" },
  { id: "rt_4", category: "runtime", title: "Investigation workflow defined", description: "Detect→fix→verify.", severity: "important" },
  { id: "mem_1", category: "memory", title: "No memory leaks", description: "Stable heap.", severity: "critical" },
  { id: "mem_2", category: "memory", title: "Resource cleanup verified", description: "Listeners cleaned.", severity: "important" },
  { id: "mem_3", category: "memory", title: "Bundle size within budget", description: "JS tracked.", severity: "important" },
  { id: "net_1", category: "network", title: "Third-party scripts audited", description: "Impact measured.", severity: "critical" },
  { id: "net_2", category: "network", title: "Images optimized", description: "WebP/AVIF.", severity: "important" },
  { id: "net_3", category: "network", title: "Preload hints configured", description: "Critical resources.", severity: "advisory" },
  { id: "net_4", category: "network", title: "Cache headers appropriate", description: "Fingerprinted.", severity: "important" },
  { id: "bg_1", category: "budgets", title: "Budgets defined", description: "Route-level.", severity: "critical" },
  { id: "bg_2", category: "budgets", title: "CI gates enforce budgets", description: "PR blocked.", severity: "critical" },
  { id: "bg_3", category: "budgets", title: "Budget ratchet enabled", description: "Auto-tighten.", severity: "important" },
  { id: "bg_4", category: "budgets", title: "Gate override audit trail", description: "Logged.", severity: "important" },
  { id: "cu_1", category: "culture", title: "Perf champion exists", description: "On-call.", severity: "critical" },
  { id: "cu_2", category: "culture", title: "Quarterly reviews conducted", description: "Practice drift.", severity: "important" },
  { id: "cu_3", category: "culture", title: "Engineers can block on perf", description: "Authority.", severity: "critical" },
  { id: "cu_4", category: "culture", title: "Perf in sprint planning", description: "Regular work.", severity: "advisory" },
];

function computeAuditScore(statuses: Record<string, AuditStatus>): number {
  let total = 0;
  let earned = 0;
  for (const item of CHECKLIST_ITEMS) {
    const weight = item.severity === "critical" ? 3 : item.severity === "important" ? 2 : 1;
    total += weight;
    const s = statuses[item.id] ?? "not_checked";
    if (s === "pass") earned += weight;
    else if (s === "partial") earned += weight * 0.5;
  }
  return total > 0 ? Math.round((earned / total) * 100) : 0;
}

function computeCategoryScores(statuses: Record<string, AuditStatus>): Record<string, { score: number; pass: number; total: number }> {
  const result: Record<string, { score: number; pass: number; total: number }> = {};
  for (const cat of AUDIT_CATEGORIES) {
    const items = CHECKLIST_ITEMS.filter((i) => i.category === cat.key);
    let total = 0, earned = 0, pass = 0;
    for (const item of items) {
      const weight = item.severity === "critical" ? 3 : item.severity === "important" ? 2 : 1;
      total += weight;
      const s = statuses[item.id] ?? "not_checked";
      if (s === "pass") { earned += weight; pass++; }
      else if (s === "partial") earned += weight * 0.5;
    }
    result[cat.key] = { score: total > 0 ? Math.round((earned / total) * 100) : 0, pass, total: items.length };
  }
  return result;
}

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

// Replicate autoEvaluate from audit/page.tsx
function autoEvaluate(
  runs: any[],
  gates: any[],
  _schedules: any[],
  baselines: any[],
  anomalies: any[],
  loadProfiles: any[],
  channels: any[],
  budgets: any[],
): Record<string, AuditStatus> {
  const result: Record<string, AuditStatus> = {};
  const completedRuns = runs.filter((r: any) => r.status === "completed" && r.metrics);
  const hasMetrics = completedRuns.length > 0;

  const multiRuns = completedRuns.filter((r: any) => (r.config?.n_runs ?? 1) >= 3);
  result.mh_3 = multiRuns.length > 0 ? (multiRuns.length === completedRuns.length ? "pass" : "partial") : completedRuns.length > 0 ? "fail" : "not_checked";

  if (hasMetrics) {
    const latest = completedRuns[completedRuns.length - 1];
    const m = latest.metrics ?? {};
    const hasAllCWV = m.lcp_ms != null && m.fcp_ms != null && m.cls != null && m.ttfb_ms != null;
    result.mh_6 = hasAllCWV ? "pass" : "partial";
  }

  result.lt_1 = loadProfiles.length > 0 ? "pass" : "fail";
  const loadRuns = runs.filter((r: any) => r.mode === "load" || r.engine === "k6_browser");
  result.lt_3 = loadRuns.length > 0 ? "pass" : "fail";
  result.rt_1 = anomalies.length > 0 ? "pass" : "fail";
  result.rt_2 = channels.length > 0 ? "pass" : "fail";
  result.rt_3 = baselines.length > 0 ? "pass" : "fail";
  result.bg_1 = budgets.length > 0 || gates.some((g: any) => g.metric) ? "pass" : "fail";
  result.bg_2 = gates.length > 0 ? "pass" : "fail";
  return result;
}

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
