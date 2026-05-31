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
  const contentLength = res.headers.get("content-length");
  if (res.status === 204 || contentLength === "0") {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
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
    list: (projectId?: string, userId?: string, isAdmin?: boolean) => {
      const params = new URLSearchParams();
      if (projectId) params.set("project_id", projectId);
      if (userId) params.set("user_id", userId);
      if (isAdmin) params.set("is_admin", "true");
      const qs = params.toString();
      return request<any[]>(`/scripts${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => request<any>(`/scripts/${id}`),
    create: (data: any) => request<any>("/scripts", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/scripts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/scripts/${id}`, { method: "DELETE" }),
  },
  runs: {
    list: (projectId?: string, userId?: string, isAdmin?: boolean) => {
      const params = new URLSearchParams();
      if (projectId) params.set("project_id", projectId);
      if (userId) params.set("user_id", userId);
      if (isAdmin) params.set("is_admin", "true");
      const qs = params.toString();
      return request<any[]>(`/runs${qs ? `?${qs}` : ""}`);
    },
    get: (id: string) => request<any>(`/runs/${id}`),
    create: (data: any) => request<any>("/runs", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/runs/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/runs/${id}`, { method: "DELETE" }),
    getGateResults: (id: string) => request<any[]>(`/runs/${id}/gates`),
    claim: () => request<any>("/runs/claim", { method: "POST" }),
    complete: (id: string, payload: any) => request<any>(`/runs/${id}/complete`, { method: "POST", body: JSON.stringify(payload) }),
  },
  gates: {
    list: (projectId?: string) => request<any[]>(`/gates${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
    get: (id: string) => request<any>(`/gates/${id}`),
    create: (data: any) => request<any>("/gates", { method: "POST", body: JSON.stringify(data) }),
    batchCreate: (projectId: string, gates: any[]) => request<any>("/gates/batch", { method: "POST", body: JSON.stringify({ project_id: projectId, gates }) }),
    update: (id: string, data: any) => request<any>(`/gates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/gates/${id}`, { method: "DELETE" }),
    evaluate: (runId: string) => request<any[]>("/gates/evaluate", { method: "POST", body: JSON.stringify({ run_id: runId }) }),
    getRunResults: (runId: string) => request<any[]>(`/gates/results/${encodeURIComponent(runId)}`),
  },
  schedules: {
    list: (projectId?: string) => request<any[]>(`/schedules${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
    get: (id: string) => request<any>(`/schedules/${id}`),
    create: (data: any) => request<any>("/schedules", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/schedules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/schedules/${id}`, { method: "DELETE" }),
  },
  baselines: {
    list: (projectId?: string) => request<any[]>(`/baselines${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
    active: (projectId: string, metric: string) =>
      request<any>(`/baselines/active?project_id=${encodeURIComponent(projectId)}&metric=${encodeURIComponent(metric)}`),
    compute: (data: { project_id: string; metric: string }) =>
      request<any>("/baselines/compute", { method: "POST", body: JSON.stringify(data) }),
    refresh: (data: { project_id: string }) =>
      request<any>("/baselines/refresh", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/baselines/${id}`, { method: "DELETE" }),
  },
  trends: {
    metrics: (projectId: string, metric?: string, limit?: number) =>
      request<any[]>(
        `/trends?project_id=${encodeURIComponent(projectId)}${metric ? `&metric=${encodeURIComponent(metric)}` : ""}${limit ? `&limit=${limit}` : ""}`,
      ),
    summary: (projectId: string) => request<any>(`/trends/summary?project_id=${encodeURIComponent(projectId)}`),
  },
  notifications: {
    listChannels: (projectId?: string) =>
      request<any[]>(`/notifications/channels${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
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
    anomalies: (projectId?: string, status?: string) => {
      const params = new URLSearchParams();
      if (projectId) params.set("project_id", projectId);
      if (status) params.set("status", status);
      const qs = params.toString();
      return request<any[]>(`/analytics/anomalies${qs ? `?${qs}` : ""}`);
    },
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
        `/analytics/attribution?baseline_run_id=${encodeURIComponent(baselineRunId)}&regression_run_id=${encodeURIComponent(regressionRunId)}&metric=${encodeURIComponent(metric)}`,
      ),
  },
  reports: {
    generate: (data: { project_id: string; days?: number; environment?: string }) =>
      request<any>("/reports/executive", { method: "POST", body: JSON.stringify(data) }),
    list: (projectId: string, reportType?: string) =>
      request<any[]>(
        `/reports?project_id=${encodeURIComponent(projectId)}${reportType ? `&report_type=${encodeURIComponent(reportType)}` : ""}`,
      ),
    get: (id: string) => request<any>(`/reports/${id}`),
    delete: (id: string) => request<any>(`/reports/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
  authoring: {
    generate: (data: { project_id: string; prompt: string; target_url?: string; device?: string }) =>
      request<any>("/authoring/generate", { method: "POST", body: JSON.stringify(data) }),
    logs: (projectId: string) => request<any[]>(`/authoring/logs?project_id=${encodeURIComponent(projectId)}`),
    policy: (projectId: string) => request<any>(`/authoring/policy?project_id=${encodeURIComponent(projectId)}`),
  },
  load: {
    profiles: {
      list: (projectId?: string) =>
        request<any[]>(`/load/profiles${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ""}`),
      get: (id: string) => request<any>(`/load/profiles/${id}`),
      create: (data: any) => request<any>("/load/profiles", { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: any) =>
        request<any>(`/load/profiles/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      delete: (id: string) => request<void>(`/load/profiles/${id}`, { method: "DELETE" }),
    },
    runs: {
      list: (projectId?: string, status?: string) => {
        const params = new URLSearchParams();
        if (projectId) params.set("project_id", projectId);
        if (status) params.set("status", status);
        const qs = params.toString();
        return request<any[]>(`/load/runs${qs ? `?${qs}` : ""}`);
      },
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
        request<any[]>(`/load/telemetry/${encodeURIComponent(loadRunId)}${host ? `?host=${encodeURIComponent(host)}` : ""}`),
      summary: (loadRunId: string) => request<any[]>(`/load/telemetry/${loadRunId}/summary`),
    },
    correlation: (loadRunId: string) => request<any>(`/load/correlation/${loadRunId}`),
    evaluateGates: (data: { load_run_id: string; actual_vus: number; metrics_summary: Record<string, number> }) =>
      request<any[]>("/load/gates/evaluate", { method: "POST", body: JSON.stringify(data) }),
  },
  intelligence: {
    attribution: {
      compute: (data: any) => request<any>("/intelligence/attribution", { method: "POST", body: JSON.stringify(data) }),
      list: (projectId: string) => request<any[]>(`/intelligence/attribution?project_id=${encodeURIComponent(projectId)}`),
      get: (id: string) => request<any>(`/intelligence/attribution/${id}`),
    },
    forecast: {
      generate: (data: any) => request<any>("/intelligence/forecast", { method: "POST", body: JSON.stringify(data) }),
      list: (projectId: string, metric?: string) =>
        request<any[]>(`/intelligence/forecast?project_id=${encodeURIComponent(projectId)}${metric ? `&metric=${encodeURIComponent(metric)}` : ""}`),
    },
    rum: {
      ingest: (data: any) => request<any>("/intelligence/rum/ingest", { method: "POST", body: JSON.stringify(data) }),
      ingestBatch: (events: any[]) =>
        request<any>("/intelligence/rum/ingest/batch", { method: "POST", body: JSON.stringify({ events }) }),
      summary: (projectId: string, days?: number, origin?: string) =>
        request<any[]>(`/intelligence/rum/summary?project_id=${encodeURIComponent(projectId)}${days ? `&days=${days}` : ""}${origin ? `&origin=${encodeURIComponent(origin)}` : ""}`),
      trend: (projectId: string, metric: string, days?: number) =>
        request<any[]>(`/intelligence/rum/trend?project_id=${encodeURIComponent(projectId)}&metric=${encodeURIComponent(metric)}${days ? `&days=${days}` : ""}`),
    },
    crux: {
      fetch: (data: any) => request<any>("/intelligence/crux/fetch", { method: "POST", body: JSON.stringify(data) }),
      list: (projectId: string, origin?: string) =>
        request<any[]>(`/intelligence/crux?project_id=${encodeURIComponent(projectId)}${origin ? `&origin=${encodeURIComponent(origin)}` : ""}`),
    },
    capacity: {
      generateReport: (data: { project_id: string; horizon_days?: number }) =>
        request<any>("/intelligence/capacity/report", { method: "POST", body: JSON.stringify(data) }),
      listReports: (projectId: string) => request<any[]>(`/intelligence/capacity/reports?project_id=${encodeURIComponent(projectId)}`),
      evaluateResourceFloor: (data: any) =>
        request<any>("/intelligence/capacity/resource-floor", { method: "POST", body: JSON.stringify(data) }),
    },
    audit: {
      query: (params: Record<string, string>) => {
        const qs = new URLSearchParams(params).toString();
        return request<any[]>(`/intelligence/audit${qs ? `?${qs}` : ""}`);
      },
      summary: (projectId: string) => request<any[]>(`/intelligence/audit/summary?project_id=${encodeURIComponent(projectId)}`),
    },
    apiKeys: {
      create: (data: any) => request<any>("/intelligence/api-keys", { method: "POST", body: JSON.stringify(data) }),
      list: (projectId: string) => request<any[]>(`/intelligence/api-keys?project_id=${encodeURIComponent(projectId)}`),
      revoke: (id: string) => request<void>(`/intelligence/api-keys/${id}/revoke`, { method: "POST" }),
      delete: (id: string) => request<void>(`/intelligence/api-keys/${id}`, { method: "DELETE" }),
    },
    geo: {
      locations: (provider?: string) =>
        request<any[]>(`/intelligence/geo/locations${provider ? `?provider=${encodeURIComponent(provider)}` : ""}`),
      dispatch: (data: any) =>
        request<any>("/intelligence/geo/dispatch", { method: "POST", body: JSON.stringify(data) }),
    },
  },
  auth: {
    register: (data: { email: string; display_name: string; password: string }) =>
      request<any>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email: string; password: string }) =>
      request<any>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    forgotPassword: (data: { email: string }) =>
      request<any>("/auth/forgot-password", { method: "POST", body: JSON.stringify(data) }),
    resetPassword: (data: { token: string; password: string }) =>
      request<any>("/auth/reset-password", { method: "POST", body: JSON.stringify(data) }),
    changePassword: (data: { user_id: string; current_password: string; new_password: string }) =>
      request<any>("/auth/change-password", { method: "POST", body: JSON.stringify(data) }),
  },
  rbac: {
    users: {
      list: () => request<any[]>("/rbac/users"),
      get: (id: string) => request<any>(`/rbac/users/${id}`),
      create: (data: { email: string; display_name: string; role?: string; password?: string }) =>
        request<any>("/rbac/users", { method: "POST", body: JSON.stringify(data) }),
      update: (id: string, data: { display_name?: string; email?: string; role?: string; is_active?: boolean }) =>
        request<any>(`/rbac/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      delete: (id: string) => request<void>(`/rbac/users/${id}`, { method: "DELETE" }),
    },
    projectMembers: {
      list: (projectId: string) => request<any[]>(`/rbac/projects/${projectId}/members`),
      add: (projectId: string, data: { user_id: string; role?: string }) =>
        request<any>(`/rbac/projects/${projectId}/members`, { method: "POST", body: JSON.stringify(data) }),
      remove: (projectId: string, userId: string) =>
        request<void>(`/rbac/projects/${projectId}/members/${userId}`, { method: "DELETE" }),
    },
  },
  environments: {
    list: () => request<any[]>("/environments"),
    create: (data: { name: string; slug: string; description?: string }) =>
      request<any>("/environments", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/environments/${id}`, { method: "DELETE" }),
  },
  health: {
    check: () => request<{ status: string; timestamp: string }>("/health"),
  },
};
