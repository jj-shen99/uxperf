"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { projects } = useProjects();

  // --- Project Management ---
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "" });

  const createProjectMut = useMutation({
    mutationFn: (data: { name: string; description?: string }) => api.projects.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setShowCreateProject(false);
      setNewProject({ name: "", description: "" });
    },
  });

  const deleteProjectMut = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  // --- API Health ---
  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health.check(),
    refetchInterval: 30_000,
  });

  // --- Notification Channels ---
  const { data: channels = [] } = useQuery({
    queryKey: ["notification-channels"],
    queryFn: () => api.notifications.listChannels(),
  });

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [channelForm, setChannelForm] = useState({
    name: "",
    channel_type: "slack" as string,
    config: "{}",
    project_id: "",
  });

  const createChannelMut = useMutation({
    mutationFn: (data: any) => api.notifications.createChannel(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notification-channels"] });
      setShowCreateChannel(false);
      setChannelForm({ name: "", channel_type: "slack", config: "{}", project_id: "" });
    },
  });

  const deleteChannelMut = useMutation({
    mutationFn: (id: string) => api.notifications.deleteChannel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-channels"] }),
  });

  const testChannelMut = useMutation({
    mutationFn: (id: string) => api.notifications.test(id),
  });

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-400">
          Manage projects, notifications, and system health
        </p>
      </div>

      {/* API Health */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">API Health</h2>
        {healthLoading ? (
          <p className="text-sm text-gray-500">Checking...</p>
        ) : health ? (
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${health.status === "ok" ? "bg-green-500" : "bg-red-500"}`} />
            <span className="text-sm text-gray-200">
              Status: <strong>{health.status}</strong>
            </span>
            <span className="text-xs text-gray-500 ml-4">
              Last checked: {new Date(health.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-sm text-red-400">API unreachable</span>
          </div>
        )}
      </section>

      {/* Project Management */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400">Projects</h2>
          <button
            onClick={() => setShowCreateProject(!showCreateProject)}
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
          >
            {showCreateProject ? "Cancel" : "New Project"}
          </button>
        </div>

        {showCreateProject && (
          <div className="mb-4 space-y-3 rounded-md border border-gray-700 bg-gray-800 p-4">
            <input
              placeholder="Project name"
              value={newProject.name}
              onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            />
            <input
              placeholder="Description (optional)"
              value={newProject.description}
              onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            />
            <button
              onClick={() => createProjectMut.mutate(newProject)}
              disabled={!newProject.name || createProjectMut.isPending}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        )}

        {projects.length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet.</p>
        ) : (
          <div className="space-y-2">
            {projects.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-md border border-gray-700 bg-gray-800 px-4 py-3">
                <div>
                  <div className="text-sm text-gray-200">{p.name}</div>
                  <div className="text-xs text-gray-500">{p.id}</div>
                </div>
                <button
                  onClick={() => { if (confirm(`Delete project "${p.name}"?`)) deleteProjectMut.mutate(p.id); }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notification Channels */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400">Notification Channels</h2>
          <button
            onClick={() => setShowCreateChannel(!showCreateChannel)}
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
          >
            {showCreateChannel ? "Cancel" : "Add Channel"}
          </button>
        </div>

        {showCreateChannel && (
          <div className="mb-4 space-y-3 rounded-md border border-gray-700 bg-gray-800 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                placeholder="Channel name"
                value={channelForm.name}
                onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
              />
              <select
                value={channelForm.channel_type}
                onChange={(e) => setChannelForm({ ...channelForm, channel_type: e.target.value })}
                className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
              >
                <option value="slack">Slack</option>
                <option value="email">Email</option>
                <option value="webhook">Webhook</option>
                <option value="pagerduty">PagerDuty</option>
              </select>
            </div>
            <select
              value={channelForm.project_id}
              onChange={(e) => setChannelForm({ ...channelForm, project_id: e.target.value })}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
            >
              <option value="">Select a project</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <textarea
              placeholder='Config JSON (e.g. {"webhook_url": "..."})'
              value={channelForm.config}
              onChange={(e) => setChannelForm({ ...channelForm, config: e.target.value })}
              rows={3}
              className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-200 font-mono"
            />
            <button
              onClick={() => {
                try {
                  createChannelMut.mutate({
                    ...channelForm,
                    config: JSON.parse(channelForm.config),
                  });
                } catch {
                  alert("Invalid JSON in config");
                }
              }}
              disabled={!channelForm.name || !channelForm.project_id || createChannelMut.isPending}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Create Channel
            </button>
          </div>
        )}

        {channels.length === 0 ? (
          <p className="text-sm text-gray-500">No notification channels configured.</p>
        ) : (
          <div className="space-y-2">
            {channels.map((ch: any) => (
              <div key={ch.id} className="flex items-center justify-between rounded-md border border-gray-700 bg-gray-800 px-4 py-3">
                <div>
                  <div className="text-sm text-gray-200">{ch.name}</div>
                  <div className="text-xs text-gray-500">
                    {ch.channel_type} &middot; {ch.enabled !== false ? "Active" : "Inactive"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => testChannelMut.mutate(ch.id)}
                    disabled={testChannelMut.isPending}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => { if (confirm(`Delete channel "${ch.name}"?`)) deleteChannelMut.mutate(ch.id); }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
