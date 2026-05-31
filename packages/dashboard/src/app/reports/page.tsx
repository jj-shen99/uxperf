"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState, useMemo } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const metricLabels: Record<string, string> = {
  lcp_ms: "LCP",
  fcp_ms: "FCP",
  cls: "CLS",
  ttfb_ms: "TTFB",
  inp_ms: "INP",
  tbt_ms: "TBT",
};

const CWV_THRESHOLDS: Record<string, { good: number; poor: number; unit: string }> = {
  lcp_ms: { good: 2500, poor: 4000, unit: "ms" },
  fcp_ms: { good: 1800, poor: 3000, unit: "ms" },
  cls: { good: 0.1, poor: 0.25, unit: "" },
  ttfb_ms: { good: 800, poor: 1800, unit: "ms" },
  inp_ms: { good: 200, poor: 500, unit: "ms" },
  tbt_ms: { good: 200, poor: 600, unit: "ms" },
};

function ratingColor(value: number, good: number, poor: number) {
  if (value <= good) return "#22c55e";
  if (value <= poor) return "#eab308";
  return "#ef4444";
}

const directionIcons: Record<string, string> = {
  improving: "↗ Improving",
  stable: "→ Stable",
  degrading: "↘ Degrading",
};
const directionColors: Record<string, string> = {
  improving: "text-green-400",
  stable: "text-gray-400",
  degrading: "text-red-400",
};

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const { projects, projectId, setProjectId } = useProjects();
  const [days, setDays] = useState(30);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const { isAdmin } = useCurrentUser();

  const { data: allRuns = [], isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(),
  });

  // Saved reports from API
  const { data: savedReports = [] } = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api.reports.list(projectId),
    enabled: !!projectId,
  });

  const generateMut = useMutation({
    mutationFn: () => api.reports.generate({ project_id: projectId, days }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", projectId] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.reports.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", projectId] }),
  });

  const completedRuns = useMemo(() =>
    allRuns
      .filter((r: any) => r.status === "completed" && r.metrics)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [allRuns]
  );

  // Filter by date range
  const filteredRuns = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return completedRuns.filter((r: any) => new Date(r.created_at) >= cutoff);
  }, [completedRuns, days]);

  // Build run trend sparkline data
  const trendData = useMemo(() =>
    completedRuns.slice(-20).map((r: any, i: number) => ({
      idx: i + 1,
      lcp: r.metrics?.lcp_ms ?? null,
      fcp: r.metrics?.fcp_ms ?? null,
      lh: r.metrics?.lighthouse_performance_score != null ? Math.round(r.metrics.lighthouse_performance_score * 100) : null,
    })),
    [completedRuns]
  );

  // Performance distribution: count good/needs-improvement/poor for each CWV
  const distribution = useMemo(() => {
    const result: Record<string, { good: number; needsImprovement: number; poor: number }> = {};
    for (const key of ["lcp_ms", "fcp_ms", "cls", "ttfb_ms"]) {
      let good = 0, ni = 0, poor = 0;
      completedRuns.forEach((r: any) => {
        const v = r.metrics?.[key] as number | undefined;
        if (v == null) return;
        const t = CWV_THRESHOLDS[key];
        if (v <= t.good) good++;
        else if (v <= t.poor) ni++;
        else poor++;
      });
      result[key] = { good, needsImprovement: ni, poor };
    }
    return result;
  }, [completedRuns]);

  // Aggregated stats
  const aggStats = useMemo(() => {
    if (completedRuns.length === 0) return null;
    const metrics = ["lcp_ms", "fcp_ms", "cls", "ttfb_ms", "tbt_ms", "inp_ms"];
    const stats: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    for (const key of metrics) {
      const vals: number[] = [];
      completedRuns.forEach((r: any) => {
        const v = r.metrics?.[key] as number | undefined;
        if (v != null) vals.push(v);
      });
      if (vals.length > 0) {
        stats[key] = {
          avg: vals.reduce((a, b) => a + b, 0) / vals.length,
          min: Math.min(...vals),
          max: Math.max(...vals),
          count: vals.length,
        };
      }
    }
    return stats;
  }, [completedRuns]);

  // Run summary stats
  const runSummary = useMemo(() => {
    const runs = filteredRuns;
    const completed = runs.length;
    const allInRange = allRuns.filter((r: any) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      return new Date(r.created_at) >= cutoff;
    });
    const failed = allInRange.filter((r: any) => r.status === "failed").length;
    const total = allInRange.length;
    const passRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, failed, total, passRate };
  }, [filteredRuns, allRuns, days]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Reports</h1>
          <p className="mt-1 text-sm text-gray-400">
            Performance summaries with Core Web Vitals distribution, metric trends, and statistics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
          >
            <option value="">All projects</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={() => generateMut.mutate()}
            disabled={!projectId || generateMut.isPending}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {generateMut.isPending ? "Generating…" : "Generate Report"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading data...</div>
      ) : completedRuns.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          No completed runs with metrics found. Run some performance tests to see reports.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Total Runs ({days}d)</p>
              <p className="mt-1 text-2xl font-bold text-white">{runSummary.total}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Completed</p>
              <p className="mt-1 text-2xl font-bold text-green-400">{runSummary.completed}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Failed</p>
              <p className="mt-1 text-2xl font-bold text-red-400">{runSummary.failed}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Pass Rate</p>
              <p className="mt-1 text-2xl font-bold text-white">{runSummary.passRate}%</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${runSummary.passRate}%` }} />
              </div>
            </div>
          </div>

          {/* Performance Distribution */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-sm font-medium text-gray-300">Performance Distribution ({days}-day window)</h3>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(["lcp_ms", "fcp_ms", "cls", "ttfb_ms"] as const).map((key) => {
                const d = distribution[key];
                const total = d.good + d.needsImprovement + d.poor;
                if (total === 0) return null;
                return (
                  <div key={key} className="rounded-lg border border-gray-800 bg-gray-800/30 p-3">
                    <p className="text-xs font-medium text-gray-500">{metricLabels[key]}</p>
                    <div className="mt-2 flex h-4 w-full overflow-hidden rounded-full">
                      <div className="bg-green-500 transition-all" style={{ width: `${(d.good / total) * 100}%` }} />
                      <div className="bg-yellow-500 transition-all" style={{ width: `${(d.needsImprovement / total) * 100}%` }} />
                      <div className="bg-red-500 transition-all" style={{ width: `${(d.poor / total) * 100}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px]">
                      <span className="text-green-400">{d.good} Good</span>
                      <span className="text-yellow-400">{d.needsImprovement} NI</span>
                      <span className="text-red-400">{d.poor} Poor</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aggregated Metric Stats */}
          {aggStats && Object.keys(aggStats).length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-sm font-medium text-gray-300">Aggregated Metric Statistics ({days}-day window)</h3>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Avg</th>
                      <th className="px-3 py-2 font-medium">Min</th>
                      <th className="px-3 py-2 font-medium">Max</th>
                      <th className="px-3 py-2 font-medium">Samples</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(aggStats).map(([key, s]: [string, any]) => {
                      const t = CWV_THRESHOLDS[key];
                      const color = t ? ratingColor(s.avg, t.good, t.poor) : "#818cf8";
                      const isCls = key === "cls";
                      const fmtVal = (v: number) => isCls ? v.toFixed(3) : `${Math.round(v)} ms`;
                      return (
                        <tr key={key} className="border-b border-gray-800/50">
                          <td className="px-3 py-2 font-medium text-gray-300">{metricLabels[key] ?? key}</td>
                          <td className="px-3 py-2 font-mono font-bold" style={{ color }}>{fmtVal(s.avg)}</td>
                          <td className="px-3 py-2 font-mono text-green-400">{fmtVal(s.min)}</td>
                          <td className="px-3 py-2 font-mono text-red-400">{fmtVal(s.max)}</td>
                          <td className="px-3 py-2 text-gray-500">{s.count}</td>
                          <td className="px-3 py-2">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LCP/FCP Trend Sparkline */}
          {trendData.length > 1 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-sm font-medium text-gray-300">Recent LCP & FCP Trend (last 20 runs)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="idx" stroke="#6b7280" fontSize={11} label={{ value: "Run #", position: "insideBottom", offset: -2, fill: "#6b7280", fontSize: 10 }} />
                  <YAxis stroke="#6b7280" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: "12px" }}
                  />
                  <Line type="monotone" dataKey="lcp" name="LCP (ms)" stroke="#818cf8" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey="fcp" name="FCP (ms)" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Lighthouse Score Trend */}
          {trendData.some((d) => d.lh != null) && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-sm font-medium text-gray-300">Lighthouse Performance Score Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="idx" stroke="#6b7280" fontSize={11} />
                  <YAxis stroke="#6b7280" fontSize={11} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: "12px" }}
                  />
                  <Line type="monotone" dataKey="lh" name="LH Score" stroke="#fb923c" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Previous Reports */}
      {savedReports.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Previous Reports</h2>
          <div className="space-y-2">
            {savedReports.slice(0, 20).map((r: any) => {
              const isExpanded = expandedReportId === r.id;
              const rpt = r.data as any;
              return (
                <div key={r.id} className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpandedReportId(isExpanded ? null : r.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedReportId(isExpanded ? null : r.id); } }}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-indigo-900/30 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
                        {r.report_type ?? "executive"}
                      </span>
                      <span className="text-sm text-gray-300">
                        {new Date(r.period_start).toLocaleDateString()} — {new Date(r.period_end).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {new Date(r.generated_at).toLocaleString()}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("Delete this report?")) deleteMut.mutate(r.id);
                          }}
                          disabled={deleteMut.isPending}
                          className="rounded px-2 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-900/30 hover:text-red-300 transition-colors disabled:opacity-50"
                          title="Delete report"
                        >
                          ✕ Delete
                        </button>
                      )}
                      <span className="text-gray-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExpanded && rpt && (
                    <div className="border-t border-gray-800 px-4 py-4 space-y-4">
                      {/* CWV p75 */}
                      {rpt.core_web_vitals && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-2">Core Web Vitals (p75)</h4>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                            {[
                              { label: "LCP", value: rpt.core_web_vitals.lcp_p75_ms, key: "lcp_ms", fmt: (v: number) => `${v.toFixed(0)} ms` },
                              { label: "FCP", value: rpt.core_web_vitals.fcp_p75_ms, key: "fcp_ms", fmt: (v: number) => `${v.toFixed(0)} ms` },
                              { label: "CLS", value: rpt.core_web_vitals.cls_p75, key: "cls", fmt: (v: number) => v.toFixed(3) },
                              { label: "INP", value: rpt.core_web_vitals.inp_p75_ms, key: "inp_ms", fmt: (v: number) => `${v.toFixed(0)} ms` },
                              { label: "TTFB", value: rpt.core_web_vitals.ttfb_p75_ms, key: "ttfb_ms", fmt: (v: number) => `${v.toFixed(0)} ms` },
                            ].map((item) => {
                              const t = CWV_THRESHOLDS[item.key];
                              const color = item.value != null && t ? ratingColor(item.value, t.good, t.poor) : "#6b7280";
                              return (
                                <div key={item.key} className="rounded-md border border-gray-800 bg-gray-800/30 p-2">
                                  <p className="text-[10px] text-gray-500">{item.label}</p>
                                  <p className="text-sm font-mono font-bold" style={{ color }}>
                                    {item.value != null ? item.fmt(item.value) : "—"}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Run & Gate stats row */}
                      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {rpt.run_stats && (
                          <>
                            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                              <p className="text-[10px] text-gray-500">Total Runs</p>
                              <p className="text-lg font-bold text-white">{rpt.run_stats.total_runs}</p>
                              <div className="mt-1 flex gap-2 text-[10px]">
                                <span className="text-green-400">{rpt.run_stats.completed} pass</span>
                                <span className="text-red-400">{rpt.run_stats.failed} fail</span>
                              </div>
                              <div className="mt-1.5 h-1 w-full rounded-full bg-gray-800 overflow-hidden">
                                <div className="h-full rounded-full bg-green-500" style={{ width: `${rpt.run_stats.pass_rate}%` }} />
                              </div>
                              <p className="mt-0.5 text-[10px] text-gray-500">{rpt.run_stats.pass_rate}% pass rate</p>
                            </div>
                          </>
                        )}
                        {rpt.gate_stats && (
                          <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                            <p className="text-[10px] text-gray-500">Gate Evaluations</p>
                            <p className="text-lg font-bold text-white">{rpt.gate_stats.total_evaluations}</p>
                            <div className="mt-1 flex gap-2 text-[10px]">
                              <span className="text-green-400">{rpt.gate_stats.passed} pass</span>
                              <span className="text-red-400">{rpt.gate_stats.failed} fail</span>
                            </div>
                            <div className="mt-1.5 h-1 w-full rounded-full bg-gray-800 overflow-hidden">
                              <div className="h-full rounded-full bg-green-500" style={{ width: `${rpt.gate_stats.pass_rate}%` }} />
                            </div>
                            <p className="mt-0.5 text-[10px] text-gray-500">{rpt.gate_stats.pass_rate}% pass rate</p>
                          </div>
                        )}
                        {rpt.anomalies && (
                          <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                            <p className="text-[10px] text-gray-500">Anomalies</p>
                            <p className="text-lg font-bold text-white">{rpt.anomalies.total}</p>
                            <div className="mt-1 flex gap-2 text-[10px]">
                              <span className="text-red-400">{rpt.anomalies.critical} critical</span>
                              <span className="text-green-400">{rpt.anomalies.resolved} resolved</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Trend Directions */}
                      {rpt.trend_direction && Object.keys(rpt.trend_direction).length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-2">Trend Directions</h4>
                          <div className="flex flex-wrap gap-3">
                            {Object.entries(rpt.trend_direction).map(([metric, direction]) => (
                              <div key={metric} className="rounded-md border border-gray-800 bg-gray-800/30 px-3 py-1.5 text-center">
                                <p className="text-[10px] text-gray-500">{metricLabels[metric] ?? metric}</p>
                                <p className={`text-xs font-semibold ${directionColors[direction as string] ?? "text-gray-400"}`}>
                                  {directionIcons[direction as string] ?? direction}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
