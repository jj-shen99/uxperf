"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface FeatureImportance {
  feature: string;
  shap_value: number;
  direction: "positive" | "negative";
  magnitude: "high" | "medium" | "low";
  description?: string;
}

interface AttributionPanelProps {
  anomalyId: string;
  projectId: string;
  metric: string;
  runId?: string;
}

const magnitudeColor: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-gray-500",
};

const directionIcon: Record<string, string> = {
  positive: "↑",
  negative: "↓",
};

export function AttributionPanel({ anomalyId, projectId, metric, runId }: AttributionPanelProps) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: attribution, isLoading } = useQuery({
    queryKey: ["attribution-for-anomaly", anomalyId],
    queryFn: async () => {
      const list = await api.intelligence.attribution.list(projectId);
      return list.find((a: any) => a.anomaly_id === anomalyId) ?? null;
    },
    enabled: !!projectId,
  });

  const computeMut = useMutation({
    mutationFn: () =>
      api.intelligence.attribution.compute({
        project_id: projectId,
        anomaly_id: anomalyId,
        target_metric: metric,
        window_size: 50,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attribution-for-anomaly", anomalyId] });
    },
  });

  // Also fetch deploy correlation — recent deploys in the change window
  const { data: deployCorrelation } = useQuery({
    queryKey: ["deploy-correlation", projectId, runId],
    queryFn: async () => {
      // Use runs around the anomaly run to find deploy markers
      const runs = await api.runs.list(projectId);
      const anomalyRunIdx = runs.findIndex((r: any) => r.id === runId);
      if (anomalyRunIdx < 0) return null;
      const windowStart = Math.max(0, anomalyRunIdx - 5);
      const windowRuns = runs.slice(windowStart, anomalyRunIdx + 1);
      const deployChanges: { sha: string; date: string; env: string }[] = [];
      for (const r of windowRuns) {
        if (r.config?.build_hash || r.config?.commit_sha) {
          deployChanges.push({
            sha: (r.config.commit_sha ?? r.config.build_hash ?? "").slice(0, 8),
            date: r.created_at ? new Date(r.created_at).toLocaleString() : "",
            env: r.config?.environment ?? "production",
          });
        }
      }
      return { deploys: deployChanges, windowSize: windowRuns.length };
    },
    enabled: !!runId && !!projectId,
  });

  if (isLoading) {
    return <div className="text-xs text-gray-500">Loading attribution...</div>;
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-200">Attribution Analysis</h3>
        {!attribution && (
          <button
            onClick={() => computeMut.mutate()}
            disabled={computeMut.isPending}
            className="rounded-md bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {computeMut.isPending ? "Computing..." : "Run SHAP Analysis"}
          </button>
        )}
      </div>

      {computeMut.isError && (
        <p className="text-xs text-red-400">Error: {(computeMut.error as Error).message}</p>
      )}

      {attribution ? (
        <>
          {/* Confidence */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Confidence:</span>
            <div className="flex-1 h-2 rounded-full bg-gray-800 max-w-[200px]">
              <div
                className={`h-full rounded-full ${
                  attribution.confidence > 0.7 ? "bg-green-500" : attribution.confidence > 0.4 ? "bg-yellow-500" : "bg-red-500"
                }`}
                style={{ width: `${(attribution.confidence ?? 0) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-gray-300">
              {((attribution.confidence ?? 0) * 100).toFixed(0)}%
            </span>
          </div>

          {/* Explanation */}
          {attribution.explanation && (
            <p className="text-xs text-gray-400 leading-relaxed">{attribution.explanation}</p>
          )}

          {/* Top Contributors */}
          {(attribution.top_contributors ?? attribution.feature_importances ?? []).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Top Contributors</p>
              {(attribution.top_contributors ?? attribution.feature_importances ?? [])
                .slice(0, expanded ? 10 : 5)
                .map((f: FeatureImportance, i: number) => {
                  const maxVal = Math.max(
                    ...(attribution.top_contributors ?? attribution.feature_importances ?? []).map(
                      (ff: FeatureImportance) => Math.abs(ff.shap_value),
                    ),
                  );
                  const pct = maxVal > 0 ? (Math.abs(f.shap_value) / maxVal) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-3 text-[10px] text-gray-500">{directionIcon[f.direction] ?? ""}</span>
                      <span className="w-32 text-xs text-gray-300 truncate" title={f.feature}>
                        {f.feature}
                      </span>
                      <div className="flex-1 h-3 rounded bg-gray-800 overflow-hidden">
                        <div className={`h-full rounded ${magnitudeColor[f.magnitude]}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-14 text-right text-[10px] font-mono text-gray-400">
                        {f.shap_value.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              {(attribution.top_contributors ?? attribution.feature_importances ?? []).length > 5 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300"
                >
                  {expanded ? "Show less" : `Show all ${(attribution.top_contributors ?? attribution.feature_importances ?? []).length}`}
                </button>
              )}
            </div>
          )}

          {/* Server Resource Features */}
          {(attribution.server_resource_features ?? []).length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Server Resources</p>
              {attribution.server_resource_features.map((f: FeatureImportance, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">{f.feature.replace("server_", "")}</span>
                  <span className={`font-mono ${f.magnitude === "high" ? "text-red-400" : "text-gray-400"}`}>
                    {f.shap_value.toFixed(3)} {f.description ? `(${f.description})` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-gray-500">
          No attribution analysis available. Click "Run SHAP Analysis" to compute feature importances.
        </p>
      )}

      {/* Deploy Correlation */}
      {deployCorrelation && deployCorrelation.deploys.length > 0 && (
        <div className="border-t border-gray-800 pt-3 space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-gray-500">
            Deploys in Change Window ({deployCorrelation.windowSize} runs)
          </p>
          {deployCorrelation.deploys.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-indigo-400">{d.sha}</span>
              <span className="text-gray-500">{d.env}</span>
              <span className="text-gray-600">{d.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
