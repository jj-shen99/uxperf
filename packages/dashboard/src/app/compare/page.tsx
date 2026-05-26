"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const METRICS = [
  { key: "lcp_ms", label: "LCP (ms)", good: 2500 },
  { key: "fcp_ms", label: "FCP (ms)", good: 1800 },
  { key: "cls", label: "CLS", good: 0.1 },
  { key: "ttfb_ms", label: "TTFB (ms)", good: 800 },
  { key: "tbt_ms", label: "TBT (ms)", good: 200 },
  { key: "si_ms", label: "Speed Index (ms)", good: 3400 },
  { key: "lighthouse_performance_score", label: "Perf Score", good: 0.9 },
];

export default function ComparePage() {
  const [runIdA, setRunIdA] = useState("");
  const [runIdB, setRunIdB] = useState("");
  const [comparing, setComparing] = useState(false);

  const { data: runs } = useQuery({
    queryKey: ["runs-compare"],
    queryFn: () => api.runs.list(),
  });

  const completedRuns = (runs ?? []).filter((r: any) => r.status === "completed" && r.metrics);

  const { data: runA } = useQuery({
    queryKey: ["run", runIdA],
    queryFn: () => api.runs.get(runIdA),
    enabled: comparing && !!runIdA,
  });

  const { data: runB } = useQuery({
    queryKey: ["run", runIdB],
    queryFn: () => api.runs.get(runIdB),
    enabled: comparing && !!runIdB,
  });

  const chartData = METRICS.map((m) => ({
    metric: m.label,
    "Run A": runA?.metrics?.[m.key] ?? null,
    "Run B": runB?.metrics?.[m.key] ?? null,
  })).filter((d) => d["Run A"] !== null || d["Run B"] !== null);

  const detailRows = METRICS.map((m) => {
    const a = runA?.metrics?.[m.key] as number | undefined;
    const b = runB?.metrics?.[m.key] as number | undefined;
    const diff = a != null && b != null ? b - a : null;
    const pct = a != null && a !== 0 && diff != null ? ((diff / a) * 100) : null;
    return { ...m, a, b, diff, pct };
  });

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold text-white">Compare Runs</h1>

      {/* Run selectors */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs text-gray-400">Run A (baseline)</label>
          <select
            value={runIdA}
            onChange={(e) => setRunIdA(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="">Select a run...</option>
            {completedRuns.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.id.slice(0, 8)} — {new Date(r.created_at).toLocaleDateString()} ({r.environment})
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs text-gray-400">Run B (comparison)</label>
          <select
            value={runIdB}
            onChange={(e) => setRunIdB(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="">Select a run...</option>
            {completedRuns.map((r: any) => (
              <option key={r.id} value={r.id}>
                {r.id.slice(0, 8)} — {new Date(r.created_at).toLocaleDateString()} ({r.environment})
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setComparing(true)}
            disabled={!runIdA || !runIdB}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Compare
          </button>
        </div>
      </div>

      {/* Comparison chart */}
      {comparing && runA && runB && (
        <>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <h2 className="mb-4 text-sm font-medium text-gray-300">Side-by-Side Metrics</h2>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="metric" stroke="#6b7280" fontSize={11} angle={-20} textAnchor="end" height={60} />
                <YAxis stroke="#6b7280" fontSize={12} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: "8px", fontSize: "12px" }}
                />
                <Legend />
                <Bar dataKey="Run A" fill="#818cf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Run B" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detail table */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="px-4 py-3 text-left font-medium">Metric</th>
                  <th className="px-4 py-3 text-right font-medium">Run A</th>
                  <th className="px-4 py-3 text-right font-medium">Run B</th>
                  <th className="px-4 py-3 text-right font-medium">Diff</th>
                  <th className="px-4 py-3 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row) => (
                  <tr key={row.key} className="border-b border-gray-800/50 text-gray-300">
                    <td className="px-4 py-2 font-medium">{row.label}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {row.a != null ? (row.key === "cls" ? row.a.toFixed(3) : Math.round(row.a)) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {row.b != null ? (row.key === "cls" ? row.b.toFixed(3) : Math.round(row.b)) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {row.diff != null ? (
                        <span className={row.diff > 0 ? "text-red-400" : row.diff < 0 ? "text-green-400" : "text-gray-500"}>
                          {row.diff > 0 ? "+" : ""}
                          {row.key === "cls" ? row.diff.toFixed(3) : Math.round(row.diff)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {row.pct != null ? (
                        <span className={row.pct > 0 ? "text-red-400" : row.pct < 0 ? "text-green-400" : "text-gray-500"}>
                          {row.pct > 0 ? "+" : ""}{row.pct.toFixed(1)}%
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Waterfall placeholder */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <h2 className="mb-2 text-sm font-medium text-gray-300">Waterfall View</h2>
            <p className="text-xs text-gray-500">
              Per-request waterfall with filmstrip will render once per-request data is ingested for these runs.
              Use the <code className="text-indigo-400">/api/v1/per-request/ingest</code> endpoint to send HAR data.
            </p>

            {/* Filmstrip placeholder */}
            <div className="mt-4 flex gap-2 overflow-x-auto">
              {[0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => (
                <div
                  key={t}
                  className="flex h-16 w-24 flex-shrink-0 flex-col items-center justify-center rounded border border-gray-700 bg-gray-800 text-xs text-gray-500"
                >
                  <span>{t.toFixed(1)}s</span>
                  <span className="text-[10px] text-gray-600">screenshot</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!comparing && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-12 text-center text-gray-500">
          Select two completed runs and click Compare to see a side-by-side analysis.
        </div>
      )}
    </div>
  );
}
