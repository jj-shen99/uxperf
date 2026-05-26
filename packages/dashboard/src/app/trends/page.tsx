"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const METRICS = [
  { key: "lcp_ms", label: "LCP (ms)", color: "#818cf8" },
  { key: "fcp_ms", label: "FCP (ms)", color: "#34d399" },
  { key: "cls", label: "CLS", color: "#fbbf24" },
  { key: "ttfb_ms", label: "TTFB (ms)", color: "#f87171" },
  { key: "si_ms", label: "Speed Index (ms)", color: "#38bdf8" },
  { key: "tbt_ms", label: "TBT (ms)", color: "#c084fc" },
  { key: "lighthouse_performance_score", label: "Perf Score", color: "#fb923c" },
];

export default function TrendsPage() {
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["lcp_ms", "fcp_ms"]);

  const { data: runs, isLoading } = useQuery({
    queryKey: ["runs-trend"],
    queryFn: () => api.runs.list(),
  });

  const completedRuns = (runs ?? [])
    .filter((r: any) => r.status === "completed" && r.metrics)
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const chartData = completedRuns.map((r: any) => ({
    name: new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    date: r.created_at,
    ...r.metrics,
  }));

  const toggleMetric = (key: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold text-white">Metric Trends</h1>

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

      {/* Chart */}
      {isLoading ? (
        <div className="text-gray-400">Loading runs...</div>
      ) : chartData.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-12 text-center text-gray-500">
          No completed runs with metrics. Create and run a performance test to see trends.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
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
        Showing {chartData.length} completed run{chartData.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
