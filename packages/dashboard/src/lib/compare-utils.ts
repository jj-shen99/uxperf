/**
 * E-18: Compare page utility functions — diff computation, summary, formatting.
 */

export interface MetricDef {
  key: string;
  label: string;
  good: number;
  unit: string;
  lowerIsBetter: boolean;
}

export interface DiffRow extends MetricDef {
  a: number | undefined;
  b: number | undefined;
  diff: number | null;
  pct: number | null;
  improved: boolean | null;
  regressed: boolean | null;
}

/** Compute diff row for a single metric between two runs. */
export function computeDiffRow(m: MetricDef, metricsA: any, metricsB: any): DiffRow {
  const a = metricsA?.[m.key] as number | undefined;
  const b = metricsB?.[m.key] as number | undefined;
  const diff = a != null && b != null ? b - a : null;
  const pct = a != null && a !== 0 && diff != null ? ((diff / a) * 100) : null;
  const improved = diff != null ? (m.lowerIsBetter ? diff < 0 : diff > 0) : null;
  const regressed = diff != null ? (m.lowerIsBetter ? diff > 0 : diff < 0) : null;
  return { ...m, a, b, diff, pct, improved, regressed };
}

/** Summarize regressions / improvements across all metrics. */
export function computeDiffSummary(rows: DiffRow[]) {
  const regressions = rows.filter((r) => r.regressed);
  const improvements = rows.filter((r) => r.improved);
  const unchanged = rows.filter((r) => r.diff === 0);
  const noData = rows.filter((r) => r.diff === null);
  return { regressions, improvements, unchanged, noData, total: rows.length };
}

/** Format a metric value for display. */
export function formatValue(value: number | undefined, key: string): string {
  if (value == null) return "—";
  if (key === "cls") return value.toFixed(3);
  if (key === "lighthouse_performance_score") return (value * 100).toFixed(0);
  return Math.round(value).toString();
}

/** Horizontal diff bar width (0-100%) based on |pct|, capped at 100. */
export function diffBarWidth(pct: number | null): number {
  if (pct == null) return 0;
  return Math.min(Math.abs(pct), 100);
}
