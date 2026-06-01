/**
 * Tests for poll-loop journey execution helpers:
 * convertToCompiledSteps, hasJourneyMeasureSteps
 */
import { describe, it, expect } from "vitest";

// Replicate the functions from poll-loop.ts for unit testing
// (they're module-private, so we duplicate the pure logic here)

type StepAction = "visit" | "click" | "fill" | "scroll" | "wait_for" | "hover" | "select" | "press" | "measure";

interface CompiledStep {
  index: number;
  action: StepAction;
  target: string;
  value?: string;
  label: string;
}

function convertToCompiledSteps(
  nlSteps: { intent: string; locators?: any }[],
  targetUrl: string,
): CompiledStep[] {
  const compiled: CompiledStep[] = [];

  for (let i = 0; i < nlSteps.length; i++) {
    const s = nlSteps[i];
    const intent = s.intent ?? "";
    const lower = intent.toLowerCase();

    if (/^measure/i.test(lower)) {
      compiled.push({ index: i, action: "measure", target: "measure", label: intent });
    } else if (/\b(navigate back|go back|return to)\b/i.test(lower)) {
      const url = intent.match(/https?:\/\/[^\s'"]+/)?.[0] ?? targetUrl;
      compiled.push({ index: i, action: "visit", target: url, label: intent });
    } else if (/\b(go to|navigate|visit|open|load)\b/i.test(lower)) {
      const url = intent.match(/https?:\/\/[^\s'"]+/)?.[0] ?? targetUrl;
      compiled.push({ index: i, action: "visit", target: url, label: intent });
    } else if (/\b(click|tap|press|submit|select)\b/i.test(lower)) {
      const quoted = intent.match(/["'](.+?)["']/)?.[1];
      const locator = s.locators?.primary?.selector;
      const target = locator ?? quoted ?? intent.replace(/^click\s+(on\s+)?/i, "").trim();
      compiled.push({ index: i, action: "click", target, label: intent });
    } else if (/\b(type|fill|enter|input|write)\b/i.test(lower)) {
      const m = intent.match(/["'](.+?)["'].*?(?:into|in)\s+(.+)/i);
      compiled.push({
        index: i,
        action: "fill",
        target: m?.[2]?.trim() ?? "input",
        value: m?.[1] ?? "test",
        label: intent,
      });
    } else if (/\b(wait|pause|settle)\b/i.test(lower)) {
      compiled.push({ index: i, action: "wait_for", target: "body", label: intent });
    } else if (/\b(scroll|swipe)\b/i.test(lower)) {
      compiled.push({ index: i, action: "scroll", target: "bottom", label: intent });
    } else {
      const quoted = intent.match(/["'](.+?)["']/)?.[1];
      compiled.push({ index: i, action: "click", target: quoted ?? intent, label: intent });
    }
  }
  return compiled;
}

function hasJourneyMeasureSteps(steps: any[]): boolean {
  return steps.some((s: any) => /^measure/i.test((s.intent ?? "").trim()));
}

// === Tests ===

describe("convertToCompiledSteps", () => {
  const TARGET = "https://example.com";

  // --- Equivalence Partitioning ---

  it("converts measure intent to measure action", () => {
    const steps = [{ intent: 'measure: "Home Page"' }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result).toHaveLength(1);
    expect(result[0].action).toBe("measure");
    expect(result[0].target).toBe("measure");
  });

  it("converts click intent to click action with quoted target", () => {
    const steps = [{ intent: 'click on "Book Title"' }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result[0].action).toBe("click");
    expect(result[0].target).toBe("Book Title");
  });

  it("converts click intent with locator strategy", () => {
    const steps = [{
      intent: 'click on "Login"',
      locators: { primary: { strategy: "role", selector: "getByRole('button', {name: 'Login'})" } },
    }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result[0].action).toBe("click");
    expect(result[0].target).toBe("getByRole('button', {name: 'Login'})");
  });

  it("converts navigate/visit intent to visit action", () => {
    const steps = [{ intent: "navigate to https://shop.com/products" }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result[0].action).toBe("visit");
    expect(result[0].target).toBe("https://shop.com/products");
  });

  it("converts go-back intent to visit with target URL fallback", () => {
    const steps = [{ intent: "navigate back to the page" }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result[0].action).toBe("visit");
    expect(result[0].target).toBe(TARGET);
  });

  it("converts go-back intent with explicit URL", () => {
    const steps = [{ intent: "navigate back to https://example.com/home" }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result[0].action).toBe("visit");
    expect(result[0].target).toBe("https://example.com/home");
  });

  it("converts fill/type intent", () => {
    const steps = [{ intent: "type 'hello' into #search" }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result[0].action).toBe("fill");
    expect(result[0].target).toBe("#search");
    expect(result[0].value).toBe("hello");
  });

  it("converts wait intent", () => {
    const steps = [{ intent: "wait for the page to settle" }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result[0].action).toBe("wait_for");
  });

  it("converts scroll intent", () => {
    const steps = [{ intent: "scroll down" }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result[0].action).toBe("scroll");
    expect(result[0].target).toBe("bottom");
  });

  it("defaults unknown intent to click", () => {
    const steps = [{ intent: "do something special" }];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result[0].action).toBe("click");
  });

  // --- Multi-step journey (typical NL-authored script) ---

  it("converts full multi-link journey", () => {
    const steps = [
      { intent: 'click on "Book A"' },
      { intent: 'measure: "Book A"' },
      { intent: "navigate back to https://example.com" },
      { intent: 'click on "Book B"' },
      { intent: 'measure: "Book B"' },
      { intent: "navigate back to https://example.com" },
    ];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result).toHaveLength(6);
    expect(result.map(s => s.action)).toEqual(["click", "measure", "visit", "click", "measure", "visit"]);
    expect(result[0].target).toBe("Book A");
    expect(result[2].target).toBe("https://example.com");
    expect(result[3].target).toBe("Book B");
  });

  // --- Boundary cases ---

  it("handles empty steps array", () => {
    expect(convertToCompiledSteps([], TARGET)).toEqual([]);
  });

  it("handles single step", () => {
    const result = convertToCompiledSteps([{ intent: 'measure: "Page"' }], TARGET);
    expect(result).toHaveLength(1);
  });

  it("assigns sequential indices", () => {
    const steps = [
      { intent: 'click "A"' },
      { intent: 'measure: "A"' },
      { intent: "go back" },
    ];
    const result = convertToCompiledSteps(steps, TARGET);
    expect(result.map(s => s.index)).toEqual([0, 1, 2]);
  });

  it("preserves original intent as label", () => {
    const intent = 'click on "My Special Link"';
    const result = convertToCompiledSteps([{ intent }], TARGET);
    expect(result[0].label).toBe(intent);
  });
});

describe("hasJourneyMeasureSteps", () => {
  it("returns true when steps contain measure intents", () => {
    const steps = [
      { intent: 'click "A"' },
      { intent: 'measure: "A"' },
    ];
    expect(hasJourneyMeasureSteps(steps)).toBe(true);
  });

  it("returns false when no measure intents", () => {
    const steps = [
      { intent: "click login" },
      { intent: "fill username" },
    ];
    expect(hasJourneyMeasureSteps(steps)).toBe(false);
  });

  it("returns false for empty steps", () => {
    expect(hasJourneyMeasureSteps([])).toBe(false);
  });

  it("detects case-insensitive Measure", () => {
    expect(hasJourneyMeasureSteps([{ intent: "Measure performance" }])).toBe(true);
  });

  it("does not match measure in the middle of intent", () => {
    // "click measure button" — "measure" doesn't start the intent
    expect(hasJourneyMeasureSteps([{ intent: "click measure button" }])).toBe(false);
  });

  it("handles missing intent field", () => {
    expect(hasJourneyMeasureSteps([{}])).toBe(false);
  });
});
