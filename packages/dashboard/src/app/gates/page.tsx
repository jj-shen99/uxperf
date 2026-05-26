"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

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
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    project_id: "",
    name: "",
    metric: "lcp",
    operator: "lte",
    threshold: "",
    policy: "warn",
  });

  const { data: gates, isLoading } = useQuery({
    queryKey: ["gates"],
    queryFn: () => api.gates.list(),
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
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {showCreate ? "Cancel" : "New Gate"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4 sm:grid-cols-3">
          <input
            placeholder="Gate name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="col-span-2 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 sm:col-span-1"
          />
          <input
            placeholder="Project ID"
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
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
                project_id: form.project_id,
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
            disabled={!form.name || !form.project_id || !form.threshold}
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
