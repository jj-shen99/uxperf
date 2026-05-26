"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function ScriptsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", project_id: "", canonical_json: "{}" });

  const { data: scripts, isLoading } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => api.scripts.list(),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.scripts.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
      setShowCreate(false);
      setForm({ name: "", project_id: "", canonical_json: "{}" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.scripts.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scripts"] }),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Scripts</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {showCreate ? "Cancel" : "New Script"}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <input
            placeholder="Script name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <input
            placeholder="Project ID"
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <textarea
            placeholder='Canonical JSON (e.g. {"steps":[]})'
            value={form.canonical_json}
            onChange={(e) => setForm({ ...form, canonical_json: e.target.value })}
            rows={4}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono"
          />
          <button
            onClick={() => {
              try {
                createMut.mutate({
                  ...form,
                  canonical_json: JSON.parse(form.canonical_json),
                });
              } catch {
                alert("Invalid JSON");
              }
            }}
            disabled={!form.name || !form.project_id}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}

      {/* Scripts list */}
      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : !scripts?.length ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
          No scripts yet. Create one to get started.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Name</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Project</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Mode</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Updated</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {scripts.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-200">{s.name}</td>
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">{s.project_id?.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-gray-400">{s.authoring_mode}</td>
                  <td className="px-4 py-2 text-gray-400">{new Date(s.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => deleteMut.mutate(s.id)}
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
