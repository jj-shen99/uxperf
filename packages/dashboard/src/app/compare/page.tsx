"use client";

import { useState, useMemo } from "react";
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
import { ArrowDown, ArrowUp, Minus, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import { computeDiffRow, computeDiffSummary, formatValue, diffBarWidth } from "@/lib/compare-utils";

const METRICS = [
  { key: "lcp_ms", label: "LCP (ms)", good: 2500, unit: "ms", lowerIsBetter: true },
  { key: "fcp_ms", label: "FCP (ms)", good: 1800, unit: "ms", lowerIsBetter: true },
  { key: "cls", label: "CLS", good: 0.1, unit: "", lowerIsBetter: true },
  { key: "ttfb_ms", label: "TTFB (ms)", good: 800, unit: "ms", lowerIsBetter: true },
  { key: "tbt_ms", label: "TBT (ms)", good: 200, unit: "ms", lowerIsBetter: true },
  { key: "si_ms", label: "Speed Index (ms)", good: 3400, unit: "ms", lowerIsBetter: true },
  { key: "lighthouse_performance_score", label: "Perf Score", good: 0.9, unit: "", lowerIsBetter: false },
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

  const detailRows = useMemo(
    () => METRICS.map((m) => computeDiffRow(m, runA?.metrics, runB?.metrics)),
    [runA, runB],
  );

  const summary = useMemo(() => computeDiffSummary(detailRows), [detailRows]);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-semibold text-white">Compare Runs</h1>

      {/* Run selectors */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs text-gray-400">Run A (baseline)</label>
          <select
            value={runIdA}
            onChange={(e) => { setRunIdA(e.target.value); setComparing(false); }}
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
            onChange={(e) => { setRunIdB(e.target.value); setComparing(false); }}
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
        <div className="flex items-end gap-2">
          <button
            onClick={() => setComparing(true)}
            disabled={!runIdA || !runIdB || runIdA === runIdB}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Compare
          </button>
          {runIdA && runIdB && runIdA === runIdB && (
            <span className="text-xs text-amber-400">Same run selected</span>
          )}
        </div>
      </div>

      {/* Comparison results */}
      {comparing && runA && runB && (
        <>
          {/* E-18: Diff summary badges */}
          <div className="flex flex-wrap gap-3">
            {summary.regressions.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/30 px-3 py-1 text-xs font-medium text-red-400">
                <TrendingUp className="h-3.5 w-3.5" />
                {summary.regressions.length} regression{summary.regressions.length > 1 ? "s" : ""}
              </span>
            )}
            {summary.improvements.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 border border-green-500/30 px-3 py-1 text-xs font-medium text-green-400">
                <TrendingDown className="h-3.5 w-3.5" />
                {summary.improvements.length} improvement{summary.improvements.length > 1 ? "s" : ""}
              </span>
            )}
            {summary.unchanged.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-500/10 border border-gray-500/30 px-3 py-1 text-xs font-medium text-gray-400">
                <Minus className="h-3.5 w-3.5" />
                {summary.unchanged.length} unchanged
              </span>
            )}
          </div>

          {/* Side-by-side bar chart */}
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

          {/* E-18: Enhanced detail table with diff bars and indicators */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="px-4 py-3 text-left font-medium w-8"></th>
                  <th className="px-4 py-3 text-left font-medium">Metric</th>
                  <th className="px-4 py-3 text-right font-medium">Run A</th>
                  <th className="px-4 py-3 text-right font-medium">Run B</th>
                  <th className="px-4 py-3 text-right font-medium">Diff</th>
                  <th className="px-4 py-3 text-right font-medium">Change</th>
                  <th className="px-4 py-3 font-medium w-32"></th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row) => (
                  <tr key={row.key} className="border-b border-gray-800/50 text-gray-300">
                    <td className="px-4 py-2 text-center">
                      {row.regressed ? (
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                      ) : row.improved ? (
                        <CheckCircle2 className="h-4 w-4 text-green-400" />
                      ) : (
                        <Minus className="h-4 w-4 text-gray-600" />
                      )}
                    </td>
                    <td className="px-4 py-2 font-medium">{row.label}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatValue(row.a, row.key)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatValue(row.b, row.key)}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {row.diff != null ? (
                        <span className={row.regressed ? "text-red-400" : row.improved ? "text-green-400" : "text-gray-500"}>
                          {row.diff > 0 ? "+" : ""}
                          {row.key === "cls" ? row.diff.toFixed(3) : Math.round(row.diff)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {row.pct != null ? (
                        <span className={`inline-flex items-center gap-1 ${row.regressed ? "text-red-400" : row.improved ? "text-green-400" : "text-gray-500"}`}>
                          {row.regressed ? <ArrowUp className="h-3 w-3" /> : row.improved ? <ArrowDown className="h-3 w-3" /> : null}
                          {row.pct > 0 ? "+" : ""}{row.pct.toFixed(1)}%
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-2 py-2">
                      {row.pct != null && (
                        <div className="h-2 w-full rounded-full bg-gray-800">
                          <div
                            className={`h-2 rounded-full ${row.regressed ? "bg-red-500/60" : row.improved ? "bg-green-500/60" : "bg-gray-600"}`}
                            style={{ width: `${diffBarWidth(row.pct)}%` }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* HAR / Waterfall comparison */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
            <h2 className="mb-2 text-sm font-medium text-gray-300">Resource Waterfall Comparison</h2>
            <p className="text-xs text-gray-500 mb-4">
              Side-by-side waterfall comparison requires HAR data for both runs.
              Use the <code className="text-indigo-400">/api/v1/per-request/{"{runId}"}</code> endpoint to retrieve HAR data.
            </p>

            {/* Filmstrip timeline */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400 mb-2">Run A — {runA?.id?.slice(0, 8)}</p>
                <div className="flex gap-1 overflow-x-auto">
                  {[0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => (
                    <div key={t} className="flex h-12 w-20 flex-shrink-0 flex-col items-center justify-center rounded border border-gray-700 bg-gray-800 text-[10px] text-gray-500">
                      <span>{t.toFixed(1)}s</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Run B — {runB?.id?.slice(0, 8)}</p>
                <div className="flex gap-1 overflow-x-auto">
                  {[0, 0.5, 1, 1.5, 2, 2.5, 3].map((t) => (
                    <div key={t} className="flex h-12 w-20 flex-shrink-0 flex-col items-center justify-center rounded border border-gray-700 bg-gray-800 text-[10px] text-gray-500">
                      <span>{t.toFixed(1)}s</span>
                    </div>
                  ))}
                </div>
              </div>
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
