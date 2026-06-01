"use client";

import { useMemo } from "react";

/**
 * E-61: Mobile-First Segment — Desktop/Mobile Side-by-Side
 *
 * Shows desktop and mobile metrics side by side with independent baselines
 * and device-class-aware performance rating.
 */

interface DeviceMetrics {
  device: "desktop" | "mobile";
  avgLcp: number | null;
  avgFcp: number | null;
  avgCls: number | null;
  avgTtfb: number | null;
  avgPerf: number | null;
  sampleCount: number;
  p75Lcp: number | null;
  p75Fcp: number | null;
}

interface MobileSegmentViewProps {
  runs: any[];
  baselines?: any[];
}

const THRESHOLDS = {
  lcp_ms: { desktop: { good: 2500, poor: 4000 }, mobile: { good: 3000, poor: 5000 } },
  fcp_ms: { desktop: { good: 1800, poor: 3000 }, mobile: { good: 2200, poor: 3500 } },
  cls: { desktop: { good: 0.1, poor: 0.25 }, mobile: { good: 0.1, poor: 0.25 } },
  ttfb_ms: { desktop: { good: 800, poor: 1800 }, mobile: { good: 1000, poor: 2000 } },
  performance_score: { desktop: { good: 0.9, poor: 0.5 }, mobile: { good: 0.8, poor: 0.4 } },
};

type MetricKey = keyof typeof THRESHOLDS;

function ratingFor(value: number, metric: MetricKey, device: "desktop" | "mobile"): "good" | "needs-improvement" | "poor" {
  const t = THRESHOLDS[metric]?.[device];
  if (!t) return "good";
  if (metric === "performance_score") {
    return value >= t.good ? "good" : value >= t.poor ? "needs-improvement" : "poor";
  }
  return value <= t.good ? "good" : value <= t.poor ? "needs-improvement" : "poor";
}

const ratingStyle: Record<string, string> = {
  good: "bg-green-900/30 text-green-400",
  "needs-improvement": "bg-yellow-900/30 text-yellow-400",
  poor: "bg-red-900/30 text-red-400",
};

function fmtVal(v: number | null, metric: string): string {
  if (v == null) return "—";
  if (metric === "cls") return v.toFixed(3);
  if (metric === "performance_score") return `${Math.round(v * 100)}`;
  return `${Math.round(v)}`;
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function detectDevice(run: any): "desktop" | "mobile" {
  const device = (run.config?.device ?? run.config?.formFactor ?? "desktop").toLowerCase();
  return device.includes("mobile") || device.includes("phone") || device.includes("moto") || device.includes("nexus")
    ? "mobile"
    : "desktop";
}

export function MobileSegmentView({ runs, baselines = [] }: MobileSegmentViewProps) {
  const completedRuns = useMemo(
    () => runs.filter((r: any) => r.status === "completed" && r.metrics),
    [runs],
  );

  const segments: Record<"desktop" | "mobile", DeviceMetrics> = useMemo(() => {
    const groups: Record<"desktop" | "mobile", any[]> = { desktop: [], mobile: [] };
    for (const r of completedRuns) {
      groups[detectDevice(r)].push(r);
    }

    function buildMetrics(device: "desktop" | "mobile"): DeviceMetrics {
      const g = groups[device];
      if (g.length === 0) {
        return { device, avgLcp: null, avgFcp: null, avgCls: null, avgTtfb: null, avgPerf: null, sampleCount: 0, p75Lcp: null, p75Fcp: null };
      }
      const avg = (key: string) => {
        const vals = g.map((r: any) => r.metrics[key]).filter((v: any) => v != null) as number[];
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      };
      const p75 = (key: string) => {
        const vals = g.map((r: any) => r.metrics[key]).filter((v: any) => v != null).sort((a: number, b: number) => a - b) as number[];
        return vals.length > 0 ? percentile(vals, 0.75) : null;
      };
      return {
        device,
        avgLcp: avg("lcp_ms"),
        avgFcp: avg("fcp_ms"),
        avgCls: avg("cls"),
        avgTtfb: avg("ttfb_ms"),
        avgPerf: avg("performance_score"),
        sampleCount: g.length,
        p75Lcp: p75("lcp_ms"),
        p75Fcp: p75("fcp_ms"),
      };
    }

    return { desktop: buildMetrics("desktop"), mobile: buildMetrics("mobile") };
  }, [completedRuns]);

  const metricRows: { key: MetricKey; label: string; unit: string }[] = [
    { key: "lcp_ms", label: "LCP (avg)", unit: "ms" },
    { key: "fcp_ms", label: "FCP (avg)", unit: "ms" },
    { key: "cls", label: "CLS (avg)", unit: "" },
    { key: "ttfb_ms", label: "TTFB (avg)", unit: "ms" },
    { key: "performance_score", label: "Perf Score", unit: "" },
  ];

  function getValue(segment: DeviceMetrics, key: MetricKey): number | null {
    switch (key) {
      case "lcp_ms": return segment.avgLcp;
      case "fcp_ms": return segment.avgFcp;
      case "cls": return segment.avgCls;
      case "ttfb_ms": return segment.avgTtfb;
      case "performance_score": return segment.avgPerf;
      default: return null;
    }
  }

  // Mobile vs desktop gap
  const mobileGap = useMemo(() => {
    const dLcp = segments.desktop.avgLcp;
    const mLcp = segments.mobile.avgLcp;
    if (dLcp != null && mLcp != null && dLcp > 0) {
      return Math.round(((mLcp - dLcp) / dLcp) * 100);
    }
    return null;
  }, [segments]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-400">Desktop vs Mobile Performance</h2>
        {mobileGap != null && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            mobileGap > 40 ? "bg-red-900/30 text-red-400" :
            mobileGap > 15 ? "bg-yellow-900/30 text-yellow-400" :
            "bg-green-900/30 text-green-400"
          }`}>
            Mobile gap: {mobileGap > 0 ? "+" : ""}{mobileGap}%
          </span>
        )}
      </div>

      {/* Side-by-side cards */}
      <div className="grid grid-cols-2 gap-4">
        {(["desktop", "mobile"] as const).map((device) => {
          const seg = segments[device];
          return (
            <div key={device} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-200 capitalize">{device}</span>
                <span className="text-xs text-gray-500">{seg.sampleCount} runs</span>
              </div>
              <div className="space-y-2">
                {metricRows.map((m) => {
                  const val = getValue(seg, m.key);
                  const rating = val != null ? ratingFor(val, m.key, device) : "good";
                  return (
                    <div key={m.key} className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{m.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-200">
                          {fmtVal(val, m.key)}{m.unit && val != null ? m.unit : ""}
                        </span>
                        {val != null && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${ratingStyle[rating]}`}>
                            {rating === "needs-improvement" ? "NI" : rating}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* p75 stats */}
              {(seg.p75Lcp != null || seg.p75Fcp != null) && (
                <div className="mt-3 border-t border-gray-800 pt-2 flex gap-4 text-[10px] text-gray-500">
                  {seg.p75Lcp != null && <span>p75 LCP: {Math.round(seg.p75Lcp)}ms</span>}
                  {seg.p75Fcp != null && <span>p75 FCP: {Math.round(seg.p75Fcp)}ms</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Comparison table */}
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="px-4 py-2 text-left text-gray-400">Metric</th>
              <th className="px-4 py-2 text-right text-gray-400">Desktop</th>
              <th className="px-4 py-2 text-right text-gray-400">Mobile</th>
              <th className="px-4 py-2 text-right text-gray-400">Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {metricRows.map((m) => {
              const dVal = getValue(segments.desktop, m.key);
              const mVal = getValue(segments.mobile, m.key);
              let gap: string = "—";
              let gapColor = "text-gray-500";
              if (dVal != null && mVal != null && dVal !== 0) {
                const pct = ((mVal - dVal) / Math.abs(dVal)) * 100;
                gap = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
                gapColor = Math.abs(pct) > 25 ? "text-red-400" : Math.abs(pct) > 10 ? "text-yellow-400" : "text-gray-400";
              }
              return (
                <tr key={m.key} className="hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-200">{m.label}</td>
                  <td className="px-4 py-2 text-right font-mono text-gray-300">
                    {fmtVal(dVal, m.key)}{m.unit && dVal != null ? m.unit : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-300">
                    {fmtVal(mVal, m.key)}{m.unit && mVal != null ? m.unit : ""}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${gapColor}`}>{gap}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
