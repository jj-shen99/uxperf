"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";

const severityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
};

const statusColors: Record<string, string> = {
  open: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  acknowledged: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  resolved: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
  false_positive: "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export default function AnomaliesPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [selectedAnomaly, setSelectedAnomaly] = useState<any>(null);

  const { data: anomalies = [], isLoading } = useQuery({
    queryKey: ["anomalies", statusFilter],
    queryFn: () => api.analytics.anomalies(undefined, statusFilter),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.analytics.updateAnomalyStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["anomalies"] }),
  });

  const feedback = useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback: string }) =>
      api.analytics.feedback(id, feedback),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["anomalies"] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Anomalies</h1>
          <p className="text-sm text-muted-foreground">
            Regressions and change points detected by CUSUM and EWMA analysis
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["open", "acknowledged", "resolved", "false_positive"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* Anomaly List */}
      {isLoading ? (
        <div className="text-muted-foreground">Loading anomalies...</div>
      ) : anomalies.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          No {statusFilter} anomalies found.
        </div>
      ) : (
        <div className="space-y-3">
          {anomalies.map((a: any) => (
            <div
              key={a.id}
              className="rounded-lg border bg-card p-4 hover:shadow-md transition cursor-pointer"
              onClick={() => setSelectedAnomaly(selectedAnomaly?.id === a.id ? null : a)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${severityColors[a.severity] ?? ""}`}>
                    {a.severity}
                  </span>
                  <span className="font-mono text-sm font-semibold">{a.metric}</span>
                  <span className={`rounded px-2 py-0.5 text-xs ${statusColors[a.status] ?? ""}`}>
                    {a.status}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {a.detector} · {new Date(a.detected_at).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{a.description}</p>

              {/* Expanded detail */}
              {selectedAnomaly?.id === a.id && (
                <div className="mt-4 space-y-3 border-t pt-3">
                  {a.attribution && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">Root Cause</h4>
                      <p className="mt-1 text-sm">{a.attribution.explanation ?? JSON.stringify(a.attribution)}</p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {a.status === "open" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: a.id, status: "acknowledged" }); }}
                        className="rounded bg-yellow-500 px-3 py-1 text-xs text-white hover:bg-yellow-600"
                      >
                        Acknowledge
                      </button>
                    )}
                    {(a.status === "open" || a.status === "acknowledged") && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: a.id, status: "resolved" }); }}
                          className="rounded bg-green-500 px-3 py-1 text-xs text-white hover:bg-green-600"
                        >
                          Resolve
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus.mutate({ id: a.id, status: "false_positive" }); }}
                          className="rounded bg-gray-500 px-3 py-1 text-xs text-white hover:bg-gray-600"
                        >
                          False Positive
                        </button>
                      </>
                    )}
                  </div>

                  {a.status === "resolved" && !a.feedback && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Was the attribution correct?</span>
                      {["correct", "incorrect", "partial"].map((f) => (
                        <button
                          key={f}
                          onClick={(e) => { e.stopPropagation(); feedback.mutate({ id: a.id, feedback: f }); }}
                          className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
