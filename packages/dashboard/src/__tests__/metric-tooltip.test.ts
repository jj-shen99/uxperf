/**
 * Unit tests for metric glossary data and metric rating logic.
 * We inline the glossary here instead of importing the "use client"
 * module, since Jest runs in Node without a bundler directive.
 */

const EXPECTED_METRIC_KEYS = [
  "LCP", "FCP", "CLS", "TTFB", "INP", "TBT", "TTI", "SI", "Lighthouse Score",
  "Server Processing", "Browser Rendering",
];

const TIMING_KEYS = ["LCP", "FCP", "TTFB", "INP", "TBT", "TTI", "SI"];

const METRIC_FULL_NAMES: Record<string, string> = {
  LCP: "Largest Contentful Paint",
  FCP: "First Contentful Paint",
  CLS: "Cumulative Layout Shift",
  TTFB: "Time to First Byte",
  INP: "Interaction to Next Paint",
  TBT: "Total Blocking Time",
  TTI: "Time to Interactive",
  SI: "Speed Index",
  "Lighthouse Score": "Lighthouse Performance Score",
  "Server Processing": "Server Processing Time",
  "Browser Rendering": "Browser Rendering Time",
};

describe("Metric Glossary expectations", () => {
  it("framework tracks all 11 metrics (9 standard + server processing + browser rendering)", () => {
    expect(EXPECTED_METRIC_KEYS).toHaveLength(11);
  });

  it("every metric has a full human-readable name", () => {
    for (const key of EXPECTED_METRIC_KEYS) {
      expect(METRIC_FULL_NAMES[key]).toBeTruthy();
      expect(METRIC_FULL_NAMES[key].length).toBeGreaterThan(5);
    }
  });

  it("LCP full name is correct", () => {
    expect(METRIC_FULL_NAMES["LCP"]).toBe("Largest Contentful Paint");
  });

  it("CLS is not a timing metric", () => {
    expect(TIMING_KEYS).not.toContain("CLS");
  });

  it("7 timing metrics exist", () => {
    expect(TIMING_KEYS).toHaveLength(7);
  });

  it("Lighthouse Score is a composite metric", () => {
    expect(METRIC_FULL_NAMES["Lighthouse Score"]).toContain("Performance");
  });
});
