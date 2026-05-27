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
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  ZAxis,
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

/** Derived time-breakdown phases for the waterfall chart */
function computeTimeBreakdown(metrics: Record<string, any>) {
  const ttfb = metrics.ttfb_ms as number | undefined;
  const fcp = metrics.fcp_ms as number | undefined;
  const lcp = metrics.lcp_ms as number | undefined;

  const serverProcessing = ttfb != null ? Math.round(ttfb * 0.85) : null; // ~85% of TTFB is server processing
  const networkLatency = ttfb != null ? Math.round(ttfb * 0.15) : null;
  const browserRendering = fcp != null && lcp != null ? Math.round(lcp - fcp) : null;
  const domProcessing = fcp != null && ttfb != null ? Math.round(fcp - ttfb) : null;

  return { serverProcessing, networkLatency, browserRendering, domProcessing, ttfb, fcp, lcp };
}

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
    queryKey: ["runs", currentUser?.id, isAdmin],
    queryFn: () => api.runs.list(undefined, currentUser?.id, isAdmin),
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

  const lighthouseScores = SCORE_KEYS
    .filter(({ key }) => metrics[key] != null)
    .map(({ key, label }) => ({
      key,
      label,
      score: Math.round((metrics[key] as number) * 100),
      color: scoreRating(metrics[key] as number),
    }));

  const overallScore = lighthouseScores.length > 0
    ? Math.round(lighthouseScores.reduce((s, x) => s + x.score, 0) / lighthouseScores.length)
    : null;

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

          {/* Lighthouse KPI Scores */}
          {lighthouseScores.length > 0 && (
            <div className="space-y-4">
              {/* Overall KPI */}
              {overallScore != null && (
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-medium text-gray-400">
                        <MetricTooltip metricKey="Lighthouse Score" className="text-gray-400">Overall Lighthouse Score</MetricTooltip>
                      </h2>
                      <p className="mt-1 text-xs text-gray-500">Average across all categories</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-5xl font-bold ${overallScore >= 90 ? "text-green-400" : overallScore >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                        {overallScore}
                      </span>
                      <span className="text-lg text-gray-500">/100</span>
                    </div>
                  </div>
                  <div className="mt-4 h-2.5 w-full rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${overallScore}%`,
                        backgroundColor: overallScore >= 90 ? COLORS.good : overallScore >= 50 ? COLORS.needs_improvement : COLORS.poor,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Category breakdown cards */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {lighthouseScores.map((item) => (
                  <div key={item.key} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                    <p className="text-xs font-medium text-gray-500">{item.label}</p>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-2xl font-bold" style={{ color: item.color }}>{item.score}</span>
                      <span className="text-xs text-gray-600">/100</span>
                    </div>
                    <div className="mt-3 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${item.score}%`, backgroundColor: item.color }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-gray-600">
                      {item.score >= 90 ? "Good" : item.score >= 50 ? "Needs Improvement" : "Poor"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lighthouse Radar Chart */}
          {lighthouseScores.length >= 3 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h2 className="mb-4 text-sm font-medium text-gray-300">Lighthouse Category Radar</h2>
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={lighthouseScores.map(s => ({ category: s.label, score: s.score, fullMark: 100 }))}>
                  <PolarGrid stroke="#374151" />
                  <PolarAngleAxis dataKey="category" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 10 }} />
                  <Radar name="Score" dataKey="score" stroke="#818cf8" fill="#818cf8" fillOpacity={0.3} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Core Web Vitals Gauge Rings */}
          {(() => {
            const cwvMetrics = [
              { key: "lcp_ms", label: "LCP", good: 2500, poor: 4000, max: 8000, unit: "ms" },
              { key: "fcp_ms", label: "FCP", good: 1800, poor: 3000, max: 6000, unit: "ms" },
              { key: "cls",    label: "CLS", good: 0.1,  poor: 0.25, max: 0.5, unit: "" },
              { key: "inp_ms", label: "INP", good: 200,  poor: 500,  max: 1000, unit: "ms" },
              { key: "ttfb_ms", label: "TTFB", good: 800, poor: 1800, max: 3600, unit: "ms" },
              { key: "tbt_ms", label: "TBT", good: 200, poor: 600, max: 1200, unit: "ms" },
            ].filter(m => metrics[m.key] != null);
            if (cwvMetrics.length === 0) return null;
            return (
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                <h2 className="mb-4 text-sm font-medium text-gray-300">Core Metrics Gauges</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {cwvMetrics.map(m => {
                    const val = metrics[m.key] as number;
                    const pct = Math.min(val / m.max, 1) * 100;
                    const color = val <= m.good ? COLORS.good : val <= m.poor ? COLORS.needs_improvement : COLORS.poor;
                    const gaugeData = [
                      { name: "value", value: pct, fill: color },
                      { name: "remaining", value: 100 - pct, fill: "#1f2937" },
                    ];
                    return (
                      <div key={m.key} className="flex flex-col items-center">
                        <div className="relative" style={{ width: 100, height: 100 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={gaugeData}
                                cx="50%" cy="50%"
                                innerRadius={30} outerRadius={42}
                                startAngle={90} endAngle={-270}
                                dataKey="value"
                                stroke="none"
                              >
                                {gaugeData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-sm font-bold" style={{ color }}>
                              {m.unit === "ms" ? Math.round(val) : val.toFixed(3)}
                            </span>
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">{m.label}</p>
                        <p className="text-[10px]" style={{ color }}>
                          {val <= m.good ? "Good" : val <= m.poor ? "Needs Work" : "Poor"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

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

          {/* Server Processing & Browser Rendering Breakdown */}
          {(() => {
            const tb = computeTimeBreakdown(metrics);
            const hasData = tb.serverProcessing != null || tb.browserRendering != null;
            if (!hasData) return null;

            const phases = [
              { label: "Server Processing", value: tb.serverProcessing, color: "#14b8a6", tooltipKey: "Server Processing", good: 200, poor: 500 },
              { label: "Network Latency", value: tb.networkLatency, color: "#8b5cf6", tooltipKey: "TTFB", good: 100, poor: 300 },
              { label: "DOM Processing", value: tb.domProcessing, color: "#f59e0b", tooltipKey: "FCP", good: 500, poor: 1500 },
              { label: "Browser Rendering", value: tb.browserRendering, color: "#06b6d4", tooltipKey: "Browser Rendering", good: 1000, poor: 2500 },
            ].filter((p) => p.value != null && p.value >= 0) as { label: string; value: number; color: string; tooltipKey: string; good: number; poor: number }[];

            const totalMs = phases.reduce((s, p) => s + p.value, 0);

            const barData = phases.map((p) => ({ name: p.label, value: p.value, fill: p.color }));

            return (
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                <h2 className="mb-4 text-sm font-medium text-gray-300">Server Processing & Browser Rendering Breakdown</h2>

                {/* Phase cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
                  {phases.map((p) => {
                    const pct = totalMs > 0 ? ((p.value / totalMs) * 100).toFixed(1) : "0";
                    const statusColor = p.value <= p.good ? "text-green-400" : p.value <= p.poor ? "text-yellow-400" : "text-red-400";
                    return (
                      <div key={p.label} className="rounded-lg border border-gray-800 bg-gray-800/40 p-3">
                        <MetricTooltip metricKey={p.tooltipKey} className="text-xs text-gray-500">{p.label}</MetricTooltip>
                        <p className={`mt-1 text-lg font-bold ${statusColor}`}>{Math.round(p.value)} ms</p>
                        <p className="text-[10px] text-gray-600">{pct}% of total</p>
                      </div>
                    );
                  })}
                </div>

                {/* Stacked waterfall bar */}
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-2">Time Waterfall ({totalMs} ms total)</p>
                  <div className="flex h-8 w-full overflow-hidden rounded-md">
                    {phases.map((p) => (
                      <div
                        key={p.label}
                        className="flex items-center justify-center text-[10px] font-medium text-white/90 transition-all"
                        style={{ width: `${totalMs > 0 ? (p.value / totalMs) * 100 : 0}%`, backgroundColor: p.color, minWidth: phases.length > 0 ? "2%" : undefined }}
                        title={`${p.label}: ${p.value} ms`}
                      >
                        {totalMs > 0 && (p.value / totalMs) > 0.1 ? p.label.split(" ")[0] : ""}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-4 mt-2">
                    {phases.map((p) => (
                      <span key={p.label} className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Horizontal bar chart */}
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={barData} layout="vertical" margin={{ top: 5, right: 30, left: 120, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} unit=" ms" />
                    <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} width={110} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                      formatter={(value: number) => [`${value} ms`, "Duration"]}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {barData.map((entry, index) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}

          {/* Raw metrics JSON */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-3 text-sm font-medium text-gray-300">Raw Metrics</h2>
            <pre className="overflow-auto rounded-md bg-gray-800 p-4 text-xs text-gray-300 max-h-64">
              {JSON.stringify(metrics, null, 2)}
            </pre>
          </div>

          {/* Score Explanations */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-white mb-1">Lighthouse Score Breakdown</h2>
              <p className="text-xs text-gray-500">
                Each Lighthouse category score is 0–100. Scores are computed by running audits, converting raw values to 0–1 via a
                <strong className="text-gray-300"> log-normal scoring curve</strong>, then applying category-specific weights.
                Scores ≥ 90 are <span className="text-green-400 font-medium">Good</span>, 50–89 are
                <span className="text-yellow-400 font-medium"> Needs Improvement</span>, and &lt; 50 are
                <span className="text-red-400 font-medium"> Poor</span>.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Performance */}
              <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
                <h3 className="text-sm font-semibold text-indigo-400 mb-2">Performance (Lighthouse 11)</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Measures how fast the page loads and becomes interactive. The score is a <strong className="text-gray-300">weighted average</strong> of 5 lab metrics, each scored on a log-normal curve derived from real HTTP Archive data.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-700">
                      <th className="text-left py-1 pr-2">Metric</th>
                      <th className="text-right py-1 px-2">Weight</th>
                      <th className="text-right py-1">Good Threshold</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">FCP (First Contentful Paint)</td><td className="text-right px-2">10%</td><td className="text-right text-green-400">≤ 1.8s</td></tr>
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">SI (Speed Index)</td><td className="text-right px-2">10%</td><td className="text-right text-green-400">≤ 3.4s</td></tr>
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">LCP (Largest Contentful Paint)</td><td className="text-right px-2">25%</td><td className="text-right text-green-400">≤ 2.5s</td></tr>
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">TBT (Total Blocking Time)</td><td className="text-right px-2">30%</td><td className="text-right text-green-400">≤ 200ms</td></tr>
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">CLS (Cumulative Layout Shift)</td><td className="text-right px-2">25%</td><td className="text-right text-green-400">≤ 0.1</td></tr>
                  </tbody>
                </table>
                <div className="mt-3 rounded-md border border-indigo-900/40 bg-indigo-900/10 p-2">
                  <p className="text-[11px] text-indigo-300 font-medium">How to improve:</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                    <li>- Optimize images (WebP/AVIF, responsive sizes, lazy-load below fold)</li>
                    <li>- Remove render-blocking JS/CSS, defer non-critical scripts</li>
                    <li>- Reduce server response time (TTFB) with caching/CDN</li>
                    <li>- Code-split JS bundles, tree-shake unused modules</li>
                    <li>- Set explicit dimensions on images/videos to reduce CLS</li>
                  </ul>
                </div>
              </div>

              {/* Accessibility */}
              <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
                <h3 className="text-sm font-semibold text-purple-400 mb-2">Accessibility</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Runs ~50 automated audits based on the <strong className="text-gray-300">axe-core library</strong> and WCAG 2.1 guidelines. Each audit is pass/fail/not-applicable. The score = (passing audits ÷ applicable audits) × 100. All applicable audits are <strong className="text-gray-300">weighted equally</strong>.
                </p>
                <p className="text-xs text-gray-500 mb-2">Key audit categories:</p>
                <ul className="space-y-0.5 text-[11px] text-gray-400">
                  <li>- <strong className="text-gray-300">Color Contrast</strong> — text must have ≥ 4.5:1 contrast ratio</li>
                  <li>- <strong className="text-gray-300">Alt Text</strong> — all images need descriptive alt attributes</li>
                  <li>- <strong className="text-gray-300">ARIA</strong> — roles, labels, and states must be valid and complete</li>
                  <li>- <strong className="text-gray-300">Keyboard Navigation</strong> — all interactive elements must be focusable</li>
                  <li>- <strong className="text-gray-300">Semantic HTML</strong> — headings in order, landmarks present, form labels</li>
                  <li>- <strong className="text-gray-300">Document</strong> — valid lang attribute, meta viewport not blocking zoom</li>
                </ul>
                <div className="mt-3 rounded-md border border-purple-900/40 bg-purple-900/10 p-2">
                  <p className="text-[11px] text-purple-300 font-medium">How to improve:</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                    <li>- Fix color contrast issues (use a contrast checker)</li>
                    <li>- Add alt text to every image; use aria-label on icon buttons</li>
                    <li>- Ensure all form inputs have associated labels</li>
                    <li>- Use semantic elements (&lt;nav&gt;, &lt;main&gt;, &lt;header&gt;, &lt;button&gt;)</li>
                    <li>- Note: automated tests catch ~30% of real a11y issues — manual testing is also needed</li>
                  </ul>
                </div>
              </div>

              {/* Best Practices */}
              <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
                <h3 className="text-sm font-semibold text-cyan-400 mb-2">Best Practices</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Checks ~15 audits for modern web development standards and security. Like Accessibility, the score = (passing ÷ applicable) × 100 with <strong className="text-gray-300">equal weight per audit</strong>.
                </p>
                <p className="text-xs text-gray-500 mb-2">What it checks:</p>
                <ul className="space-y-0.5 text-[11px] text-gray-400">
                  <li>- <strong className="text-gray-300">HTTPS</strong> — page and all sub-resources served over HTTPS</li>
                  <li>- <strong className="text-gray-300">No console errors</strong> — no JS errors logged to the browser console</li>
                  <li>- <strong className="text-gray-300">Image aspect ratios</strong> — displayed size matches natural size</li>
                  <li>- <strong className="text-gray-300">Deprecated APIs</strong> — no use of deprecated web platform APIs</li>
                  <li>- <strong className="text-gray-300">CSP / XSS</strong> — Content Security Policy present, no XSS vulnerabilities</li>
                  <li>- <strong className="text-gray-300">Source maps</strong> — source maps detected for debugging</li>
                  <li>- <strong className="text-gray-300">Charset declaration</strong> — UTF-8 charset declared in first 1024 bytes</li>
                </ul>
                <div className="mt-3 rounded-md border border-cyan-900/40 bg-cyan-900/10 p-2">
                  <p className="text-[11px] text-cyan-300 font-medium">How to improve:</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                    <li>- Migrate all resources to HTTPS</li>
                    <li>- Fix JS errors visible in the browser console</li>
                    <li>- Serve images at their displayed dimensions</li>
                    <li>- Replace deprecated APIs (document.write, etc.)</li>
                    <li>- Add a Content Security Policy header</li>
                  </ul>
                </div>
              </div>

              {/* SEO */}
              <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
                <h3 className="text-sm font-semibold text-emerald-400 mb-2">SEO</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Checks ~13 audits for baseline search-engine-optimization hygiene. Score = (passing ÷ applicable) × 100, <strong className="text-gray-300">equally weighted</strong>. This tests technical SEO — not content quality, backlinks, or domain authority.
                </p>
                <p className="text-xs text-gray-500 mb-2">What it checks:</p>
                <ul className="space-y-0.5 text-[11px] text-gray-400">
                  <li>- <strong className="text-gray-300">Meta description</strong> — present and not empty</li>
                  <li>- <strong className="text-gray-300">HTTP status</strong> — page returns 2xx status code</li>
                  <li>- <strong className="text-gray-300">Crawlable links</strong> — links use &lt;a href&gt;, not JS-only navigation</li>
                  <li>- <strong className="text-gray-300">robots.txt</strong> — valid and doesn't block page</li>
                  <li>- <strong className="text-gray-300">Indexable</strong> — no noindex meta tag or header</li>
                  <li>- <strong className="text-gray-300">Structured data</strong> — JSON-LD/microdata is valid (if present)</li>
                  <li>- <strong className="text-gray-300">Viewport meta</strong> — &lt;meta name="viewport"&gt; is present</li>
                  <li>- <strong className="text-gray-300">Font legibility</strong> — text is ≥ 12px on mobile</li>
                  <li>- <strong className="text-gray-300">Tap targets</strong> — buttons/links have adequate spacing</li>
                </ul>
                <div className="mt-3 rounded-md border border-emerald-900/40 bg-emerald-900/10 p-2">
                  <p className="text-[11px] text-emerald-300 font-medium">How to improve:</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                    <li>- Add unique, descriptive &lt;title&gt; and &lt;meta description&gt; per page</li>
                    <li>- Use semantic heading hierarchy (h1 → h2 → h3)</li>
                    <li>- Ensure all links are crawlable &lt;a href="..."&gt;</li>
                    <li>- Add a valid robots.txt and XML sitemap</li>
                    <li>- Set viewport meta for mobile responsiveness</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Parameters that affect scores */}
            <div className="rounded-md border border-gray-800 bg-gray-800/20 p-4">
              <h3 className="text-sm font-semibold text-yellow-400 mb-2">Test Parameters That Change Scores</h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-3">
                The same URL can produce very different scores depending on how Lighthouse runs. These parameters are configurable in our test runner:
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Device (desktop / mobile)</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Mobile applies 4× CPU throttling and slower network (simulated 4G). Desktop has no CPU throttle and faster network. Switching from mobile → desktop typically <span className="text-green-400">increases Performance by 10–30 pts</span>.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Number of Iterations (n_runs)</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    We report the <span className="text-gray-300 font-medium">median</span> across iterations. More runs (5–10) reduces variance and gives a more stable score. Single runs can fluctuate ± 5–8 pts.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Viewport Size</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Affects which LCP element is in view, how images load, and CLS measurement. Narrow viewports may trigger different responsive layouts and larger CLS values.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Network Conditions</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Lighthouse simulates network throttling. Actual throughput of the test machine's network also matters. Testing from a slow connection increases TTFB and all loading metrics.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Server Warm/Cold State</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    First run after a deploy may have cold caches (CDN, DB, application). Subsequent runs with warm caches often produce <span className="text-green-400">better TTFB and overall scores</span>.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Third-Party Scripts</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Ad networks, analytics, chat widgets, etc. can add 500ms–2s of TBT and degrade Performance score significantly. <span className="text-yellow-400">Blocking 3rd-parties</span> during testing isolates your own code's performance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Cross-run comparison charts (always visible when runs exist) */}
      {completedRuns.length >= 2 && (() => {
        const scatterData = completedRuns
          .filter((r: any) => r.metrics?.fcp_ms != null && r.metrics?.lcp_ms != null)
          .map((r: any) => ({
            fcp: Math.round(r.metrics.fcp_ms),
            lcp: Math.round(r.metrics.lcp_ms),
            lh: Math.round((r.metrics.lighthouse_performance_score ?? 0) * 100),
            url: (r.config?.url ?? "").replace(/^https?:\/\//, "").slice(0, 30),
            id: r.id.slice(0, 8),
          }));

        const lhDistribution = completedRuns
          .filter((r: any) => r.metrics?.lighthouse_performance_score != null)
          .map((r: any) => {
            const score = Math.round((r.metrics.lighthouse_performance_score as number) * 100);
            return {
              name: new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + r.id.slice(0, 4),
              score,
              fill: score >= 90 ? COLORS.good : score >= 50 ? COLORS.needs_improvement : COLORS.poor,
            };
          })
          .slice(-20); // last 20 runs

        return (
          <div className="space-y-6">
            {scatterData.length >= 2 && (
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                <h2 className="mb-1 text-sm font-medium text-gray-300">FCP vs LCP Scatter — All Completed Runs</h2>
                <p className="mb-4 text-xs text-gray-500">Each dot is a completed run. Color shows Lighthouse Performance score.</p>
                <ResponsiveContainer width="100%" height={320}>
                  <ScatterChart margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis type="number" dataKey="fcp" name="FCP" unit=" ms" tick={{ fill: "#9ca3af", fontSize: 11 }} label={{ value: "FCP (ms)", position: "insideBottomRight", offset: -5, fill: "#6b7280", fontSize: 11 }} />
                    <YAxis type="number" dataKey="lcp" name="LCP" unit=" ms" tick={{ fill: "#9ca3af", fontSize: 11 }} label={{ value: "LCP (ms)", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }} />
                    <ZAxis type="number" dataKey="lh" range={[40, 200]} name="LH Score" />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                      formatter={(value: number, name: string) => [`${value} ${name === "LH Score" ? "/100" : "ms"}`, name]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.url ?? ""}
                    />
                    <Legend />
                    <Scatter name="Runs" data={scatterData} fill="#818cf8">
                      {scatterData.map((d, i) => (
                        <Cell key={i} fill={d.lh >= 90 ? COLORS.good : d.lh >= 50 ? COLORS.needs_improvement : COLORS.poor} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            )}

            {lhDistribution.length >= 2 && (
              <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                <h2 className="mb-1 text-sm font-medium text-gray-300">Lighthouse Performance Score History</h2>
                <p className="mb-4 text-xs text-gray-500">Recent completed runs. Green ≥ 90, Yellow ≥ 50, Red &lt; 50.</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={lhDistribution} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={50} />
                    <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                      formatter={(value: number) => [`${value}/100`, "Performance"]}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                      {lhDistribution.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        );
      })()}

      {!selectedRunId && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-12 text-center text-gray-500">
          <p className="text-lg">Select a test execution above to view results</p>
          <p className="mt-2 text-sm">Completed runs will appear in the dropdown with their URL and timestamp</p>
        </div>
      )}
    </div>
  );
}
