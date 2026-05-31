"use client";

/**
 * E-40: Synthetic vs. Field Side-by-Side Comparison
 *
 * Book: Ch 14, p240; Ch 15, p254
 * "Show synthetic and RUM metrics for the same route side by side,
 * with disagreement highlighting — synthetic flat, RUM rising → investigate segment."
 */

import { useMemo } from "react";

interface MetricPair {
  metric: string;
  label: string;
  unit: string;
  syntheticValue: number | null;
  fieldValue: number | null;
  fieldP50?: number | null;
  fieldP95?: number | null;
  fieldSamples?: number;
}

interface SyntheticVsFieldProps {
  syntheticRuns: Array<{ metrics?: Record<string, unknown> }>;
  rumSummary: Array<{
    metric?: string;
    lcp_p75?: number | null;
    fcp_p75?: number | null;
    inp_p75?: number | null;
    cls_p75?: number | null;
    ttfb_p75?: number | null;
    sample_count?: number;
    p50?: number | null;
    p95?: number | null;
  }>;
}

const METRIC_MAP: { key: string; rumKey: string; label: string; unit: string; good: number; poor: number }[] = [
  { key: "lcp_ms", rumKey: "lcp_p75", label: "LCP", unit: "ms", good: 2500, poor: 4000 },
  { key: "fcp_ms", rumKey: "fcp_p75", label: "FCP", unit: "ms", good: 1800, poor: 3000 },
  { key: "inp_ms", rumKey: "inp_p75", label: "INP", unit: "ms", good: 200, poor: 500 },
  { key: "cls", rumKey: "cls_p75", label: "CLS", unit: "", good: 0.1, poor: 0.25 },
  { key: "ttfb_ms", rumKey: "ttfb_p75", label: "TTFB", unit: "ms", good: 800, poor: 1800 },
];

function ratingClass(value: number | null, good: number, poor: number, isScore = false): string {
  if (value == null) return "text-gray-500";
  if (isScore) return value >= good ? "text-green-400" : value >= poor ? "text-yellow-400" : "text-red-400";
  return value <= good ? "text-green-400" : value <= poor ? "text-yellow-400" : "text-red-400";
}

function fmt(v: number | null, key: string): string {
  if (v == null) return "—";
  if (key === "cls") return v.toFixed(3);
  return Math.round(v).toString();
}

function disagreementLevel(synthetic: number | null, field: number | null): "none" | "mild" | "severe" {
  if (synthetic == null || field == null) return "none";
  const diff = Math.abs(synthetic - field);
  const avg = (synthetic + field) / 2;
  if (avg === 0) return "none";
  const pct = (diff / avg) * 100;
  if (pct > 50) return "severe";
  if (pct > 20) return "mild";
  return "none";
}

export function SyntheticVsField({ syntheticRuns, rumSummary }: SyntheticVsFieldProps) {
  const pairs = useMemo<MetricPair[]>(() => {
    // Compute synthetic medians from recent runs
    const completed = syntheticRuns.filter((r) => r.metrics);
    const recent = completed.slice(-20);

    return METRIC_MAP.map((m) => {
      const synValues = recent
        .map((r) => r.metrics?.[m.key] as number | undefined)
        .filter((v): v is number => v != null);
      const synMedian = synValues.length > 0
        ? [...synValues].sort((a, b) => a - b)[Math.floor(synValues.length / 2)]
        : null;

      // Find matching RUM data
      const rumRow = rumSummary[0]; // first summary row (primary origin)
      const fieldValue = rumRow ? (rumRow as any)[m.rumKey] ?? null : null;

      return {
        metric: m.key,
        label: m.label,
        unit: m.unit,
        syntheticValue: synMedian,
        fieldValue: fieldValue != null ? Number(fieldValue) : null,
        fieldSamples: rumRow?.sample_count ? Number(rumRow.sample_count) : undefined,
      };
    });
  }, [syntheticRuns, rumSummary]);

  const hasAnyData = pairs.some((p) => p.syntheticValue != null || p.fieldValue != null);

  if (!hasAnyData) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
        <p className="text-sm">No synthetic or RUM data available for comparison.</p>
        <p className="mt-1 text-xs">Run synthetic tests and integrate the RUM SDK to see side-by-side metrics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs text-gray-400">Metric</th>
              <th className="px-4 py-2 text-right text-xs text-gray-400">Synthetic (p50)</th>
              <th className="px-4 py-2 text-right text-xs text-gray-400">Field RUM (p75)</th>
              <th className="px-4 py-2 text-right text-xs text-gray-400">Delta</th>
              <th className="px-4 py-2 text-center text-xs text-gray-400">Agreement</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => {
              const m = METRIC_MAP.find((mm) => mm.key === p.metric)!;
              const disagreement = disagreementLevel(p.syntheticValue, p.fieldValue);
              const delta = p.syntheticValue != null && p.fieldValue != null
                ? p.fieldValue - p.syntheticValue
                : null;
              const deltaPct = delta != null && p.syntheticValue
                ? (delta / p.syntheticValue) * 100
                : null;

              return (
                <tr key={p.metric} className="border-b border-gray-800/30">
                  <td className="px-4 py-2 text-gray-200 font-medium">{p.label}</td>
                  <td className={`px-4 py-2 text-right font-mono ${ratingClass(p.syntheticValue, m.good, m.poor)}`}>
                    {fmt(p.syntheticValue, p.metric)}{p.unit && p.syntheticValue != null ? p.unit : ""}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${ratingClass(p.fieldValue, m.good, m.poor)}`}>
                    {fmt(p.fieldValue, p.metric)}{p.unit && p.fieldValue != null ? p.unit : ""}
                    {p.fieldSamples != null && (
                      <span className="ml-1 text-[10px] text-gray-600">({p.fieldSamples})</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-gray-500">
                    {delta != null ? (
                      <>
                        {delta > 0 ? "+" : ""}{fmt(delta, p.metric)}{p.unit}
                        {deltaPct != null && (
                          <span className="ml-1 text-[10px]">
                            ({deltaPct > 0 ? "+" : ""}{deltaPct.toFixed(0)}%)
                          </span>
                        )}
                      </>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      disagreement === "severe"
                        ? "bg-red-900/30 text-red-400"
                        : disagreement === "mild"
                        ? "bg-yellow-900/30 text-yellow-400"
                        : "bg-green-900/30 text-green-400"
                    }`}>
                      {disagreement === "severe" ? "⚠ Investigate" : disagreement === "mild" ? "~ Mild gap" : "✓ Aligned"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-600 italic">
        Synthetic = lab median (last 20 runs) · Field = RUM p75 (last 28 days) · &quot;Investigate&quot; when gap &gt; 50%
      </p>
    </div>
  );
}
