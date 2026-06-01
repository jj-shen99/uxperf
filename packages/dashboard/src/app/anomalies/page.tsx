"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState, useMemo } from "react";
import { useProjects } from "@/hooks/use-projects";

const METRIC_THRESHOLDS: Record<string, { good: number; poor: number; label: string; unit: string }> = {
  lcp_ms: { good: 2500, poor: 4000, label: "LCP", unit: "ms" },
  fcp_ms: { good: 1800, poor: 3000, label: "FCP", unit: "ms" },
  cls: { good: 0.1, poor: 0.25, label: "CLS", unit: "" },
  ttfb_ms: { good: 800, poor: 1800, label: "TTFB", unit: "ms" },
  inp_ms: { good: 200, poor: 500, label: "INP", unit: "ms" },
  tbt_ms: { good: 200, poor: 600, label: "TBT", unit: "ms" },
};

const TIME_RANGES = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "All", days: 0 },
];

interface DetectedAnomaly {
  id: string;
  metric: string;
  metricLabel: string;
  severity: "critical" | "warning" | "info";
  value: number;
  baseline: number;
  changePercent: number;
  runId: string;
  url: string;
  detectedAt: string;
  description: string;
  unit: string;
}

function fmt(v: number, metric: string): string {
  return metric === "cls" ? v.toFixed(3) : `${Math.round(v)}`;
}

export default function AnomaliesPage() {
  const { projects, projectId, setProjectId } = useProjects();
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [metricFilter, setMetricFilter] = useState<string>("all");
  const [daysFilter, setDaysFilter] = useState<number>(30);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(),
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => api.scripts.list(),
  });

  const anomalies = useMemo(() => {
    const now = Date.now();
    const cutoff = daysFilter > 0 ? now - daysFilter * 86400000 : 0;

    const completed = runs
      .filter((r: any) => r.status === "completed" && r.metrics && (!projectId || r.project_id === projectId))
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (completed.length < 2) return [];

    const detected: DetectedAnomaly[] = [];
    const metricKeys = Object.keys(METRIC_THRESHOLDS);

    for (const key of metricKeys) {
      const vals: { run: any; value: number }[] = [];
      for (const r of completed) {
        const v = r.metrics?.[key] as number | undefined;
        if (v != null) vals.push({ run: r, value: v });
      }
      if (vals.length < 2) continue;

      for (let i = 1; i < vals.length; i++) {
        const prev = vals.slice(Math.max(0, i - 5), i);
        const avg = prev.reduce((s, p) => s + p.value, 0) / prev.length;
        const stddev = Math.sqrt(prev.reduce((s, p) => s + (p.value - avg) ** 2, 0) / prev.length);
        const current = vals[i].value;
        const run = vals[i].run;
        const th = METRIC_THRESHOLDS[key];

        const deviation = current - avg;
        const threshold = Math.max(stddev * 2, avg * 0.15);

        if (deviation > threshold && current > th.good) {
          const runTime = new Date(run.finished_at ?? run.created_at).getTime();
          if (cutoff > 0 && runTime < cutoff) continue;

          const changePct = ((current - avg) / avg) * 100;
          let severity: "critical" | "warning" | "info" = "info";
          if (current > th.poor) severity = "critical";
          else if (current > th.good) severity = "warning";

          detected.push({
            id: `${run.id}-${key}`,
            metric: key,
            metricLabel: th.label,
            severity,
            value: current,
            baseline: avg,
            changePercent: changePct,
            runId: run.id,
            url: run.config?.url ?? "—",
            detectedAt: run.finished_at ?? run.created_at,
            description: `${th.label} spiked to ${fmt(current, key)}${th.unit} (+${changePct.toFixed(0)}% from avg ${fmt(avg, key)}${th.unit})`,
            unit: th.unit,
          });
        }
      }
    }

    return detected.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }, [runs, projectId, daysFilter]);

  const filtered = useMemo(() => {
    let list = anomalies;
    if (severityFilter !== "all") list = list.filter((a) => a.severity === severityFilter);
    if (metricFilter !== "all") list = list.filter((a) => a.metric === metricFilter);
    return list;
  }, [anomalies, severityFilter, metricFilter]);

  const criticalCount = anomalies.filter((a) => a.severity === "critical").length;
  const warningCount = anomalies.filter((a) => a.severity === "warning").length;
  const infoCount = anomalies.filter((a) => a.severity === "info").length;

  // Anomaly trend: count per day for the mini timeline
  const dailyTrend = useMemo(() => {
    if (anomalies.length === 0) return [];
    const dayMap: Record<string, { critical: number; warning: number; info: number }> = {};
    anomalies.forEach((a) => {
      const day = new Date(a.detectedAt).toLocaleDateString();
      if (!dayMap[day]) dayMap[day] = { critical: 0, warning: 0, info: 0 };
      dayMap[day][a.severity]++;
    });
    return Object.entries(dayMap)
      .map(([day, counts]) => ({ day, ...counts, total: counts.critical + counts.warning + counts.info }))
      .sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime())
      .slice(-30);
  }, [anomalies]);

  // Metric breakdown
  const metricBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    anomalies.forEach((a) => {
      counts[a.metric] = (counts[a.metric] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([metric, count]) => ({ metric, label: METRIC_THRESHOLDS[metric]?.label ?? metric, count }))
      .sort((a, b) => b.count - a.count);
  }, [anomalies]);

  const getScriptName = (runId: string) => {
    const run = runs.find((r: any) => r.id === runId);
    if (!run?.script_id) return null;
    return scripts.find((s: any) => s.id === run.script_id)?.name ?? null;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Anomalies</h1>
          <p className="mt-1 text-sm text-gray-400">
            Performance regressions detected by comparing each run against its rolling baseline
          </p>
        </div>
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
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Total Anomalies</p>
          <p className="mt-1 text-2xl font-bold text-white">{anomalies.length}</p>
          <p className="mt-0.5 text-[10px] text-gray-600">
            {runs.filter((r: any) => r.status === "completed" && r.metrics && (!projectId || r.project_id === projectId)).length} completed runs
          </p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Critical</p>
          <p className="mt-1 text-2xl font-bold text-red-400">{criticalCount}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Warning</p>
          <p className="mt-1 text-2xl font-bold text-yellow-400">{warningCount}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs text-gray-500">Info</p>
          <p className="mt-1 text-2xl font-bold text-blue-400">{infoCount}</p>
        </div>
      </div>

      {/* Anomaly Trend Timeline */}
      {dailyTrend.length > 1 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-xs font-medium text-gray-500">Anomaly Trend (by day)</h3>
          <div className="flex items-end gap-1 h-16">
            {dailyTrend.map((d) => {
              const maxTotal = Math.max(...dailyTrend.map((dd) => dd.total), 1);
              const pct = (d.total / maxTotal) * 100;
              const color = d.critical > 0 ? "bg-red-500" : d.warning > 0 ? "bg-yellow-500" : "bg-blue-500";
              return (
                <div
                  key={d.day}
                  className={`flex-1 rounded-t ${color} opacity-70 hover:opacity-100 transition-opacity`}
                  style={{ height: `${Math.max(pct, 6)}%` }}
                  title={`${d.day}: ${d.total} (${d.critical}C/${d.warning}W/${d.info}I)`}
                />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-gray-600">
            <span>{dailyTrend[0]?.day}</span>
            <span>{dailyTrend[dailyTrend.length - 1]?.day}</span>
          </div>
        </div>
      )}

      {/* Metric Breakdown */}
      {metricBreakdown.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-xs font-medium text-gray-500">Anomalies by Metric</h3>
          <div className="flex flex-wrap gap-2">
            {metricBreakdown.map((mb) => (
              <button
                key={mb.metric}
                onClick={() => setMetricFilter(metricFilter === mb.metric ? "all" : mb.metric)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  metricFilter === mb.metric
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {mb.label} <span className="ml-1 font-bold">{mb.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1">
          {[
            { key: "all", label: "All" },
            { key: "critical", label: "Critical" },
            { key: "warning", label: "Warning" },
            { key: "info", label: "Info" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setSeverityFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                severityFilter === f.key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.days}
              onClick={() => setDaysFilter(tr.days)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                daysFilter === tr.days
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
        {metricFilter !== "all" && (
          <button
            onClick={() => setMetricFilter("all")}
            className="rounded-full px-3 py-1 text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            Clear metric filter
          </button>
        )}
      </div>

      {/* Anomaly List */}
      {isLoading ? (
        <div className="text-gray-400">Loading runs data...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          {anomalies.length === 0
            ? `No anomalies detected for ${projectId ? "this project" : "any project"}. Need at least 2 completed runs with metrics to detect anomalies. ${projectId ? `This project has ${runs.filter((r: any) => r.status === "completed" && r.metrics && r.project_id === projectId).length} completed run(s) — try selecting \"All projects\" or running more tests.` : ""}`
            : `No matching anomalies found.`}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{filtered.length} anomal{filtered.length === 1 ? "y" : "ies"} shown</p>
          {filtered.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition cursor-pointer"
              onClick={() => setSelectedId(selectedId === a.id ? null : a.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.severity === "critical" ? "bg-red-900/40 text-red-400" :
                    a.severity === "warning" ? "bg-yellow-900/40 text-yellow-400" :
                    "bg-blue-900/40 text-blue-400"
                  }`}>
                    {a.severity}
                  </span>
                  <span className="font-mono text-sm font-semibold text-gray-200">{a.metricLabel}</span>
                  <span className="text-xs text-red-400 font-medium">+{a.changePercent.toFixed(0)}%</span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(a.detectedAt).toLocaleDateString()} {new Date(a.detectedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="mt-2 text-sm text-gray-400">{a.description}</p>
              <div className="mt-1 text-xs text-gray-600 truncate">{a.url}</div>

              {selectedId === a.id && (
                <div className="mt-4 space-y-3 border-t border-gray-800 pt-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="rounded-md border border-gray-800 bg-gray-800/30 p-2">
                      <p className="text-[10px] text-gray-500">Current Value</p>
                      <p className="text-sm font-bold text-red-400">{fmt(a.value, a.metric)}{a.unit}</p>
                    </div>
                    <div className="rounded-md border border-gray-800 bg-gray-800/30 p-2">
                      <p className="text-[10px] text-gray-500">Baseline Avg</p>
                      <p className="text-sm font-bold text-gray-300">{fmt(a.baseline, a.metric)}{a.unit}</p>
                    </div>
                    <div className="rounded-md border border-gray-800 bg-gray-800/30 p-2">
                      <p className="text-[10px] text-gray-500">Regression</p>
                      <p className="text-sm font-bold text-yellow-400">+{a.changePercent.toFixed(1)}%</p>
                    </div>
                    <div className="rounded-md border border-gray-800 bg-gray-800/30 p-2">
                      <p className="text-[10px] text-gray-500">Script</p>
                      <p className="text-sm text-gray-300 truncate">{getScriptName(a.runId) ?? "—"}</p>
                    </div>
                    <div className="rounded-md border border-gray-800 bg-gray-800/30 p-2">
                      <p className="text-[10px] text-gray-500">Good Threshold</p>
                      <p className="text-sm text-green-400">{METRIC_THRESHOLDS[a.metric]?.good ?? "—"}{a.unit}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
