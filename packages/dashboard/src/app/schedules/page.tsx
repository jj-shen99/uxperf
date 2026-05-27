"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";

export default function SchedulesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { projects } = useProjects();
  const [form, setForm] = useState({
    project_id: "",
    script_id: "",
    name: "",
    cron_expression: "0 */6 * * *",
    url: "",
    environment: "staging",
  });

  const { data: schedules, isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => api.schedules.list(),
  });

  const { data: environments = [] } = useQuery({
    queryKey: ["environments"],
    queryFn: () => api.environments.list(),
  });

  const { data: allScripts = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => api.scripts.list(),
  });

  // Filter scripts to selected project
  const projectScripts = useMemo(() =>
    form.project_id
      ? allScripts.filter((s: any) => s.project_id === form.project_id)
      : allScripts,
    [allScripts, form.project_id]
  );

  // Script lookup map for the table
  const scriptMap = useMemo(() => {
    const map = new Map<string, string>();
    allScripts.forEach((s: any) => map.set(s.id, s.name));
    return map;
  }, [allScripts]);

  const createMut = useMutation({
    mutationFn: (data: any) => api.schedules.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      setShowCreate(false);
      setForm({ project_id: "", script_id: "", name: "", cron_expression: "0 */6 * * *", url: "", environment: "staging" });
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

  // When script is selected, auto-fill URL from script config
  const handleScriptChange = (scriptId: string) => {
    setForm((prev) => ({ ...prev, script_id: scriptId }));
    if (scriptId) {
      const script = allScripts.find((s: any) => s.id === scriptId);
      if (script) {
        try {
          const body = typeof script.body === "string" ? JSON.parse(script.body) : script.body;
          if (body?.url) setForm((prev) => ({ ...prev, script_id: scriptId, url: body.url }));
        } catch { /* ignore parse errors */ }
        if (!form.name) setForm((prev) => ({ ...prev, name: `Schedule: ${script.name}` }));
      }
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Scheduled Tests</h1>
          <p className="mt-1 text-sm text-gray-400">
            Schedule individual tests (scripts) on a cron. Standard 5-field cron format.
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
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Schedule Name</label>
              <input
                placeholder="e.g. Nightly homepage check"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Project</label>
              <select
                value={form.project_id}
                onChange={(e) => setForm({ ...form, project_id: e.target.value, script_id: "" })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              >
                <option value="">Select project</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Test Script</label>
              <select
                value={form.script_id}
                onChange={(e) => handleScriptChange(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              >
                <option value="">Select a script to schedule</option>
                {projectScripts.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">URL to Test</label>
              <input
                placeholder="https://example.com"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Cron Expression</label>
              <input
                placeholder="0 */6 * * *"
                value={form.cron_expression}
                onChange={(e) => setForm({ ...form, cron_expression: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono"
              />
              <p className="mt-1 text-[10px] text-gray-600">min hour dom mon dow</p>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Environment</label>
              <select
                value={form.environment}
                onChange={(e) => setForm({ ...form, environment: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
              >
                {environments.length > 0 ? (
                  environments.map((env: any) => (
                    <option key={env.slug} value={env.slug}>{env.name}</option>
                  ))
                ) : (
                  <>
                    <option value="staging">Staging</option>
                    <option value="production">Production</option>
                  </>
                )}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() =>
                  createMut.mutate({
                    project_id: form.project_id,
                    script_id: form.script_id || undefined,
                    name: form.name,
                    cron_expression: form.cron_expression,
                    environment: form.environment,
                    config: { url: form.url },
                  })
                }
                disabled={!form.name || !form.project_id || !form.url}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Create Schedule
              </button>
            </div>
          </div>
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
                <th className="px-4 py-2 text-left text-xs text-gray-400">Script</th>
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
                  <td className="px-4 py-2 text-xs text-gray-400">
                    {s.script_id ? (scriptMap.get(s.script_id) ?? s.script_id.slice(0, 8)) : "—"}
                  </td>
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
