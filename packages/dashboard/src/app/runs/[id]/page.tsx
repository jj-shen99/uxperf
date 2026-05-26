"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Link from "next/link";

const METRIC_LABELS: Record<string, { label: string; unit: string; good: number; poor: number }> = {
  lcp_ms: { label: "LCP", unit: "ms", good: 2500, poor: 4000 },
  fcp_ms: { label: "FCP", unit: "ms", good: 1800, poor: 3000 },
  inp_ms: { label: "INP", unit: "ms", good: 200, poor: 500 },
  cls: { label: "CLS", unit: "", good: 0.1, poor: 0.25 },
  ttfb_ms: { label: "TTFB", unit: "ms", good: 800, poor: 1800 },
  si_ms: { label: "Speed Index", unit: "ms", good: 3400, poor: 5800 },
  tti_ms: { label: "TTI", unit: "ms", good: 3800, poor: 7300 },
  tbt_ms: { label: "TBT", unit: "ms", good: 200, poor: 600 },
};

const SCORE_LABELS: Record<string, string> = {
  lighthouse_performance_score: "Performance",
  lighthouse_accessibility_score: "Accessibility",
  lighthouse_best_practices_score: "Best Practices",
  lighthouse_seo_score: "SEO",
};

function statusColor(status: string) {
  switch (status) {
    case "completed": return "text-green-400";
    case "failed": return "text-red-400";
    case "running": return "text-yellow-400";
    case "queued": return "text-blue-400";
    case "cancelled": return "text-gray-400";
    default: return "text-gray-400";
  }
}

function metricColor(value: number, good: number, poor: number) {
  if (value <= good) return "text-green-400";
  if (value <= poor) return "text-yellow-400";
  return "text-red-400";
}

function scoreColor(score: number) {
  if (score >= 0.9) return "text-green-400";
  if (score >= 0.5) return "text-yellow-400";
  return "text-red-400";
}

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: run, isLoading, error } = useQuery({
    queryKey: ["run", id],
    queryFn: () => api.runs.get(id),
  });

  const { data: gateResults } = useQuery({
    queryKey: ["run-gates", id],
    queryFn: () => api.runs.getGateResults(id),
    enabled: !!run && run.status === "completed",
  });

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (error) return <div className="p-6 text-red-400">Error loading run</div>;
  if (!run) return <div className="p-6 text-gray-400">Run not found</div>;

  const metrics = run.metrics ?? {};

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/runs" className="text-sm text-gray-400 hover:text-gray-200">
          ← Runs
        </Link>
        <h1 className="text-xl font-semibold text-white">Run {id.slice(0, 8)}</h1>
        <span className={`text-sm font-medium ${statusColor(run.status)}`}>
          {run.status.toUpperCase()}
        </span>
      </div>

      {/* Run info */}
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-gray-500">URL</p>
          <p className="text-sm text-gray-200 truncate">{run.config?.url ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Engine</p>
          <p className="text-sm text-gray-200">{run.engine}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Mode</p>
          <p className="text-sm text-gray-200">{run.mode}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Created</p>
          <p className="text-sm text-gray-200">
            {new Date(run.created_at).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Lighthouse scores */}
      {run.status === "completed" && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-gray-300">Lighthouse Scores</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(SCORE_LABELS).map(([key, label]) => {
              const score = metrics[key] as number | undefined;
              return (
                <div key={key} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 text-center">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`mt-1 text-2xl font-bold ${score != null ? scoreColor(score) : "text-gray-600"}`}>
                    {score != null ? Math.round(score * 100) : "—"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Web Vitals */}
      {run.status === "completed" && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-gray-300">Web Vitals & Timings</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(METRIC_LABELS).map(([key, meta]) => {
              const value = metrics[key] as number | undefined;
              return (
                <div key={key} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                  <p className="text-xs text-gray-500">{meta.label}</p>
                  <p className={`mt-1 text-lg font-bold ${value != null ? metricColor(value, meta.good, meta.poor) : "text-gray-600"}`}>
                    {value != null ? `${meta.unit === "ms" ? Math.round(value) : value.toFixed(3)}${meta.unit ? ` ${meta.unit}` : ""}` : "—"}
                  </p>
                  <div className="mt-1 flex gap-2 text-[10px] text-gray-600">
                    <span>Good ≤ {meta.good}</span>
                    <span>Poor &gt; {meta.poor}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gate results */}
      {gateResults && gateResults.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-gray-300">Quality Gate Results</h2>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-400">Gate</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-400">Policy</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-400">Status</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-400">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {gateResults.map((gr: any) => (
                  <tr key={gr.id}>
                    <td className="px-4 py-2 text-gray-200">{gr.gate_name}</td>
                    <td className="px-4 py-2 text-gray-400">{gr.policy}</td>
                    <td className={`px-4 py-2 font-medium ${gr.status === "passed" ? "text-green-400" : gr.status === "failed" ? "text-red-400" : "text-gray-400"}`}>
                      {gr.status}
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {gr.details?.actual_value != null ? `${gr.details.actual_value} ${gr.details.operator} ${gr.details.threshold}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Error */}
      {run.error && (
        <div className="rounded-lg border border-red-900 bg-red-900/20 p-4">
          <h2 className="mb-1 text-sm font-medium text-red-400">Error</h2>
          <pre className="text-xs text-red-300 whitespace-pre-wrap">{run.error}</pre>
        </div>
      )}
    </div>
  );
}
