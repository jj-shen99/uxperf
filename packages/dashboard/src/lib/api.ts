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
  analytics: {
    anomalies: (projectId?: string, status?: string) =>
      request<any[]>(
        `/analytics/anomalies?${projectId ? `project_id=${projectId}&` : ""}${status ? `status=${status}` : ""}`,
      ),
    getAnomaly: (id: string) => request<any>(`/analytics/anomalies/${id}`),
    updateAnomalyStatus: (id: string, status: string) =>
      request<any>(`/analytics/anomalies/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    feedback: (id: string, feedback: string) =>
      request<any>(`/analytics/anomalies/${id}/feedback`, {
        method: "PATCH",
        body: JSON.stringify({ feedback }),
      }),
    detect: (data: { project_id: string; environment?: string }) =>
      request<any[]>("/analytics/detect", { method: "POST", body: JSON.stringify(data) }),
    changePoints: (data: { project_id: string; environment?: string }) =>
      request<any[]>("/analytics/detect/change-points", { method: "POST", body: JSON.stringify(data) }),
    attribution: (baselineRunId: string, regressionRunId: string, metric: string) =>
      request<any>(
        `/analytics/attribution?baseline_run_id=${baselineRunId}&regression_run_id=${regressionRunId}&metric=${metric}`,
      ),
  },
  reports: {
    generate: (data: { project_id: string; days?: number; environment?: string }) =>
      request<any>("/reports/executive", { method: "POST", body: JSON.stringify(data) }),
    list: (projectId: string, reportType?: string) =>
      request<any[]>(
        `/reports?project_id=${projectId}${reportType ? `&report_type=${reportType}` : ""}`,
      ),
    get: (id: string) => request<any>(`/reports/${id}`),
  },
  authoring: {
    generate: (data: { project_id: string; prompt: string; target_url?: string; device?: string }) =>
      request<any>("/authoring/generate", { method: "POST", body: JSON.stringify(data) }),
    logs: (projectId: string) => request<any[]>(`/authoring/logs?project_id=${projectId}`),
    policy: (projectId: string) => request<any>(`/authoring/policy?project_id=${projectId}`),
  },
  load: {
    profiles: {
      list: (projectId?: string) =>
        request<any[]>(`/load/profiles${projectId ? `?project_id=${projectId}` : ""}`),
      get: (id: string) => request<any>(`/load/profiles/${id}`),
      create: (data: any) => request<any>("/load/profiles", { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: any) =>
        request<any>(`/load/profiles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      delete: (id: string) => request<void>(`/load/profiles/${id}`, { method: "DELETE" }),
    },
    runs: {
      list: (projectId?: string, status?: string) =>
        request<any[]>(
          `/load/runs?${projectId ? `project_id=${projectId}&` : ""}${status ? `status=${status}` : ""}`,
        ),
      get: (id: string) => request<any>(`/load/runs/${id}`),
      create: (data: any) => request<any>("/load/runs", { method: "POST", body: JSON.stringify(data) }),
      updateStatus: (id: string, status: string, extras?: any) =>
        request<any>(`/load/runs/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status, ...extras }),
        }),
      cancel: (id: string) =>
        request<any>(`/load/runs/${id}/cancel`, { method: "POST" }),
      costEstimate: (data: { stages: any[]; target_vus: number }) =>
        request<any>("/load/runs/cost-estimate", { method: "POST", body: JSON.stringify(data) }),
    },
    telemetry: {
      snapshots: (loadRunId: string, host?: string) =>
        request<any[]>(`/load/telemetry/${loadRunId}${host ? `?host=${host}` : ""}`),
      summary: (loadRunId: string) => request<any[]>(`/load/telemetry/${loadRunId}/summary`),
    },
    correlation: (loadRunId: string) => request<any>(`/load/correlation/${loadRunId}`),
    evaluateGates: (data: { load_run_id: string; actual_vus: number; metrics_summary: Record<string, number> }) =>
      request<any[]>("/load/gates/evaluate", { method: "POST", body: JSON.stringify(data) }),
  },
  health: {
    check: () => request<{ status: string; timestamp: string }>("/health"),
  },
};
