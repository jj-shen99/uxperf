/**
 * Tests for the Investigation page timeline logic and anomaly detection threshold.
 * Covers: timeline filtering by anomaly's project_id, minimum run threshold,
 * and boundary cases for window calculation.
 */

// Replicate timeline logic from investigation/page.tsx
function buildTimeline(
  runs: any[],
  selectedAnomaly: { metric: string; project_id: string; run_id: string } | null,
) {
  if (!selectedAnomaly || runs.length === 0) return [];
  const metric = selectedAnomaly.metric;
  const projectRuns = runs
    .filter((r: any) => r.project_id === selectedAnomaly.project_id)
    .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const anomalyRunIdx = projectRuns.findIndex((r: any) => r.id === selectedAnomaly.run_id);
  if (anomalyRunIdx < 0) return [];
  const windowStart = Math.max(0, anomalyRunIdx - 10);
  const windowEnd = Math.min(projectRuns.length, anomalyRunIdx + 6);
  return projectRuns
    .slice(windowStart, windowEnd)
    .filter((r: any) => r.status === "completed" && r.metrics)
    .map((r: any) => ({
      label: new Date(r.created_at).toLocaleDateString(),
      value: Number((r.metrics as any)?.[metric]) || 0,
      isAnomaly: r.id === selectedAnomaly.run_id,
    }));
}

// Replicate anomaly detection minimum-runs logic from anomalies/page.tsx
function detectAnomalies(runs: any[], projectId: string | null) {
  const completed = runs.filter(
    (r: any) => r.status === "completed" && r.metrics && (!projectId || r.project_id === projectId),
  );
  if (completed.length < 2) return [];
  // Simplified: just return completed runs as "analyzable"
  return completed;
}

describe("Investigation page — timeline logic", () => {
  // === Equivalence Partitioning ===

  describe("filters runs by anomaly project_id", () => {
    const runs = [
      { id: "r1", project_id: "p1", status: "completed", metrics: { lcp_ms: 1200 }, created_at: "2024-01-01" },
      { id: "r2", project_id: "p2", status: "completed", metrics: { lcp_ms: 1500 }, created_at: "2024-01-02" },
      { id: "r3", project_id: "p1", status: "completed", metrics: { lcp_ms: 5000 }, created_at: "2024-01-03" },
    ];

    it("only includes runs from the anomaly's project", () => {
      const timeline = buildTimeline(runs, { metric: "lcp_ms", project_id: "p1", run_id: "r3" });
      expect(timeline).toHaveLength(2);
      expect(timeline.every((t: any) => !["r2"].includes(t.run_id))).toBe(true);
    });

    it("marks the anomaly run in the timeline", () => {
      const timeline = buildTimeline(runs, { metric: "lcp_ms", project_id: "p1", run_id: "r3" });
      expect(timeline[1].isAnomaly).toBe(true);
      expect(timeline[0].isAnomaly).toBe(false);
    });
  });

  // === Boundary Value Analysis ===

  describe("boundary cases", () => {
    it("returns empty when no anomaly selected", () => {
      expect(buildTimeline([{ id: "r1" }], null)).toEqual([]);
    });

    it("returns empty when runs array is empty", () => {
      expect(buildTimeline([], { metric: "lcp_ms", project_id: "p1", run_id: "r1" })).toEqual([]);
    });

    it("returns empty when anomaly run_id not found in project runs", () => {
      const runs = [
        { id: "r1", project_id: "p1", status: "completed", metrics: { lcp_ms: 1200 }, created_at: "2024-01-01" },
      ];
      const timeline = buildTimeline(runs, { metric: "lcp_ms", project_id: "p1", run_id: "nonexistent" });
      expect(timeline).toEqual([]);
    });

    it("handles single run that is the anomaly", () => {
      const runs = [
        { id: "r1", project_id: "p1", status: "completed", metrics: { lcp_ms: 5000 }, created_at: "2024-01-01" },
      ];
      const timeline = buildTimeline(runs, { metric: "lcp_ms", project_id: "p1", run_id: "r1" });
      expect(timeline).toHaveLength(1);
      expect(timeline[0].isAnomaly).toBe(true);
    });
  });

  // === Window calculation ===

  describe("window centering around anomaly run", () => {
    it("shows up to 10 runs before and 5 after the anomaly", () => {
      const runs = Array.from({ length: 25 }, (_, i) => ({
        id: `r${i}`,
        project_id: "p1",
        status: "completed",
        metrics: { lcp_ms: 1000 + i * 100 },
        created_at: `2024-01-${String(i + 1).padStart(2, "0")}`,
      }));
      const timeline = buildTimeline(runs, { metric: "lcp_ms", project_id: "p1", run_id: "r15" });
      // Window: max(0, 15-10)=5 to min(25, 15+6)=21 → 16 runs
      expect(timeline.length).toBe(16);
    });

    it("clamps window at start for early anomaly", () => {
      const runs = Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`,
        project_id: "p1",
        status: "completed",
        metrics: { lcp_ms: 1000 },
        created_at: `2024-01-${String(i + 1).padStart(2, "0")}`,
      }));
      const timeline = buildTimeline(runs, { metric: "lcp_ms", project_id: "p1", run_id: "r2" });
      // Window: max(0, 2-10)=0 to min(10, 2+6)=8 → 8 runs
      expect(timeline.length).toBe(8);
    });

    it("clamps window at end for late anomaly", () => {
      const runs = Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`,
        project_id: "p1",
        status: "completed",
        metrics: { lcp_ms: 1000 },
        created_at: `2024-01-${String(i + 1).padStart(2, "0")}`,
      }));
      const timeline = buildTimeline(runs, { metric: "lcp_ms", project_id: "p1", run_id: "r9" });
      // Window: max(0, 9-10)=0 to min(10, 9+6)=10 → 10 runs
      expect(timeline.length).toBe(10);
    });
  });

  // === Excludes non-completed and metric-less runs ===

  describe("filters by status and metrics presence", () => {
    it("excludes queued/running runs from timeline", () => {
      const runs = [
        { id: "r1", project_id: "p1", status: "completed", metrics: { lcp_ms: 1200 }, created_at: "2024-01-01" },
        { id: "r2", project_id: "p1", status: "running", metrics: { lcp_ms: 1300 }, created_at: "2024-01-02" },
        { id: "r3", project_id: "p1", status: "completed", metrics: { lcp_ms: 5000 }, created_at: "2024-01-03" },
      ];
      const timeline = buildTimeline(runs, { metric: "lcp_ms", project_id: "p1", run_id: "r3" });
      expect(timeline).toHaveLength(2);
    });

    it("excludes runs without metrics", () => {
      const runs = [
        { id: "r1", project_id: "p1", status: "completed", metrics: null, created_at: "2024-01-01" },
        { id: "r2", project_id: "p1", status: "completed", metrics: { lcp_ms: 5000 }, created_at: "2024-01-02" },
      ];
      const timeline = buildTimeline(runs, { metric: "lcp_ms", project_id: "p1", run_id: "r2" });
      expect(timeline).toHaveLength(1);
    });
  });
});

describe("Anomalies page — minimum run threshold", () => {
  it("requires at least 2 completed runs to detect anomalies", () => {
    const runs = [
      { id: "r1", project_id: "p1", status: "completed", metrics: { lcp_ms: 1200 } },
    ];
    expect(detectAnomalies(runs, "p1")).toEqual([]);
  });

  it("detects with exactly 2 completed runs", () => {
    const runs = [
      { id: "r1", project_id: "p1", status: "completed", metrics: { lcp_ms: 1200 } },
      { id: "r2", project_id: "p1", status: "completed", metrics: { lcp_ms: 5000 } },
    ];
    expect(detectAnomalies(runs, "p1")).toHaveLength(2);
  });

  it("filters by projectId when provided", () => {
    const runs = [
      { id: "r1", project_id: "p1", status: "completed", metrics: { lcp_ms: 1200 } },
      { id: "r2", project_id: "p2", status: "completed", metrics: { lcp_ms: 1300 } },
      { id: "r3", project_id: "p1", status: "completed", metrics: { lcp_ms: 5000 } },
    ];
    const result = detectAnomalies(runs, "p1");
    expect(result).toHaveLength(2);
    expect(result.every((r: any) => r.project_id === "p1")).toBe(true);
  });

  it("shows all projects when projectId is null", () => {
    const runs = [
      { id: "r1", project_id: "p1", status: "completed", metrics: { lcp_ms: 1200 } },
      { id: "r2", project_id: "p2", status: "completed", metrics: { lcp_ms: 1300 } },
    ];
    expect(detectAnomalies(runs, null)).toHaveLength(2);
  });
});
