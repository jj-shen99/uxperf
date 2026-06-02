"use client";

import { useMemo } from "react";

/**
 * E-60: Decision-Driving Dashboard
 *
 * Shows deltas-since-last-review, team-segmented KPIs, and
 * a small set of actionable headline numbers (Ch 16 "Practice Four").
 */

interface MetricDelta {
  label: string;
  metric: string;
  current: number;
  previous: number;
  unit: string;
  lowerIsBetter: boolean;
}

interface TeamKpi {
  team: string;
  projectCount: number;
  avgLcp: number | null;
  avgFcp: number | null;
  avgPerf: number | null;
  gatePassRate: number | null;
  trend: "improving" | "stable" | "degrading";
}

interface DecisionDashboardProps {
  runs: any[];
  projects: any[];
  projectId?: string;
  gateResults?: any[];
  reviewWindowDays?: number;
}

const HEADLINE_METRICS = [
  { key: "lcp_ms", label: "LCP", unit: "ms", good: 2500, poor: 4000, lowerIsBetter: true },
  { key: "fcp_ms", label: "FCP", unit: "ms", good: 1800, poor: 3000, lowerIsBetter: true },
  { key: "cls", label: "CLS", unit: "", good: 0.1, poor: 0.25, lowerIsBetter: true },
  { key: "performance_score", label: "Perf Score", unit: "", good: 0.9, poor: 0.5, lowerIsBetter: false },
];

function fmtVal(v: number | null, metric: string): string {
  if (v == null) return "—";
  if (metric === "cls") return v.toFixed(3);
  if (metric === "performance_score") return `${Math.round(v * 100)}`;
  return `${Math.round(v)}`;
}

function deltaColor(delta: number, lowerIsBetter: boolean): string {
  if (delta === 0) return "text-gray-400";
  const improving = lowerIsBetter ? delta < 0 : delta > 0;
  return improving ? "text-green-400" : "text-red-400";
}

function trendBadge(trend: string) {
  const map: Record<string, string> = {
    improving: "bg-green-900/30 text-green-400",
    stable: "bg-gray-800 text-gray-400",
    degrading: "bg-red-900/30 text-red-400",
  };
  return map[trend] ?? map.stable;
}

export function DecisionDashboard({
  runs,
  projects,
  projectId,
  gateResults = [],
  reviewWindowDays = 7,
}: DecisionDashboardProps) {
  const cutoff = Date.now() - reviewWindowDays * 86_400_000;
  const prevCutoff = cutoff - reviewWindowDays * 86_400_000;

  // Filter by project if selected
  const scopedRuns = useMemo(
    () => projectId ? runs.filter((r: any) => r.project_id === projectId) : runs,
    [runs, projectId],
  );

  // Split runs into current and previous review windows
  const currentRuns = useMemo(
    () => scopedRuns.filter((r: any) => r.status === "completed" && r.metrics && new Date(r.created_at).getTime() >= cutoff),
    [scopedRuns, cutoff],
  );
  const previousRuns = useMemo(
    () => scopedRuns.filter((r: any) =>
      r.status === "completed" && r.metrics &&
      new Date(r.created_at).getTime() >= prevCutoff &&
      new Date(r.created_at).getTime() < cutoff,
    ),
    [scopedRuns, prevCutoff, cutoff],
  );

  // Compute headline deltas
  const headlineDeltas: MetricDelta[] = useMemo(() => {
    return HEADLINE_METRICS.map((m) => {
      const curVals = currentRuns.map((r: any) => r.metrics[m.key]).filter((v: any) => v != null) as number[];
      const prevVals = previousRuns.map((r: any) => r.metrics[m.key]).filter((v: any) => v != null) as number[];
      const current = curVals.length > 0 ? curVals.reduce((a, b) => a + b, 0) / curVals.length : 0;
      const previous = prevVals.length > 0 ? prevVals.reduce((a, b) => a + b, 0) / prevVals.length : 0;
      return { label: m.label, metric: m.key, current, previous, unit: m.unit, lowerIsBetter: m.lowerIsBetter };
    });
  }, [currentRuns, previousRuns]);

  // Team-segmented KPIs
  const teamKpis: TeamKpi[] = useMemo(() => {
    const teamMap = new Map<string, any[]>();
    for (const p of projects) {
      const team = p.owner_team ?? "default";
      if (!teamMap.has(team)) teamMap.set(team, []);
      teamMap.get(team)!.push(p);
    }

    return Array.from(teamMap.entries()).map(([team, teamProjects]) => {
      const projectIds = new Set(teamProjects.map((p: any) => p.id));
      const teamRuns = currentRuns.filter((r: any) => projectIds.has(r.project_id));

      const avg = (key: string) => {
        const vals = teamRuns.map((r: any) => r.metrics?.[key]).filter((v: any) => v != null) as number[];
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };

      const teamGates = gateResults.filter((g: any) => projectIds.has(g.project_id));
      const passed = teamGates.filter((g: any) => g.status === "passed").length;
      const gatePassRate = teamGates.length > 0 ? (passed / teamGates.length) * 100 : null;

      // Trend: compare LCP of first half vs second half of current window
      const lcpVals = teamRuns.map((r: any) => r.metrics?.lcp_ms).filter((v: any) => v != null) as number[];
      let trend: "improving" | "stable" | "degrading" = "stable";
      if (lcpVals.length >= 4) {
        const half = Math.floor(lcpVals.length / 2);
        const firstAvg = lcpVals.slice(0, half).reduce((a, b) => a + b, 0) / half;
        const secondAvg = lcpVals.slice(half).reduce((a, b) => a + b, 0) / (lcpVals.length - half);
        const pctChange = ((secondAvg - firstAvg) / Math.max(firstAvg, 1)) * 100;
        if (pctChange < -10) trend = "improving";
        else if (pctChange > 10) trend = "degrading";
      }

      return {
        team,
        projectCount: teamProjects.length,
        avgLcp: avg("lcp_ms"),
        avgFcp: avg("fcp_ms"),
        avgPerf: avg("performance_score"),
        gatePassRate,
        trend,
      };
    });
  }, [projects, currentRuns, gateResults]);

  // Action items count
  const actionItems = useMemo(() => {
    let count = 0;
    for (const d of headlineDeltas) {
      const delta = d.current - d.previous;
      const pct = d.previous > 0 ? Math.abs(delta / d.previous) * 100 : 0;
      const degrading = d.lowerIsBetter ? delta > 0 : delta < 0;
      if (degrading && pct > 15) count++;
    }
    return count;
  }, [headlineDeltas]);

  return (
    <div className="space-y-6">
      {/* Headline: Deltas Since Last Review */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-400">
            Deltas Since Last Review ({reviewWindowDays}d window)
          </h2>
          {actionItems > 0 && (
            <span className="rounded-full bg-red-600/80 px-2 py-0.5 text-[10px] font-bold text-white">
              {actionItems} action{actionItems > 1 ? "s" : ""} needed
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {headlineDeltas.map((d) => {
            const delta = d.current - d.previous;
            const pct = d.previous > 0 ? ((delta / d.previous) * 100) : 0;
            return (
              <div key={d.metric} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-500">{d.label}</p>
                <p className="mt-1 text-2xl font-bold text-white">
                  {fmtVal(d.current, d.metric)}
                  <span className="ml-1 text-xs font-normal text-gray-500">{d.unit}</span>
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`text-xs font-mono ${deltaColor(delta, d.lowerIsBetter)}`}>
                    {delta >= 0 ? "+" : ""}{fmtVal(delta, d.metric)}{d.unit}
                  </span>
                  {d.previous > 0 && (
                    <span className={`text-[10px] ${deltaColor(pct, d.lowerIsBetter)}`}>
                      ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[10px] text-gray-600">
                  Prev: {fmtVal(d.previous, d.metric)}{d.unit} ({currentRuns.length}/{previousRuns.length} runs)
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team KPIs */}
      {teamKpis.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">Team KPIs</h2>
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-800/50">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-400">Team</th>
                  <th className="px-4 py-2 text-right text-gray-400">Projects</th>
                  <th className="px-4 py-2 text-right text-gray-400">Avg LCP</th>
                  <th className="px-4 py-2 text-right text-gray-400">Avg FCP</th>
                  <th className="px-4 py-2 text-right text-gray-400">Perf Score</th>
                  <th className="px-4 py-2 text-right text-gray-400">Gate Pass %</th>
                  <th className="px-4 py-2 text-left text-gray-400">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {teamKpis.map((t) => (
                  <tr key={t.team} className="hover:bg-gray-800/30">
                    <td className="px-4 py-2 font-medium text-gray-200">{t.team}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{t.projectCount}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-200">{t.avgLcp != null ? `${Math.round(t.avgLcp)}ms` : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-200">{t.avgFcp != null ? `${Math.round(t.avgFcp)}ms` : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-200">{t.avgPerf != null ? Math.round(t.avgPerf * 100) : "—"}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-200">{t.gatePassRate != null ? `${t.gatePassRate.toFixed(0)}%` : "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${trendBadge(t.trend)}`}>
                        {t.trend}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Throughput summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-[10px] text-gray-500 uppercase">Tests This Period</p>
          <p className="mt-1 text-2xl font-bold text-white">{currentRuns.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-[10px] text-gray-500 uppercase">Previous Period</p>
          <p className="mt-1 text-2xl font-bold text-gray-400">{previousRuns.length}</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <p className="text-[10px] text-gray-500 uppercase">Active Projects</p>
          <p className="mt-1 text-2xl font-bold text-white">
            {new Set(currentRuns.map((r: any) => r.project_id)).size}
          </p>
        </div>
      </div>
    </div>
  );
}
