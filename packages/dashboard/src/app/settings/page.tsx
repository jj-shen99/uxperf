"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";
import { useCurrentUser } from "@/hooks/use-current-user";

type ProjectSortKey = "name" | "id" | "created_at";
type SettingsTab = "general" | "profile";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { projects } = useProjects();
  const { isAdmin, currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // --- Profile Management ---
  const [profileForm, setProfileForm] = useState({
    display_name: currentUser?.display_name ?? "",
    email: currentUser?.email ?? "",
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sync profile form when currentUser loads/changes
  useEffect(() => {
    if (currentUser) {
      setProfileForm({
        display_name: currentUser.display_name ?? "",
        email: currentUser.email ?? "",
      });
    }
  }, [currentUser?.id]);

  const updateProfileMut = useMutation({
    mutationFn: (data: { display_name?: string }) =>
      api.rbac.users.update(currentUser!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setProfileMsg({ type: "success", text: "Profile updated successfully" });
    },
    onError: (err: Error) => setProfileMsg({ type: "error", text: err.message }),
  });

  const changePasswordMut = useMutation({
    mutationFn: (data: { user_id: string; current_password: string; new_password: string }) =>
      api.auth.changePassword(data),
    onSuccess: () => {
      setPasswordForm({ current_password: "", new_password: "", confirm_password: "" });
      setPasswordMsg({ type: "success", text: "Password changed successfully" });
    },
    onError: (err: Error) => setPasswordMsg({ type: "error", text: err.message }),
  });

  // --- Project Management ---
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProject, setNewProject] = useState({ name: "", description: "" });
  const [projectSort, setProjectSort] = useState<{ key: ProjectSortKey; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });

  const toggleProjectSort = (key: ProjectSortKey) => {
    setProjectSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const sortedProjects = [...projects].sort((a: any, b: any) => {
    const aVal = (a[projectSort.key] ?? "").toString().toLowerCase();
    const bVal = (b[projectSort.key] ?? "").toString().toLowerCase();
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return projectSort.dir === "asc" ? cmp : -cmp;
  });

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

  // --- Environments ---
  const { data: environments = [] } = useQuery({
    queryKey: ["environments"],
    queryFn: () => api.environments.list(),
  });

  const [showCreateEnv, setShowCreateEnv] = useState(false);
  const [envForm, setEnvForm] = useState({ name: "", slug: "", description: "" });

  const createEnvMut = useMutation({
    mutationFn: (data: { name: string; slug: string; description?: string }) => api.environments.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["environments"] });
      setShowCreateEnv(false);
      setEnvForm({ name: "", slug: "", description: "" });
    },
  });

  const deleteEnvMut = useMutation({
    mutationFn: (id: string) => api.environments.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["environments"] }),
  });

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="mt-1 text-sm text-gray-400">
          Manage projects, notifications, and your profile
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-800 pb-0">
        {(["general", "profile"] as SettingsTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
              activeTab === tab
                ? "bg-gray-800 text-white border-b-2 border-indigo-500"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab === "general" ? "General" : "My Profile"}
          </button>
        ))}
      </div>

      {activeTab === "profile" && currentUser && (
        <div className="space-y-6">
          {/* Profile Info */}
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-sm font-medium text-gray-400 mb-4">Profile Information</h2>
            <div className="space-y-3 max-w-md">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Display Name</label>
                <input
                  value={profileForm.display_name}
                  onChange={(e) => setProfileForm({ ...profileForm, display_name: e.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email</label>
                <input
                  value={profileForm.email}
                  disabled
                  className="w-full rounded-md border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                />
                <p className="text-[10px] text-gray-600 mt-1">Email changes require admin assistance</p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Role</label>
                <input
                  value={currentUser.role}
                  disabled
                  className="w-full rounded-md border border-gray-700 bg-gray-800/50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
                />
              </div>
              <button
                onClick={() => {
                  setProfileMsg(null);
                  updateProfileMut.mutate({ display_name: profileForm.display_name });
                }}
                disabled={!profileForm.display_name || updateProfileMut.isPending}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {updateProfileMut.isPending ? "Saving..." : "Save Changes"}
              </button>
              {profileMsg && (
                <p className={`text-sm ${profileMsg.type === "success" ? "text-green-400" : "text-red-400"}`}>
                  {profileMsg.text}
                </p>
              )}
            </div>
          </section>

          {/* Change Password */}
          <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-sm font-medium text-gray-400 mb-4">Change Password</h2>
            <div className="space-y-3 max-w-md">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Current Password</label>
                <input
                  type="password"
                  value={passwordForm.current_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">New Password</label>
                <input
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
                />
              </div>
              <button
                onClick={() => {
                  setPasswordMsg(null);
                  if (passwordForm.new_password !== passwordForm.confirm_password) {
                    setPasswordMsg({ type: "error", text: "Passwords do not match" });
                    return;
                  }
                  if (passwordForm.new_password.length < 6) {
                    setPasswordMsg({ type: "error", text: "Password must be at least 6 characters" });
                    return;
                  }
                  changePasswordMut.mutate({
                    user_id: currentUser.id,
                    current_password: passwordForm.current_password,
                    new_password: passwordForm.new_password,
                  });
                }}
                disabled={!passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password || changePasswordMut.isPending}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {changePasswordMut.isPending ? "Changing..." : "Change Password"}
              </button>
              {passwordMsg && (
                <p className={`text-sm ${passwordMsg.type === "success" ? "text-green-400" : "text-red-400"}`}>
                  {passwordMsg.text}
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "general" && <>
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
          {isAdmin && (
            <button
              onClick={() => setShowCreateProject(!showCreateProject)}
              className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            >
              {showCreateProject ? "Cancel" : "New Project"}
            </button>
          )}
        </div>

        {isAdmin && showCreateProject && (
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
              {createProjectMut.isPending ? "Creating..." : "Create"}
            </button>
            {createProjectMut.isError && (
              <p className="text-sm text-red-400">{(createProjectMut.error as Error).message}</p>
            )}
          </div>
        )}

        {projects.length === 0 ? (
          <p className="text-sm text-gray-500">No projects yet.</p>
        ) : (
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800/50">
                <tr>
                  {([["name", "Name"], ["id", "ID"], ["created_at", "Created"]] as [ProjectSortKey, string][]).map(([key, label]) => (
                    <th
                      key={key}
                      onClick={() => toggleProjectSort(key)}
                      className="px-4 py-2 text-left text-xs text-gray-400 cursor-pointer hover:text-gray-200 select-none"
                    >
                      {label} {projectSort.key === key ? (projectSort.dir === "asc" ? "▲" : "▼") : ""}
                    </th>
                  ))}
                  {isAdmin && <th className="px-4 py-2 text-right text-xs text-gray-400">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {sortedProjects.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-800/30">
                    <td className="px-4 py-2 text-gray-200">{p.name}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">{p.id}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => { if (confirm(`Delete project "${p.name}"?`)) deleteProjectMut.mutate(p.id); }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Notification Channels */}
      <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-400">Notification Channels</h2>
          {isAdmin && (
            <button
              onClick={() => setShowCreateChannel(!showCreateChannel)}
              className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            >
              {showCreateChannel ? "Cancel" : "Add Channel"}
            </button>
          )}
        </div>

        {isAdmin && showCreateChannel && (
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
                  {isAdmin && (
                    <button
                      onClick={() => { if (confirm(`Delete channel "${ch.name}"?`)) deleteChannelMut.mutate(ch.id); }}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Environment Management (Admin only) */}
      {isAdmin && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-medium text-gray-400">Environments</h2>
              <p className="text-xs text-gray-600 mt-1">Manage testing environments available across the platform</p>
            </div>
            <button
              onClick={() => setShowCreateEnv(!showCreateEnv)}
              className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500"
            >
              {showCreateEnv ? "Cancel" : "Add Environment"}
            </button>
          </div>

          {showCreateEnv && (
            <div className="mb-4 space-y-3 rounded-md border border-gray-700 bg-gray-800 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    placeholder="e.g. Pre-Production"
                    value={envForm.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                      setEnvForm({ ...envForm, name, slug });
                    }}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Slug</label>
                  <input
                    placeholder="pre-production"
                    value={envForm.slug}
                    onChange={(e) => setEnvForm({ ...envForm, slug: e.target.value })}
                    className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
                <input
                  placeholder="Purpose of this environment"
                  value={envForm.description}
                  onChange={(e) => setEnvForm({ ...envForm, description: e.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200"
                />
              </div>
              <button
                onClick={() => createEnvMut.mutate(envForm)}
                disabled={!envForm.name || !envForm.slug || createEnvMut.isPending}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {createEnvMut.isPending ? "Creating..." : "Create Environment"}
              </button>
            </div>
          )}

          {environments.length === 0 ? (
            <p className="text-sm text-gray-500">No environments configured.</p>
          ) : (
            <div className="space-y-2">
              {environments.map((env: any) => (
                <div key={env.id} className="flex items-center justify-between rounded-md border border-gray-700 bg-gray-800 px-4 py-3">
                  <div>
                    <div className="text-sm text-gray-200">{env.name}</div>
                    <div className="text-xs text-gray-500">
                      <span className="font-mono">{env.slug}</span>
                      {env.description && <span className="ml-2">&middot; {env.description}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => { if (confirm(`Delete environment "${env.name}"?`)) deleteEnvMut.mutate(env.id); }}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      </>}
    </div>
  );
}
