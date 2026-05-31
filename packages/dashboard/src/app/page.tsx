"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MetricRelationshipDiagram } from "@/components/metric-relationship-diagram";
import { extractSparklineData, sparklinePoints, sparklineTrend } from "@/lib/sparkline-utils";

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

function Sparkline({ values, lowerIsBetter = true }: { values: number[]; lowerIsBetter?: boolean }) {
  if (values.length < 2) return null;
  const W = 80;
  const H = 24;
  const points = sparklinePoints(values, W, H);
  const trend = sparklineTrend(values);
  const good = lowerIsBetter ? trend === "down" : trend === "up";
  const bad = lowerIsBetter ? trend === "up" : trend === "down";
  const color = good ? "#34d399" : bad ? "#f87171" : "#6b7280";

  return (
    <svg width={W} height={H} className="mt-1">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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

  // E-19: Sparkline data
  const sparkLcp = useMemo(() => extractSparklineData(completedRuns, "lcp_ms"), [completedRuns]);
  const sparkFcp = useMemo(() => extractSparklineData(completedRuns, "fcp_ms"), [completedRuns]);
  const sparkCls = useMemo(() => extractSparklineData(completedRuns, "cls"), [completedRuns]);
  const sparkPerf = useMemo(() => extractSparklineData(completedRuns, "lighthouse_performance_score"), [completedRuns]);

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

      {/* KPI Averages with Sparklines (E-19) */}
      {completedRuns.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">Average KPIs (All Completed Runs)</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Avg LCP</p>
              <p className={`mt-1 text-xl font-bold ${avgLcp != null ? metricColor(avgLcp, 2500, 4000) : "text-gray-600"}`}>
                {avgLcp != null ? `${Math.round(avgLcp)}` : "—"}<span className="ml-1 text-xs font-normal text-gray-500">ms</span>
              </p>
              <Sparkline values={sparkLcp} lowerIsBetter />
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Avg FCP</p>
              <p className={`mt-1 text-xl font-bold ${avgFcp != null ? metricColor(avgFcp, 1800, 3000) : "text-gray-600"}`}>
                {avgFcp != null ? `${Math.round(avgFcp)}` : "—"}<span className="ml-1 text-xs font-normal text-gray-500">ms</span>
              </p>
              <Sparkline values={sparkFcp} lowerIsBetter />
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Avg CLS</p>
              <p className={`mt-1 text-xl font-bold ${avgCls != null ? metricColor(avgCls, 0.1, 0.25) : "text-gray-600"}`}>
                {avgCls != null ? avgCls.toFixed(3) : "—"}
              </p>
              <Sparkline values={sparkCls} lowerIsBetter />
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Avg Lighthouse</p>
              <p className={`mt-1 text-xl font-bold ${avgPerf != null ? scoreColor(Math.round(avgPerf * 100)) : "text-gray-600"}`}>
                {avgPerf != null ? Math.round(avgPerf * 100) : "—"}<span className="ml-1 text-xs font-normal text-gray-500">/100</span>
              </p>
              <Sparkline values={sparkPerf} lowerIsBetter={false} />
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
