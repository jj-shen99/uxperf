/**
 * E-63: Shared IQR (interquartile range) utility for error bars on metric charts.
 *
 * Computes rolling p25/p75 bands for any numeric metric series.
 * Used by trends, reports, and other time-series chart pages.
 */

export const IQR_WINDOW = 5;

/** Compute rolling p25/p75 (IQR band) for a metric across data points. */
export function computeRollingIQR(
  data: any[],
  metricKey: string,
  windowSize: number = IQR_WINDOW,
): { lower: number | null; upper: number | null }[] {
  return data.map((_, idx) => {
    const start = Math.max(0, idx - Math.floor(windowSize / 2));
    const end = Math.min(data.length, idx + Math.ceil(windowSize / 2));
    const values = data.slice(start, end)
      .map((d) => d[metricKey] as number | null)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    if (values.length < 2) return { lower: null, upper: null };
    const p25Idx = Math.floor(values.length * 0.25);
    const p75Idx = Math.floor(values.length * 0.75);
    return { lower: values[p25Idx], upper: values[Math.min(p75Idx, values.length - 1)] };
  });
}

/**
 * Attach IQR band arrays to chart data points for the given metric keys.
 * Each key gets a `${key}_iqr` field on each data point: [lower, upper] or null.
 */
export function attachIQRBands(
  data: any[],
  metricKeys: string[],
  windowSize: number = IQR_WINDOW,
): void {
  for (const key of metricKeys) {
    const iqr = computeRollingIQR(data, key, windowSize);
    data.forEach((d: any, i: number) => {
      d[`${key}_iqr`] = iqr[i].lower != null && iqr[i].upper != null
        ? [iqr[i].lower, iqr[i].upper]
        : null;
    });
  }
}
