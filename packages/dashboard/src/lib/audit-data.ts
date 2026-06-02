/**
 * Audit checklist data and scoring logic extracted from E-64.
 * Kept separate from the page component so Next.js App Router
 * doesn't reject the named exports.
 */

export interface ChecklistItem {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: "critical" | "important" | "advisory";
  bookRef?: string;
}

export const AUDIT_CATEGORIES = [
  { key: "measurement", label: "Measurement Hygiene", icon: "📏" },
  { key: "load", label: "Load Testing", icon: "⚡" },
  { key: "runtime", label: "Runtime & Monitoring", icon: "📊" },
  { key: "memory", label: "Memory & Resources", icon: "💾" },
  { key: "network", label: "Network & Assets", icon: "🌐" },
  { key: "budgets", label: "Budgets & Gates", icon: "🎯" },
  { key: "culture", label: "Culture & Process", icon: "👥" },
] as const;

export const CHECKLIST_ITEMS: ChecklistItem[] = [
  // Measurement Hygiene
  { id: "mh_1", category: "measurement", title: "Consistent test environment", description: "Tests run on dedicated hardware or containers with consistent CPU, memory, and network. No shared-tenancy noise.", severity: "critical", bookRef: "Ch 5, p78" },
  { id: "mh_2", category: "measurement", title: "Warm-up runs discarded", description: "First 1-2 runs are discarded to prime caches and JIT. Only stable-state runs are measured.", severity: "important", bookRef: "Ch 5, p80" },
  { id: "mh_3", category: "measurement", title: "Sufficient sample size (n >= 3)", description: "Each test executes at least 3 iterations. Metrics are aggregated using median, not mean.", severity: "critical", bookRef: "Ch 5, p82" },
  { id: "mh_4", category: "measurement", title: "Confidence intervals reported", description: "Results include p25/p75 IQR or percentile CIs, not just point estimates.", severity: "important", bookRef: "App G, p233" },
  { id: "mh_5", category: "measurement", title: "RUM and synthetic both active", description: "Lab (synthetic) and field (RUM) data are both collected and compared.", severity: "critical", bookRef: "Ch 6, p93" },
  { id: "mh_6", category: "measurement", title: "All Core Web Vitals tracked", description: "LCP, FCP, CLS, INP, and TTFB are measured for every critical page.", severity: "critical", bookRef: "Ch 5, p69" },
  // Load Testing
  { id: "lt_1", category: "load", title: "Load profiles defined", description: "Realistic load profiles with ramp-up, steady-state, and ramp-down stages are defined.", severity: "critical", bookRef: "Ch 8, p110" },
  { id: "lt_2", category: "load", title: "Saturation point documented", description: "The VU count at which response times degrade beyond budget is known and documented.", severity: "important", bookRef: "Ch 14, p242" },
  { id: "lt_3", category: "load", title: "Load tests run regularly", description: "Load tests are part of the CI/CD pipeline or run at least monthly.", severity: "important", bookRef: "Ch 13, p215" },
  { id: "lt_4", category: "load", title: "Server metrics correlated", description: "CPU, memory, and throughput are correlated with VU ramp to identify bottlenecks.", severity: "important", bookRef: "Ch 14, p234" },
  // Runtime & Monitoring
  { id: "rt_1", category: "runtime", title: "Anomaly detection enabled", description: "Change-point detection is running on metric trends and auto-creating anomalies.", severity: "critical", bookRef: "Ch 14, p243" },
  { id: "rt_2", category: "runtime", title: "Notification channels tested", description: "All alert channels (Slack, email, webhook) have been tested and confirmed working.", severity: "critical", bookRef: "Ch 14, p181" },
  { id: "rt_3", category: "runtime", title: "Baselines regularly updated", description: "Performance baselines are recomputed periodically and after major releases.", severity: "important", bookRef: "Ch 14, p238" },
  { id: "rt_4", category: "runtime", title: "Investigation workflow defined", description: "Clear process exists for triaging performance anomalies: detect → attribute → fix → verify.", severity: "important", bookRef: "Ch 15, p260" },
  // Memory & Resources
  { id: "mem_1", category: "memory", title: "No memory leaks in long sessions", description: "Heap snapshots show stable memory after prolonged use. No unbounded growth.", severity: "critical", bookRef: "Ch 6, p100" },
  { id: "mem_2", category: "memory", title: "Resource cleanup verified", description: "Event listeners, timers, and subscriptions are properly cleaned up on navigation.", severity: "important" },
  { id: "mem_3", category: "memory", title: "Bundle size within budget", description: "Total JS bundle size is tracked and within the defined budget.", severity: "important", bookRef: "Ch 13, p211" },
  // Network & Assets
  { id: "net_1", category: "network", title: "Third-party scripts audited", description: "All third-party scripts are inventoried with their performance impact measured.", severity: "critical", bookRef: "Ch 6, p97" },
  { id: "net_2", category: "network", title: "Images optimized", description: "Images use modern formats (WebP/AVIF), are lazy-loaded below the fold, and have explicit dimensions.", severity: "important" },
  { id: "net_3", category: "network", title: "Preload/preconnect hints configured", description: "Critical resources use <link rel=preload> and third-party origins use preconnect hints.", severity: "advisory" },
  { id: "net_4", category: "network", title: "Cache headers appropriate", description: "Static assets have long cache TTLs with fingerprinted filenames. HTML uses no-cache or short TTLs.", severity: "important" },
  // Budgets & Gates
  { id: "bg_1", category: "budgets", title: "Performance budgets defined", description: "Route-level budgets exist for LCP, FCP, CLS, and bundle size.", severity: "critical", bookRef: "Ch 12, p145" },
  { id: "bg_2", category: "budgets", title: "CI gates enforce budgets", description: "Pull requests are blocked or warned when budgets are exceeded.", severity: "critical", bookRef: "Ch 13, p167" },
  { id: "bg_3", category: "budgets", title: "Budget ratchet enabled", description: "Budgets automatically tighten when performance improves.", severity: "important", bookRef: "Ch 12, p153" },
  { id: "bg_4", category: "budgets", title: "Gate override audit trail", description: "When gates are overridden, the override is logged with reason and approver.", severity: "important", bookRef: "Ch 12, p155" },
  // Culture & Process
  { id: "cu_1", category: "culture", title: "Perf champion or on-call exists", description: "Someone is explicitly responsible for performance monitoring each week.", severity: "critical", bookRef: "Ch 16, p270" },
  { id: "cu_2", category: "culture", title: "Quarterly reviews conducted", description: "The team reviews performance practices quarterly to identify drift.", severity: "important", bookRef: "Ch 16, p277" },
  { id: "cu_3", category: "culture", title: "Engineers can block on perf", description: "Engineers have explicit authority to delay a release for performance regressions.", severity: "critical", bookRef: "Ch 16, p274" },
  { id: "cu_4", category: "culture", title: "Perf in sprint planning", description: "Performance work items are part of regular sprint planning, not just incident response.", severity: "advisory", bookRef: "Ch 16, p276" },
];

export type AuditStatus = "pass" | "fail" | "partial" | "not_checked";

/** Compute the audit score from a status map. */
export function computeAuditScore(statuses: Record<string, AuditStatus>): number {
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

/** Compute per-category scores. */
export function computeCategoryScores(statuses: Record<string, AuditStatus>): Record<string, { score: number; pass: number; total: number }> {
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

/**
 * Auto-evaluate checklist items from project data.
 * Returns statuses only for items that can be verified automatically;
 * items that require human judgment are left as-is.
 */
export function autoEvaluate(
  runs: any[],
  gates: any[],
  schedules: any[],
  baselines: any[],
  anomalies: any[],
  loadProfiles: any[],
  channels: any[],
  budgets: any[],
): Record<string, AuditStatus> {
  const result: Record<string, AuditStatus> = {};

  const completedRuns = runs.filter((r: any) => r.status === "completed" && r.metrics);
  const hasMetrics = completedRuns.length > 0;

  // -- Measurement Hygiene --
  // mh_3: n_runs >= 3
  const multiRuns = completedRuns.filter((r: any) => (r.config?.n_runs ?? 1) >= 3);
  result.mh_3 = multiRuns.length > 0 ? (multiRuns.length === completedRuns.length ? "pass" : "partial") : completedRuns.length > 0 ? "fail" : "not_checked";

  // mh_6: All Core Web Vitals tracked
  if (hasMetrics) {
    const latest = completedRuns[completedRuns.length - 1];
    const m = latest.metrics ?? {};
    const hasAllCWV = m.lcp_ms != null && m.fcp_ms != null && m.cls != null && m.ttfb_ms != null;
    result.mh_6 = hasAllCWV ? "pass" : "partial";
  }

  // -- Load Testing --
  // lt_1: Load profiles defined
  result.lt_1 = loadProfiles.length > 0 ? "pass" : "fail";

  // lt_3: Load tests run regularly
  const loadRuns = runs.filter((r: any) => r.mode === "load" || r.engine === "k6_browser");
  result.lt_3 = loadRuns.length > 0 ? "pass" : "fail";

  // -- Runtime & Monitoring --
  // rt_1: Anomaly detection enabled
  result.rt_1 = anomalies.length > 0 ? "pass" : "fail";

  // rt_2: Notification channels tested
  result.rt_2 = channels.length > 0 ? "pass" : "fail";

  // rt_3: Baselines regularly updated
  result.rt_3 = baselines.length > 0 ? "pass" : "fail";

  // -- Budgets & Gates --
  // bg_1: Performance budgets defined
  result.bg_1 = budgets.length > 0 || gates.some((g: any) => g.metric) ? "pass" : "fail";

  // bg_2: CI gates enforce budgets
  result.bg_2 = gates.length > 0 ? "pass" : "fail";

  return result;
}
