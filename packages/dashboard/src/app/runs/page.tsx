"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";

interface Run {
  id: string;
  project_id: string;
  mode: string;
  engine: string;
  environment: string;
  status: string;
  config: { url?: string };
  metrics?: Record<string, number>;
  created_at: string;
  finished_at?: string;
}

const statusIcons: Record<string, React.ComponentType<{ className?: string }>> =
  {
    queued: Clock,
    running: Loader2,
    completed: CheckCircle2,
    failed: XCircle,
  };

const statusColors: Record<string, string> = {
  queued: "text-yellow-400",
  running: "text-blue-400",
  completed: "text-green-400",
  failed: "text-red-400",
};

export default function RunsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ project_id: "", url: "", n_runs: "5" });

  const { data: runs, isLoading } = useQuery<Run[]>({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.runs.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      setShowCreate(false);
      setForm({ project_id: "", url: "", n_runs: "5" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Runs</h1>
          <p className="mt-1 text-sm text-gray-400">
            Performance test execution history
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
        >
          <Play className="h-4 w-4" />
          {showCreate ? "Cancel" : "New Run"}
        </button>
      </div>

      {showCreate && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4 sm:grid-cols-4">
          <input
            placeholder="Project ID"
            value={form.project_id}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, project_id: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <input
            placeholder="URL to test"
            value={form.url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, url: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <input
            type="number"
            placeholder="N runs (default 5)"
            value={form.n_runs}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, n_runs: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <button
            onClick={() =>
              createMut.mutate({
                project_id: form.project_id,
                config: { url: form.url, n_runs: parseInt(form.n_runs) || 5 },
              })
            }
            disabled={!form.project_id || !form.url}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Launch
          </button>
        </div>
      )}

      <div className="rounded-lg border border-gray-800 bg-gray-900">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading runs...
          </div>
        ) : !runs || runs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Play className="mx-auto h-8 w-8 mb-3 opacity-50" />
            <p>No runs yet.</p>
            <p className="mt-1 text-xs">
              Create a run via the API or use the CLI worker.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">URL</th>
                <th className="px-4 py-3 font-medium">Engine</th>
                <th className="px-4 py-3 font-medium">Mode</th>
                <th className="px-4 py-3 font-medium">LCP</th>
                <th className="px-4 py-3 font-medium">LH Score</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const StatusIcon = statusIcons[run.status] || Clock;
                const color = statusColors[run.status] || "text-gray-400";
                return (
                  <tr
                    key={run.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30 cursor-pointer"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/runs/${run.id}`} className={`flex items-center gap-1.5 ${color}`}>
                        <StatusIcon className="h-4 w-4" />
                        {run.status}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-300">
                      <Link href={`/runs/${run.id}`}>{run.config?.url || "—"}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{run.engine}</td>
                    <td className="px-4 py-3 text-gray-400">{run.mode}</td>
                    <td className="px-4 py-3 text-gray-300">
                      {run.metrics?.lcp_ms
                        ? `${Math.round(run.metrics.lcp_ms)} ms`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-300">
                      {run.metrics?.lighthouse_performance_score !== undefined
                        ? Math.round(
                            run.metrics.lighthouse_performance_score * 100
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
