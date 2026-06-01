/**
 * Tests for the per-link results breakdown logic on the Results page.
 * Covers: linkGroups derivation from script steps and journey measurements,
 * boundary cases, and regression for single-link scripts.
 */

// Replicate the linkGroups logic from results/page.tsx
function buildLinkGroups(
  scriptSteps: any[],
  journeyMeasurements: any[],
): { label: string; clickIntent: string; measurement: any | null; stepIndex: number }[] {
  if (scriptSteps.length === 0 && journeyMeasurements.length === 0) return [];
  const groups: { label: string; clickIntent: string; measurement: any | null; stepIndex: number }[] = [];

  if (journeyMeasurements.length > 0) {
    journeyMeasurements.forEach((m: any, i: number) => {
      groups.push({
        label: m.label?.replace(/^measure:?\s*/i, "") || `Measurement ${i + 1}`,
        clickIntent: "",
        measurement: m,
        stepIndex: m.step_index ?? i,
      });
    });
    return groups;
  }

  for (let i = 0; i < scriptSteps.length; i++) {
    const step = scriptSteps[i];
    const intent = (step.intent ?? "").toLowerCase();
    if (intent.startsWith("measure") || intent.includes("measure")) {
      const label = (step.intent ?? "").replace(/^measure:?\s*/i, "").replace(/^["']|["']$/g, "") || `Step ${i + 1}`;
      const prevClick = i > 0 ? scriptSteps[i - 1] : null;
      const clickLabel = prevClick?.intent?.match?.(/["'](.+?)["']/)?.[1] ?? "";
      groups.push({
        label,
        clickIntent: clickLabel || prevClick?.intent || "",
        measurement: null,
        stepIndex: step.step ?? i,
      });
    }
  }
  return groups;
}

describe("Results page — per-link groups logic", () => {
  // === Equivalence Partitioning ===

  describe("journey measurements source", () => {
    it("builds groups from journey measurements when available", () => {
      const measurements = [
        { label: "Book A", step_index: 2, web_vitals: { lcp_ms: 1200, fcp_ms: 800 } },
        { label: "Book B", step_index: 5, web_vitals: { lcp_ms: 2400, fcp_ms: 900 } },
      ];
      const groups = buildLinkGroups([], measurements);
      expect(groups).toHaveLength(2);
      expect(groups[0].label).toBe("Book A");
      expect(groups[0].measurement).toBe(measurements[0]);
      expect(groups[1].label).toBe("Book B");
      expect(groups[1].stepIndex).toBe(5);
    });

    it("strips 'measure:' prefix from labels", () => {
      const measurements = [
        { label: 'measure: "Home Page"', step_index: 0, web_vitals: {} },
      ];
      const groups = buildLinkGroups([], measurements);
      expect(groups[0].label).toBe('"Home Page"');
    });

    it("defaults label when measurement has no label", () => {
      const measurements = [
        { step_index: 0, web_vitals: {} },
      ];
      const groups = buildLinkGroups([], measurements);
      expect(groups[0].label).toBe("Measurement 1");
    });
  });

  describe("script steps source", () => {
    it("builds groups from click→measure step pairs", () => {
      const steps = [
        { step: 1, intent: 'click on "Product A"' },
        { step: 2, intent: 'measure: "Product A"' },
        { step: 3, intent: "navigate back to https://shop.com" },
        { step: 4, intent: 'click on "Product B"' },
        { step: 5, intent: 'measure: "Product B"' },
      ];
      const groups = buildLinkGroups(steps, []);
      expect(groups).toHaveLength(2);
      expect(groups[0].label).toBe("Product A");
      expect(groups[0].clickIntent).toBe("Product A");
      expect(groups[1].label).toBe("Product B");
    });

    it("uses preceding click intent when measure has no quoted label", () => {
      const steps = [
        { step: 1, intent: 'click "Login"' },
        { step: 2, intent: "measure performance" },
      ];
      const groups = buildLinkGroups(steps, []);
      expect(groups).toHaveLength(1);
      expect(groups[0].clickIntent).toBe("Login");
    });

    it("uses preceding step intent as fallback when no quotes", () => {
      const steps = [
        { step: 1, intent: "submit form" },
        { step: 2, intent: "measure page load" },
      ];
      const groups = buildLinkGroups(steps, []);
      expect(groups[0].clickIntent).toBe("submit form");
    });
  });

  // === Boundary Value Analysis ===

  describe("boundary cases", () => {
    it("returns empty for no steps and no measurements", () => {
      expect(buildLinkGroups([], [])).toEqual([]);
    });

    it("returns empty for steps with no measure intents", () => {
      const steps = [
        { step: 1, intent: "click login" },
        { step: 2, intent: "fill username" },
      ];
      expect(buildLinkGroups(steps, [])).toEqual([]);
    });

    it("handles single measurement", () => {
      const measurements = [{ label: "Home", step_index: 0, web_vitals: { lcp_ms: 1000 } }];
      const groups = buildLinkGroups([], measurements);
      expect(groups).toHaveLength(1);
    });

    it("handles measure as first step (no preceding click)", () => {
      const steps = [{ step: 1, intent: "measure initial load" }];
      const groups = buildLinkGroups(steps, []);
      expect(groups).toHaveLength(1);
      expect(groups[0].clickIntent).toBe("");
      expect(groups[0].label).toBe("initial load");
    });
  });

  // === Priority: journey measurements take precedence ===

  describe("measurements take priority over script steps", () => {
    it("uses measurements when both are present", () => {
      const steps = [
        { step: 1, intent: 'click "A"' },
        { step: 2, intent: 'measure: "A"' },
      ];
      const measurements = [
        { label: "Runtime A", step_index: 2, web_vitals: { lcp_ms: 1500 } },
      ];
      const groups = buildLinkGroups(steps, measurements);
      // Measurements take precedence
      expect(groups).toHaveLength(1);
      expect(groups[0].label).toBe("Runtime A");
      expect(groups[0].measurement).toBe(measurements[0]);
    });
  });

  // === Regression: single-link scripts don't show breakdown ===

  describe("regression: single-link scripts", () => {
    it("single measurement group is still returned (UI decides to hide < 2)", () => {
      const steps = [
        { step: 1, intent: "navigate to https://shop.com" },
        { step: 2, intent: "measure page load" },
      ];
      const groups = buildLinkGroups(steps, []);
      // Returns 1 group — the UI conditionally hides if linkGroups.length <= 1
      expect(groups).toHaveLength(1);
    });
  });

  // === Step index mapping ===

  describe("step index mapping", () => {
    it("uses step_index from measurement", () => {
      const measurements = [
        { label: "A", step_index: 7, web_vitals: {} },
        { label: "B", step_index: 12, web_vitals: {} },
      ];
      const groups = buildLinkGroups([], measurements);
      expect(groups[0].stepIndex).toBe(7);
      expect(groups[1].stepIndex).toBe(12);
    });

    it("defaults step_index to array index when missing", () => {
      const measurements = [
        { label: "A", web_vitals: {} },
        { label: "B", web_vitals: {} },
      ];
      const groups = buildLinkGroups([], measurements);
      expect(groups[0].stepIndex).toBe(0);
      expect(groups[1].stepIndex).toBe(1);
    });
  });
});
