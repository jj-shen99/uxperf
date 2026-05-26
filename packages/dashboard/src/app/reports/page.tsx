"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";
import { useProjects } from "@/hooks/use-projects";

const metricLabels: Record<string, string> = {
  lcp_ms: "LCP",
  fcp_ms: "FCP",
  cls: "CLS",
  ttfb_ms: "TTFB",
};

const directionIcons: Record<string, string> = {
  improving: "↗ Improving",
  stable: "→ Stable",
  degrading: "↘ Degrading",
};

const directionColors: Record<string, string> = {
  improving: "text-green-600 dark:text-green-400",
  stable: "text-gray-500",
  degrading: "text-red-600 dark:text-red-400",
};

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<any>(null);
  const { projects, projectId, setProjectId } = useProjects();

  const generate = useMutation({
    mutationFn: () => api.reports.generate({ project_id: projectId, days }),
    onSuccess: (data) => setReport(data),
  });

  const { data: savedReports = [] } = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api.reports.list(projectId),
    enabled: !!projectId,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Executive Reports</h1>
          <p className="text-sm text-muted-foreground">
            Rolling performance summaries with Core Web Vitals, gate pass rates, and trend analysis
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Select project</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button
            onClick={() => generate.mutate()}
            disabled={!projectId || generate.isPending}
            className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {generate.isPending ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </div>

      {/* Report Content */}
      {report && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* CWV Card */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Core Web Vitals (p75)</h3>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span>LCP</span>
                <span className="font-mono font-bold">
                  {report.core_web_vitals.lcp_p75_ms?.toFixed(0) ?? "—"} ms
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>FCP</span>
                <span className="font-mono font-bold">
                  {report.core_web_vitals.fcp_p75_ms?.toFixed(0) ?? "—"} ms
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>CLS</span>
                <span className="font-mono font-bold">
                  {report.core_web_vitals.cls_p75?.toFixed(3) ?? "—"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>TTFB</span>
                <span className="font-mono font-bold">
                  {report.core_web_vitals.ttfb_p75_ms?.toFixed(0) ?? "—"} ms
                </span>
              </div>
            </div>
          </div>

          {/* Runs Card */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Runs</h3>
            <p className="mt-2 text-3xl font-bold">{report.run_stats.total_runs}</p>
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span className="text-green-600">{report.run_stats.completed} passed</span>
              <span className="text-red-600">{report.run_stats.failed} failed</span>
            </div>
            <div className="mt-1 text-sm font-semibold">
              {report.run_stats.pass_rate}% pass rate
            </div>
          </div>

          {/* Gates Card */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Quality Gates</h3>
            <p className="mt-2 text-3xl font-bold">{report.gate_stats.total_evaluations}</p>
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span className="text-green-600">{report.gate_stats.passed} passed</span>
              <span className="text-red-600">{report.gate_stats.failed} failed</span>
            </div>
            <div className="mt-1 text-sm font-semibold">
              {report.gate_stats.pass_rate}% pass rate
            </div>
          </div>

          {/* Anomalies Card */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Anomalies</h3>
            <p className="mt-2 text-3xl font-bold">{report.anomalies.total}</p>
            <div className="mt-2 flex gap-3 text-xs text-muted-foreground">
              <span className="text-red-600">{report.anomalies.critical} critical</span>
              <span className="text-green-600">{report.anomalies.resolved} resolved</span>
            </div>
          </div>
        </div>
      )}

      {/* Trend Directions */}
      {report?.trend_direction && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Trend Directions ({days} days)</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(report.trend_direction).map(([metric, direction]) => (
              <div key={metric} className="text-center">
                <div className="text-xs text-muted-foreground">{metricLabels[metric] ?? metric}</div>
                <div className={`mt-1 text-sm font-semibold ${directionColors[direction as string] ?? ""}`}>
                  {directionIcons[direction as string] ?? direction}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Reports */}
      {savedReports.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground">Previous Reports</h3>
          <div className="mt-2 space-y-2">
            {savedReports.slice(0, 10).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between rounded border bg-card px-4 py-2 text-sm">
                <span>{r.report_type} — {new Date(r.period_start).toLocaleDateString()} to {new Date(r.period_end).toLocaleDateString()}</span>
                <span className="text-xs text-muted-foreground">{new Date(r.generated_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
