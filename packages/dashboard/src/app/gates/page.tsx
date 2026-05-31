"use client";

import { useState, useMemo } from "react";
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
  const [filterProjectId, setFilterProjectId] = useState("");
  const [checkRunId, setCheckRunId] = useState("");
  const [checkResults, setCheckResults] = useState<any[] | null>(null);
  const [checkMeta, setCheckMeta] = useState<{ project_name?: string; reason?: string }>({});
  const [createError, setCreateError] = useState("");
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set(GATE_TEMPLATES.map((t) => t.name)));
  const [batchResult, setBatchResult] = useState<{ created: number; skipped: string[] } | null>(null);
  const [form, setForm] = useState({
    project_id: "",
    name: "",
    metric: "lcp",
    operator: "lte",
    threshold: "",
    policy: "warn",
  });
  const formProjectId = form.project_id || defaultProjectId;
  const templateProjectId = form.project_id || defaultProjectId;

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
    onSuccess: (data: any) => {
      setCheckResults(data.outcomes ?? data);
      setCheckMeta({ project_name: data.project_name, reason: data.reason });
      qc.invalidateQueries({ queryKey: ["gates"] });
    },
  });

  const projectMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of projects) m[p.id] = p.name;
    return m;
  }, [projects]);

  const gatesByProject = useMemo(() => {
    if (!gates?.length) return {} as Record<string, any[]>;
    const grouped: Record<string, any[]> = {};
    for (const g of gates) {
      const pid = g.project_id;
      if (!grouped[pid]) grouped[pid] = [];
      grouped[pid].push(g);
    }
    return grouped;
  }, [gates]);

  const filteredProjectIds = useMemo(() => {
    const ids = Object.keys(gatesByProject);
    if (filterProjectId) return ids.filter((id) => id === filterProjectId);
    return ids;
  }, [gatesByProject, filterProjectId]);

  const existingNamesForTemplate = useMemo(() => {
    if (!templateProjectId || !gates) return new Set<string>();
    return new Set(gates.filter((g: any) => g.project_id === templateProjectId).map((g: any) => g.name));
  }, [templateProjectId, gates]);

  const createMut = useMutation({
    mutationFn: (data: any) => api.gates.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gates"] });
      setShowCreate(false);
      setCreateError("");
    },
    onError: (err: any) => {
      setCreateError(err?.message || "Failed to create gate");
    },
  });

  const batchMut = useMutation({
    mutationFn: ({ projectId, gates: g }: { projectId: string; gates: any[] }) =>
      api.gates.batchCreate(projectId, g),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["gates"] });
      setBatchResult({ created: data.created?.length ?? 0, skipped: data.skipped ?? [] });
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

  const toggleTemplate = (name: string) => {
    setSelectedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
    setBatchResult(null);
  };

  const applySelectedTemplates = () => {
    if (!templateProjectId) return;
    const selected = GATE_TEMPLATES.filter((t) => selectedTemplates.has(t.name));
    const payload = selected.map((t) => ({
      name: t.name,
      policy: t.policy,
      definition: { type: "threshold" as const, metric: t.metric, operator: t.operator, threshold: t.threshold },
    }));
    batchMut.mutate({ projectId: templateProjectId, gates: payload });
  };

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
                onChange={(e) => { setCheckRunId(e.target.value); setCheckResults(null); setCheckMeta({}); }}
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
            <div className="rounded-md border border-yellow-900/40 bg-yellow-900/10 p-3">
              <p className="text-sm text-yellow-400 font-medium">
                {checkMeta.reason ?? "No gate results returned."}
              </p>
              {checkMeta.project_name && (
                <p className="mt-1 text-xs text-gray-400">
                  Run belongs to project: <span className="text-gray-200 font-medium">{checkMeta.project_name}</span>.
                  Gates are configured per-project — make sure this project has enabled gates.
                </p>
              )}
            </div>
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
                  {checkResults.map((r: any, i: number) => {
                    const threshold = r.computed_threshold ?? r.threshold;
                    const actual = r.actual_value;
                    const op = r.operator;
                    const thisRunMissed = actual != null && threshold != null && (
                      (op === "lte" && actual > threshold) ||
                      (op === "lt" && actual >= threshold) ||
                      (op === "gte" && actual < threshold) ||
                      (op === "gt" && actual <= threshold)
                    );
                    const quorumSaved = thisRunMissed && r.status === "passed";
                    return (
                    <tr key={r.gate_id ?? i} className={`hover:bg-gray-800/30 ${quorumSaved ? "bg-yellow-900/5" : ""}`}>
                      <td className="px-4 py-2 text-gray-200">{r.gate_name}</td>
                      <td className="px-4 py-2 text-gray-400">{r.metric}</td>
                      <td className={`px-4 py-2 text-right font-mono ${thisRunMissed ? "text-red-400" : "text-gray-300"}`}>
                        {actual != null ? (r.metric?.includes("lighthouse") ? (actual * 100).toFixed(0) : typeof actual === "number" ? actual.toFixed(1) : actual) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-gray-400">
                        {op} {threshold}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.policy === "block" ? "bg-red-900/30 text-red-400" :
                          r.policy === "warn" ? "bg-yellow-900/30 text-yellow-400" :
                          "bg-blue-900/30 text-blue-400"
                        }`}>{r.policy}</span>
                      </td>
                      <td className="px-4 py-2">
                        {quorumSaved ? (
                          <>
                            <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-900/30 text-yellow-400">
                              missed
                            </span>
                            <span className="ml-1 text-[10px] text-gray-500">
                              quorum {r.quorum_detail.recent_failures}/{r.quorum_detail.required_failures} — not blocked
                            </span>
                          </>
                        ) : (
                          <>
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
                          </>
                        )}
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

      {/* Gate Templates */}
      {showTemplates && (
        <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Target Project</label>
              <select
                value={templateProjectId}
                onChange={(e) => { setForm({ ...form, project_id: e.target.value }); setBatchResult(null); }}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              >
                <option value="">Select a project</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedTemplates(new Set(GATE_TEMPLATES.map((t) => t.name)))}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-400 hover:text-gray-200"
              >Select All</button>
              <button
                onClick={() => setSelectedTemplates(new Set())}
                className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-400 hover:text-gray-200"
              >Clear</button>
              <button
                onClick={applySelectedTemplates}
                disabled={!templateProjectId || selectedTemplates.size === 0 || batchMut.isPending}
                className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {batchMut.isPending ? "Applying…" : `Apply ${selectedTemplates.size} Template${selectedTemplates.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>

          {batchResult && (
            <div className="rounded-md border border-gray-700 bg-gray-800/50 p-3 text-xs">
              <p className="text-green-400 font-medium">{batchResult.created} gate{batchResult.created !== 1 ? "s" : ""} created</p>
              {batchResult.skipped.length > 0 && (
                <p className="mt-1 text-yellow-400">{batchResult.skipped.length} skipped (already exist): {batchResult.skipped.join(", ")}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {GATE_TEMPLATES.map((tpl) => {
              const alreadyExists = existingNamesForTemplate.has(tpl.name);
              const isSelected = selectedTemplates.has(tpl.name);
              return (
                <button
                  key={tpl.name}
                  onClick={() => toggleTemplate(tpl.name)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    alreadyExists
                      ? "border-gray-800 bg-gray-800/20 opacity-50 cursor-default"
                      : isSelected
                        ? "border-indigo-600 bg-indigo-900/15"
                        : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center text-[9px] ${
                      alreadyExists ? "border-gray-600 bg-gray-700 text-gray-500" :
                      isSelected ? "border-indigo-500 bg-indigo-600 text-white" : "border-gray-600"
                    }`}>
                      {(alreadyExists || isSelected) && "✓"}
                    </div>
                    <p className="text-sm font-medium text-gray-200">{tpl.name}</p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 pl-5.5">{tpl.description}</p>
                  <div className="mt-1.5 flex items-center gap-2 pl-5.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      tpl.policy === "block" ? "bg-red-900/30 text-red-400" :
                      tpl.policy === "warn" ? "bg-yellow-900/30 text-yellow-400" :
                      "bg-blue-900/30 text-blue-400"
                    }`}>{tpl.policy}</span>
                    <span className="text-[10px] text-gray-600">{tpl.operator === "lte" ? "≤" : "≥"} {tpl.threshold}</span>
                    {alreadyExists && <span className="text-[10px] text-gray-500 italic">already exists</span>}
                  </div>
                </button>
              );
            })}
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
            onClick={() => {
              setCreateError("");
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
              });
            }}
            disabled={!form.name || !formProjectId || !form.threshold}
            className="col-span-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 sm:col-span-1"
          >
            Create Gate
          </button>
          {createError && (
            <p className="col-span-full text-sm text-red-400">{createError}</p>
          )}
        </div>
      )}

      {/* Gates list — grouped by project */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-400">Gates by Project</h2>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-200"
          >
            <option value="">All Projects</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {gates && <span className="text-xs text-gray-500">{gates.length} total gate{gates.length !== 1 ? "s" : ""}</span>}
        </div>

        {isLoading ? (
          <div className="text-gray-400">Loading...</div>
        ) : !gates?.length ? (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
            No quality gates defined. Use <strong>Templates</strong> to quickly add gates for a project, or click <strong>New Gate</strong>.
          </div>
        ) : filteredProjectIds.length === 0 ? (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6 text-center text-gray-500">
            No gates for this project. Use Templates to add some.
          </div>
        ) : (
          filteredProjectIds.map((pid) => (
            <div key={pid} className="rounded-lg border border-gray-800 overflow-hidden">
              <div className="bg-gray-800/50 px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-200">{projectMap[pid] || pid.slice(0, 8)}</h3>
                  <span className="text-xs text-gray-500">{gatesByProject[pid]?.length} gate{gatesByProject[pid]?.length !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-[10px] text-gray-600 font-mono">{pid.slice(0, 8)}…</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-800/30">
                  <tr>
                    <th className="px-4 py-1.5 text-left text-xs text-gray-500">Name</th>
                    <th className="px-4 py-1.5 text-left text-xs text-gray-500">Metric</th>
                    <th className="px-4 py-1.5 text-left text-xs text-gray-500">Threshold</th>
                    <th className="px-4 py-1.5 text-left text-xs text-gray-500">Policy</th>
                    <th className="px-4 py-1.5 text-left text-xs text-gray-500">Enabled</th>
                    <th className="px-4 py-1.5 text-right text-xs text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {gatesByProject[pid]?.map((g: any) => (
                    <tr key={g.id} className="hover:bg-gray-800/20">
                      <td className="px-4 py-2 text-gray-200">{g.name}</td>
                      <td className="px-4 py-2 text-gray-400 font-mono text-xs">{g.definition?.metric}</td>
                      <td className="px-4 py-2 text-gray-400 font-mono text-xs">
                        {g.definition?.operator === "lte" ? "≤" : g.definition?.operator === "gte" ? "≥" : g.definition?.operator} {g.definition?.threshold}
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
          ))
        )}
      </div>
    </div>
  );
}
