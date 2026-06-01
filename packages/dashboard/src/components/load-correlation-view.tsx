"use client";

/**
 * E-55: Load + Synthetic + RUM Correlation View
 *
 * Book: Ch 14, p234; Ch 15, p256
 * "Dashboard view that overlays load test results with synthetic and
 * RUM data for the same route, showing how single-user metrics degrade
 * under concurrency."
 */

import { useMemo } from "react";

interface LoadDataPoint {
  vus: number;
  p50_ms: number | null;
  p95_ms: number | null;
  throughput_rps: number | null;
  cpu_percent: number | null;
}

interface SyntheticDataPoint {
  date: string;
  lcp_ms: number | null;
  fcp_ms: number | null;
  ttfb_ms: number | null;
}

interface RumDataPoint {
  date: string;
  p50: number;
  p75: number;
  p90: number;
  count: number;
}

interface CorrelationViewProps {
  loadData: LoadDataPoint[];
  syntheticData: SyntheticDataPoint[];
  rumData: RumDataPoint[];
  metric: string;
  saturationVus?: number | null;
}

function fmtMs(v: number | null | undefined): string {
  if (v == null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${v.toFixed(0)}ms`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

export function LoadCorrelationView({
  loadData,
  syntheticData,
  rumData,
  metric,
  saturationVus,
}: CorrelationViewProps) {
  const syntheticSummary = useMemo(() => {
    if (syntheticData.length === 0) return null;
    const values = syntheticData
      .map((d) => {
        if (metric === "lcp") return d.lcp_ms;
        if (metric === "fcp") return d.fcp_ms;
        if (metric === "ttfb") return d.ttfb_ms;
        return d.lcp_ms;
      })
      .filter((v): v is number => v != null);
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
      count: sorted.length,
    };
  }, [syntheticData, metric]);

  const rumSummary = useMemo(() => {
    if (rumData.length === 0) return null;
    const totalCount = rumData.reduce((s, d) => s + d.count, 0);
    const avgP75 = rumData.reduce((s, d) => s + d.p75 * d.count, 0) / Math.max(totalCount, 1);
    const avgP50 = rumData.reduce((s, d) => s + d.p50 * d.count, 0) / Math.max(totalCount, 1);
    return { p50: avgP50, p75: avgP75, count: totalCount };
  }, [rumData]);

  const loadSummary = useMemo(() => {
    if (loadData.length === 0) return null;
    const peakVus = Math.max(...loadData.map((d) => d.vus), 0);
    const latencies = loadData.filter((d) => d.p95_ms != null);
    const peakP95 = latencies.length > 0 ? Math.max(...latencies.map((d) => d.p95_ms!)) : null;
    const baselineP95 = latencies.length > 0 ? latencies[0].p95_ms : null;
    return { peakVus, peakP95, baselineP95, points: loadData.length };
  }, [loadData]);

  // Degradation ratio: how much worse is p95 under load vs single-user synthetic?
  const degradationRatio = useMemo(() => {
    if (!syntheticSummary || !loadSummary?.peakP95) return null;
    return loadSummary.peakP95 / Math.max(syntheticSummary.median, 1);
  }, [syntheticSummary, loadSummary]);

  // Disagreement between synthetic and RUM
  const syntheticRumDisagreement = useMemo(() => {
    if (!syntheticSummary || !rumSummary) return null;
    const delta = Math.abs(rumSummary.p75 - syntheticSummary.median);
    const pct = (delta / Math.max(syntheticSummary.median, 1)) * 100;
    if (pct < 15) return { level: "none" as const, pct };
    if (pct < 40) return { level: "mild" as const, pct };
    return { level: "severe" as const, pct };
  }, [syntheticSummary, rumSummary]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-200">
        Performance Correlation: {metric.toUpperCase()}
      </h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Synthetic */}
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-blue-400" />
            <span className="text-xs font-medium text-gray-400">Synthetic (Lab)</span>
          </div>
          {syntheticSummary ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">{fmtMs(syntheticSummary.median)}</p>
              <p className="text-[10px] text-gray-500">
                p95: {fmtMs(syntheticSummary.p95)} · range: {fmtMs(syntheticSummary.min)}–{fmtMs(syntheticSummary.max)} · {syntheticSummary.count} runs
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No synthetic data</p>
          )}
        </div>

        {/* RUM */}
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-green-400" />
            <span className="text-xs font-medium text-gray-400">RUM (Field)</span>
          </div>
          {rumSummary ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">{fmtMs(rumSummary.p75)}</p>
              <p className="text-[10px] text-gray-500">
                p50: {fmtMs(rumSummary.p50)} · {rumSummary.count.toLocaleString()} samples
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No RUM data</p>
          )}
        </div>

        {/* Load */}
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-2 w-2 rounded-full bg-orange-400" />
            <span className="text-xs font-medium text-gray-400">Under Load</span>
          </div>
          {loadSummary ? (
            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">{fmtMs(loadSummary.peakP95)}</p>
              <p className="text-[10px] text-gray-500">
                peak: {loadSummary.peakVus} VUs · baseline p95: {fmtMs(loadSummary.baselineP95)} · {loadSummary.points} points
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No load test data</p>
          )}
        </div>
      </div>

      {/* Disagreement & Degradation Indicators */}
      <div className="flex flex-wrap gap-3">
        {syntheticRumDisagreement && (
          <div className={`rounded-md px-3 py-2 text-xs ${
            syntheticRumDisagreement.level === "none"
              ? "bg-green-900/20 border border-green-900/30 text-green-400"
              : syntheticRumDisagreement.level === "mild"
                ? "bg-yellow-900/20 border border-yellow-900/30 text-yellow-400"
                : "bg-red-900/20 border border-red-900/30 text-red-400"
          }`}>
            <span className="font-medium">Lab vs Field: </span>
            {syntheticRumDisagreement.level === "none"
              ? "Good agreement"
              : `${syntheticRumDisagreement.pct.toFixed(0)}% divergence (${syntheticRumDisagreement.level})`}
          </div>
        )}

        {degradationRatio != null && (
          <div className={`rounded-md px-3 py-2 text-xs ${
            degradationRatio < 1.5
              ? "bg-green-900/20 border border-green-900/30 text-green-400"
              : degradationRatio < 3
                ? "bg-yellow-900/20 border border-yellow-900/30 text-yellow-400"
                : "bg-red-900/20 border border-red-900/30 text-red-400"
          }`}>
            <span className="font-medium">Load degradation: </span>
            {degradationRatio.toFixed(1)}x slower under peak load
          </div>
        )}

        {saturationVus != null && (
          <div className="rounded-md px-3 py-2 text-xs bg-orange-900/20 border border-orange-900/30 text-orange-400">
            <span className="font-medium">Saturation: </span>
            {saturationVus} VUs (recommended max: {Math.floor(saturationVus * 0.75)} VUs)
          </div>
        )}
      </div>

      {/* Load Degradation Table */}
      {loadData.length > 0 && (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-3 py-2 text-left text-gray-400">VUs</th>
                <th className="px-3 py-2 text-right text-gray-400">p50</th>
                <th className="px-3 py-2 text-right text-gray-400">p95</th>
                <th className="px-3 py-2 text-right text-gray-400">Throughput</th>
                <th className="px-3 py-2 text-right text-gray-400">CPU</th>
                <th className="px-3 py-2 text-left text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {loadData.map((dp, i) => {
                const isSaturated = saturationVus != null && dp.vus >= saturationVus;
                return (
                  <tr key={i} className={isSaturated ? "bg-red-900/5" : "hover:bg-gray-800/20"}>
                    <td className="px-3 py-1.5 text-gray-200 font-mono">{dp.vus}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">{fmtMs(dp.p50_ms)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${isSaturated ? "text-red-400" : "text-gray-300"}`}>
                      {fmtMs(dp.p95_ms)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-gray-300">
                      {dp.throughput_rps != null ? `${dp.throughput_rps.toFixed(1)} rps` : "—"}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono ${
                      dp.cpu_percent != null && dp.cpu_percent > 80 ? "text-red-400" : "text-gray-300"
                    }`}>
                      {fmtPct(dp.cpu_percent)}
                    </td>
                    <td className="px-3 py-1.5">
                      {isSaturated ? (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-900/30 text-red-400">saturated</span>
                      ) : (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-green-900/30 text-green-400">ok</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
