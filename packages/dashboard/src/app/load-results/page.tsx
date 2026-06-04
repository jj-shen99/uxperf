"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMemo, useState } from "react";
import { useProjects } from "@/hooks/use-projects";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";

const METRIC_COLORS: Record<string, string> = {
  lcp_ms: "#f59e0b",
  fcp_ms: "#3b82f6",
  cls: "#8b5cf6",
  ttfb_ms: "#10b981",
  inp_ms: "#ef4444",
};

const METRIC_LABELS: Record<string, string> = {
  lcp_ms: "LCP",
  fcp_ms: "FCP",
  cls: "CLS",
  ttfb_ms: "TTFB",
  inp_ms: "INP",
};

function ConfidenceBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    high: "bg-green-900/40 text-green-300 border-green-800/50",
    medium: "bg-yellow-900/40 text-yellow-300 border-yellow-800/50",
    low: "bg-red-900/40 text-red-300 border-red-800/50",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles[level] ?? styles.low}`}>
      {level} confidence
    </span>
  );
}

function StatCard({ label, value, unit, color, sub }: { label: string; value: string | number; unit?: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color ?? "text-gray-100"}`}>
        {value}{unit && <span className="text-sm font-normal text-gray-500 ml-0.5">{unit}</span>}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-gray-600">{sub}</p>}
    </div>
  );
}

export default function LoadResultsPage() {
  const { projects, projectId, setProjectId } = useProjects();
  const [activeTab, setActiveTab] = useState<"overview" | "capacity" | "percentiles" | "timeseries" | "trends" | "errors">("overview");

  const { data: analysis, isLoading, error } = useQuery({
    queryKey: ["load-results-analysis", projectId],
    queryFn: () => api.load.results.analysis(projectId!),
    enabled: !!projectId,
  });

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "capacity" as const, label: "Capacity" },
    { id: "percentiles" as const, label: "Percentiles" },
    { id: "timeseries" as const, label: "Time Series" },
    { id: "trends" as const, label: "Trends" },
    { id: "errors" as const, label: "Errors" },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Load Results</h1>
          <p className="mt-1 text-sm text-gray-400">
            Capacity estimation, percentile analysis, and performance trends from load tests
          </p>
        </div>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
        >
          <option value="">Select a project</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {!projectId && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-12 text-center text-gray-500">
          <p className="text-lg">Select a project to view load test results</p>
        </div>
      )}

      {isLoading && projectId && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-12 text-center text-gray-500">
          <p className="animate-pulse">Analyzing load test data...</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/40 bg-red-900/20 p-4 text-sm text-red-400">
          Failed to load analysis: {(error as Error).message}
        </div>
      )}

      {analysis && (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-gray-800 pb-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-md transition ${
                  activeTab === tab.id
                    ? "bg-gray-800 text-white border border-gray-700 border-b-0"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
                }`}
              >
                {tab.label}
                {tab.id === "errors" && analysis.total_failed_runs > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] text-white">
                    {analysis.total_failed_runs}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === "overview" && (
            <OverviewTab analysis={analysis} />
          )}

          {/* Capacity Tab */}
          {activeTab === "capacity" && (
            <CapacityTab analysis={analysis} />
          )}

          {/* Percentiles Tab */}
          {activeTab === "percentiles" && (
            <PercentilesTab analysis={analysis} />
          )}

          {/* Time Series Tab */}
          {activeTab === "timeseries" && (
            <TimeSeriesTab analysis={analysis} />
          )}

          {/* Trends Tab */}
          {activeTab === "trends" && (
            <TrendsTab analysis={analysis} />
          )}

          {/* Errors Tab */}
          {activeTab === "errors" && (
            <ErrorsTab analysis={analysis} />
          )}
        </>
      )}
    </div>
  );
}

/* ── Overview Tab ─────────────────────────────────────────────── */

function OverviewTab({ analysis }: { analysis: any }) {
  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Completed Runs" value={analysis.total_completed_runs} color="text-green-400" />
        <StatCard label="Failed Runs" value={analysis.total_failed_runs} color={analysis.total_failed_runs > 0 ? "text-red-400" : "text-gray-100"} />
        <StatCard label="Total VU-Minutes" value={analysis.total_vu_minutes.toFixed(1)} color="text-indigo-400" />
        <StatCard label="Avg Duration" value={analysis.avg_run_duration_s} unit="s" />
        <StatCard
          label="Max Sustainable VUs"
          value={analysis.capacity.max_sustainable_vus}
          color="text-amber-400"
          sub={analysis.capacity.confidence + " confidence"}
        />
      </div>

      {/* Capacity summary */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-200">Capacity Estimate</h3>
          <ConfidenceBadge level={analysis.capacity.confidence} />
        </div>
        <p className="text-sm text-gray-400 leading-relaxed">{analysis.capacity.recommendation}</p>
        {analysis.capacity.degradation_slope != null && (
          <div className="mt-3 grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-gray-600">Degradation Rate</p>
              <p className="text-sm font-mono text-gray-300">{analysis.capacity.degradation_slope} ms/VU</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-600">LCP at Peak</p>
              <p className="text-sm font-mono text-gray-300">{analysis.capacity.lcp_at_peak_ms ?? "N/A"} ms</p>
            </div>
            {analysis.capacity.saturation_point_vus && (
              <div>
                <p className="text-[10px] text-gray-600">Saturation Point</p>
                <p className="text-sm font-mono text-amber-400">{analysis.capacity.saturation_point_vus} VUs</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* VU vs Response chart */}
      {analysis.vu_vs_response.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">VU Count vs Response Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={analysis.vu_vs_response}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="vus" tick={{ fill: "#9ca3af", fontSize: 11 }} label={{ value: "Virtual Users", position: "bottom", fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} label={{ value: "ms", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey="lcp_ms" name="LCP" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="fcp_ms" name="FCP" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="ttfb_ms" name="TTFB" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Cache comparison */}
      {analysis.cache_comparison.length > 1 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">Cache State Comparison</h3>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
            {analysis.cache_comparison.map((c: any) => (
              <div key={c.cache_state} className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-200 capitalize">{c.cache_state}</span>
                  <span className="text-[10px] text-gray-600">{c.run_count} runs</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">LCP</span>
                    <span className="font-mono text-amber-400">{c.avg_lcp_ms}ms</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">FCP</span>
                    <span className="font-mono text-blue-400">{c.avg_fcp_ms}ms</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500">TTFB</span>
                    <span className="font-mono text-green-400">{c.avg_ttfb_ms}ms</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Capacity Tab ─────────────────────────────────────────────── */

function CapacityTab({ analysis }: { analysis: any }) {
  const cap = analysis.capacity;

  // Build projected response curve
  const projected = useMemo(() => {
    if (cap.degradation_slope == null || cap.degradation_slope <= 0) return [];
    const baselineLcp = cap.lcp_at_peak_ms ?? 1000;
    const peakVus = Math.max(...(analysis.vu_vs_response.map((p: any) => p.vus) as number[]), 10);
    const slope = cap.degradation_slope;
    const intercept = baselineLcp - slope * peakVus;
    const points = [];
    for (let v = 1; v <= Math.max(cap.max_sustainable_vus * 1.5, peakVus * 2); v += Math.max(1, Math.floor(cap.max_sustainable_vus / 20))) {
      points.push({
        vus: v,
        projected_lcp: Math.round(slope * v + intercept),
        threshold: 2500,
      });
    }
    return points;
  }, [cap, analysis.vu_vs_response]);

  return (
    <div className="space-y-6">
      {/* Capacity headline */}
      <div className="rounded-lg border border-indigo-800/40 bg-indigo-900/15 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-indigo-300/80">Estimated Maximum Sustainable Load</p>
            <p className="mt-1 text-4xl font-bold text-indigo-300">{cap.max_sustainable_vus} <span className="text-lg font-normal">VUs</span></p>
            <p className="mt-1 text-xs text-indigo-400/60">Before LCP exceeds 2500ms threshold</p>
          </div>
          <ConfidenceBadge level={cap.confidence} />
        </div>
      </div>

      {/* Detail cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard label="Degradation Slope" value={cap.degradation_slope ?? "N/A"} unit="ms/VU" color="text-amber-400" sub="LCP increase per additional VU" />
        <StatCard label="LCP at Peak" value={cap.lcp_at_peak_ms ?? "N/A"} unit="ms" color="text-yellow-400" />
        <StatCard label="FCP at Peak" value={cap.fcp_at_peak_ms ?? "N/A"} unit="ms" color="text-blue-400" />
        <StatCard label="TTFB at Peak" value={cap.ttfb_at_peak_ms ?? "N/A"} unit="ms" color="text-green-400" />
      </div>

      {cap.saturation_point_vus && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-900/15 p-4">
          <p className="text-sm font-medium text-amber-300">⚠ Saturation Detected at {cap.saturation_point_vus} VUs</p>
          <p className="mt-1 text-xs text-amber-400/70">
            Beyond this point, response times degrade sharply ({">"}20ms per additional VU). This is typically the practical capacity limit.
          </p>
        </div>
      )}

      {/* Projected curve */}
      {projected.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-1">Projected LCP vs VU Count</h3>
          <p className="text-[10px] text-gray-500 mb-4">Based on linear regression of observed data</p>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={projected}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="vus" tick={{ fill: "#9ca3af", fontSize: 11 }} label={{ value: "Virtual Users", position: "bottom", fill: "#6b7280", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} domain={[0, "auto"]} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
              <defs>
                <linearGradient id="lcpGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="projected_lcp" name="Projected LCP" stroke="#f59e0b" fill="url(#lcpGrad)" strokeWidth={2} />
              <Line type="monotone" dataKey="threshold" name="Threshold (2500ms)" stroke="#ef4444" strokeDasharray="6 3" strokeWidth={1.5} dot={false} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recommendation */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-2">Recommendation</h3>
        <p className="text-sm text-gray-400 leading-relaxed">{cap.recommendation}</p>
      </div>
    </div>
  );
}

/* ── Percentiles Tab ──────────────────────────────────────────── */

function PercentilesTab({ analysis }: { analysis: any }) {
  const pctls: any[] = analysis.percentiles ?? [];

  return (
    <div className="space-y-6">
      {/* Percentile table */}
      {pctls.filter((p: any) => p.count > 0).length > 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/40">
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400">Metric</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">p50</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">p75</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">p90</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">p95</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">p99</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Min</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Max</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">Samples</th>
              </tr>
            </thead>
            <tbody>
              {pctls.filter((p: any) => p.count > 0).map((p: any) => (
                <tr key={p.metric} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 font-medium" style={{ color: METRIC_COLORS[p.metric] ?? "#d1d5db" }}>
                    {p.label} {p.unit && <span className="text-gray-600 text-xs">({p.unit})</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{p.p50 ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{p.p75 ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{p.p90 ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-yellow-300">{p.p95 ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-300">{p.p99 ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-400 text-xs">{p.min ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-400 text-xs">{p.max ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
          No completed runs with metrics data yet.
        </div>
      )}

      {/* Percentile bar chart */}
      {pctls.filter((p: any) => p.count > 0 && p.unit === "ms").length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h3 className="text-sm font-semibold text-gray-200 mb-4">Percentile Distribution (ms)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pctls.filter((p: any) => p.count > 0 && p.unit === "ms")} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="p50" name="p50" fill="#6366f1" radius={[2, 2, 0, 0]} />
              <Bar dataKey="p95" name="p95" fill="#f59e0b" radius={[2, 2, 0, 0]} />
              <Bar dataKey="p99" name="p99" fill="#ef4444" radius={[2, 2, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ── Time Series Tab ─────────────────────────────────────────── */

function TimeSeriesTab({ analysis }: { analysis: any }) {
  const series: any[] = analysis.time_series ?? [];
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  // Group points by run_id for the run selector
  const runIds = useMemo(() => {
    const ids = [...new Set(series.map((p: any) => p.run_id))];
    return ids;
  }, [series]);

  // Filter to selected run or show all
  const filteredSeries = useMemo(() => {
    const pts = selectedRun ? series.filter((p: any) => p.run_id === selectedRun) : series;
    return pts.map((p: any) => ({
      ...p,
      time_label: new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    }));
  }, [series, selectedRun]);

  if (series.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
        No time series data available. Run a load test to generate data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Run selector */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500">Filter by run:</label>
        <select
          value={selectedRun ?? ""}
          onChange={(e) => setSelectedRun(e.target.value || null)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
        >
          <option value="">All runs ({runIds.length})</option>
          {runIds.map((id) => (
            <option key={id} value={id}>{id.slice(0, 8)}</option>
          ))}
        </select>
      </div>

      {/* Response Time vs Time (dual-axis with VUs) */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">Response Time vs Time</h3>
        <p className="text-[10px] text-gray-500 mb-4">Web vitals (left axis) and VU count (right axis) over elapsed time</p>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={filteredSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="elapsed_s"
              tick={{ fill: "#9ca3af", fontSize: 10 }}
              label={{ value: "Elapsed (s)", position: "bottom", fill: "#6b7280", fontSize: 11 }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              label={{ value: "ms", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "#818cf8", fontSize: 11 }}
              label={{ value: "VUs", angle: 90, position: "insideRight", fill: "#818cf8", fontSize: 11 }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(v) => `Elapsed: ${v}s`}
              formatter={(value: number, name: string) => {
                if (value == null) return ["—", name];
                return [name === "VUs" ? value : `${Math.round(value)}ms`, name];
              }}
            />
            <Line yAxisId="right" type="stepAfter" dataKey="vus" name="VUs" stroke="#818cf8" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
            <Line yAxisId="left" type="monotone" dataKey="lcp_ms" name="LCP" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} connectNulls />
            <Line yAxisId="left" type="monotone" dataKey="fcp_ms" name="FCP" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} connectNulls />
            <Line yAxisId="left" type="monotone" dataKey="ttfb_ms" name="TTFB" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} connectNulls />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* VU Ramp Profile area chart */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-1">VU Ramp Profile</h3>
        <p className="text-[10px] text-gray-500 mb-4">Virtual user count as load ramps up and down over time</p>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={filteredSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="elapsed_s" tick={{ fill: "#9ca3af", fontSize: 10 }} label={{ value: "Elapsed (s)", position: "bottom", fill: "#6b7280", fontSize: 11 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(v) => `Elapsed: ${v}s`}
            />
            <defs>
              <linearGradient id="vuGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#818cf8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <Area type="stepAfter" dataKey="vus" name="VUs" stroke="#818cf8" fill="url(#vuGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Data table */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-800/40">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Time</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">Elapsed</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">VUs</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">LCP</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">FCP</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">TTFB</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Stage</th>
            </tr>
          </thead>
          <tbody>
            {filteredSeries.map((p: any, i: number) => (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-3 py-2 text-gray-400 text-xs font-mono">{p.time_label}</td>
                <td className="px-3 py-2 text-right text-gray-300 font-mono text-xs">{p.elapsed_s}s</td>
                <td className="px-3 py-2 text-right font-mono text-indigo-400">{p.vus}</td>
                <td className="px-3 py-2 text-right font-mono text-amber-400">{p.lcp_ms != null ? `${Math.round(p.lcp_ms)}ms` : "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-blue-400">{p.fcp_ms != null ? `${Math.round(p.fcp_ms)}ms` : "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-green-400">{p.ttfb_ms != null ? `${Math.round(p.ttfb_ms)}ms` : "—"}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{p.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Trends Tab ───────────────────────────────────────────────── */

function TrendsTab({ analysis }: { analysis: any }) {
  const trend: any[] = analysis.trend ?? [];

  if (trend.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
        No completed runs to show trends.
      </div>
    );
  }

  const trendData = trend.map((t: any, i: number) => ({
    ...t,
    idx: i + 1,
    date: new Date(t.created_at).toLocaleDateString(),
  }));

  return (
    <div className="space-y-6">
      {/* LCP trend */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">Web Vitals Over Time</h3>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 10 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload;
                return p ? `${p.date} · ${p.target_vus} VUs` : "";
              }}
            />
            <Line type="monotone" dataKey="lcp_ms" name="LCP (ms)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="fcp_ms" name="FCP (ms)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="ttfb_ms" name="TTFB (ms)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* VU count over time */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h3 className="text-sm font-semibold text-gray-200 mb-4">VU Count Per Run</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 10 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
            <Bar dataKey="target_vus" name="VUs" radius={[3, 3, 0, 0]}>
              {trendData.map((t: any, i: number) => (
                <Cell key={i} fill={t.error_rate > 0 ? "#ef4444" : "#6366f1"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-1 text-[10px] text-gray-600 text-center">Red bars indicate failed runs</p>
      </div>

      {/* Run detail table */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 bg-gray-800/40">
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-400">Date</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">VUs</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">Duration</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">LCP</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">FCP</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">TTFB</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {trendData.slice(-20).reverse().map((t: any, i: number) => (
              <tr key={t.run_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                <td className="px-3 py-2 text-gray-600 font-mono text-xs">{t.run_id.slice(0, 8)}</td>
                <td className="px-3 py-2 text-gray-300 text-xs">{new Date(t.created_at).toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-mono text-indigo-400">{t.target_vus}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-400">{t.duration_s ? `${t.duration_s}s` : "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-amber-400">{t.lcp_ms ? `${t.lcp_ms}ms` : "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-blue-400">{t.fcp_ms ? `${t.fcp_ms}ms` : "—"}</td>
                <td className="px-3 py-2 text-right font-mono text-green-400">{t.ttfb_ms ? `${t.ttfb_ms}ms` : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${t.error_rate > 0 ? "bg-red-900/40 text-red-300" : "bg-green-900/40 text-green-300"}`}>
                    {t.error_rate > 0 ? "failed" : "ok"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Errors Tab ───────────────────────────────────────────────── */

function ErrorsTab({ analysis }: { analysis: any }) {
  const errors: any[] = analysis.error_analysis ?? [];

  if (errors.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
        <p className="text-lg">No errors recorded</p>
        <p className="mt-1 text-sm">All load runs completed successfully.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-gray-200">Error Summary</h3>
          <span className="rounded-full bg-red-600/20 px-2 py-0.5 text-[10px] text-red-400">
            {analysis.total_failed_runs} total failures
          </span>
        </div>
        <div className="space-y-2">
          {errors.map((err: any, i: number) => (
            <div key={i} className="rounded-md border border-red-900/30 bg-red-900/10 p-3">
              <div className="flex items-start justify-between">
                <pre className="text-xs text-red-300/90 font-mono whitespace-pre-wrap flex-1 mr-4">{err.error}</pre>
                <div className="flex flex-col items-end shrink-0">
                  <span className="rounded-full bg-red-900/40 px-2 py-0.5 text-[10px] text-red-300 font-medium">
                    {err.count}×
                  </span>
                  <span className="mt-1 text-[9px] text-gray-600">
                    Last: {new Date(err.last_seen).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
