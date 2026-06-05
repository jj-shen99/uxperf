/**
 * Unit tests for knowledge page data integrity: FRAMEWORK_TERMINOLOGY entries,
 * tab definitions, and data structure validation.
 */

const FRAMEWORK_TERMINOLOGY: { term: string; abbr?: string; description: string; context: string }[] = [
  {
    term: "Exponentially Weighted Moving Average",
    abbr: "EWMA",
    description: "A smoothing technique that gives exponentially decreasing weight to older observations. The formula is: EWMA_t = \u03B1 \u00D7 x_t + (1 \u2212 \u03B1) \u00D7 EWMA_{t\u22121}, where x_t is the current observation and \u03B1 (0 < \u03B1 < 1) is the smoothing factor. Higher \u03B1 makes the average more responsive to recent values; lower \u03B1 produces a smoother curve that dampens noise. Unlike a simple moving average, EWMA does not require a fixed window size and naturally down-weights older data.",
    context: "Used in our change-point detection service to compute dynamic baselines. An EWMA of metric values tracks the \"expected\" performance; when a new data point deviates beyond a z-score threshold from the EWMA, it triggers an anomaly alert on the /anomalies page.",
  },
  {
    term: "Real User Monitoring",
    abbr: "RUM",
    description: "Collecting performance data from actual users\u2019 browsers in production.",
    context: "Our RUM SDK instruments pages to report Core Web Vitals back to the API.",
  },
  {
    term: "Change-Point Detection",
    description: "Statistical methods that identify moments in a time series where the underlying distribution shifts.",
    context: "The analytics/change-point service uses EWMA-based z-scores.",
  },
  {
    term: "Canary Analysis",
    description: "A deployment strategy where a small percentage of traffic is routed to the new version.",
    context: "The canary-analysis service compares metric distributions.",
  },
  {
    term: "Interquartile Range",
    abbr: "IQR",
    description: "The range between the 25th percentile (Q1) and 75th percentile (Q3) of a dataset.",
    context: "Used in error-bar visualizations and stats module.",
  },
  {
    term: "Saturation Point",
    description: "The load level at which a system\u2019s response time begins to degrade non-linearly.",
    context: "The saturation-detector service monitors load test runs.",
  },
  {
    term: "Virtual User",
    abbr: "VU",
    description: "A simulated concurrent user in a load test.",
    context: "k6 browser adapter manages VU lifecycle.",
  },
  {
    term: "Ramp Stage",
    description: "A phase in a load test profile that defines a target VU count and a duration.",
    context: "Load profiles on the /load page use stages.",
  },
  {
    term: "Percentile",
    abbr: "p50 / p75 / p95 / p99",
    description: "The value below which a given percentage of observations fall.",
    context: "Baselines, gates, and the results page all use percentile-based analysis.",
  },
  {
    term: "Baseline",
    description: "A statistical snapshot of normal performance for a specific metric.",
    context: "The baselines service computes and stores baselines per project/metric.",
  },
  {
    term: "Core Web Vitals",
    abbr: "CWV",
    description: "Google\u2019s three key metrics for user experience: LCP, INP, CLS.",
    context: "CWV metrics are measured by both synthetic runners and the RUM SDK.",
  },
  {
    term: "Synthetic Monitoring",
    description: "Running automated tests against a URL from controlled infrastructure.",
    context: "The core of this framework.",
  },
  {
    term: "Chrome UX Report",
    abbr: "CrUX",
    description: "Google\u2019s public dataset of real user experience metrics.",
    context: "The CrUX ingestion service pulls field data.",
  },
  {
    term: "Quality Gate",
    description: "An automated rule that evaluates a performance metric against a threshold or baseline.",
    context: "Configured per-project on the /gates page.",
  },
  {
    term: "Attribution Analysis",
    description: "The process of identifying which specific resources caused a metric regression.",
    context: "The /investigation page\u2019s Attribution tab.",
  },
  {
    term: "Confidence Interval",
    abbr: "CI",
    description: "A range of values that is likely to contain the true population parameter.",
    context: "Baselines include CI for p75.",
  },
  {
    term: "Mann-Whitney U Test",
    description: "A non-parametric statistical test that compares two independent samples.",
    context: "Used in canary analysis.",
  },
  {
    term: "Capacity Planning",
    description: "Estimating the maximum sustainable load a system can handle.",
    context: "The capacity-planning service analyzes load test results.",
  },
];

type KnowledgeTab = "metrics" | "terminology" | "lighthouse" | "optimization" | "methodology" | "thresholds" | "network" | "gates" | "rendering";

const TABS: { key: KnowledgeTab; label: string }[] = [
  { key: "metrics", label: "Metrics" },
  { key: "terminology", label: "Terminology" },
  { key: "lighthouse", label: "Lighthouse Scores" },
  { key: "optimization", label: "Optimization" },
  { key: "methodology", label: "Testing Methodology" },
  { key: "thresholds", label: "Thresholds" },
  { key: "network", label: "Network Fundamentals" },
  { key: "gates", label: "Quality Gates" },
  { key: "rendering", label: "Browser Rendering" },
];

// ── Tests ──

describe("Knowledge — FRAMEWORK_TERMINOLOGY data integrity", () => {
  it("has at least 18 entries", () => {
    expect(FRAMEWORK_TERMINOLOGY.length).toBeGreaterThanOrEqual(18);
  });

  it("every entry has a non-empty term", () => {
    for (const entry of FRAMEWORK_TERMINOLOGY) {
      expect(entry.term.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a non-empty description", () => {
    for (const entry of FRAMEWORK_TERMINOLOGY) {
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  it("every entry has a non-empty context", () => {
    for (const entry of FRAMEWORK_TERMINOLOGY) {
      expect(entry.context.length).toBeGreaterThan(5);
    }
  });

  it("has no duplicate terms", () => {
    const terms = FRAMEWORK_TERMINOLOGY.map((e) => e.term);
    const unique = new Set(terms);
    expect(unique.size).toBe(terms.length);
  });

  it("contains required key terms: EWMA, RUM, IQR, VU, CWV, CrUX, CI", () => {
    const abbrs = FRAMEWORK_TERMINOLOGY.map((e) => e.abbr).filter(Boolean);
    expect(abbrs).toContain("EWMA");
    expect(abbrs).toContain("RUM");
    expect(abbrs).toContain("IQR");
    expect(abbrs).toContain("VU");
    expect(abbrs).toContain("CWV");
    expect(abbrs).toContain("CrUX");
    expect(abbrs).toContain("CI");
  });

  it("entries without abbreviations have abbr undefined", () => {
    const noAbbr = FRAMEWORK_TERMINOLOGY.filter((e) => !e.abbr);
    expect(noAbbr.length).toBeGreaterThan(0);
    for (const entry of noAbbr) {
      expect(entry.abbr).toBeUndefined();
    }
  });

  it("abbreviations are short (< 20 chars)", () => {
    for (const entry of FRAMEWORK_TERMINOLOGY) {
      if (entry.abbr) {
        expect(entry.abbr.length).toBeLessThan(30);
      }
    }
  });
});

describe("Knowledge — TABS definition", () => {
  it("includes the terminology tab", () => {
    const keys = TABS.map((t) => t.key);
    expect(keys).toContain("terminology");
  });

  it("has 9 tabs", () => {
    expect(TABS).toHaveLength(9);
  });

  it("has unique keys", () => {
    const keys = TABS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique labels", () => {
    const labels = TABS.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("metrics tab is labeled 'Metrics' (not 'Metrics & Glossary')", () => {
    const metricsTab = TABS.find((t) => t.key === "metrics")!;
    expect(metricsTab.label).toBe("Metrics");
  });

  it("every tab has a non-empty label", () => {
    for (const tab of TABS) {
      expect(tab.label.length).toBeGreaterThan(0);
    }
  });

  it("terminology tab comes after metrics tab", () => {
    const keys = TABS.map((t) => t.key);
    const metricsIdx = keys.indexOf("metrics");
    const termIdx = keys.indexOf("terminology");
    expect(termIdx).toBe(metricsIdx + 1);
  });
});

describe("Knowledge — specific terminology entries", () => {
  it("EWMA entry includes formula and explains alpha", () => {
    const ewma = FRAMEWORK_TERMINOLOGY.find((e) => e.abbr === "EWMA")!;
    expect(ewma).toBeDefined();
    expect(ewma.description.toLowerCase()).toContain("smoothing");
    expect(ewma.description.toLowerCase()).toContain("formula");
    expect(ewma.term).toBe("Exponentially Weighted Moving Average");
  });

  it("RUM entry references real user browsers", () => {
    const rum = FRAMEWORK_TERMINOLOGY.find((e) => e.abbr === "RUM")!;
    expect(rum).toBeDefined();
    expect(rum.description.toLowerCase()).toContain("browser");
  });

  it("IQR entry mentions percentiles Q1 and Q3", () => {
    const iqr = FRAMEWORK_TERMINOLOGY.find((e) => e.abbr === "IQR")!;
    expect(iqr).toBeDefined();
    expect(iqr.description).toContain("Q1");
    expect(iqr.description).toContain("Q3");
  });

  it("Canary Analysis entry exists without abbreviation", () => {
    const canary = FRAMEWORK_TERMINOLOGY.find((e) => e.term === "Canary Analysis")!;
    expect(canary).toBeDefined();
    expect(canary.abbr).toBeUndefined();
  });

  it("Quality Gate entry mentions threshold and baseline", () => {
    const gate = FRAMEWORK_TERMINOLOGY.find((e) => e.term === "Quality Gate")!;
    expect(gate).toBeDefined();
    expect(gate.description.toLowerCase()).toContain("threshold");
    expect(gate.description.toLowerCase()).toContain("baseline");
  });
});
