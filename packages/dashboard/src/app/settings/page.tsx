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
  const { isAdmin, currentUser, login } = useCurrentUser();
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
    mutationFn: (data: { display_name?: string; email?: string }) =>
      api.rbac.users.update(currentUser!.id, data),
    onSuccess: (_data, variables) => {
      if (currentUser) {
        login({
          ...currentUser,
          ...(variables.display_name ? { display_name: variables.display_name } : {}),
          ...(variables.email ? { email: variables.email } : {}),
        });
      }
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

  // --- Engine Configuration (WPT) ---
  const { data: engineConfig = {} } = useQuery({
    queryKey: ["config", "engine"],
    queryFn: () => api.config.getAll("engine."),
  });
  const [wptForm, setWptForm] = useState({ server: "", api_key: "" });
  const [wptMsg, setWptMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sync wptForm when config loads
  useEffect(() => {
    if (engineConfig["engine.wpt_server"] || engineConfig["engine.wpt_api_key"]) {
      setWptForm({
        server: engineConfig["engine.wpt_server"] ?? "",
        api_key: engineConfig["engine.wpt_api_key"] ?? "",
      });
    }
  }, [engineConfig["engine.wpt_server"], engineConfig["engine.wpt_api_key"]]);

  const saveWptConfig = useMutation({
    mutationFn: async () => {
      await Promise.all([
        api.config.set("engine.wpt_server", wptForm.server.trim()),
        api.config.set("engine.wpt_api_key", wptForm.api_key.trim()),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["config", "engine"] });
      setWptMsg({ type: "success", text: "WPT configuration saved" });
    },
    onError: (err: Error) => setWptMsg({ type: "error", text: err.message }),
  });

  const clearWptConfig = useMutation({
    mutationFn: async () => {
      await Promise.all([
        api.config.delete("engine.wpt_server"),
        api.config.delete("engine.wpt_api_key"),
      ]);
    },
    onSuccess: () => {
      setWptForm({ server: "", api_key: "" });
      qc.invalidateQueries({ queryKey: ["config", "engine"] });
      setWptMsg({ type: "success", text: "WPT configuration cleared" });
    },
  });

  // --- Engine Configuration (k6) ---
  const [k6BinaryPath, setK6BinaryPath] = useState(engineConfig["engine.k6_binary"] ?? "");
  const [k6Msg, setK6Msg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setK6BinaryPath(engineConfig["engine.k6_binary"] ?? "");
  }, [engineConfig["engine.k6_binary"]]);

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
                  type="email"
                  value={profileForm.email}
                  onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
                />
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
                  const updates: { display_name?: string; email?: string } = {};
                  if (profileForm.display_name !== currentUser.display_name) {
                    updates.display_name = profileForm.display_name;
                  }
                  if (profileForm.email !== currentUser.email) {
                    updates.email = profileForm.email;
                  }
                  if (Object.keys(updates).length === 0) {
                    setProfileMsg({ type: "error", text: "No changes to save" });
                    return;
                  }
                  updateProfileMut.mutate(updates);
                }}
                disabled={!profileForm.display_name || !profileForm.email || updateProfileMut.isPending}
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

      {/* Engine Configuration — WebPageTest */}
      {isAdmin && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-gray-400">Engine Configuration — WebPageTest</h2>
            <p className="text-xs text-gray-600 mt-1">
              Configure a private WebPageTest instance to enable WPT as a testing engine.
              The worker will use these credentials when running WPT tests.
            </p>
          </div>
          <div className="space-y-3 max-w-lg">
            <div>
              <label className="block text-xs text-gray-400 mb-1">WPT Server URL</label>
              <input
                placeholder="https://wpt.example.com"
                value={wptForm.server}
                onChange={(e) => setWptForm({ ...wptForm, server: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">WPT API Key</label>
              <input
                type="password"
                placeholder="API key"
                value={wptForm.api_key}
                onChange={(e) => setWptForm({ ...wptForm, api_key: e.target.value })}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setWptMsg(null); saveWptConfig.mutate(); }}
                disabled={!wptForm.server.trim() || !wptForm.api_key.trim() || saveWptConfig.isPending}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {saveWptConfig.isPending ? "Saving..." : "Save WPT Config"}
              </button>
              {engineConfig["engine.wpt_server"] && (
                <button
                  onClick={() => { setWptMsg(null); clearWptConfig.mutate(); }}
                  disabled={clearWptConfig.isPending}
                  className="rounded-md border border-gray-700 px-4 py-1.5 text-sm text-gray-400 hover:text-red-400 hover:border-red-800"
                >
                  Clear
                </button>
              )}
              {engineConfig["engine.wpt_server"] && (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  Configured
                </span>
              )}
            </div>
            {wptMsg && (
              <p className={`text-sm ${wptMsg.type === "success" ? "text-green-400" : "text-red-400"}`}>
                {wptMsg.text}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Engine Configuration — k6 Browser */}
      {isAdmin && (
        <section className="rounded-lg border border-gray-800 bg-gray-900 p-6">
          <div className="mb-4">
            <h2 className="text-sm font-medium text-gray-400">Engine Configuration — k6 Browser</h2>
            <p className="text-xs text-gray-600 mt-1">
              Enable k6 browser engine for concurrent load testing. Requires the k6 binary to be installed on the worker machine.
            </p>
          </div>
          <div className="space-y-3 max-w-lg">
            <div className="flex items-center justify-between rounded-md border border-gray-700 bg-gray-800 px-4 py-3">
              <div>
                <p className="text-sm text-gray-200">k6 Browser Engine</p>
                <p className="text-xs text-gray-500">
                  {engineConfig["engine.k6_browser_enabled"] === "true"
                    ? "Enabled — load tests will use k6 browser module"
                    : "Disabled — k6 load tests will be unavailable"}
                </p>
              </div>
              <button
                onClick={() => {
                  const next = engineConfig["engine.k6_browser_enabled"] === "true" ? "false" : "true";
                  api.config.set("engine.k6_browser_enabled", next).then(() => {
                    qc.invalidateQueries({ queryKey: ["config", "engine"] });
                  });
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  engineConfig["engine.k6_browser_enabled"] === "true" ? "bg-indigo-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    engineConfig["engine.k6_browser_enabled"] === "true" ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">k6 Binary Path (optional)</label>
              <div className="flex gap-2">
                <input
                  placeholder="k6 (default)"
                  value={k6BinaryPath}
                  onChange={(e) => setK6BinaryPath(e.target.value)}
                  className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono"
                />
                <button
                  onClick={() => {
                    setK6Msg(null);
                    const value = k6BinaryPath.trim() || "k6";
                    api.config.set("engine.k6_binary", value).then(() => {
                      qc.invalidateQueries({ queryKey: ["config", "engine"] });
                      setK6Msg({ type: "success", text: "k6 binary path saved" });
                    }).catch((err: Error) => setK6Msg({ type: "error", text: err.message }));
                  }}
                  disabled={k6BinaryPath === (engineConfig["engine.k6_binary"] ?? "")}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  Save
                </button>
                {engineConfig["engine.k6_binary"] && engineConfig["engine.k6_binary"] !== "k6" && (
                  <button
                    onClick={() => {
                      api.config.delete("engine.k6_binary").then(() => {
                        setK6BinaryPath("");
                        qc.invalidateQueries({ queryKey: ["config", "engine"] });
                        setK6Msg({ type: "success", text: "k6 binary path reset to default" });
                      });
                    }}
                    className="rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:text-red-400 hover:border-red-800"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="text-[10px] text-gray-600 mt-1">
                Path to k6 binary. Leave empty to use the default system path.
              </p>
              {k6Msg && (
                <p className={`text-xs mt-1 ${k6Msg.type === "success" ? "text-green-400" : "text-red-400"}`}>
                  {k6Msg.text}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

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
