"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const IQR_WINDOW = 5; // sliding window for IQR computation

/** Compute rolling p25/p75 (IQR band) for a metric across data points. */
function computeRollingIQR(
  data: any[],
  metricKey: string,
  windowSize: number = IQR_WINDOW,
): { lower: number | null; upper: number | null }[] {
  return data.map((_, idx) => {
    const start = Math.max(0, idx - Math.floor(windowSize / 2));
    const end = Math.min(data.length, idx + Math.ceil(windowSize / 2));
    const values = data.slice(start, end)
      .map((d) => d[metricKey] as number | null)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (values.length < 2) return { lower: null, upper: null };
    const p25Idx = Math.floor(values.length * 0.25);
    const p75Idx = Math.floor(values.length * 0.75);
    return { lower: values[p25Idx], upper: values[Math.min(p75Idx, values.length - 1)] };
  });
}

const METRICS = [
  { key: "lcp_ms", label: "LCP (ms)", color: "#818cf8" },
  { key: "fcp_ms", label: "FCP (ms)", color: "#34d399" },
  { key: "cls", label: "CLS", color: "#fbbf24" },
  { key: "ttfb_ms", label: "TTFB (ms)", color: "#f87171" },
  { key: "inp_ms", label: "INP (ms)", color: "#a78bfa" },
  { key: "si_ms", label: "Speed Index (ms)", color: "#38bdf8" },
  { key: "tbt_ms", label: "TBT (ms)", color: "#c084fc" },
  { key: "tti_ms", label: "TTI (ms)", color: "#2dd4bf" },
  { key: "lighthouse_performance_score", label: "Perf Score", color: "#fb923c" },
];

export default function TrendsPage() {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["lcp_ms", "fcp_ms"]);
  const [filterUrl, setFilterUrl] = useState<string>("");
  const [filterScript, setFilterScript] = useState<string>("");

  const { data: runs, isLoading } = useQuery({
    queryKey: ["runs-trend"],
    queryFn: () => api.runs.list(),
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => api.scripts.list(),
  });

  const completedRuns = useMemo(() =>
    (runs ?? [])
      .filter((r: any) => r.status === "completed" && r.metrics)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [runs]
  );

  // Extract unique URLs for filter dropdown
  const uniqueUrls = useMemo(() => {
    const urls = new Set<string>();
    completedRuns.forEach((r: any) => {
      if (r.config?.url) urls.add(r.config.url);
    });
    return Array.from(urls).sort();
  }, [completedRuns]);

  // Filter runs by URL and/or script
  const filteredRuns = useMemo(() =>
    completedRuns.filter((r: any) => {
      if (filterUrl && r.config?.url !== filterUrl) return false;
      if (filterScript && r.script_id !== filterScript) return false;
      return true;
    }),
    [completedRuns, filterUrl, filterScript]
  );

  const chartData = useMemo(() => {
    const base = filteredRuns.map((r: any, idx: number) => ({
      name: `#${idx + 1} ${new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      date: r.created_at,
      ...r.metrics,
      lighthouse_performance_score: r.metrics?.lighthouse_performance_score != null
        ? Math.round(r.metrics.lighthouse_performance_score * 100)
        : null,
    }));
    // E-63: Compute IQR bands for each selected metric
    for (const key of selectedMetrics) {
      const iqr = computeRollingIQR(base, key);
      base.forEach((d: any, i: number) => {
        d[`${key}_iqr`] = iqr[i].lower != null && iqr[i].upper != null
          ? [iqr[i].lower, iqr[i].upper]
          : null;
      });
    }
    return base;
  }, [filteredRuns, selectedMetrics]);

  const toggleMetric = (key: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  // Compute stats for filtered runs
  const stats = useMemo(() => {
    if (filteredRuns.length === 0) return null;
    const result: Record<string, { min: number; max: number; avg: number; count: number }> = {};
    for (const m of METRICS) {
      const values: number[] = [];
      filteredRuns.forEach((r: any) => {
        let v = r.metrics?.[m.key] as number | undefined;
        if (v != null) {
          if (m.key === "lighthouse_performance_score") v = Math.round(v * 100);
          values.push(v);
        }
      });
      if (values.length > 0) {
        result[m.key] = {
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length,
        };
      }
    }
    return result;
  }, [filteredRuns]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Metric Trends</h1>
        <p className="mt-1 text-sm text-gray-400">
          Track how metrics change for the same test across multiple runs
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Filter by URL</label>
          <select
            value={filterUrl}
            onChange={(e) => setFilterUrl(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="">All URLs</option>
            {uniqueUrls.map((url) => (
              <option key={url} value={url}>{url}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Filter by Script</label>
          <select
            value={filterScript}
            onChange={(e) => setFilterScript(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="">All Scripts</option>
            {scripts.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Metric toggles */}
      <div className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => toggleMetric(m.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedMetrics.includes(m.key)
                ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Stats row */}
      {stats && Object.keys(stats).length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {METRICS.filter((m) => selectedMetrics.includes(m.key) && stats[m.key]).map((m) => {
            const s = stats[m.key];
            return (
              <div key={m.key} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                <p className="text-[10px] font-medium text-gray-500">{m.label}</p>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
                  <div>
                    <span className="text-gray-600">Min</span>
                    <p className="text-xs font-bold text-green-400">{m.key === "cls" ? s.min.toFixed(3) : Math.round(s.min)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Avg</span>
                    <p className="text-xs font-bold text-gray-200">{m.key === "cls" ? s.avg.toFixed(3) : Math.round(s.avg)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Max</span>
                    <p className="text-xs font-bold text-red-400">{m.key === "cls" ? s.max.toFixed(3) : Math.round(s.max)}</p>
                  </div>
                </div>
                <p className="mt-1 text-[9px] text-gray-600">{s.count} sample{s.count !== 1 ? "s" : ""}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Chart */}
      {isLoading ? (
        <div className="text-gray-400">Loading runs...</div>
      ) : chartData.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-12 text-center text-gray-500">
          {completedRuns.length === 0
            ? "No completed runs with metrics. Create and run a performance test to see trends."
            : "No runs match the current filter. Try selecting a different URL or script."}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={11} angle={-20} textAnchor="end" height={50} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "#9ca3af" }}
              />
              <Legend />
              {METRICS.filter((m) => selectedMetrics.includes(m.key)).map((m) => (
                <Area
                  key={`${m.key}_iqr`}
                  type="monotone"
                  dataKey={`${m.key}_iqr`}
                  name={`${m.label} IQR`}
                  stroke="none"
                  fill={m.color}
                  fillOpacity={0.12}
                  connectNulls
                  legendType="none"
                  tooltipType="none"
                  isAnimationActive={false}
                />
              ))}
              {METRICS.filter((m) => selectedMetrics.includes(m.key)).map((m) => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={m.key}
                  name={m.label}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Run count */}
      <p className="text-xs text-gray-500">
        Showing {chartData.length} of {completedRuns.length} completed run{completedRuns.length !== 1 ? "s" : ""}
        {filterUrl && <span className="ml-1 text-indigo-400">— filtered to {filterUrl}</span>}
        {filterScript && <span className="ml-1 text-indigo-400">— script filtered</span>}
      </p>
    </div>
  );
}
