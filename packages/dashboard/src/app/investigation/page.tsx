"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";
import { AttributionPanel } from "@/components/attribution-panel";

type InvestigationTab = "timeline" | "attribution" | "gates" | "baseline";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-900/30 text-red-400 border-red-800/50",
  warning: "bg-yellow-900/30 text-yellow-400 border-yellow-800/50",
  info: "bg-blue-900/30 text-blue-400 border-blue-800/50",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-red-900/40 text-red-400",
  acknowledged: "bg-yellow-900/40 text-yellow-400",
  resolved: "bg-green-900/40 text-green-400",
  false_positive: "bg-gray-800 text-gray-400",
};

function fmtMs(v: number | null | undefined, metric?: string): string {
  if (v == null) return "—";
  if (metric === "cls") return v.toFixed(3);
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
}

export default function InvestigationPage() {
  const { projects, projectId, setProjectId } = useProjects();
  const qc = useQueryClient();
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const [tab, setTab] = useState<InvestigationTab>("timeline");

  // Fetch anomalies
  const { data: anomalies = [], isLoading } = useQuery({
    queryKey: ["anomalies", projectId],
    queryFn: () => api.analytics.anomalies(projectId || undefined),
  });

  // Selected anomaly details
  const selectedAnomaly = useMemo(
    () => anomalies.find((a: any) => a.id === selectedAnomalyId) ?? null,
    [anomalies, selectedAnomalyId],
  );

  // Fetch runs for timeline (fetch all, filter client-side for the anomaly's project)
  const { data: runs = [] } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(),
  });

  // Detect anomalies mutation
  const detectMut = useMutation({
    mutationFn: (pid: string) => api.analytics.detect({ project_id: pid }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });

  // Fetch baselines for comparison
  const { data: baselines = [] } = useQuery({
    queryKey: ["baselines", projectId],
    queryFn: () => api.baselines.list(projectId || undefined),
    enabled: !!projectId,
  });

  // Fetch gate results for the anomaly run
  const { data: gateResults = [] } = useQuery({
    queryKey: ["gate-results", selectedAnomaly?.run_id],
    queryFn: () => api.gates.getRunResults(selectedAnomaly.run_id),
    enabled: !!selectedAnomaly?.run_id,
  });

  // Status update mutation
  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.analytics.updateAnomalyStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });

  // Feedback mutation
  const feedbackMut = useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: string }) =>
      api.analytics.feedback(id, feedback),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["anomalies"] }),
  });

  // Build timeline from runs around the change point
  const timeline = useMemo(() => {
    if (!selectedAnomaly || runs.length === 0) return [];
    const metric = selectedAnomaly.metric;
    // Filter to the anomaly's project runs, sorted chronologically
    const projectRuns = runs
      .filter((r: any) => r.project_id === selectedAnomaly.project_id)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const anomalyRunIdx = projectRuns.findIndex((r: any) => r.id === selectedAnomaly.run_id);
    if (anomalyRunIdx < 0) return [];
    const windowStart = Math.max(0, anomalyRunIdx - 10);
    const windowEnd = Math.min(projectRuns.length, anomalyRunIdx + 6);
    return projectRuns
      .slice(windowStart, windowEnd)
      .filter((r: any) => r.status === "completed" && r.metrics)
      .map((r: any) => ({
        id: r.id,
        date: r.created_at ? new Date(r.created_at).toLocaleString() : "",
        value: r.metrics?.[metric] ?? null,
        isChangePoint: r.id === selectedAnomaly.run_id,
        sha: (r.config?.commit_sha ?? r.config?.build_hash ?? "").slice(0, 8) || null,
        env: r.config?.environment ?? null,
      }));
  }, [selectedAnomaly, runs]);

  // Find baseline for the anomaly metric
  const activeBaseline = useMemo(() => {
    if (!selectedAnomaly) return null;
    return baselines.find(
      (b: any) => b.metric === selectedAnomaly.metric && b.status === "active",
    );
  }, [selectedAnomaly, baselines]);

  const tabs: { key: InvestigationTab; label: string }[] = [
    { key: "timeline", label: "Change-Point Timeline" },
    { key: "attribution", label: "Attribution" },
    { key: "gates", label: "Gate Status" },
    { key: "baseline", label: "Baseline Comparison" },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Investigation</h1>
          <p className="mt-1 text-sm text-gray-400">
            Investigate regressions: timeline, attribution, gates, baselines — all in one view
          </p>
        </div>
        <select
          value={projectId}
          onChange={(e) => { setProjectId(e.target.value); setSelectedAnomalyId(null); }}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
        >
          <option value="">All projects</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Anomaly List */}
        <div className="col-span-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-gray-500">Anomalies</h2>
            {projectId && (
              <button
                onClick={() => detectMut.mutate(projectId)}
                disabled={detectMut.isPending}
                className="rounded-md bg-indigo-600 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                title="Run server-side anomaly detection for this project"
              >
                {detectMut.isPending ? "Detecting…" : "Detect"}
              </button>
            )}
          </div>
          {detectMut.isSuccess && (detectMut.data as any[])?.length > 0 && (
            <p className="text-[10px] text-green-400">{(detectMut.data as any[]).length} new anomaly(ies) found</p>
          )}
          {detectMut.isSuccess && (detectMut.data as any[])?.length === 0 && (
            <p className="text-[10px] text-gray-500">No new anomalies detected</p>
          )}
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : anomalies.length === 0 ? (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-2">
              <p className="text-sm text-gray-500">No anomalies found.</p>
              <p className="text-xs text-gray-600">
                {projectId
                  ? 'Click "Detect" above to run anomaly detection for this project, or anomalies are auto-detected when runs complete.'
                  : "Select a project first, then click \"Detect\" to run anomaly detection."}
              </p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto">
              {anomalies.map((a: any) => (
                <button
                  key={a.id}
                  onClick={() => { setSelectedAnomalyId(a.id); setTab("timeline"); }}
                  className={`w-full text-left rounded-lg border p-3 transition ${
                    selectedAnomalyId === a.id
                      ? "border-indigo-500 bg-indigo-500/10"
                      : "border-gray-800 bg-gray-900 hover:border-gray-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-200">{a.metric}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SEVERITY_STYLES[a.severity] ?? ""}`}>
                      {a.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 line-clamp-2">{a.description}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                    <span className={`rounded-full px-1.5 py-0.5 ${STATUS_STYLES[a.status] ?? ""}`}>
                      {a.status}
                    </span>
                    <span>{a.detected_at ? new Date(a.detected_at).toLocaleDateString() : ""}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="col-span-8 space-y-4">
          {!selectedAnomaly ? (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-12 text-center text-gray-500">
              Select an anomaly to investigate
            </div>
          ) : (
            <>
              {/* Summary Header */}
              <div className={`rounded-lg border p-4 ${SEVERITY_STYLES[selectedAnomaly.severity] ?? "border-gray-800"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{selectedAnomaly.metric} regression</h3>
                    <p className="mt-1 text-xs text-gray-300">{selectedAnomaly.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedAnomaly.status === "open" && (
                      <>
                        <button
                          onClick={() => statusMut.mutate({ id: selectedAnomaly.id, status: "acknowledged" })}
                          className="rounded-md bg-yellow-600/80 px-2.5 py-1 text-xs text-white hover:bg-yellow-500"
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => statusMut.mutate({ id: selectedAnomaly.id, status: "false_positive" })}
                          className="rounded-md bg-gray-700 px-2.5 py-1 text-xs text-gray-300 hover:bg-gray-600"
                        >
                          False Positive
                        </button>
                      </>
                    )}
                    {selectedAnomaly.status === "acknowledged" && (
                      <button
                        onClick={() => statusMut.mutate({ id: selectedAnomaly.id, status: "resolved" })}
                        className="rounded-md bg-green-600/80 px-2.5 py-1 text-xs text-white hover:bg-green-500"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex gap-4 text-[10px] text-gray-400">
                  <span>Detector: <span className="text-gray-300">{selectedAnomaly.detector}</span></span>
                  <span>Run: <span className="font-mono text-gray-300">{selectedAnomaly.run_id?.slice(0, 8) ?? "—"}</span></span>
                  <span>Detected: {selectedAnomaly.detected_at ? new Date(selectedAnomaly.detected_at).toLocaleString() : "—"}</span>
                </div>
                {/* Feedback */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">Feedback:</span>
                  {["correct", "partial", "incorrect"].map((fb) => (
                    <button
                      key={fb}
                      onClick={() => feedbackMut.mutate({ id: selectedAnomaly.id, feedback: fb })}
                      className={`rounded-full px-2 py-0.5 text-[10px] transition ${
                        selectedAnomaly.feedback === fb
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {fb}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 border-b border-gray-800">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition ${
                      tab === t.key
                        ? "border-indigo-500 text-indigo-400"
                        : "border-transparent text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Timeline Tab */}
              {tab === "timeline" && (
                <div className="space-y-3">
                  {timeline.length === 0 ? (
                    <p className="text-sm text-gray-500">No timeline data available.</p>
                  ) : (
                    <div className="rounded-lg border border-gray-800 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-800/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-400">Run</th>
                            <th className="px-3 py-2 text-left text-gray-400">Date</th>
                            <th className="px-3 py-2 text-right text-gray-400">{selectedAnomaly.metric}</th>
                            <th className="px-3 py-2 text-left text-gray-400">SHA</th>
                            <th className="px-3 py-2 text-left text-gray-400">Env</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {timeline.map((pt) => (
                            <tr
                              key={pt.id}
                              className={pt.isChangePoint ? "bg-red-900/20" : "hover:bg-gray-800/30"}
                            >
                              <td className="px-3 py-2 font-mono text-gray-400">
                                {pt.id.slice(0, 8)}
                                {pt.isChangePoint && (
                                  <span className="ml-1 rounded bg-red-600/60 px-1 text-[9px] text-red-200">change-point</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-gray-400">{pt.date}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-200">
                                {fmtMs(pt.value, selectedAnomaly.metric)}
                              </td>
                              <td className="px-3 py-2 font-mono text-indigo-400">{pt.sha || "—"}</td>
                              <td className="px-3 py-2 text-gray-500">{pt.env || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Mini bar chart */}
                  {timeline.length > 1 && (
                    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                      <p className="text-[10px] text-gray-500 mb-2">Metric values across change window</p>
                      <div className="flex items-end gap-1 h-16">
                        {timeline.map((pt) => {
                          const maxVal = Math.max(...timeline.map((t) => t.value ?? 0));
                          const pct = maxVal > 0 ? ((pt.value ?? 0) / maxVal) * 100 : 0;
                          return (
                            <div
                              key={pt.id}
                              className={`flex-1 rounded-t transition ${
                                pt.isChangePoint ? "bg-red-500" : "bg-indigo-500/60"
                              }`}
                              style={{ height: `${Math.max(pct, 4)}%` }}
                              title={`${pt.id.slice(0, 8)}: ${fmtMs(pt.value, selectedAnomaly.metric)}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Attribution Tab */}
              {tab === "attribution" && (
                <AttributionPanel
                  anomalyId={selectedAnomaly.id}
                  projectId={selectedAnomaly.project_id}
                  metric={selectedAnomaly.metric}
                  runId={selectedAnomaly.run_id}
                />
              )}

              {/* Gates Tab */}
              {tab === "gates" && (
                <div className="space-y-3">
                  {!selectedAnomaly.run_id ? (
                    <p className="text-sm text-gray-500">No run associated with this anomaly.</p>
                  ) : gateResults.length === 0 ? (
                    <p className="text-sm text-gray-500">No gate results for this run.</p>
                  ) : (
                    <div className="rounded-lg border border-gray-800 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-800/50">
                          <tr>
                            <th className="px-3 py-2 text-left text-gray-400">Gate</th>
                            <th className="px-3 py-2 text-left text-gray-400">Metric</th>
                            <th className="px-3 py-2 text-right text-gray-400">Actual</th>
                            <th className="px-3 py-2 text-right text-gray-400">Threshold</th>
                            <th className="px-3 py-2 text-left text-gray-400">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {gateResults.map((g: any, i: number) => (
                            <tr key={i} className="hover:bg-gray-800/30">
                              <td className="px-3 py-2 text-gray-200">{g.gate_name ?? g.gate_id?.slice(0, 8)}</td>
                              <td className="px-3 py-2 text-gray-400">{g.metric ?? "—"}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-200">{g.actual_value?.toFixed(1) ?? "—"}</td>
                              <td className="px-3 py-2 text-right font-mono text-gray-400">
                                {g.threshold ?? g.computed_threshold ?? "—"}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                  g.status === "passed" ? "bg-green-900/40 text-green-400" :
                                  g.status === "failed" ? "bg-red-900/40 text-red-400" :
                                  "bg-gray-800 text-gray-400"
                                }`}>
                                  {g.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Baseline Tab */}
              {tab === "baseline" && (
                <div className="space-y-3">
                  {activeBaseline ? (
                    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-gray-200">
                          Active Baseline: {activeBaseline.metric}
                        </h4>
                        <span className="text-xs text-gray-500">
                          Computed: {activeBaseline.computed_at ? new Date(activeBaseline.computed_at).toLocaleDateString() : "—"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {["p50", "p75", "p95", "mean"].map((stat) => (
                          <div key={stat} className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                            <p className="text-[10px] text-gray-500 uppercase">{stat}</p>
                            <p className="text-lg font-bold font-mono text-gray-200">
                              {activeBaseline[stat] != null ? fmtMs(activeBaseline[stat], selectedAnomaly.metric) : "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                      {activeBaseline.ci_p75_lower != null && (
                        <div className="text-xs text-gray-500">
                          CI (p75): [{fmtMs(activeBaseline.ci_p75_lower, selectedAnomaly.metric)} – {fmtMs(activeBaseline.ci_p75_upper, selectedAnomaly.metric)}]
                          {activeBaseline.ci_p75_reliable && <span className="ml-2 text-green-400">Reliable</span>}
                        </div>
                      )}
                      {/* Delta from anomaly value */}
                      {selectedAnomaly.details?.value != null && activeBaseline.p75 != null && (
                        <div className="border-t border-gray-800 pt-2">
                          <p className="text-xs text-gray-400">
                            Anomaly value: <span className="font-mono text-red-400">
                              {fmtMs(selectedAnomaly.details.value as number, selectedAnomaly.metric)}
                            </span>
                            {" "}— delta from baseline p75:{" "}
                            <span className="font-mono text-red-400">
                              +{fmtMs((selectedAnomaly.details.value as number) - activeBaseline.p75, selectedAnomaly.metric)}
                              {" "}({(((selectedAnomaly.details.value as number) - activeBaseline.p75) / activeBaseline.p75 * 100).toFixed(1)}%)
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No active baseline found for {selectedAnomaly.metric}.</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
