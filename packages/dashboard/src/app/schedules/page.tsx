"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function SchedulesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    project_id: "",
    name: "",
    cron_expression: "0 */6 * * *",
    url: "",
    environment: "staging",
  });

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.schedules.list(),
  });

  const createMut = useMutation({
    mutationFn: (data: any) => api.schedules.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      setShowCreate(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.schedules.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.schedules.update(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedules"] }),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Scheduled Runs</h1>
          <p className="mt-1 text-sm text-gray-400">
            Cron-based performance test scheduling. Standard 5-field cron format.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {showCreate ? "Cancel" : "New Schedule"}
        </button>
      </div>

      {showCreate && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <input
            placeholder="Schedule name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <input
            placeholder="Project ID"
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <input
            placeholder="Cron expression (e.g. 0 */6 * * *)"
            value={form.cron_expression}
            onChange={(e) => setForm({ ...form, cron_expression: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono"
          />
          <input
            placeholder="URL to test"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <select
            value={form.environment}
            onChange={(e) => setForm({ ...form, environment: e.target.value })}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
          <button
            onClick={() =>
              createMut.mutate({
                project_id: form.project_id,
                name: form.name,
                cron_expression: form.cron_expression,
                environment: form.environment,
                config: { url: form.url },
              })
            }
            disabled={!form.name || !form.project_id || !form.url}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Create Schedule
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : !schedules?.length ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
          No schedules configured. Create one to run performance tests on a cron.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Name</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Cron</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Env</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Next Run</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Enabled</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {schedules.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-200">{s.name}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-400">{s.cron_expression}</td>
                  <td className="px-4 py-2 text-gray-400">{s.environment}</td>
                  <td className="px-4 py-2 text-gray-400">
                    {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleMut.mutate({ id: s.id, enabled: !s.enabled })}
                      className={`text-xs font-medium ${s.enabled ? "text-green-400" : "text-gray-500"}`}
                    >
                      {s.enabled ? "ON" : "OFF"}
                    </button>
                  </td>
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
