/**
 * Unit tests for anomalies page logic: client-side detection,
 * server anomaly normalization, merge strategy, and formatting.
 */

const METRIC_THRESHOLDS: Record<string, { good: number; poor: number; label: string; unit: string }> = {
  lcp_ms: { good: 2500, poor: 4000, label: "LCP", unit: "ms" },
  fcp_ms: { good: 1800, poor: 3000, label: "FCP", unit: "ms" },
  cls: { good: 0.1, poor: 0.25, label: "CLS", unit: "" },
  ttfb_ms: { good: 800, poor: 1800, label: "TTFB", unit: "ms" },
  inp_ms: { good: 200, poor: 500, label: "INP", unit: "ms" },
  tbt_ms: { good: 200, poor: 600, label: "TBT", unit: "ms" },
};

interface DetectedAnomaly {
  id: string;
  metric: string;
  metricLabel: string;
  severity: "critical" | "warning" | "info";
  value: number;
  baseline: number;
  changePercent: number;
  runId: string;
  url: string;
  detectedAt: string;
  description: string;
  unit: string;
}

function fmt(v: number, metric: string): string {
  return metric === "cls" ? v.toFixed(3) : `${Math.round(v)}`;
}

/** Normalize a server anomaly object to the DetectedAnomaly shape */
function normalizeServerAnomaly(a: any): DetectedAnomaly {
  const th = METRIC_THRESHOLDS[a.metric];
  const value = a.details?.value ?? 0;
  const baseline = a.details?.baseline ?? 0;
  const changePct = a.details?.change_percent ?? (baseline > 0 ? ((value - baseline) / baseline) * 100 : 0);
  return {
    id: a.id,
    metric: a.metric,
    metricLabel: th?.label ?? a.metric,
    severity: a.severity ?? "info",
    value,
    baseline,
    changePercent: changePct,
    runId: a.run_id ?? "",
    url: a.url ?? "—",
    detectedAt: a.detected_at ?? a.created_at ?? "",
    description: a.description ?? `${th?.label ?? a.metric} anomaly detected`,
    unit: th?.unit ?? "ms",
  };
}

/** Merge server anomalies with client-side fallback */
function mergeAnomalies(
  serverAnomalies: any[],
  clientAnomalies: DetectedAnomaly[],
  daysFilter: number,
): DetectedAnomaly[] {
  const now = Date.now();
  const cutoff = daysFilter > 0 ? now - daysFilter * 86400000 : 0;

  const fromServer: DetectedAnomaly[] = serverAnomalies
    .map(normalizeServerAnomaly)
    .filter((a) => {
      if (cutoff > 0 && new Date(a.detectedAt).getTime() < cutoff) return false;
      return true;
    });

  if (fromServer.length > 0) {
    const serverIds = new Set(fromServer.map((a) => a.id));
    const extra = clientAnomalies.filter((a) => !serverIds.has(a.id));
    return [...fromServer, ...extra].sort(
      (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    );
  }

  return clientAnomalies;
}

// ── Tests ──

describe("Anomalies — fmt", () => {
  it("formats CLS with 3 decimal places", () => {
    expect(fmt(0.123456, "cls")).toBe("0.123");
  });

  it("formats non-CLS metrics as rounded integers", () => {
    expect(fmt(2534.7, "lcp_ms")).toBe("2535");
    expect(fmt(199.4, "inp_ms")).toBe("199");
  });

  it("handles zero", () => {
    expect(fmt(0, "lcp_ms")).toBe("0");
    expect(fmt(0, "cls")).toBe("0.000");
  });
});

describe("Anomalies — METRIC_THRESHOLDS", () => {
  it("has thresholds for all expected metrics", () => {
    const expected = ["lcp_ms", "fcp_ms", "cls", "ttfb_ms", "inp_ms", "tbt_ms"];
    for (const key of expected) {
      expect(METRIC_THRESHOLDS[key]).toBeDefined();
      expect(METRIC_THRESHOLDS[key].good).toBeLessThan(METRIC_THRESHOLDS[key].poor);
    }
  });

  it("every threshold has label and unit", () => {
    for (const [, th] of Object.entries(METRIC_THRESHOLDS)) {
      expect(th.label).toBeTruthy();
      expect(typeof th.unit).toBe("string");
    }
  });
});

describe("Anomalies — normalizeServerAnomaly", () => {
  it("maps a fully-populated server anomaly", () => {
    const server = {
      id: "anom-1",
      metric: "lcp_ms",
      severity: "critical",
      details: { value: 5000, baseline: 2000, change_percent: 150 },
      run_id: "run-1",
      url: "https://example.com",
      detected_at: "2026-01-15T10:00:00Z",
      description: "LCP spiked to 5000ms",
    };
    const result = normalizeServerAnomaly(server);
    expect(result.id).toBe("anom-1");
    expect(result.metric).toBe("lcp_ms");
    expect(result.metricLabel).toBe("LCP");
    expect(result.severity).toBe("critical");
    expect(result.value).toBe(5000);
    expect(result.baseline).toBe(2000);
    expect(result.changePercent).toBe(150);
    expect(result.runId).toBe("run-1");
    expect(result.url).toBe("https://example.com");
    expect(result.detectedAt).toBe("2026-01-15T10:00:00Z");
    expect(result.description).toBe("LCP spiked to 5000ms");
    expect(result.unit).toBe("ms");
  });

  it("handles missing details gracefully", () => {
    const server = { id: "a2", metric: "fcp_ms" };
    const result = normalizeServerAnomaly(server);
    expect(result.value).toBe(0);
    expect(result.baseline).toBe(0);
    expect(result.changePercent).toBe(0);
    expect(result.severity).toBe("info");
    expect(result.runId).toBe("");
    expect(result.url).toBe("—");
  });

  it("computes changePercent from value/baseline when details.change_percent is missing", () => {
    const server = {
      id: "a3",
      metric: "ttfb_ms",
      details: { value: 1200, baseline: 800 },
    };
    const result = normalizeServerAnomaly(server);
    expect(result.changePercent).toBe(50); // (1200-800)/800 * 100
  });

  it("handles zero baseline without division by zero", () => {
    const server = {
      id: "a4",
      metric: "lcp_ms",
      details: { value: 3000, baseline: 0 },
    };
    const result = normalizeServerAnomaly(server);
    expect(result.changePercent).toBe(0); // can't compute %, fallback to 0
  });

  it("falls back to metric key as label for unknown metrics", () => {
    const server = { id: "a5", metric: "unknown_metric" };
    const result = normalizeServerAnomaly(server);
    expect(result.metricLabel).toBe("unknown_metric");
    expect(result.unit).toBe("ms"); // default
  });

  it("uses created_at as fallback for detected_at", () => {
    const server = { id: "a6", metric: "cls", created_at: "2026-03-01T00:00:00Z" };
    const result = normalizeServerAnomaly(server);
    expect(result.detectedAt).toBe("2026-03-01T00:00:00Z");
  });
});

describe("Anomalies — mergeAnomalies", () => {
  const clientAnomalies: DetectedAnomaly[] = [
    {
      id: "run-1-lcp_ms",
      metric: "lcp_ms",
      metricLabel: "LCP",
      severity: "warning",
      value: 3500,
      baseline: 2000,
      changePercent: 75,
      runId: "run-1",
      url: "https://example.com",
      detectedAt: "2026-06-01T10:00:00Z",
      description: "LCP spiked to 3500ms",
      unit: "ms",
    },
    {
      id: "run-2-fcp_ms",
      metric: "fcp_ms",
      metricLabel: "FCP",
      severity: "info",
      value: 2000,
      baseline: 1500,
      changePercent: 33,
      runId: "run-2",
      url: "https://example.com",
      detectedAt: "2026-06-02T10:00:00Z",
      description: "FCP spiked to 2000ms",
      unit: "ms",
    },
  ];

  it("returns client anomalies when server list is empty", () => {
    const result = mergeAnomalies([], clientAnomalies, 0);
    expect(result).toEqual(clientAnomalies);
  });

  it("prefers server anomalies when present", () => {
    const server = [
      {
        id: "server-1",
        metric: "lcp_ms",
        severity: "critical",
        details: { value: 5000, baseline: 2000, change_percent: 150 },
        run_id: "run-3",
        detected_at: "2026-06-03T10:00:00Z",
        description: "Server detected LCP regression",
      },
    ];
    const result = mergeAnomalies(server, clientAnomalies, 0);
    // Server anomaly is first (most recent), then client anomalies added
    expect(result.length).toBe(3);
    expect(result[0].id).toBe("server-1");
  });

  it("deduplicates by id when server and client share an id", () => {
    const server = [
      {
        id: "run-1-lcp_ms", // same id as client anomaly
        metric: "lcp_ms",
        severity: "critical",
        details: { value: 5000, baseline: 2000, change_percent: 150 },
        detected_at: "2026-06-01T10:00:00Z",
      },
    ];
    const result = mergeAnomalies(server, clientAnomalies, 0);
    // Only 2 results: the server version of the duplicate + the non-duplicate client
    expect(result.length).toBe(2);
    const ids = result.map((a) => a.id);
    expect(ids).toContain("run-1-lcp_ms");
    expect(ids).toContain("run-2-fcp_ms");
    // The severity should be from the server version
    const merged = result.find((a) => a.id === "run-1-lcp_ms")!;
    expect(merged.severity).toBe("critical");
  });

  it("sorts results by detectedAt descending", () => {
    const server = [
      {
        id: "old-server",
        metric: "ttfb_ms",
        severity: "warning",
        details: { value: 1000, baseline: 500 },
        detected_at: "2026-05-01T00:00:00Z",
      },
    ];
    const result = mergeAnomalies(server, clientAnomalies, 0);
    for (let i = 1; i < result.length; i++) {
      expect(new Date(result[i - 1].detectedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(result[i].detectedAt).getTime(),
      );
    }
  });

  it("filters by daysFilter cutoff on server anomalies", () => {
    const oldDate = new Date(Date.now() - 60 * 86400000).toISOString(); // 60 days ago
    const server = [
      {
        id: "old-one",
        metric: "lcp_ms",
        severity: "info",
        details: { value: 3000, baseline: 2000 },
        detected_at: oldDate,
      },
    ];
    // With 30-day filter, the old server anomaly should be filtered out
    const result = mergeAnomalies(server, [], 30);
    expect(result.length).toBe(0);
  });

  it("includes server anomalies within daysFilter", () => {
    const recentDate = new Date(Date.now() - 5 * 86400000).toISOString(); // 5 days ago
    const server = [
      {
        id: "recent-one",
        metric: "lcp_ms",
        severity: "warning",
        details: { value: 3000, baseline: 2000 },
        detected_at: recentDate,
      },
    ];
    const result = mergeAnomalies(server, [], 30);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("recent-one");
  });

  it("daysFilter=0 means no cutoff (all included)", () => {
    const veryOldDate = new Date(Date.now() - 365 * 86400000).toISOString();
    const server = [
      {
        id: "ancient",
        metric: "fcp_ms",
        severity: "info",
        details: { value: 2000, baseline: 1500 },
        detected_at: veryOldDate,
      },
    ];
    const result = mergeAnomalies(server, [], 0);
    expect(result.length).toBe(1);
  });
});
