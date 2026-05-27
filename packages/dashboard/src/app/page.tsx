"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MetricTooltip } from "@/components/metric-tooltip";

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
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export default function DashboardPage() {
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api.projects.list() });
  const { data: scripts = [] } = useQuery({ queryKey: ["scripts"], queryFn: () => api.scripts.list() });
  const { data: runs = [] } = useQuery({ queryKey: ["runs"], queryFn: () => api.runs.list() });
  const { data: schedules = [] } = useQuery({ queryKey: ["schedules"], queryFn: () => api.schedules.list() });
  const { data: gates = [] } = useQuery({ queryKey: ["gates"], queryFn: () => api.gates.list() });

  // Derive stats
  const completedRuns = runs.filter((r: any) => r.status === "completed");
  const failedRuns = runs.filter((r: any) => r.status === "failed");
  const pendingRuns = runs.filter((r: any) => r.status === "queued" || r.status === "running");
  const passRate = runs.length > 0 ? Math.round((completedRuns.length / runs.length) * 100) : null;
  const activeSchedules = schedules.filter((s: any) => s.enabled);
  const enabledGates = gates.filter((g: any) => g.enabled);

  // Script stats
  const scriptsWithRuns = new Set(completedRuns.map((r: any) => r.script_id).filter(Boolean));
  const uniqueUrls = new Set(completedRuns.map((r: any) => r.config?.url).filter(Boolean));
  const envBreakdown: Record<string, number> = {};
  runs.forEach((r: any) => { const e = r.environment ?? "staging"; envBreakdown[e] = (envBreakdown[e] || 0) + 1; });

  // Avg duration
  const durations = completedRuns.filter((r: any) => r.started_at && r.finished_at)
    .map((r: any) => (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  // Latest completed run metrics
  const latestRun = completedRuns.length > 0
    ? completedRuns.reduce((a: any, b: any) => new Date(a.finished_at) > new Date(b.finished_at) ? a : b)
    : null;
  const m = latestRun?.metrics ?? {};

  const lcp = m.lcp_ms as number | undefined;
  const fcp = m.fcp_ms as number | undefined;
  const cls = m.cls as number | undefined;
  const ttfb = m.ttfb_ms as number | undefined;
  const inp = m.inp_ms as number | undefined;
  const tbt = m.tbt_ms as number | undefined;
  const perfScore = m.lighthouse_performance_score as number | undefined;

  // Averages across all completed runs
  const avgLcp = avgMetric(completedRuns, "lcp_ms");
  const avgFcp = avgMetric(completedRuns, "fcp_ms");
  const avgCls = avgMetric(completedRuns, "cls");
  const avgPerf = avgMetric(completedRuns, "lighthouse_performance_score");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-400">
          Frontend Performance Testing Framework
        </p>
      </div>

      {/* Overview counts */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Projects</p>
          <p className="mt-1 text-2xl font-bold text-white">{projects.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Scripts</p>
          <p className="mt-1 text-2xl font-bold text-white">{scripts.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Total Runs</p>
          <p className="mt-1 text-2xl font-bold text-white">{runs.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Completed</p>
          <p className="mt-1 text-2xl font-bold text-green-400">{completedRuns.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Failed</p>
          <p className="mt-1 text-2xl font-bold text-red-400">{failedRuns.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Pass Rate</p>
          <p className="mt-1 text-2xl font-bold text-white">{passRate != null ? `${passRate}%` : "—"}</p>
        </div>
      </div>

      {/* Core Web Vitals from latest run */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-400">Core Web Vitals (Latest Run)</h2>
          {latestRun && (
            <span className="text-xs text-gray-600">
              {new Date(latestRun.finished_at).toLocaleString()} — {latestRun.config?.url || latestRun.id?.slice(0, 8)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <MetricTooltip metricKey="LCP" className="text-xs text-gray-500" />
            <p className={`mt-1 text-xl font-bold ${lcp != null ? metricColor(lcp, 2500, 4000) : "text-gray-600"}`}>
              {lcp != null ? `${Math.round(lcp)}` : "—"}
              <span className="ml-1 text-xs font-normal text-gray-500">ms</span>
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <MetricTooltip metricKey="FCP" className="text-xs text-gray-500" />
            <p className={`mt-1 text-xl font-bold ${fcp != null ? metricColor(fcp, 1800, 3000) : "text-gray-600"}`}>
              {fcp != null ? `${Math.round(fcp)}` : "—"}
              <span className="ml-1 text-xs font-normal text-gray-500">ms</span>
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <MetricTooltip metricKey="CLS" className="text-xs text-gray-500" />
            <p className={`mt-1 text-xl font-bold ${cls != null ? metricColor(cls, 0.1, 0.25) : "text-gray-600"}`}>
              {cls != null ? cls.toFixed(3) : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <MetricTooltip metricKey="TTFB" className="text-xs text-gray-500" />
            <p className={`mt-1 text-xl font-bold ${ttfb != null ? metricColor(ttfb, 800, 1800) : "text-gray-600"}`}>
              {ttfb != null ? `${Math.round(ttfb)}` : "—"}
              <span className="ml-1 text-xs font-normal text-gray-500">ms</span>
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <MetricTooltip metricKey="INP" className="text-xs text-gray-500" />
            <p className={`mt-1 text-xl font-bold ${inp != null ? metricColor(inp, 200, 500) : "text-gray-600"}`}>
              {inp != null ? `${Math.round(inp)}` : "—"}
              <span className="ml-1 text-xs font-normal text-gray-500">ms</span>
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <MetricTooltip metricKey="TBT" className="text-xs text-gray-500" />
            <p className={`mt-1 text-xl font-bold ${tbt != null ? metricColor(tbt, 200, 600) : "text-gray-600"}`}>
              {tbt != null ? `${Math.round(tbt)}` : "—"}
              <span className="ml-1 text-xs font-normal text-gray-500">ms</span>
            </p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <MetricTooltip metricKey="Lighthouse Score" className="text-xs text-gray-500" />
            <p className={`mt-1 text-xl font-bold ${perfScore != null ? scoreColor(Math.round(perfScore * 100)) : "text-gray-600"}`}>
              {perfScore != null ? Math.round(perfScore * 100) : "—"}
              <span className="ml-1 text-xs font-normal text-gray-500">/100</span>
            </p>
          </div>
        </div>
      </div>

      {/* Activity summary row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Pending runs */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-medium text-gray-400">Active Runs</h2>
          {pendingRuns.length > 0 ? (
            <div className="mt-3 space-y-2">
              {pendingRuns.slice(0, 5).map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300 truncate max-w-[180px]">{r.config?.url || r.id.slice(0, 8)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "running" ? "bg-blue-900/30 text-blue-400" : "bg-yellow-900/30 text-yellow-400"}`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-gray-600">No active runs</p>
          )}
        </div>

        {/* Quality gates */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-medium text-gray-400">Quality Gates</h2>
          <p className="mt-2 text-2xl font-bold text-white">{gates.length}</p>
          <p className="mt-1 text-xs text-gray-500">gates configured</p>
          <Link href="/gates" className="mt-3 inline-block text-xs text-indigo-400 hover:text-indigo-300">
            Manage gates →
          </Link>
        </div>

        {/* Schedules */}
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-medium text-gray-400">Schedules</h2>
          <p className="mt-2 text-2xl font-bold text-white">{schedules.length}</p>
          <p className="mt-1 text-xs text-gray-500">scheduled test plans</p>
          <Link href="/schedules" className="mt-3 inline-block text-xs text-indigo-400 hover:text-indigo-300">
            Manage schedules →
          </Link>
        </div>
      </div>

      {/* Recent runs table */}
      {completedRuns.length > 0 && (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <div className="bg-gray-900 px-4 py-3 border-b border-gray-800">
            <h2 className="text-sm font-medium text-gray-400">Recent Completed Runs</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-400">URL</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">LCP</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">FCP</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">CLS</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">TTFB</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {completedRuns.slice(0, 8).map((r: any) => {
                const rm = r.metrics ?? {};
                return (
                  <tr key={r.id} className="hover:bg-gray-800/30">
                    <td className="px-4 py-2 text-gray-300 truncate max-w-[200px]">
                      <Link href={`/results`} className="text-indigo-400 hover:text-indigo-300 hover:underline">
                        {r.config?.url || r.id.slice(0, 12)}
                      </Link>
                    </td>
                    <td className={`px-4 py-2 text-right font-mono text-xs ${rm.lcp_ms != null ? metricColor(rm.lcp_ms, 2500, 4000) : "text-gray-600"}`}>
                      {rm.lcp_ms != null ? `${Math.round(rm.lcp_ms)} ms` : "—"}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono text-xs ${rm.fcp_ms != null ? metricColor(rm.fcp_ms, 1800, 3000) : "text-gray-600"}`}>
                      {rm.fcp_ms != null ? `${Math.round(rm.fcp_ms)} ms` : "—"}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono text-xs ${rm.cls != null ? metricColor(rm.cls, 0.1, 0.25) : "text-gray-600"}`}>
                      {rm.cls != null ? (rm.cls as number).toFixed(3) : "—"}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono text-xs ${rm.ttfb_ms != null ? metricColor(rm.ttfb_ms, 800, 1800) : "text-gray-600"}`}>
                      {rm.ttfb_ms != null ? `${Math.round(rm.ttfb_ms)} ms` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-500">
                      {r.finished_at ? new Date(r.finished_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* KPI Averages (all completed runs) */}
      {completedRuns.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">Average KPIs (All Completed Runs)</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Avg LCP</p>
              <p className={`mt-1 text-xl font-bold ${avgLcp != null ? metricColor(avgLcp, 2500, 4000) : "text-gray-600"}`}>
                {avgLcp != null ? `${Math.round(avgLcp)}` : "—"}<span className="ml-1 text-xs font-normal text-gray-500">ms</span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Avg FCP</p>
              <p className={`mt-1 text-xl font-bold ${avgFcp != null ? metricColor(avgFcp, 1800, 3000) : "text-gray-600"}`}>
                {avgFcp != null ? `${Math.round(avgFcp)}` : "—"}<span className="ml-1 text-xs font-normal text-gray-500">ms</span>
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Avg CLS</p>
              <p className={`mt-1 text-xl font-bold ${avgCls != null ? metricColor(avgCls, 0.1, 0.25) : "text-gray-600"}`}>
                {avgCls != null ? avgCls.toFixed(3) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Avg Lighthouse</p>
              <p className={`mt-1 text-xl font-bold ${avgPerf != null ? scoreColor(Math.round(avgPerf * 100)) : "text-gray-600"}`}>
                {avgPerf != null ? Math.round(avgPerf * 100) : "—"}<span className="ml-1 text-xs font-normal text-gray-500">/100</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Script & Test Run Statistics */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Script Statistics</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
              <p className="text-xs text-gray-500">Total Scripts</p>
              <p className="mt-1 text-lg font-bold text-white">{scripts.length}</p>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
              <p className="text-xs text-gray-500">Scripts with Runs</p>
              <p className="mt-1 text-lg font-bold text-white">{scriptsWithRuns.size}</p>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
              <p className="text-xs text-gray-500">Unique URLs Tested</p>
              <p className="mt-1 text-lg font-bold text-white">{uniqueUrls.size}</p>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
              <p className="text-xs text-gray-500">Active Schedules</p>
              <p className="mt-1 text-lg font-bold text-white">{activeSchedules.length}</p>
            </div>
          </div>
          <Link href="/scripts" className="mt-3 inline-block text-xs text-indigo-400 hover:text-indigo-300">
            View all scripts →
          </Link>
        </div>

        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-sm font-medium text-gray-400 mb-3">Test Run Statistics</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
              <p className="text-xs text-gray-500">Total Runs</p>
              <p className="mt-1 text-lg font-bold text-white">{runs.length}</p>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
              <p className="text-xs text-gray-500">Avg Duration</p>
              <p className="mt-1 text-lg font-bold text-white">{avgDuration != null ? `${avgDuration.toFixed(0)}s` : "—"}</p>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
              <p className="text-xs text-gray-500">Enabled Gates</p>
              <p className="mt-1 text-lg font-bold text-white">{enabledGates.length} / {gates.length}</p>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
              <p className="text-xs text-gray-500">Environments</p>
              <p className="mt-1 text-lg font-bold text-white">{Object.keys(envBreakdown).length}</p>
            </div>
          </div>
          {Object.keys(envBreakdown).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(envBreakdown).map(([env, count]) => (
                <span key={env} className="rounded-full bg-gray-800 px-2.5 py-0.5 text-[10px] font-medium text-gray-400">
                  {env}: {count} runs
                </span>
              ))}
            </div>
          )}
          <Link href="/runs" className="mt-3 inline-block text-xs text-indigo-400 hover:text-indigo-300">
            View all runs →
          </Link>
        </div>
      </div>
    </div>
  );
}
