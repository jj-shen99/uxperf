"use client";

/**
 * E-64: Audit Checklist Page (Appendix C).
 *
 * Interactive version of the book's Appendix C audit checklist:
 * measurement hygiene, load, runtime, memory, network, budgets, culture —
 * with per-item status tracking per project.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";
import { CheckCircle2, Circle, AlertTriangle, HelpCircle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { MetricTooltip, METRIC_GLOSSARY } from "@/components/metric-tooltip";
import {
  AUDIT_CATEGORIES,
  CHECKLIST_ITEMS,
  computeAuditScore,
  computeCategoryScores,
  autoEvaluate,
  type AuditStatus,
} from "@/lib/audit-data";

// ── STATUS ICONS ──

function StatusIcon({ status }: { status: AuditStatus }) {
  switch (status) {
    case "pass": return <CheckCircle2 className="h-4 w-4 text-green-400" />;
    case "fail": return <AlertTriangle className="h-4 w-4 text-red-400" />;
    case "partial": return <HelpCircle className="h-4 w-4 text-yellow-400" />;
    default: return <Circle className="h-4 w-4 text-gray-600" />;
  }
}

// ── PAGE COMPONENT ──

export default function AuditChecklistPage() {
  const queryClient = useQueryClient();
  const { projects, projectId, setProjectId } = useProjects();
  const [expandedCategory, setExpandedCategory] = useState<string | null>("measurement");

  // Load saved statuses from config API (config key: audit.<projectId>)
  const configKey = projectId ? `audit.${projectId}` : "";
  const { data: savedConfig } = useQuery({
    queryKey: ["config", configKey],
    queryFn: () => api.config.get(configKey),
    enabled: !!projectId,
  });

  // Fetch project data for auto-audit evaluation
  const { data: runs = [] } = useQuery({ queryKey: ["runs"], queryFn: () => api.runs.list() });
  const { data: gates = [] } = useQuery({ queryKey: ["gates", projectId], queryFn: () => api.gates.list(projectId || undefined), enabled: !!projectId });
  const { data: schedules = [] } = useQuery({ queryKey: ["schedules", projectId], queryFn: () => api.schedules.list(projectId || undefined), enabled: !!projectId });
  const { data: baselines = [] } = useQuery({ queryKey: ["baselines", projectId], queryFn: () => api.baselines.list(projectId || undefined), enabled: !!projectId });
  const { data: serverAnomalies = [] } = useQuery({ queryKey: ["anomalies", projectId], queryFn: () => api.analytics.anomalies(projectId || undefined), enabled: !!projectId });
  const { data: loadProfiles = [] } = useQuery({ queryKey: ["load-profiles"], queryFn: () => api.load.profiles.list() });
  const { data: channels = [] } = useQuery({ queryKey: ["notification-channels", projectId], queryFn: () => api.notifications.listChannels(projectId || undefined), enabled: !!projectId });
  const { data: budgets = [] } = useQuery({ queryKey: ["budgets", projectId], queryFn: () => api.budgets.list(projectId || undefined), enabled: !!projectId });

  const savedStatuses: Record<string, AuditStatus> = useMemo(() => {
    try {
      return savedConfig?.value ? JSON.parse(savedConfig.value) : {};
    } catch {
      return {};
    }
  }, [savedConfig]);

  // Merge: auto-evaluated items provide defaults, saved statuses override
  const autoStatuses = useMemo(() => {
    if (!projectId) return {};
    const projectRuns = runs.filter((r: any) => r.project_id === projectId);
    return autoEvaluate(projectRuns, gates, schedules, baselines, serverAnomalies, loadProfiles, channels, budgets);
  }, [projectId, runs, gates, schedules, baselines, serverAnomalies, loadProfiles, channels, budgets]);

  const statuses: Record<string, AuditStatus> = useMemo(() => {
    return { ...autoStatuses, ...savedStatuses };
  }, [autoStatuses, savedStatuses]);

  const saveMut = useMutation({
    mutationFn: (newStatuses: Record<string, AuditStatus>) =>
      api.config.set(configKey, JSON.stringify(newStatuses)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["config", configKey] }),
  });

  const setStatus = (itemId: string, status: AuditStatus) => {
    const next = { ...savedStatuses, [itemId]: status };
    saveMut.mutate(next);
  };

  const handleAutoAudit = () => {
    if (!projectId) return;
    // Save the auto-evaluated statuses merged with any existing overrides
    const merged = { ...autoStatuses, ...savedStatuses };
    saveMut.mutate(merged);
  };

  const overallScore = computeAuditScore(statuses);
  const categoryScores = computeCategoryScores(statuses);
  const checkedCount = Object.values(statuses).filter((s) => s !== "not_checked").length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Audit Checklist</h1>
          <p className="mt-1 text-sm text-gray-400">
            Interactive performance audit based on best practices
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
          >
            <option value="">Select a project</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {projectId && (
            <button
              onClick={handleAutoAudit}
              disabled={saveMut.isPending}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saveMut.isPending ? "Auditing..." : "Auto-Audit"}
            </button>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-12 text-center text-gray-500">
          Select a project to start the performance audit checklist.
        </div>
      ) : (
        <>
          {/* Score overview */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Overall Score</p>
              <p className={`mt-1 text-3xl font-bold ${overallScore >= 80 ? "text-green-400" : overallScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                {overallScore}%
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-800">
                <div
                  className={`h-full rounded-full transition-all ${overallScore >= 80 ? "bg-green-500" : overallScore >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${overallScore}%` }}
                />
              </div>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Items Checked</p>
              <p className="mt-1 text-3xl font-bold text-white">{checkedCount}/{CHECKLIST_ITEMS.length}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Passing</p>
              <p className="mt-1 text-3xl font-bold text-green-400">
                {Object.values(statuses).filter((s) => s === "pass").length}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Failing</p>
              <p className="mt-1 text-3xl font-bold text-red-400">
                {Object.values(statuses).filter((s) => s === "fail").length}
              </p>
            </div>
          </div>

          {/* Category score bar */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {AUDIT_CATEGORIES.map((cat) => {
              const cs = categoryScores[cat.key];
              return (
                <button
                  key={cat.key}
                  onClick={() => setExpandedCategory(expandedCategory === cat.key ? null : cat.key)}
                  className={`rounded-lg border p-3 text-left transition ${
                    expandedCategory === cat.key
                      ? "border-indigo-500/50 bg-indigo-900/20"
                      : "border-gray-800 bg-gray-900 hover:bg-gray-800/60"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{cat.icon}</span>
                    <span className="text-[10px] font-medium text-gray-400 truncate">{cat.label}</span>
                  </div>
                  <p className={`mt-1 text-lg font-bold ${cs.score >= 80 ? "text-green-400" : cs.score >= 50 ? "text-yellow-400" : cs.score > 0 ? "text-red-400" : "text-gray-600"}`}>
                    {cs.score}%
                  </p>
                  <p className="text-[9px] text-gray-600">{cs.pass}/{cs.total} items</p>
                </button>
              );
            })}
          </div>

          {/* KPI Reference Guide */}
          <details className="rounded-lg border border-gray-800 bg-gray-900 group">
            <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-800/40 transition select-none">
              <Info className="h-4 w-4 text-indigo-400" />
              <span className="text-sm font-medium text-gray-200">KPI Reference Guide</span>
              <span className="ml-auto text-[10px] text-gray-500">Hover any metric name for details</span>
            </summary>
            <div className="border-t border-gray-800 p-4">
              <p className="text-xs text-gray-500 mb-3">These are the key performance indicators referenced throughout the audit checklist. Hover or tap any metric for its full definition and threshold.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {(["LCP", "FCP", "CLS", "TTFB", "INP", "TBT", "TTI", "SI", "Lighthouse Score"] as const).map((key) => {
                  const info = METRIC_GLOSSARY[key];
                  if (!info) return null;
                  return (
                    <div key={key} className="rounded-md border border-gray-800 bg-gray-800/40 p-3">
                      <MetricTooltip metricKey={key} className="text-xs font-semibold text-indigo-400" />
                      <p className="mt-0.5 text-[10px] text-gray-500">{info.full}</p>
                      <p className="mt-1 text-[10px] text-gray-400 leading-relaxed line-clamp-2">{info.description}</p>
                      <p className="mt-1 text-[9px] text-green-500/70">Good: {info.good}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-md border border-yellow-800/30 bg-yellow-900/10 p-3">
                <p className="text-xs font-medium text-yellow-400/80">Why "No metrics captured"?</p>
                <p className="mt-1 text-[11px] text-gray-500">
                  If a measurement step shows no data, it means the step was defined in the test script but the worker returned no metrics for it. Common causes:
                </p>
                <ul className="mt-1.5 text-[11px] text-gray-500 space-y-0.5 list-disc list-inside">
                  <li><strong className="text-gray-400">Single-URL engine</strong> — The run used the simple URL engine instead of the journey executor, so multi-step measurements weren't collected</li>
                  <li><strong className="text-gray-400">Worker timeout</strong> — The worker crashed or timed out before reaching the measurement step</li>
                  <li><strong className="text-gray-400">Script mismatch</strong> — The script's measure step has a typo, unrecognized intent, or targets an element that doesn't exist on the page</li>
                  <li><strong className="text-gray-400">SPA navigation</strong> — A single-page app route change intercepted the browser navigation, preventing web vitals collection</li>
                  <li><strong className="text-gray-400">Element not found</strong> — The click target (e.g., "Kindle Books") may not match the actual page element text or selector</li>
                </ul>
              </div>
            </div>
          </details>

          {/* Checklist items by category */}
          <div className="space-y-2">
            {AUDIT_CATEGORIES.map((cat) => {
              const isExpanded = expandedCategory === cat.key;
              const items = CHECKLIST_ITEMS.filter((i) => i.category === cat.key);
              const cs = categoryScores[cat.key];

              return (
                <div key={cat.key} className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : cat.key)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span className="text-sm font-medium text-gray-200">{cat.label}</span>
                      <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-500">
                        {cs.pass}/{cs.total}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold ${cs.score >= 80 ? "text-green-400" : cs.score >= 50 ? "text-yellow-400" : cs.score > 0 ? "text-red-400" : "text-gray-600"}`}>
                        {cs.score}%
                      </span>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-800 divide-y divide-gray-800/50">
                      {items.map((item) => {
                        const currentStatus = statuses[item.id] ?? "not_checked";
                        return (
                          <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                            <div className="flex-shrink-0 pt-0.5">
                              <StatusIcon status={currentStatus} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-200">{item.title}</p>
                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                                  item.severity === "critical" ? "bg-red-500/10 text-red-400" :
                                  item.severity === "important" ? "bg-yellow-500/10 text-yellow-400" :
                                  "bg-gray-500/10 text-gray-400"
                                }`}>
                                  {item.severity}
                                </span>
                              </div>
                              <p className="mt-0.5 text-xs text-gray-500">{item.description}</p>
                              {item.bookRef && (
                                <p className="mt-0.5 text-[10px] text-indigo-400/60">{item.bookRef}</p>
                              )}
                            </div>
                            <div className="flex-shrink-0 flex gap-1">
                              {(["pass", "partial", "fail", "not_checked"] as AuditStatus[]).map((s) => (
                                <button
                                  key={s}
                                  onClick={() => setStatus(item.id, s)}
                                  className={`rounded px-2 py-1 text-[10px] font-medium transition ${
                                    currentStatus === s
                                      ? s === "pass" ? "bg-green-500/20 text-green-300 ring-1 ring-green-500/50"
                                        : s === "fail" ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/50"
                                        : s === "partial" ? "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/50"
                                        : "bg-gray-700 text-gray-300 ring-1 ring-gray-600"
                                      : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                                  }`}
                                >
                                  {s === "not_checked" ? "N/A" : s === "pass" ? "Pass" : s === "fail" ? "Fail" : "Partial"}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
