"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState, useMemo } from "react";
import { useProjects } from "@/hooks/use-projects";

const METRICS: Record<string, { label: string; unit: string; good: number; poor: number }> = {
  lcp_ms: { label: "LCP", unit: "ms", good: 2500, poor: 4000 },
  fcp_ms: { label: "FCP", unit: "ms", good: 1800, poor: 3000 },
  cls: { label: "CLS", unit: "", good: 0.1, poor: 0.25 },
  ttfb_ms: { label: "TTFB", unit: "ms", good: 800, poor: 1800 },
  inp_ms: { label: "INP", unit: "ms", good: 200, poor: 500 },
  tbt_ms: { label: "TBT", unit: "ms", good: 200, poor: 600 },
  lighthouse_performance_score: { label: "Perf Score", unit: "", good: 0.9, poor: 0.5 },
};

const FORECAST_METRICS = [
  { value: "lcp_ms", label: "LCP" },
  { value: "fcp_ms", label: "FCP" },
  { value: "cls", label: "CLS" },
  { value: "ttfb_ms", label: "TTFB" },
  { value: "tbt_ms", label: "TBT" },
  { value: "lighthouse_performance_score", label: "Perf Score" },
];

function fmt(v: number, key: string) {
  if (key === "cls") return v.toFixed(3);
  if (key.includes("score")) return (v * 100).toFixed(0);
  return Math.round(v).toString();
}

function ratingFor(v: number, key: string): "good" | "needs-improvement" | "poor" {
  const m = METRICS[key];
  if (!m) return "good";
  if (key.includes("score")) return v >= m.good ? "good" : v >= m.poor ? "needs-improvement" : "poor";
  return v <= m.good ? "good" : v <= m.poor ? "needs-improvement" : "poor";
}

const ratingStyle: Record<string, string> = {
  good: "bg-green-900/30 text-green-400",
  "needs-improvement": "bg-yellow-900/30 text-yellow-400",
  poor: "bg-red-900/30 text-red-400",
};

type TabKey = "overview" | "trends" | "pages" | "environments" | "scores" | "recommendations" | "attribution" | "forecast" | "rum" | "crux" | "capacity";

export default function IntelligencePage() {
  const queryClient = useQueryClient();
  const { projects, projectId, setProjectId } = useProjects();
  const [tab, setTab] = useState<TabKey>("overview");
  const [forecastMetric, setForecastMetric] = useState("lcp_ms");

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(),
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => api.scripts.list(),
  });

  const completed = useMemo(() =>
    runs
      .filter((r: any) => r.status === "completed" && r.metrics && (!projectId || r.project_id === projectId))
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [runs, projectId]
  );

  // Metric health overview: latest average per metric with rating
  const metricHealth = useMemo(() => {
    const recent = completed.slice(-20);
    if (recent.length === 0) return [];
    return Object.entries(METRICS).map(([key, meta]) => {
      const vals = recent.map((r: any) => r.metrics?.[key]).filter((v: any) => v != null) as number[];
      if (vals.length === 0) return null;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const rating = ratingFor(avg, key);
      return { key, ...meta, avg, min, max, rating, sampleCount: vals.length };
    }).filter(Boolean);
  }, [completed]);

  // Trend: metric values over last N runs
  const trendData = useMemo(() => {
    if (completed.length < 2) return [];
    const metricKeys = ["lcp_ms", "fcp_ms", "cls", "ttfb_ms"];
    return metricKeys.map((key) => {
      const points = completed.slice(-30).map((r: any) => ({
        date: new Date(r.created_at).toLocaleDateString(),
        value: r.metrics?.[key] as number | undefined,
        url: r.config?.url ?? "",
      })).filter((p) => p.value != null);

      if (points.length < 2) return null;
      const first5avg = points.slice(0, Math.min(5, points.length)).reduce((s, p) => s + (p.value ?? 0), 0) / Math.min(5, points.length);
      const last5avg = points.slice(-5).reduce((s, p) => s + (p.value ?? 0), 0) / Math.min(5, points.length);
      const changePct = first5avg !== 0 ? ((last5avg - first5avg) / first5avg) * 100 : 0;
      const direction = changePct > 5 ? "degrading" : changePct < -5 ? "improving" : "stable";

      return {
        key,
        label: METRICS[key].label,
        unit: METRICS[key].unit,
        points,
        changePct,
        direction,
        first5avg,
        last5avg,
      };
    }).filter(Boolean);
  }, [completed]);

  // Top slowest pages by LCP
  const slowestPages = useMemo(() => {
    const urlMap: Record<string, { lcps: number[]; fcps: number[]; count: number }> = {};
    completed.forEach((r: any) => {
      const url = r.config?.url;
      if (!url) return;
      if (!urlMap[url]) urlMap[url] = { lcps: [], fcps: [], count: 0 };
      urlMap[url].count++;
      if (r.metrics?.lcp_ms != null) urlMap[url].lcps.push(r.metrics.lcp_ms);
      if (r.metrics?.fcp_ms != null) urlMap[url].fcps.push(r.metrics.fcp_ms);
    });
    return Object.entries(urlMap)
      .map(([url, data]) => ({
        url,
        avgLcp: data.lcps.length > 0 ? data.lcps.reduce((a, b) => a + b, 0) / data.lcps.length : null,
        avgFcp: data.fcps.length > 0 ? data.fcps.reduce((a, b) => a + b, 0) / data.fcps.length : null,
        runs: data.count,
      }))
      .filter((p) => p.avgLcp != null)
      .sort((a, b) => (b.avgLcp ?? 0) - (a.avgLcp ?? 0))
      .slice(0, 10);
  }, [completed]);

  // Environment comparison
  const envComparison = useMemo(() => {
    const envMap: Record<string, any[]> = {};
    completed.forEach((r: any) => {
      const env = r.environment ?? "staging";
      if (!envMap[env]) envMap[env] = [];
      envMap[env].push(r);
    });
    return Object.entries(envMap).map(([env, envRuns]) => {
      const lcps = envRuns.map((r) => r.metrics?.lcp_ms).filter((v: any) => v != null) as number[];
      const fcps = envRuns.map((r) => r.metrics?.fcp_ms).filter((v: any) => v != null) as number[];
      const perfs = envRuns.map((r) => r.metrics?.lighthouse_performance_score).filter((v: any) => v != null) as number[];
      return {
        env,
        count: envRuns.length,
        avgLcp: lcps.length > 0 ? lcps.reduce((a, b) => a + b, 0) / lcps.length : null,
        avgFcp: fcps.length > 0 ? fcps.reduce((a, b) => a + b, 0) / fcps.length : null,
        avgPerf: perfs.length > 0 ? perfs.reduce((a, b) => a + b, 0) / perfs.length : null,
      };
    });
  }, [completed]);

  // Score distribution
  const scoreDistribution = useMemo(() => {
    const scores = completed
      .map((r: any) => r.metrics?.lighthouse_performance_score)
      .filter((v: any) => v != null) as number[];
    if (scores.length === 0) return null;
    const buckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
    scores.forEach((s) => {
      const pct = Math.min(s * 100, 100);
      const idx = Math.min(Math.floor(pct / 20), 4);
      buckets[idx]++;
    });
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const median = [...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)];
    const p90 = [...scores].sort((a, b) => a - b)[Math.floor(scores.length * 0.9)];
    return { buckets, total: scores.length, avg, median, p90 };
  }, [completed]);

  // Recommendations
  const recommendations = useMemo(() => {
    if (completed.length === 0) return [];
    const recs: { priority: "critical" | "warning" | "info"; title: string; detail: string }[] = [];
    const recent = completed.slice(-10);

    // Check each metric
    for (const [key, meta] of Object.entries(METRICS)) {
      const vals = recent.map((r: any) => r.metrics?.[key]).filter((v: any) => v != null) as number[];
      if (vals.length === 0) continue;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const rating = ratingFor(avg, key);
      if (rating === "poor") {
        recs.push({
          priority: "critical",
          title: `${meta.label} is in the poor range`,
          detail: `Average ${meta.label} is ${fmt(avg, key)}${meta.unit} (threshold: ${key.includes("score") ? `≥${meta.good * 100}` : `≤${meta.good}${meta.unit}`}). Investigate server response times, resource loading, and optimize critical rendering path.`,
        });
      } else if (rating === "needs-improvement") {
        recs.push({
          priority: "warning",
          title: `${meta.label} needs improvement`,
          detail: `Average ${meta.label} is ${fmt(avg, key)}${meta.unit}. Consider optimizing to reach the "good" threshold of ${key.includes("score") ? `${meta.good * 100}` : `${meta.good}${meta.unit}`}.`,
        });
      }
    }

    // Check for high failure rate
    const allRecent = runs.filter((r: any) => !projectId || r.project_id === projectId).slice(-20);
    const failed = allRecent.filter((r: any) => r.status === "failed").length;
    if (allRecent.length > 0 && failed / allRecent.length > 0.2) {
      recs.push({
        priority: "critical",
        title: "High failure rate detected",
        detail: `${failed} of the last ${allRecent.length} runs failed (${Math.round(failed / allRecent.length * 100)}%). Check script configurations and target URLs for errors.`,
      });
    }

    // Check for low test coverage
    const uniqueUrls = new Set(completed.map((r: any) => r.config?.url).filter(Boolean));
    if (uniqueUrls.size <= 1 && completed.length > 5) {
      recs.push({
        priority: "info",
        title: "Limited URL coverage",
        detail: `Only ${uniqueUrls.size} unique URL${uniqueUrls.size === 1 ? "" : "s"} tested. Consider adding more pages to your test scripts for broader coverage.`,
      });
    }

    // Check trend degradation
    for (const t of trendData) {
      if (!t) continue;
      if ((t as any).direction === "degrading" && Math.abs((t as any).changePct) > 15) {
        recs.push({
          priority: "warning",
          title: `${(t as any).label} is degrading significantly`,
          detail: `${(t as any).label} has degraded ${Math.abs((t as any).changePct).toFixed(0)}% from early to recent runs. Investigate recent deployments or infrastructure changes.`,
        });
      }
    }

    // Sort by priority
    const order = { critical: 0, warning: 1, info: 2 };
    return recs.sort((a, b) => order[a.priority] - order[b.priority]);
  }, [completed, runs, projectId, trendData]);

  // ── API-backed intelligence data (only fetched when project selected) ──

  const { data: attributions = [] } = useQuery({
    queryKey: ["intelligence-attribution", projectId],
    queryFn: () => api.intelligence.attribution.list(projectId),
    enabled: !!projectId,
  });

  const { data: forecasts = [] } = useQuery({
    queryKey: ["intelligence-forecast", projectId],
    queryFn: () => api.intelligence.forecast.list(projectId),
    enabled: !!projectId,
  });

  const forecastMut = useMutation({
    mutationFn: (data: any) => api.intelligence.forecast.generate(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intelligence-forecast", projectId] }),
  });

  const { data: rumSummary = [] } = useQuery({
    queryKey: ["intelligence-rum", projectId],
    queryFn: () => api.intelligence.rum.summary(projectId),
    enabled: !!projectId,
  });

  const { data: cruxSnapshots = [] } = useQuery({
    queryKey: ["intelligence-crux", projectId],
    queryFn: () => api.intelligence.crux.list(projectId),
    enabled: !!projectId,
  });

  const { data: capacityReports = [] } = useQuery({
    queryKey: ["intelligence-capacity", projectId],
    queryFn: () => api.intelligence.capacity.listReports(projectId),
    enabled: !!projectId,
  });

  const capacityMut = useMutation({
    mutationFn: () => api.intelligence.capacity.generateReport({ project_id: projectId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["intelligence-capacity", projectId] }),
  });

  const tabs = [
    { key: "overview", label: "Health Overview" },
    { key: "trends", label: "Trends" },
    { key: "pages", label: "Slowest Pages" },
    { key: "environments", label: "Environments" },
    { key: "scores", label: "Score Distribution" },
    { key: "recommendations", label: "Recommendations" },
    { key: "attribution", label: "SHAP Attribution" },
    { key: "forecast", label: "Forecast" },
    { key: "rum", label: "RUM" },
    { key: "crux", label: "CrUX" },
    { key: "capacity", label: "Capacity" },
  ] as const;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Intelligence</h1>
          <p className="mt-1 text-sm text-gray-400">
            Performance insights derived from your test runs
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

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? "border-indigo-500 text-indigo-400" : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
            {t.key === "recommendations" && recommendations.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600/80 px-1 text-[10px] font-bold text-white">
                {recommendations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading data...</div>
      ) : completed.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          No completed runs with metrics found. Run some performance tests to see intelligence data.
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {tab === "overview" && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-gray-400">Core Web Vitals &amp; Metric Health (last 20 runs)</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {metricHealth.map((m: any) => (
                  <div key={m.key} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-200">{m.label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ratingStyle[m.rating]}`}>
                        {m.rating === "needs-improvement" ? "Needs Work" : m.rating}
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-white">
                      {fmt(m.avg, m.key)}<span className="ml-1 text-xs font-normal text-gray-500">{m.unit || (m.key.includes("score") ? "/100" : "")}</span>
                    </p>
                    <div className="mt-2 flex items-center gap-4 text-[10px] text-gray-500">
                      <span>Min: {fmt(m.min, m.key)}{m.unit}</span>
                      <span>Max: {fmt(m.max, m.key)}{m.unit}</span>
                      <span>{m.sampleCount} samples</span>
                    </div>
                  </div>
                ))}
              </div>
              {metricHealth.length === 0 && (
                <p className="text-sm text-gray-500">No metric data available in recent runs.</p>
              )}
            </div>
          )}

          {/* Trends Tab */}
          {tab === "trends" && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-gray-400">Metric Trends (last 30 runs)</h2>
              {trendData.length === 0 ? (
                <p className="text-sm text-gray-500">Need at least 2 runs to show trends.</p>
              ) : (
                <div className="space-y-4">
                  {trendData.map((t: any) => (
                    <div key={t.key} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-200">{t.label}</span>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            t.direction === "improving" ? "bg-green-900/30 text-green-400" :
                            t.direction === "degrading" ? "bg-red-900/30 text-red-400" :
                            "bg-gray-800 text-gray-400"
                          }`}>
                            {t.direction === "improving" ? "↓ Improving" : t.direction === "degrading" ? "↑ Degrading" : "→ Stable"}
                          </span>
                          <span className="text-xs text-gray-500">{t.changePct > 0 ? "+" : ""}{t.changePct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span>Early avg: <span className="font-mono text-gray-300">{fmt(t.first5avg, t.key)}{t.unit}</span></span>
                        <span>→</span>
                        <span>Recent avg: <span className="font-mono text-gray-300">{fmt(t.last5avg, t.key)}{t.unit}</span></span>
                      </div>
                      {/* Mini bar chart of values */}
                      <div className="mt-3 flex items-end gap-px h-12">
                        {t.points.map((p: any, i: number) => {
                          const maxVal = Math.max(...t.points.map((pp: any) => pp.value));
                          const pct = maxVal > 0 ? (p.value / maxVal) * 100 : 0;
                          const m = METRICS[t.key];
                          const color = p.value <= m.good ? "bg-green-500" : p.value <= m.poor ? "bg-yellow-500" : "bg-red-500";
                          return (
                            <div
                              key={i}
                              className={`flex-1 rounded-t ${color} opacity-70 hover:opacity-100 transition-opacity`}
                              style={{ height: `${Math.max(pct, 4)}%` }}
                              title={`${p.date}: ${fmt(p.value, t.key)}${t.unit}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pages Tab */}
          {tab === "pages" && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-gray-400">Slowest Pages by Average LCP</h2>
              {slowestPages.length === 0 ? (
                <p className="text-sm text-gray-500">No page-level data available.</p>
              ) : (
                <div className="rounded-lg border border-gray-800 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs text-gray-400">URL</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-400">Avg LCP</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-400">Avg FCP</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-400">Runs</th>
                        <th className="px-4 py-2 text-right text-xs text-gray-400">Rating</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {slowestPages.map((p) => {
                        const rating = p.avgLcp != null ? ratingFor(p.avgLcp, "lcp_ms") : "good";
                        return (
                          <tr key={p.url} className="hover:bg-gray-800/30">
                            <td className="px-4 py-2 text-gray-300 truncate max-w-[300px]">{p.url}</td>
                            <td className={`px-4 py-2 text-right font-mono text-xs ${ratingStyle[rating]?.split(" ")[1] ?? "text-gray-400"}`}>
                              {p.avgLcp != null ? `${Math.round(p.avgLcp)} ms` : "—"}
                            </td>
                            <td className="px-4 py-2 text-right font-mono text-xs text-gray-400">
                              {p.avgFcp != null ? `${Math.round(p.avgFcp)} ms` : "—"}
                            </td>
                            <td className="px-4 py-2 text-right text-xs text-gray-500">{p.runs}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ratingStyle[rating]}`}>
                                {rating === "needs-improvement" ? "Needs Work" : rating}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Environments Tab */}
          {tab === "environments" && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-gray-400">Environment Comparison</h2>
              {envComparison.length === 0 ? (
                <p className="text-sm text-gray-500">No environment data available.</p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {envComparison.map((e) => (
                    <div key={e.env} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold text-gray-200 capitalize">{e.env}</span>
                        <span className="text-xs text-gray-500">{e.count} runs</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Avg LCP</span>
                          <span className={`font-mono ${e.avgLcp != null ? (e.avgLcp <= 2500 ? "text-green-400" : e.avgLcp <= 4000 ? "text-yellow-400" : "text-red-400") : "text-gray-600"}`}>
                            {e.avgLcp != null ? `${Math.round(e.avgLcp)} ms` : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Avg FCP</span>
                          <span className={`font-mono ${e.avgFcp != null ? (e.avgFcp <= 1800 ? "text-green-400" : e.avgFcp <= 3000 ? "text-yellow-400" : "text-red-400") : "text-gray-600"}`}>
                            {e.avgFcp != null ? `${Math.round(e.avgFcp)} ms` : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Avg Perf Score</span>
                          <span className={`font-mono ${e.avgPerf != null ? (e.avgPerf >= 0.9 ? "text-green-400" : e.avgPerf >= 0.5 ? "text-yellow-400" : "text-red-400") : "text-gray-600"}`}>
                            {e.avgPerf != null ? Math.round(e.avgPerf * 100) : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Score Distribution Tab */}
          {tab === "scores" && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-gray-400">Lighthouse Performance Score Distribution</h2>
              {!scoreDistribution ? (
                <p className="text-sm text-gray-500">No Lighthouse score data available.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <p className="text-xs text-gray-500">Average</p>
                      <p className="mt-1 text-2xl font-bold text-white">{Math.round(scoreDistribution.avg * 100)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <p className="text-xs text-gray-500">Median</p>
                      <p className="mt-1 text-2xl font-bold text-white">{Math.round(scoreDistribution.median * 100)}</p>
                    </div>
                    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <p className="text-xs text-gray-500">p90</p>
                      <p className="mt-1 text-2xl font-bold text-white">{Math.round(scoreDistribution.p90 * 100)}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
                    <h3 className="mb-4 text-xs font-medium text-gray-500">Score Buckets ({scoreDistribution.total} runs)</h3>
                    <div className="space-y-2">
                      {["0–19", "20–39", "40–59", "60–79", "80–100"].map((label, i) => {
                        const count = scoreDistribution.buckets[i];
                        const pct = scoreDistribution.total > 0 ? (count / scoreDistribution.total) * 100 : 0;
                        const colors = ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-lime-500", "bg-green-500"];
                        return (
                          <div key={label} className="flex items-center gap-3">
                            <span className="w-16 text-xs text-gray-500 text-right font-mono">{label}</span>
                            <div className="flex-1 h-5 rounded-full bg-gray-800 overflow-hidden">
                              <div className={`h-full rounded-full ${colors[i]} transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-12 text-xs text-gray-400 text-right">{count} ({pct.toFixed(0)}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Recommendations Tab */}
          {tab === "recommendations" && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-gray-400">Actionable Recommendations</h2>
              {recommendations.length === 0 ? (
                <div className="rounded-lg border border-green-800/50 bg-green-900/10 p-6 text-center">
                  <p className="text-sm text-green-400 font-medium">All clear!</p>
                  <p className="mt-1 text-xs text-gray-500">No actionable recommendations at this time. Your metrics look healthy.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recommendations.map((rec, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-4 ${
                        rec.priority === "critical" ? "border-red-800/50 bg-red-900/10" :
                        rec.priority === "warning" ? "border-yellow-800/50 bg-yellow-900/10" :
                        "border-blue-800/50 bg-blue-900/10"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          rec.priority === "critical" ? "bg-red-900/40 text-red-400" :
                          rec.priority === "warning" ? "bg-yellow-900/40 text-yellow-400" :
                          "bg-blue-900/40 text-blue-400"
                        }`}>
                          {rec.priority}
                        </span>
                        <span className="text-sm font-medium text-gray-200">{rec.title}</span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{rec.detail}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SHAP Attribution Tab */}
          {tab === "attribution" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-400">SHAP Feature Attribution</h2>
              </div>
              {!projectId ? (
                <p className="text-sm text-gray-500">Select a project to view attribution data.</p>
              ) : attributions.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
                  <p className="text-sm">No attribution analyses found for this project.</p>
                  <p className="mt-1 text-xs">Run a SHAP attribution analysis via the API to see feature importance.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {attributions.slice(0, 10).map((a: any, idx: number) => (
                    <div key={a.id ?? idx} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-200">
                          {a.metric ?? a.target_metric ?? "Attribution"} — {a.method ?? "permutation"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {a.created_at ? new Date(a.created_at).toLocaleString() : ""}
                        </span>
                      </div>
                      {a.features && Array.isArray(a.features) && (
                        <div className="space-y-1.5">
                          {(a.features as any[]).slice(0, 8).map((f: any, fi: number) => {
                            const maxImp = Math.max(...(a.features as any[]).map((ff: any) => Math.abs(ff.importance ?? ff.value ?? 0)));
                            const imp = Math.abs(f.importance ?? f.value ?? 0);
                            const pct = maxImp > 0 ? (imp / maxImp) * 100 : 0;
                            return (
                              <div key={fi} className="flex items-center gap-3">
                                <span className="w-32 text-xs text-gray-400 truncate">{f.name ?? f.feature}</span>
                                <div className="flex-1 h-4 rounded bg-gray-800 overflow-hidden">
                                  <div className="h-full rounded bg-indigo-500" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-16 text-xs text-right font-mono text-gray-300">{imp.toFixed(3)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Forecast Tab */}
          {tab === "forecast" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-400">Performance Forecast</h2>
                {projectId && (
                  <div className="flex items-center gap-2">
                    <select
                      value={forecastMetric}
                      onChange={(e) => setForecastMetric(e.target.value)}
                      className="rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200"
                    >
                      {FORECAST_METRICS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => forecastMut.mutate({ project_id: projectId, metric: forecastMetric, horizon_days: 14 })}
                      disabled={forecastMut.isPending}
                      className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {forecastMut.isPending ? "Generating…" : "Generate Forecast"}
                    </button>
                  </div>
                )}
              </div>
              {!projectId ? (
                <p className="text-sm text-gray-500">Select a project to view forecasts.</p>
              ) : forecasts.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
                  <p className="text-sm">No forecasts generated yet.</p>
                  <p className="mt-1 text-xs">Select a metric and click &quot;Generate Forecast&quot; to create a prediction.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {forecasts.slice(0, 10).map((f: any, idx: number) => (
                    <div key={f.id ?? idx} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-200">{f.metric ?? "Metric"}</span>
                        <span className="text-xs text-gray-500">{f.created_at ? new Date(f.created_at).toLocaleString() : ""}</span>
                      </div>
                      {f.predictions && Array.isArray(f.predictions) && (
                        <div className="overflow-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 border-b border-gray-800">
                                <th className="text-left py-1 px-2">Date</th>
                                <th className="text-right py-1 px-2">Predicted</th>
                                <th className="text-right py-1 px-2">Lower</th>
                                <th className="text-right py-1 px-2">Upper</th>
                              </tr>
                            </thead>
                            <tbody className="text-gray-400">
                              {(f.predictions as any[]).slice(0, 14).map((p: any, pi: number) => (
                                <tr key={pi} className="border-b border-gray-800/30">
                                  <td className="py-1 px-2 text-gray-300">{p.date ?? `Day ${pi + 1}`}</td>
                                  <td className="py-1 px-2 text-right font-mono">{(p.yhat ?? p.predicted)?.toFixed(1)}</td>
                                  <td className="py-1 px-2 text-right font-mono text-gray-500">{(p.yhat_lower ?? p.lower)?.toFixed(1)}</td>
                                  <td className="py-1 px-2 text-right font-mono text-gray-500">{(p.yhat_upper ?? p.upper)?.toFixed(1)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {f.trend && (
                        <p className="mt-2 text-xs text-gray-500">
                          Trend: <span className={`font-medium ${f.trend === "improving" ? "text-green-400" : f.trend === "degrading" ? "text-red-400" : "text-gray-400"}`}>{f.trend}</span>
                          {f.seasonality_strength != null && <> • Seasonality: <span className="text-gray-300">{(f.seasonality_strength * 100).toFixed(0)}%</span></>}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* RUM Tab */}
          {tab === "rum" && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-gray-400">Real-User Monitoring (RUM) Summary</h2>
              {!projectId ? (
                <p className="text-sm text-gray-500">Select a project to view RUM data.</p>
              ) : rumSummary.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
                  <p className="text-sm">No RUM data collected for this project.</p>
                  <p className="mt-1 text-xs">Integrate the RUM snippet to start collecting real-user metrics.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rumSummary.map((r: any, idx: number) => (
                    <div key={r.metric ?? idx} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <p className="text-xs text-gray-500">{r.metric ?? "Metric"} (p75)</p>
                      <p className="mt-1 text-2xl font-bold text-white">
                        {r.p75 != null ? (typeof r.p75 === "number" ? r.p75.toFixed(r.metric === "cls" ? 3 : 0) : r.p75) : "—"}
                        <span className="ml-1 text-xs font-normal text-gray-500">{r.unit ?? ""}</span>
                      </p>
                      <div className="mt-2 flex gap-3 text-[10px] text-gray-500">
                        {r.p50 != null && <span>p50: {typeof r.p50 === "number" ? r.p50.toFixed(0) : r.p50}</span>}
                        {r.p95 != null && <span>p95: {typeof r.p95 === "number" ? r.p95.toFixed(0) : r.p95}</span>}
                        {r.sample_count != null && <span>{r.sample_count} samples</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CrUX Tab */}
          {tab === "crux" && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium text-gray-400">Chrome UX Report (CrUX) Snapshots</h2>
              {!projectId ? (
                <p className="text-sm text-gray-500">Select a project to view CrUX data.</p>
              ) : cruxSnapshots.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
                  <p className="text-sm">No CrUX snapshots available for this project.</p>
                  <p className="mt-1 text-xs">Fetch CrUX data via the API to see real-world field metrics.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cruxSnapshots.slice(0, 10).map((s: any, idx: number) => (
                    <div key={s.id ?? idx} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-200 truncate max-w-[400px]">{s.origin ?? s.url ?? "Origin"}</span>
                        <span className="text-xs text-gray-500">{s.collected_at ? new Date(s.collected_at).toLocaleDateString() : ""}</span>
                      </div>
                      {s.metrics && typeof s.metrics === "object" && (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {Object.entries(s.metrics as Record<string, any>).map(([mk, mv]: [string, any]) => (
                            <div key={mk} className="rounded-md border border-gray-800 bg-gray-800/30 p-2">
                              <p className="text-[10px] text-gray-500 uppercase">{mk}</p>
                              <p className="text-sm font-mono font-bold text-gray-200">{typeof mv === "number" ? mv.toFixed(mk === "cls" ? 3 : 0) : JSON.stringify(mv)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Capacity Tab */}
          {tab === "capacity" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-gray-400">Capacity Planning</h2>
                {projectId && (
                  <button
                    onClick={() => capacityMut.mutate()}
                    disabled={capacityMut.isPending}
                    className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {capacityMut.isPending ? "Generating…" : "Generate Report"}
                  </button>
                )}
              </div>
              {!projectId ? (
                <p className="text-sm text-gray-500">Select a project to view capacity reports.</p>
              ) : capacityReports.length === 0 ? (
                <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
                  <p className="text-sm">No capacity reports generated yet.</p>
                  <p className="mt-1 text-xs">Click &quot;Generate Report&quot; to create a capacity analysis.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {capacityReports.slice(0, 5).map((c: any, idx: number) => (
                    <div key={c.id ?? idx} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-200">Capacity Report</span>
                        <span className="text-xs text-gray-500">{c.created_at ? new Date(c.created_at).toLocaleString() : ""}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                        {c.max_sustainable_vus != null && (
                          <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                            <p className="text-[10px] text-gray-500">Max Sustainable VUs</p>
                            <p className="text-lg font-bold text-white">{c.max_sustainable_vus}</p>
                          </div>
                        )}
                        {c.saturation_point != null && (
                          <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                            <p className="text-[10px] text-gray-500">Saturation Point</p>
                            <p className="text-lg font-bold text-yellow-400">{c.saturation_point} VUs</p>
                          </div>
                        )}
                        {c.headroom_pct != null && (
                          <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                            <p className="text-[10px] text-gray-500">Headroom</p>
                            <p className={`text-lg font-bold ${c.headroom_pct > 20 ? "text-green-400" : c.headroom_pct > 5 ? "text-yellow-400" : "text-red-400"}`}>
                              {c.headroom_pct.toFixed(0)}%
                            </p>
                          </div>
                        )}
                        {c.horizon_days != null && (
                          <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                            <p className="text-[10px] text-gray-500">Horizon</p>
                            <p className="text-lg font-bold text-gray-200">{c.horizon_days} days</p>
                          </div>
                        )}
                      </div>
                      {c.recommendations && Array.isArray(c.recommendations) && c.recommendations.length > 0 && (
                        <div className="mt-3 rounded-md border border-gray-700 bg-gray-800/30 p-3">
                          <p className="text-[10px] text-gray-500 mb-1">Recommendations</p>
                          <ul className="space-y-0.5 text-xs text-gray-400">
                            {(c.recommendations as string[]).map((r, ri) => (
                              <li key={ri}>• {r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
