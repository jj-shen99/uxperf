"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Clock, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useUserProjects } from "@/hooks/use-user-projects";
import { MetricTooltip } from "@/components/metric-tooltip";

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

type SortKey = "status" | "url" | "engine" | "mode" | "lcp" | "lh_score" | "environment" | "created_at";
type SortDir = "asc" | "desc";

export default function RunsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { projects, projectId: defaultProjectId } = useProjects();
  const { currentUser, isAdmin } = useCurrentUser();
  const { accessibleProjectIds } = useUserProjects();
  const [form, setForm] = useState({ project_id: "", script_id: "", url: "", n_runs: "5", environment: "staging" });
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const formProjectId = form.project_id || defaultProjectId;

  const { data: allRuns, isLoading } = useQuery<Run[]>({
    queryKey: ["runs", currentUser?.id, isAdmin],
    queryFn: () => api.runs.list(undefined, currentUser?.id, isAdmin),
    refetchInterval: (query) => {
      const runs = query.state.data;
      const hasActive = runs?.some((r) => r.status === "queued" || r.status === "running");
      return hasActive ? 3000 : false;
    },
  });

  // Filter runs: admins see all, regular users see only their projects
  const filteredRuns = allRuns?.filter(
    (r) => isAdmin || accessibleProjectIds.has(r.project_id)
  );

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "created_at" ? "desc" : "asc");
    }
  };

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const runs = filteredRuns?.slice().sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "status": return dir * a.status.localeCompare(b.status);
      case "url": return dir * (a.config?.url ?? "").localeCompare(b.config?.url ?? "");
      case "engine": return dir * a.engine.localeCompare(b.engine);
      case "mode": return dir * a.mode.localeCompare(b.mode);
      case "lcp": return dir * ((a.metrics?.lcp_ms ?? Infinity) - (b.metrics?.lcp_ms ?? Infinity));
      case "lh_score": return dir * ((a.metrics?.lighthouse_performance_score ?? -1) - (b.metrics?.lighthouse_performance_score ?? -1));
      case "environment": return dir * a.environment.localeCompare(b.environment);
      case "created_at": return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      default: return 0;
    }
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts-for-run", formProjectId],
    queryFn: () => api.scripts.list(formProjectId),
    enabled: !!formProjectId,
  });

  const { data: environments = [] } = useQuery<{ id: string; name: string; slug: string }[]>({
    queryKey: ["environments"],
    queryFn: () => api.environments.list(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.runs.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runs"] }),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.runs.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs"] });
      setShowCreate(false);
      setForm({ project_id: "", script_id: "", url: "", n_runs: "5", environment: "staging" });
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
        <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Project</label>
              <select
                value={formProjectId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, project_id: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              >
                <option value="">Select project</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Test Script</label>
              <select
                value={form.script_id}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  const script = scripts.find((s: any) => s.id === e.target.value);
                  setForm({
                    ...form,
                    script_id: e.target.value,
                    url: script?.canonical_json?.target_url ?? form.url,
                  });
                }}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              >
                <option value="">(no script — manual URL)</option>
                {scripts.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">URL to test</label>
              <input
                placeholder="https://example.com"
                value={form.url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, url: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Repeat count</label>
              <input
                type="number"
                min={1}
                placeholder="5"
                value={form.n_runs}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, n_runs: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Environment</label>
              <select
                value={form.environment}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, environment: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              >
                {environments.length > 0 ? (
                  environments.map((env) => (
                    <option key={env.id} value={env.slug}>{env.name}</option>
                  ))
                ) : (
                  <option value="staging">staging</option>
                )}
              </select>
            </div>
          </div>
          <button
            onClick={() =>
              createMut.mutate({
                project_id: formProjectId,
                script_id: form.script_id || undefined,
                environment: form.environment,
                config: { url: form.url, n_runs: parseInt(form.n_runs) || 5 },
                user_id: currentUser?.id,
              })
            }
            disabled={!formProjectId || !form.url}
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
                <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300" onClick={() => toggleSort("status")}>Status{sortIndicator("status")}</th>
                <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300" onClick={() => toggleSort("url")}>URL{sortIndicator("url")}</th>
                <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300" onClick={() => toggleSort("engine")}>Engine{sortIndicator("engine")}</th>
                <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300" onClick={() => toggleSort("mode")}>Mode{sortIndicator("mode")}</th>
                <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300" onClick={() => toggleSort("lcp")}><MetricTooltip metricKey="LCP" className="text-xs text-gray-500" />{sortIndicator("lcp")}</th>
                <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300" onClick={() => toggleSort("lh_score")}><MetricTooltip metricKey="Lighthouse Score" className="text-xs text-gray-500"><span>LH Score</span></MetricTooltip>{sortIndicator("lh_score")}</th>
                <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300" onClick={() => toggleSort("environment")}>Env{sortIndicator("environment")}</th>
                <th className="px-4 py-3 font-medium cursor-pointer select-none hover:text-gray-300" onClick={() => toggleSort("created_at")}>Created{sortIndicator("created_at")}</th>
                {isAdmin && <th className="px-4 py-3 font-medium text-right">Actions</th>}
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
                    <td className="px-4 py-3 text-xs text-gray-400">{run.environment}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete run ${run.id.slice(0, 8)}?`)) deleteMut.mutate(run.id); }}
                          className="text-red-400 hover:text-red-300 p-1"
                          title="Delete run"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
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
