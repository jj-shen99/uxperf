"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MetricRelationshipDiagram } from "@/components/metric-relationship-diagram";

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
  const { data: runs = [] } = useQuery({ queryKey: ["runs"], queryFn: () => api.runs.list() });

  // Derive stats
  const completedRuns = runs.filter((r: any) => r.status === "completed");
  const failedRuns = runs.filter((r: any) => r.status === "failed");
  const pendingRuns = runs.filter((r: any) => r.status === "queued" || r.status === "running");
  const passRate = runs.length > 0 ? Math.round((completedRuns.length / runs.length) * 100) : null;

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
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
          <p className="text-xs text-gray-500">Active</p>
          <p className="mt-1 text-2xl font-bold text-blue-400">{pendingRuns.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Pass Rate</p>
          <p className="mt-1 text-2xl font-bold text-white">{passRate != null ? `${passRate}%` : "—"}</p>
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

      {/* How Performance Metrics Relate — interactive diagram */}
      <div className="max-w-5xl mx-auto">
        <MetricRelationshipDiagram />
      </div>
    </div>
  );
}
