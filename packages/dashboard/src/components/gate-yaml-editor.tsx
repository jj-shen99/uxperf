"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface GateYamlEditorProps {
  projectId: string;
  projectName: string;
}

const EXAMPLE_YAML = `gates:
  - name: LCP Budget
    metric: lcp
    type: threshold
    operator: lte
    threshold: 2500
    policy: block
    enabled: true
  - name: CLS Budget
    metric: cls
    type: threshold
    operator: lte
    threshold: 0.1
    policy: warn
    enabled: true
    quorum:
      window_size: 5
      required_failures: 3
  - name: LCP Baseline Check
    metric: lcp
    type: baseline_relative
    regression_pct: 10
    baseline_stat: p75
    policy: warn
    enabled: true`;

export function GateYamlEditor({ projectId, projectName }: GateYamlEditorProps) {
  const qc = useQueryClient();
  const [yaml, setYaml] = useState("");
  const [mode, setMode] = useState<"edit" | "export">("export");
  const [syncResult, setSyncResult] = useState<any>(null);
  const [error, setError] = useState("");

  const exportQuery = useQuery({
    queryKey: ["gates-yaml-export", projectId],
    queryFn: () => api.gates.yamlExport(projectId),
    enabled: !!projectId && mode === "export",
  });

  const syncMut = useMutation({
    mutationFn: (yamlContent: string) => api.gates.yamlSync(projectId, yamlContent),
    onSuccess: (data) => {
      setSyncResult(data);
      setError("");
      qc.invalidateQueries({ queryKey: ["gates"] });
      qc.invalidateQueries({ queryKey: ["gates-yaml-export", projectId] });
    },
    onError: (err: any) => {
      setError(err?.message || "Sync failed");
      setSyncResult(null);
    },
  });

  const displayYaml = mode === "export" ? (exportQuery.data?.yaml ?? "# Loading...") : yaml;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-200">YAML Configuration</h3>
          <span className="text-[10px] text-gray-500 font-mono">{projectName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setMode("export"); setSyncResult(null); setError(""); }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === "export"
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700"
            }`}
          >
            View Current
          </button>
          <button
            onClick={() => {
              setMode("edit");
              setYaml(exportQuery.data?.yaml || EXAMPLE_YAML);
              setSyncResult(null);
              setError("");
            }}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === "edit"
                ? "bg-indigo-600 text-white"
                : "bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700"
            }`}
          >
            Edit & Sync
          </button>
          <button
            onClick={() => {
              setYaml(EXAMPLE_YAML);
              setMode("edit");
              setSyncResult(null);
              setError("");
            }}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-400 hover:text-gray-200"
          >
            Load Example
          </button>
        </div>
      </div>

      <textarea
        value={displayYaml}
        onChange={(e) => mode === "edit" && setYaml(e.target.value)}
        readOnly={mode === "export"}
        rows={16}
        className={`w-full rounded-md border px-4 py-3 font-mono text-xs leading-5 ${
          mode === "export"
            ? "border-gray-700 bg-gray-800/50 text-gray-300 cursor-default"
            : "border-indigo-600/30 bg-gray-800 text-gray-200"
        }`}
        spellCheck={false}
      />

      {mode === "edit" && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => syncMut.mutate(yaml)}
            disabled={!yaml.trim() || syncMut.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {syncMut.isPending ? "Syncing..." : "Sync to Database"}
          </button>
          <span className="text-[10px] text-gray-500">
            This will create new gates, update existing ones, and disable gates not in the YAML.
          </span>
        </div>
      )}

      {syncResult && (
        <div className="rounded-md border border-gray-700 bg-gray-800/50 p-3 text-xs space-y-1">
          {syncResult.created > 0 && (
            <p className="text-green-400 font-medium">{syncResult.created} gate(s) created</p>
          )}
          {syncResult.updated > 0 && (
            <p className="text-blue-400 font-medium">{syncResult.updated} gate(s) updated</p>
          )}
          {syncResult.disabled > 0 && (
            <p className="text-yellow-400 font-medium">{syncResult.disabled} gate(s) disabled (not in YAML)</p>
          )}
          {syncResult.unchanged > 0 && (
            <p className="text-gray-400">{syncResult.unchanged} gate(s) unchanged</p>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
