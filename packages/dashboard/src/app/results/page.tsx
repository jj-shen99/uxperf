"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/use-current-user";
import { MetricTooltip } from "@/components/metric-tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const METRIC_META: Record<string, { label: string; tooltipKey: string; unit: string; good: number; poor: number }> = {
  lcp_ms: { label: "LCP", tooltipKey: "LCP", unit: "ms", good: 2500, poor: 4000 },
  fcp_ms: { label: "FCP", tooltipKey: "FCP", unit: "ms", good: 1800, poor: 3000 },
  cls: { label: "CLS", tooltipKey: "CLS", unit: "", good: 0.1, poor: 0.25 },
  ttfb_ms: { label: "TTFB", tooltipKey: "TTFB", unit: "ms", good: 800, poor: 1800 },
  inp_ms: { label: "INP", tooltipKey: "INP", unit: "ms", good: 200, poor: 500 },
  tbt_ms: { label: "TBT", tooltipKey: "TBT", unit: "ms", good: 200, poor: 600 },
  si_ms: { label: "SI", tooltipKey: "SI", unit: "ms", good: 3400, poor: 5800 },
  tti_ms: { label: "TTI", tooltipKey: "TTI", unit: "ms", good: 3800, poor: 7300 },
};

const SCORE_KEYS = [
  { key: "lighthouse_performance_score", label: "Performance" },
  { key: "lighthouse_accessibility_score", label: "Accessibility" },
  { key: "lighthouse_best_practices_score", label: "Best Practices" },
  { key: "lighthouse_seo_score", label: "SEO" },
];

const COLORS = {
  good: "#22c55e",
  needs_improvement: "#eab308",
  poor: "#ef4444",
  bar: "#818cf8",
  radar: "#818cf8",
  radarFill: "rgba(129, 140, 248, 0.3)",
};

function ratingColor(value: number, good: number, poor: number) {
  if (value <= good) return COLORS.good;
  if (value <= poor) return COLORS.needs_improvement;
  return COLORS.poor;
}

function scoreRating(score: number) {
  if (score >= 0.9) return COLORS.good;
  if (score >= 0.5) return COLORS.needs_improvement;
  return COLORS.poor;
}

export default function ResultsPage() {
  const { currentUser, isAdmin } = useCurrentUser();
  const [selectedRunId, setSelectedRunId] = useState<string>("");

  const { data: allRuns = [], isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(),
  });

  // Filter: only completed runs; non-admin users see only their project runs
  const completedRuns = allRuns.filter((r: any) => r.status === "completed");

  const { data: selectedRun } = useQuery({
    queryKey: ["run", selectedRunId],
    queryFn: () => api.runs.get(selectedRunId),
    enabled: !!selectedRunId,
  });

  const metrics = selectedRun?.metrics ?? {};

  // Build chart data
  const webVitalsData = Object.entries(METRIC_META)
    .filter(([key]) => metrics[key] != null)
    .map(([key, meta]) => ({
      name: meta.label,
      value: Math.round(meta.unit === "ms" ? metrics[key] : metrics[key] * 1000) / (meta.unit === "ms" ? 1 : 1000),
      fill: ratingColor(metrics[key], meta.good, meta.poor),
      unit: meta.unit,
    }));

  const lighthouseRadarData = SCORE_KEYS
    .filter(({ key }) => metrics[key] != null)
    .map(({ key, label }) => ({
      metric: label,
      score: Math.round((metrics[key] as number) * 100),
    }));

  const lighthousePieData = SCORE_KEYS
    .filter(({ key }) => metrics[key] != null)
    .map(({ key, label }) => ({
      name: label,
      value: Math.round((metrics[key] as number) * 100),
      fill: scoreRating(metrics[key] as number),
    }));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Results</h1>
        <p className="mt-1 text-sm text-gray-400">
          Select a completed test execution to view detailed statistics and graphs
        </p>
      </div>

      {/* Run selector */}
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <label className="block text-xs text-gray-400 mb-2">Select Test Execution</label>
        <select
          value={selectedRunId}
          onChange={(e) => setSelectedRunId(e.target.value)}
          className="w-full max-w-xl rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
        >
          <option value="">Choose a completed run...</option>
          {completedRuns.map((r: any) => (
            <option key={r.id} value={r.id}>
              {new Date(r.created_at).toLocaleString()} — {r.config?.url || "unknown"} ({r.id.slice(0, 8)})
            </option>
          ))}
        </select>
        {isLoading && <p className="mt-2 text-xs text-gray-500">Loading runs...</p>}
      </div>

      {selectedRun && (
        <>
          {/* Run summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">URL</p>
              <p className="mt-1 text-sm text-gray-200 truncate">{selectedRun.config?.url ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Engine</p>
              <p className="mt-1 text-sm text-gray-200">{selectedRun.engine}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Status</p>
              <p className="mt-1 text-sm text-green-400 font-medium">{selectedRun.status}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Completed</p>
              <p className="mt-1 text-sm text-gray-200">
                {selectedRun.finished_at ? new Date(selectedRun.finished_at).toLocaleString() : "—"}
              </p>
            </div>
          </div>

          {/* Metric cards with tooltips */}
          <div>
            <h2 className="mb-3 text-sm font-medium text-gray-300">Core Web Vitals & Timings</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(METRIC_META).map(([key, meta]) => {
                const value = metrics[key] as number | undefined;
                const color = value != null
                  ? value <= meta.good ? "text-green-400" : value <= meta.poor ? "text-yellow-400" : "text-red-400"
                  : "text-gray-600";
                return (
                  <div key={key} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                    <MetricTooltip metricKey={meta.tooltipKey} className="text-xs text-gray-500" />
                    <p className={`mt-1 text-lg font-bold ${color}`}>
                      {value != null
                        ? `${meta.unit === "ms" ? Math.round(value) : value.toFixed(3)}${meta.unit ? ` ${meta.unit}` : ""}`
                        : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Web Vitals bar chart */}
          {webVitalsData.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h2 className="mb-4 text-sm font-medium text-gray-300">Web Vitals (ms metrics)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={webVitalsData.filter(d => d.unit === "ms")} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#e5e7eb" }}
                    itemStyle={{ color: "#a5b4fc" }}
                    formatter={(value: number) => [`${value} ms`, "Value"]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {webVitalsData.filter(d => d.unit === "ms").map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Lighthouse radar chart */}
          {lighthouseRadarData.length > 0 && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                <h2 className="mb-4 text-sm font-medium text-gray-300">
                  <MetricTooltip metricKey="Lighthouse Score" className="text-gray-300">Lighthouse Scores (Radar)</MetricTooltip>
                </h2>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={lighthouseRadarData}>
                    <PolarGrid stroke="#374151" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <Radar name="Score" dataKey="score" stroke={COLORS.radar} fill={COLORS.radarFill} fillOpacity={0.6} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                <h2 className="mb-4 text-sm font-medium text-gray-300">Lighthouse Scores (Breakdown)</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={lighthousePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={{ stroke: "#6b7280" }}
                    >
                      {lighthousePieData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Legend wrapperStyle={{ color: "#9ca3af", fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                      itemStyle={{ color: "#e5e7eb" }}
                      formatter={(value: number) => [`${value}/100`, "Score"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* CLS separate card */}
          {metrics.cls != null && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h2 className="mb-2 text-sm font-medium text-gray-300">
                <MetricTooltip metricKey="CLS" className="text-gray-300">Cumulative Layout Shift</MetricTooltip>
              </h2>
              <div className="flex items-baseline gap-4">
                <span className={`text-4xl font-bold ${(metrics.cls as number) <= 0.1 ? "text-green-400" : (metrics.cls as number) <= 0.25 ? "text-yellow-400" : "text-red-400"}`}>
                  {(metrics.cls as number).toFixed(4)}
                </span>
                <div className="flex gap-3 text-xs text-gray-500">
                  <span className="text-green-600">Good ≤ 0.1</span>
                  <span className="text-yellow-600">Needs Improvement ≤ 0.25</span>
                  <span className="text-red-600">Poor &gt; 0.25</span>
                </div>
              </div>
              <div className="mt-3 h-3 w-full rounded-full bg-gray-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min((metrics.cls as number) / 0.5 * 100, 100)}%`,
                    backgroundColor: (metrics.cls as number) <= 0.1 ? COLORS.good : (metrics.cls as number) <= 0.25 ? COLORS.needs_improvement : COLORS.poor,
                  }}
                />
              </div>
            </div>
          )}

          {/* Raw metrics JSON */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-3 text-sm font-medium text-gray-300">Raw Metrics</h2>
            <pre className="overflow-auto rounded-md bg-gray-800 p-4 text-xs text-gray-300 max-h-64">
              {JSON.stringify(metrics, null, 2)}
            </pre>
          </div>
        </>
      )}

      {!selectedRunId && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-12 text-center text-gray-500">
          <p className="text-lg">Select a test execution above to view results</p>
          <p className="mt-2 text-sm">Completed runs will appear in the dropdown with their URL and timestamp</p>
        </div>
      )}
    </div>
  );
}
