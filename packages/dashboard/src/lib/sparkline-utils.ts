/**
 * E-19: Sparkline utility functions — data extraction, SVG points, trend detection.
 */

/** Extract the last N values of a metric from chronologically ordered runs. */
export function extractSparklineData(runs: any[], key: string, count = 20): number[] {
  return runs
    .filter((r: any) => r.metrics?.[key] != null)
    .slice(-count)
    .map((r: any) => r.metrics[key] as number);
}

/** Build an SVG polyline points string from numeric values. */
export function sparklinePoints(values: number[], width: number, height: number, padding = 2): string {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = padding + (i / (values.length - 1)) * (width - padding * 2);
      const y = padding + (1 - (v - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Determine trend direction from sparkline data. */
export function sparklineTrend(values: number[]): "up" | "down" | "flat" {
  if (values.length < 2) return "flat";
  const first = values.slice(0, Math.ceil(values.length / 3));
  const last = values.slice(-Math.ceil(values.length / 3));
  const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
  const avgLast = last.reduce((a, b) => a + b, 0) / last.length;
  const pctChange = ((avgLast - avgFirst) / (avgFirst || 1)) * 100;
  if (Math.abs(pctChange) < 3) return "flat";
  return pctChange > 0 ? "up" : "down";
}
