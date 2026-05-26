"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";

const statusColors: Record<string, string> = {
  queued: "bg-gray-100 text-gray-700",
  warming: "bg-yellow-100 text-yellow-800",
  running: "bg-blue-100 text-blue-800",
  cooling: "bg-indigo-100 text-indigo-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-200 text-gray-500",
};

export default function LoadTestingPage() {
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  const { data: loadRuns = [] } = useQuery({
    queryKey: ["load-runs"],
    queryFn: () => api.load.runs.list(),
    refetchInterval: 5000,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["load-profiles"],
    queryFn: () => api.load.profiles.list(),
  });

  const { data: correlation } = useQuery({
    queryKey: ["load-correlation", selectedRun],
    queryFn: () => api.load.correlation(selectedRun!),
    enabled: !!selectedRun,
  });

  const { data: telemetrySummary } = useQuery({
    queryKey: ["load-telemetry", selectedRun],
    queryFn: () => api.load.telemetry.summary(selectedRun!),
    enabled: !!selectedRun,
  });

  const createRun = useMutation({
    mutationFn: (profileId: string) =>
      api.load.runs.create({ project_id: "default", load_profile_id: profileId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["load-runs"] }),
  });

  const cancelRun = useMutation({
    mutationFn: (id: string) => api.load.runs.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["load-runs"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Load Testing</h1>
          <p className="text-sm text-muted-foreground">
            Concurrent browser load tests with k6, server telemetry correlation, and VU-parameterized gates
          </p>
        </div>
      </div>

      {/* Profiles & Quick Launch */}
      {profiles.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Load Profiles</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {profiles.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded border bg-background px-4 py-3">
                <div>
                  <div className="font-medium text-sm">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.target_vus} VUs · {p.stages?.length ?? 0} stages · {p.cache_state}
                  </div>
                </div>
                <button
                  onClick={() => createRun.mutate(p.id)}
                  disabled={createRun.isPending}
                  className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Launch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Load Runs */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Load Runs</h3>
        <div className="space-y-2">
          {loadRuns.map((run: any) => (
            <div
              key={run.id}
              className={`rounded-lg border bg-card p-4 cursor-pointer transition-colors ${
                selectedRun === run.id ? "ring-2 ring-primary" : "hover:bg-muted/50"
              }`}
              onClick={() => setSelectedRun(run.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[run.status] ?? ""}`}>
                    {run.status}
                  </span>
                  <span className="text-sm font-medium">{run.engine}</span>
                  <span className="text-xs text-muted-foreground">
                    {run.target_vus} VUs · {run.cache_state}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {run.vu_minutes && (
                    <span className="text-xs text-muted-foreground">
                      {Number(run.vu_minutes).toFixed(1)} VU-min
                    </span>
                  )}
                  {run.cost_estimate && (
                    <span className="text-xs font-mono">
                      ${run.cost_estimate.total_cost?.toFixed(2)}
                    </span>
                  )}
                  {["queued", "warming", "running"].includes(run.status) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); cancelRun.mutate(run.id); }}
                      className="rounded border px-2 py-0.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      Cancel
                    </button>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Saturation warnings */}
              {run.saturation_warnings?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {run.saturation_warnings.map((w: any, i: number) => (
                    <div key={i} className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1">
                      ⚠ {w.message}
                    </div>
                  ))}
                </div>
              )}

              {/* Stages visualization */}
              {run.stages?.length > 0 && (
                <div className="mt-2 flex gap-0.5 h-4">
                  {run.stages.map((stage: any, i: number) => {
                    const totalDur = run.stages.reduce((s: number, st: any) => s + st.duration_s, 0);
                    const pct = (stage.duration_s / totalDur) * 100;
                    const maxVus = Math.max(...run.stages.map((st: any) => st.target_vus), 1);
                    const intensity = Math.round((stage.target_vus / maxVus) * 100);
                    return (
                      <div
                        key={i}
                        className="rounded-sm"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: `rgba(79, 70, 229, ${intensity / 100})`,
                        }}
                        title={`Stage ${i + 1}: ${stage.target_vus} VUs for ${stage.duration_s}s`}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {loadRuns.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              No load runs yet. Create a load profile and launch a run.
            </div>
          )}
        </div>
      </div>

      {/* Correlation Detail */}
      {selectedRun && correlation && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Load Correlation — {selectedRun.slice(0, 8)}</h3>

          {/* Summary Cards */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <div className="rounded border bg-card p-3">
              <div className="text-xs text-muted-foreground">Peak VUs</div>
              <div className="text-xl font-bold">{correlation.summary.peak_vus}</div>
            </div>
            <div className="rounded border bg-card p-3">
              <div className="text-xs text-muted-foreground">Duration</div>
              <div className="text-xl font-bold">{correlation.summary.total_duration_s?.toFixed(0)}s</div>
            </div>
            <div className="rounded border bg-card p-3">
              <div className="text-xs text-muted-foreground">Peak CPU</div>
              <div className="text-xl font-bold">{correlation.summary.peak_cpu_percent?.toFixed(1) ?? "—"}%</div>
            </div>
            <div className="rounded border bg-card p-3">
              <div className="text-xs text-muted-foreground">Saturation</div>
              <div className="text-xl font-bold">
                {correlation.summary.saturation_point_vus
                  ? `${correlation.summary.saturation_point_vus} VUs`
                  : "None"}
              </div>
            </div>
          </div>

          {/* Correlations */}
          {correlation.correlations?.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">
                VU ↔ Server Metric Correlations
              </h4>
              <div className="space-y-2">
                {correlation.correlations.map((c: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-40 font-mono text-xs">{c.server_metric}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          c.direction === "positive" ? "bg-red-400" : c.direction === "negative" ? "bg-green-400" : "bg-gray-400"
                        }`}
                        style={{ width: `${Math.abs(c.pearson_r) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs w-16 text-right">
                      r={c.pearson_r.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Server Telemetry Summary */}
          {telemetrySummary && telemetrySummary.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Server Resources</h4>
              <div className="space-y-3">
                {telemetrySummary.map((host: any) => (
                  <div key={host.host} className="rounded border bg-background p-3">
                    <div className="text-sm font-medium">{host.host}</div>
                    <div className="mt-1 grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                      <div>CPU peak: {Number(host.peak_cpu_percent).toFixed(1)}%</div>
                      <div>Memory peak: {Number(host.peak_memory_percent).toFixed(1)}%</div>
                      <div>Connections: {host.peak_connections}</div>
                      <div>Event loop: {Number(host.avg_event_loop_lag_ms).toFixed(1)}ms</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stage Annotations */}
          {correlation.stages?.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Ramp Stages</h4>
              <div className="space-y-1">
                {correlation.stages.map((s: any) => (
                  <div key={s.index} className="flex items-center gap-3 text-sm">
                    <span className="w-8 text-xs text-muted-foreground">#{s.index + 1}</span>
                    <span className="flex-1">{s.label}</span>
                    <span className="text-xs text-muted-foreground">{s.duration_s}s</span>
                    <span className="text-xs font-mono">{s.ramp_type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
