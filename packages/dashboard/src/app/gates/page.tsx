"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";

const GATE_TEMPLATES = [
  { name: "LCP Budget", metric: "lcp", operator: "lte", threshold: 2500, policy: "block", description: "Largest Contentful Paint ≤ 2.5s (Good)" },
  { name: "FCP Budget", metric: "fcp", operator: "lte", threshold: 1800, policy: "warn", description: "First Contentful Paint ≤ 1.8s (Good)" },
  { name: "CLS Budget", metric: "cls", operator: "lte", threshold: 0.1, policy: "block", description: "Cumulative Layout Shift ≤ 0.1 (Good)" },
  { name: "INP Budget", metric: "inp", operator: "lte", threshold: 200, policy: "warn", description: "Interaction to Next Paint ≤ 200ms (Good)" },
  { name: "TTFB Budget", metric: "ttfb", operator: "lte", threshold: 800, policy: "warn", description: "Time to First Byte ≤ 800ms (Good)" },
  { name: "TBT Budget", metric: "tbt", operator: "lte", threshold: 200, policy: "warn", description: "Total Blocking Time ≤ 200ms (Good)" },
  { name: "Lighthouse Perf ≥ 90", metric: "lighthouse_performance", operator: "gte", threshold: 0.9, policy: "block", description: "Lighthouse Performance score ≥ 90" },
  { name: "Lighthouse A11y ≥ 90", metric: "lighthouse_accessibility", operator: "gte", threshold: 0.9, policy: "warn", description: "Lighthouse Accessibility score ≥ 90" },
  { name: "Lighthouse SEO ≥ 90", metric: "lighthouse_seo", operator: "gte", threshold: 0.9, policy: "warn", description: "Lighthouse SEO score ≥ 90" },
  { name: "LCP Degradation Alert", metric: "lcp", operator: "lte", threshold: 4000, policy: "page", description: "Page on-call if LCP exceeds 4s (Poor)" },
];

const METRIC_OPTIONS = [
  "lcp", "fcp", "inp", "cls", "ttfb", "si", "tti", "tbt",
  "lighthouse_performance", "lighthouse_accessibility",
  "lighthouse_best_practices", "lighthouse_seo",
];

const OPERATOR_OPTIONS = [
  { value: "lte", label: "≤ (at most)" },
  { value: "gte", label: "≥ (at least)" },
  { value: "lt", label: "< (less than)" },
  { value: "gt", label: "> (greater than)" },
];

export default function GatesPage() {
  const qc = useQueryClient();
  const { projects, projectId: defaultProjectId } = useProjects();
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showCheck, setShowCheck] = useState(false);
  const [checkRunId, setCheckRunId] = useState("");
  const [checkResults, setCheckResults] = useState<any[] | null>(null);
  const [form, setForm] = useState({
    project_id: "",
    name: "",
    metric: "lcp",
    operator: "lte",
    threshold: "",
    policy: "warn",
  });
  const formProjectId = form.project_id || defaultProjectId;

  const { data: gates, isLoading } = useQuery({
    queryKey: ["gates"],
    queryFn: () => api.gates.list(),
  });

  const { data: allRuns = [] } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(),
  });

  const completedRuns = allRuns
    .filter((r: any) => r.status === "completed" && r.metrics)
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  const evaluateMut = useMutation({
    mutationFn: (runId: string) => api.gates.evaluate(runId),
    onSuccess: (data) => {
      setCheckResults(data);
      qc.invalidateQueries({ queryKey: ["gates"] });
    },
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.gates.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gates"] });
      setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.gates.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gates"] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.gates.update(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gates"] }),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Quality Gates</h1>
          <p className="mt-1 text-sm text-gray-400">
            Hard-threshold gates with 3-of-5 quorum. A metric must fail in 3 of
            the last 5 runs to trigger a gate failure.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowCheck(!showCheck); setShowCreate(false); setShowTemplates(false); setCheckResults(null); }}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
          >
            {showCheck ? "Hide Check" : "Check Against Run"}
          </button>
          <button
            onClick={() => { setShowTemplates(!showTemplates); setShowCreate(false); setShowCheck(false); }}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
          >
            {showTemplates ? "Hide Templates" : "Templates"}
          </button>
          <button
            onClick={() => { setShowCreate(!showCreate); setShowTemplates(false); setShowCheck(false); }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {showCreate ? "Cancel" : "New Gate"}
          </button>
        </div>
      </div>

      {/* Check Against Run */}
      {showCheck && (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Select a Completed Run</label>
              <select
                value={checkRunId}
                onChange={(e) => { setCheckRunId(e.target.value); setCheckResults(null); }}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              >
                <option value="">Select a run…</option>
                {completedRuns.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.config?.url ? new URL(r.config.url).hostname : r.id.slice(0, 8)} — {r.engine} — {new Date(r.created_at).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => evaluateMut.mutate(checkRunId)}
              disabled={!checkRunId || evaluateMut.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {evaluateMut.isPending ? "Evaluating…" : "Evaluate Gates"}
            </button>
          </div>
          {evaluateMut.isError && (
            <p className="text-sm text-red-400">Error: {(evaluateMut.error as any)?.message ?? "Evaluation failed"}</p>
          )}
          {checkResults && checkResults.length === 0 && (
            <p className="text-sm text-gray-500">No enabled gates found for this run's project, or run has no metrics.</p>
          )}
          {checkResults && checkResults.length > 0 && (
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs text-gray-400">Gate</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-400">Metric</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-400">Actual</th>
                    <th className="px-4 py-2 text-right text-xs text-gray-400">Threshold</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-400">Policy</th>
                    <th className="px-4 py-2 text-left text-xs text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {checkResults.map((r: any, i: number) => (
                    <tr key={r.gate_id ?? i} className="hover:bg-gray-800/30">
                      <td className="px-4 py-2 text-gray-200">{r.gate_name}</td>
                      <td className="px-4 py-2 text-gray-400">{r.metric}</td>
                      <td className="px-4 py-2 text-right font-mono text-gray-300">
                        {r.actual_value != null ? (r.metric?.includes("lighthouse") ? (r.actual_value * 100).toFixed(0) : typeof r.actual_value === "number" ? r.actual_value.toFixed(1) : r.actual_value) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-400">
                        {r.operator} {r.computed_threshold ?? r.threshold}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.policy === "block" ? "bg-red-900/30 text-red-400" :
                          r.policy === "warn" ? "bg-yellow-900/30 text-yellow-400" :
                          "bg-blue-900/30 text-blue-400"
                        }`}>{r.policy}</span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.status === "passed" ? "bg-green-900/30 text-green-400" :
                          r.status === "failed" ? "bg-red-900/30 text-red-400" :
                          "bg-gray-700/30 text-gray-400"
                        }`}>{r.status}</span>
                        {r.quorum_detail && r.status === "failed" && (
                          <span className="ml-1 text-[10px] text-gray-500">
                            ({r.quorum_detail.recent_failures}/{r.quorum_detail.window_size} failed)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Gate Templates */}
      {showTemplates && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Target Project</label>
            <select
              value={formProjectId}
              onChange={(e) => setForm({ ...form, project_id: e.target.value })}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
            >
              <option value="">Select a project</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {GATE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                disabled={!formProjectId || createMut.isPending}
                onClick={() => {
                  createMut.mutate({
                    project_id: formProjectId,
                    name: tpl.name,
                    policy: tpl.policy,
                    definition: {
                      type: tpl.metric.startsWith("lighthouse") ? "threshold" : "threshold",
                      metric: tpl.metric,
                      operator: tpl.operator,
                      threshold: tpl.threshold,
                    },
                  });
                }}
                className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 text-left hover:border-indigo-600 hover:bg-indigo-900/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <p className="text-sm font-medium text-gray-200">{tpl.name}</p>
                <p className="mt-1 text-xs text-gray-500">{tpl.description}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    tpl.policy === "block" ? "bg-red-900/30 text-red-400" :
                    tpl.policy === "warn" ? "bg-yellow-900/30 text-yellow-400" :
                    "bg-blue-900/30 text-blue-400"
                  }`}>{tpl.policy}</span>
                  <span className="text-[10px] text-gray-600">{tpl.operator === "lte" ? "≤" : "≥"} {tpl.threshold}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4 sm:grid-cols-3">
          <input
            placeholder="Gate name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 sm:col-span-1"
          />
          <select
            value={formProjectId}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="">Select project</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={form.metric}
            onChange={(e) => setForm({ ...form, metric: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            {METRIC_OPTIONS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            value={form.operator}
            onChange={(e) => setForm({ ...form, operator: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            {OPERATOR_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Threshold"
            value={form.threshold}
            onChange={(e) => setForm({ ...form, threshold: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <select
            value={form.policy}
            onChange={(e) => setForm({ ...form, policy: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="warn">Warn</option>
            <option value="block">Block</option>
            <option value="page">Page</option>
          </select>
          <button
            onClick={() =>
              createMut.mutate({
                project_id: formProjectId,
                name: form.name,
                policy: form.policy,
                definition: {
                  type: "threshold",
                  metric: form.metric,
                  operator: form.operator,
                  threshold: parseFloat(form.threshold),
                },
              })
            }
            disabled={!form.name || !formProjectId || !form.threshold}
            className="col-span-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 sm:col-span-1"
          >
            Create Gate
          </button>
        </div>
      )}

      {/* Gates list */}
      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : !gates?.length ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
          No quality gates defined. Create one to enforce performance budgets.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Name</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Metric</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Threshold</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Policy</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Enabled</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {gates.map((g: any) => (
                <tr key={g.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-200">{g.name}</td>
                  <td className="px-4 py-2 text-gray-400">{g.definition?.metric}</td>
                  <td className="px-4 py-2 text-gray-400">
                    {g.definition?.operator} {g.definition?.threshold}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      g.policy === "block" ? "bg-red-900/30 text-red-400" :
                      g.policy === "warn" ? "bg-yellow-900/30 text-yellow-400" :
                      "bg-blue-900/30 text-blue-400"
                    }`}>
                      {g.policy}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleMut.mutate({ id: g.id, enabled: !g.enabled })}
                      className={`text-xs font-medium ${g.enabled ? "text-green-400" : "text-gray-500"}`}
                    >
                      {g.enabled ? "ON" : "OFF"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => deleteMut.mutate(g.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
