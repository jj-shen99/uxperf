import { describe, it, expect } from "vitest";
import {
  isValidRunStatus,
  isValidRunMode,
  isValidRunEngine,
  isValidGatePolicy,
  isValidGateResultStatus,
  isValidAuthoringMode,
  isValidMetricName,
  isValidUrl,
  clampScore,
  isMetricWithinBudget,
  validateRunConfig,
  validateEngineRunRequest,
} from "../validators";

// ============================================================
// Type Guard Tests — Equivalence Partition Testing
// Each enum type guard is tested with:
//   - Valid partition: all accepted values
//   - Invalid partition: values outside the enum
//   - Edge cases: empty string, similar-but-wrong values
// ============================================================

describe("Type guard — Equivalence Partitions", () => {
  describe("isValidRunStatus", () => {
    const valid = ["queued", "running", "completed", "failed", "cancelled"];
    const invalid = ["", "pending", "done", "QUEUED", "Running", "unknown", "complete"];

    it.each(valid)("accepts valid status '%s'", (v) => {
      expect(isValidRunStatus(v)).toBe(true);
    });

    it.each(invalid)("rejects invalid status '%s'", (v) => {
      expect(isValidRunStatus(v)).toBe(false);
    });
  });

  describe("isValidRunMode", () => {
    const valid = ["stability", "load", "deep", "scheduled"];
    const invalid = ["", "stress", "quick", "Stability", "LOAD"];

    it.each(valid)("accepts valid mode '%s'", (v) => {
      expect(isValidRunMode(v)).toBe(true);
    });

    it.each(invalid)("rejects invalid mode '%s'", (v) => {
      expect(isValidRunMode(v)).toBe(false);
    });
  });

  describe("isValidRunEngine", () => {
    const valid = ["playwright_lighthouse", "k6_browser", "wpt", "sitespeed"];
    const invalid = ["", "playwright", "lighthouse", "k6", "chrome", "PLAYWRIGHT_LIGHTHOUSE"];

    it.each(valid)("accepts valid engine '%s'", (v) => {
      expect(isValidRunEngine(v)).toBe(true);
    });

    it.each(invalid)("rejects invalid engine '%s'", (v) => {
      expect(isValidRunEngine(v)).toBe(false);
    });
  });

  describe("isValidGatePolicy", () => {
    const valid = ["block", "warn", "page"];
    const invalid = ["", "alert", "Block", "WARN", "notify"];

    it.each(valid)("accepts valid policy '%s'", (v) => {
      expect(isValidGatePolicy(v)).toBe(true);
    });

    it.each(invalid)("rejects invalid policy '%s'", (v) => {
      expect(isValidGatePolicy(v)).toBe(false);
    });
  });

  describe("isValidGateResultStatus", () => {
    const valid = ["passed", "failed", "skipped", "overridden"];
    const invalid = ["", "pass", "fail", "skip", "override", "Passed"];

    it.each(valid)("accepts '%s'", (v) => {
      expect(isValidGateResultStatus(v)).toBe(true);
    });

    it.each(invalid)("rejects '%s'", (v) => {
      expect(isValidGateResultStatus(v)).toBe(false);
    });
  });

  describe("isValidAuthoringMode", () => {
    const valid = ["record", "template", "describe", "manual"];
    const invalid = ["", "auto", "ai", "Record", "MANUAL"];

    it.each(valid)("accepts '%s'", (v) => {
      expect(isValidAuthoringMode(v)).toBe(true);
    });

    it.each(invalid)("rejects '%s'", (v) => {
      expect(isValidAuthoringMode(v)).toBe(false);
    });
  });

  describe("isValidMetricName", () => {
    const valid = [
      "lcp", "fcp", "inp", "cls", "ttfb", "si", "tti", "tbt",
      "lighthouse_performance", "lighthouse_accessibility",
      "lighthouse_best_practices", "lighthouse_seo",
    ];
    const invalid = ["", "LCP", "speed_index", "fmp", "dcl", "load"];

    it.each(valid)("accepts '%s'", (v) => {
      expect(isValidMetricName(v)).toBe(true);
    });

    it.each(invalid)("rejects '%s'", (v) => {
      expect(isValidMetricName(v)).toBe(false);
    });
  });
});

// ============================================================
// isValidUrl — Equivalence Partitions + Boundary Conditions
// Partitions: valid http, valid https, invalid protocol, malformed, empty
// ============================================================

describe("isValidUrl — Equivalence Partitions + Boundary", () => {
  describe("valid partition (http/https)", () => {
    it.each([
      "https://example.com",
      "http://example.com",
      "https://example.com/path?q=1",
      "http://localhost:4200",
      "https://sub.domain.example.co.uk/a/b",
      "http://192.168.1.1:8080",
    ])("accepts '%s'", (url) => {
      expect(isValidUrl(url)).toBe(true);
    });
  });

  describe("invalid partition (wrong protocol)", () => {
    it.each([
      "ftp://example.com",
      "file:///tmp/test",
      "ws://example.com",
      "data:text/html,<h1>hi</h1>",
    ])("rejects '%s'", (url) => {
      expect(isValidUrl(url)).toBe(false);
    });
  });

  describe("invalid partition (malformed)", () => {
    it.each([
      "",
      "not a url",
      "://missing-protocol",
      "http://",
      "just-text",
    ])("rejects '%s'", (url) => {
      expect(isValidUrl(url)).toBe(false);
    });
  });
});

// ============================================================
// clampScore — Boundary Condition Testing
// Boundaries: 0 (min), 1 (max), just below 0, just above 1
// Special: NaN, Infinity, -Infinity
// ============================================================

describe("clampScore — Boundary Conditions", () => {
  it("returns 0 for score exactly at lower boundary", () => {
    expect(clampScore(0)).toBe(0);
  });

  it("returns 1 for score exactly at upper boundary", () => {
    expect(clampScore(1)).toBe(1);
  });

  it("clamps negative values to 0", () => {
    expect(clampScore(-0.001)).toBe(0);
    expect(clampScore(-100)).toBe(0);
  });

  it("clamps values above 1 to 1", () => {
    expect(clampScore(1.001)).toBe(1);
    expect(clampScore(100)).toBe(1);
  });

  it("passes through values within range", () => {
    expect(clampScore(0.5)).toBe(0.5);
    expect(clampScore(0.95)).toBe(0.95);
    expect(clampScore(0.001)).toBe(0.001);
    expect(clampScore(0.999)).toBe(0.999);
  });

  it("returns 0 for NaN", () => {
    expect(clampScore(NaN)).toBe(0);
  });

  it("returns 0 for Infinity", () => {
    expect(clampScore(Infinity)).toBe(0);
  });

  it("returns 0 for -Infinity", () => {
    expect(clampScore(-Infinity)).toBe(0);
  });
});

// ============================================================
// isMetricWithinBudget — Decision Tree
// Decision variables: isFinite(value), isFinite(budget), value <= budget
//   T T T → true
//   T T F → false
//   T F * → false
//   F * * → false
// ============================================================

describe("isMetricWithinBudget — Decision Tree", () => {
  it("true when value <= budget (both finite)", () => {
    expect(isMetricWithinBudget(100, 200)).toBe(true);
  });

  it("true when value === budget (boundary)", () => {
    expect(isMetricWithinBudget(200, 200)).toBe(true);
  });

  it("false when value > budget (both finite)", () => {
    expect(isMetricWithinBudget(201, 200)).toBe(false);
  });

  it("false when budget is not finite", () => {
    expect(isMetricWithinBudget(100, NaN)).toBe(false);
    expect(isMetricWithinBudget(100, Infinity)).toBe(false);
  });

  it("false when value is not finite", () => {
    expect(isMetricWithinBudget(NaN, 200)).toBe(false);
    expect(isMetricWithinBudget(Infinity, 200)).toBe(false);
  });

  it("false when both are not finite", () => {
    expect(isMetricWithinBudget(NaN, NaN)).toBe(false);
  });

  it("works with zero values", () => {
    expect(isMetricWithinBudget(0, 0)).toBe(true);
    expect(isMetricWithinBudget(0, 100)).toBe(true);
  });

  it("works with negative values", () => {
    expect(isMetricWithinBudget(-10, 0)).toBe(true);
    expect(isMetricWithinBudget(-10, -20)).toBe(false);
  });
});

// ============================================================
// validateRunConfig — Decision Tree + Structural Coverage
// Covers every branch in the validation function:
//   url: present+valid / present+invalid / missing
//   n_runs: absent / valid / out-of-range / non-integer / non-number
//   device: absent / valid / invalid
//   viewport: absent / valid / invalid-type / out-of-range
// ============================================================

describe("validateRunConfig — Decision Tree + Structural", () => {
  it("accepts minimal valid config (primary path)", () => {
    const r = validateRunConfig({ url: "https://example.com" });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("accepts full valid config", () => {
    const r = validateRunConfig({
      url: "https://example.com",
      n_runs: 5,
      device: "mobile",
      viewport: { width: 375, height: 812 },
    });
    expect(r.valid).toBe(true);
  });

  it("rejects missing url", () => {
    const r = validateRunConfig({});
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("config.url must be a valid HTTP/HTTPS URL");
  });

  it("rejects invalid url", () => {
    const r = validateRunConfig({ url: "not-a-url" });
    expect(r.valid).toBe(false);
  });

  // n_runs decision branches
  it("accepts absent n_runs", () => {
    const r = validateRunConfig({ url: "https://a.com" });
    expect(r.valid).toBe(true);
  });

  it("rejects n_runs = 0 (boundary: below min)", () => {
    const r = validateRunConfig({ url: "https://a.com", n_runs: 0 });
    expect(r.valid).toBe(false);
  });

  it("accepts n_runs = 1 (boundary: at min)", () => {
    const r = validateRunConfig({ url: "https://a.com", n_runs: 1 });
    expect(r.valid).toBe(true);
  });

  it("accepts n_runs = 100 (boundary: at max)", () => {
    const r = validateRunConfig({ url: "https://a.com", n_runs: 100 });
    expect(r.valid).toBe(true);
  });

  it("rejects n_runs = 101 (boundary: above max)", () => {
    const r = validateRunConfig({ url: "https://a.com", n_runs: 101 });
    expect(r.valid).toBe(false);
  });

  it("rejects non-integer n_runs", () => {
    const r = validateRunConfig({ url: "https://a.com", n_runs: 2.5 });
    expect(r.valid).toBe(false);
  });

  it("rejects negative n_runs", () => {
    const r = validateRunConfig({ url: "https://a.com", n_runs: -1 });
    expect(r.valid).toBe(false);
  });

  // device decision branches
  it("accepts valid device 'desktop'", () => {
    const r = validateRunConfig({ url: "https://a.com", device: "desktop" });
    expect(r.valid).toBe(true);
  });

  it("accepts valid device 'mobile'", () => {
    const r = validateRunConfig({ url: "https://a.com", device: "mobile" });
    expect(r.valid).toBe(true);
  });

  it("rejects invalid device", () => {
    const r = validateRunConfig({ url: "https://a.com", device: "tablet" });
    expect(r.valid).toBe(false);
  });

  // viewport decision branches
  it("rejects viewport with width = 0 (boundary)", () => {
    const r = validateRunConfig({
      url: "https://a.com",
      viewport: { width: 0, height: 100 },
    });
    expect(r.valid).toBe(false);
  });

  it("accepts viewport width = 1 (boundary: at min)", () => {
    const r = validateRunConfig({
      url: "https://a.com",
      viewport: { width: 1, height: 1 },
    });
    expect(r.valid).toBe(true);
  });

  it("accepts viewport width = 7680 (boundary: at max)", () => {
    const r = validateRunConfig({
      url: "https://a.com",
      viewport: { width: 7680, height: 4320 },
    });
    expect(r.valid).toBe(true);
  });

  it("rejects viewport width = 7681 (boundary: above max)", () => {
    const r = validateRunConfig({
      url: "https://a.com",
      viewport: { width: 7681, height: 100 },
    });
    expect(r.valid).toBe(false);
  });

  it("rejects viewport height = 4321 (boundary: above max)", () => {
    const r = validateRunConfig({
      url: "https://a.com",
      viewport: { width: 100, height: 4321 },
    });
    expect(r.valid).toBe(false);
  });

  it("collects multiple errors simultaneously", () => {
    const r = validateRunConfig({
      url: "bad",
      n_runs: 0,
      device: "tablet",
      viewport: { width: 0, height: 0 },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================
// validateEngineRunRequest — MC/DC (Modified Condition/Decision)
// Compound condition: url valid AND n_runs valid AND device valid
// MC/DC requires toggling each condition independently
// ============================================================

describe("validateEngineRunRequest — MC/DC", () => {
  const baseValid = { url: "https://a.com", n_runs: 3, device: "desktop" };

  it("all conditions true → valid", () => {
    expect(validateEngineRunRequest(baseValid).valid).toBe(true);
  });

  it("url false, rest true → invalid (toggling url)", () => {
    const r = validateEngineRunRequest({ ...baseValid, url: "bad" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("url"))).toBe(true);
  });

  it("n_runs false, rest true → invalid (toggling n_runs)", () => {
    const r = validateEngineRunRequest({ ...baseValid, n_runs: 0 });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("n_runs"))).toBe(true);
  });

  it("device false, rest true → invalid (toggling device)", () => {
    const r = validateEngineRunRequest({ ...baseValid, device: "tablet" });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("device"))).toBe(true);
  });

  it("validates viewport when present", () => {
    const r = validateEngineRunRequest({
      ...baseValid,
      viewport: { width: -1, height: 100 },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes("viewport.width"))).toBe(true);
  });

  it("accepts request without viewport", () => {
    expect(validateEngineRunRequest(baseValid).valid).toBe(true);
  });

  it("rejects non-integer n_runs (boundary: 2.5)", () => {
    const r = validateEngineRunRequest({ ...baseValid, n_runs: 2.5 });
    expect(r.valid).toBe(false);
  });

  it("rejects n_runs = 101 (boundary: just above max)", () => {
    const r = validateEngineRunRequest({ ...baseValid, n_runs: 101 });
    expect(r.valid).toBe(false);
  });
});
