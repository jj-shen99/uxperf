const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// -- Projects --
export const api = {
  projects: {
    list: () => request<any[]>("/projects"),
    get: (id: string) => request<any>(`/projects/${id}`),
    create: (data: any) => request<any>("/projects", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/projects/${id}`, { method: "DELETE" }),
  },
  scripts: {
    list: (projectId?: string) => request<any[]>(`/scripts${projectId ? `?project_id=${projectId}` : ""}`),
    get: (id: string) => request<any>(`/scripts/${id}`),
    create: (data: any) => request<any>("/scripts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/scripts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/scripts/${id}`, { method: "DELETE" }),
  },
  runs: {
    list: (projectId?: string) => request<any[]>(`/runs${projectId ? `?project_id=${projectId}` : ""}`),
    get: (id: string) => request<any>(`/runs/${id}`),
    create: (data: any) => request<any>("/runs", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/runs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    getGateResults: (id: string) => request<any[]>(`/runs/${id}/gates`),
  },
  gates: {
    list: (projectId?: string) => request<any[]>(`/gates${projectId ? `?project_id=${projectId}` : ""}`),
    get: (id: string) => request<any>(`/gates/${id}`),
    create: (data: any) => request<any>("/gates", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/gates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/gates/${id}`, { method: "DELETE" }),
  },
  schedules: {
    list: (projectId?: string) => request<any[]>(`/schedules${projectId ? `?project_id=${projectId}` : ""}`),
    get: (id: string) => request<any>(`/schedules/${id}`),
    create: (data: any) => request<any>("/schedules", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/schedules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/schedules/${id}`, { method: "DELETE" }),
  },
  baselines: {
    list: (projectId?: string) => request<any[]>(`/baselines${projectId ? `?project_id=${projectId}` : ""}`),
    active: (projectId: string, metric: string) =>
      request<any>(`/baselines/active?project_id=${projectId}&metric=${metric}`),
    compute: (data: { project_id: string; metric: string }) =>
      request<any>("/baselines/compute", { method: "POST", body: JSON.stringify(data) }),
    refresh: (data: { project_id: string }) =>
      request<any>("/baselines/refresh", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/baselines/${id}`, { method: "DELETE" }),
  },
  trends: {
    metrics: (projectId: string, metric?: string, limit?: number) =>
      request<any[]>(
        `/trends?project_id=${projectId}${metric ? `&metric=${metric}` : ""}${limit ? `&limit=${limit}` : ""}`,
      ),
    summary: (projectId: string) => request<any>(`/trends/summary?project_id=${projectId}`),
  },
  notifications: {
    listChannels: (projectId?: string) =>
      request<any[]>(`/notifications/channels${projectId ? `?project_id=${projectId}` : ""}`),
    createChannel: (data: any) =>
      request<any>("/notifications/channels", { method: "POST", body: JSON.stringify(data) }),
    updateChannel: (id: string, data: any) =>
      request<any>(`/notifications/channels/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteChannel: (id: string) =>
      request<void>(`/notifications/channels/${id}`, { method: "DELETE" }),
    test: (channelId: string) =>
      request<any>("/notifications/test", { method: "POST", body: JSON.stringify({ channel_id: channelId }) }),
  },
  perRequest: {
    byRun: (runId: string) => request<any[]>(`/per-request/${runId}`),
    summary: (runId: string) => request<any[]>(`/per-request/${runId}/summary`),
  },
  health: {
    check: () => request<{ status: string; timestamp: string }>("/health"),
  },
};
