import { describe, it, expect } from "vitest";
import {
  parseYaml,
  validateDefinition,
  compileSteps,
  parseJourney,
} from "../journey/parser";
import type { JourneyDefinition } from "../journey/types";

// ============================================================
// Journey Parser — Unit Tests (E-01)
// Covers: YAML parsing, validation, step compilation, end-to-end
// ============================================================

describe("parseYaml", () => {
  it("parses top-level scalar fields", () => {
    const result = parseYaml(`
name: checkout-test
target: https://example.com
device: mobile
screenshots: true
    `);
    expect(result.name).toBe("checkout-test");
    expect(result.target).toBe("https://example.com");
    expect(result.device).toBe("mobile");
    expect(result.screenshots).toBe(true);
  });

  it("parses numeric and boolean values", () => {
    const result = parseYaml(`
count: 42
enabled: false
ratio: 0.75
    `);
    expect(result.count).toBe(42);
    expect(result.enabled).toBe(false);
    expect(result.ratio).toBe(0.75);
  });

  it("parses stages array with action targets", () => {
    const result = parseYaml(`
name: test
stages:
  - visit /products
  - click "Add to Cart"
  - wait_for /cart
  - measure
    `);
    const stages = result.stages as Record<string, unknown>[];
    expect(stages).toHaveLength(4);
    expect(stages[0]).toEqual({ visit: "/products" });
    expect(stages[1]).toEqual({ click: "Add to Cart" });
    expect(stages[2]).toEqual({ wait_for: "/cart" });
    expect(stages[3]).toEqual({ measure: true });
  });

  it("skips comments and empty lines", () => {
    const result = parseYaml(`
# This is a comment
name: test

# Another comment
target: https://example.com
    `);
    expect(result.name).toBe("test");
    expect(result.target).toBe("https://example.com");
  });

  it("handles quoted string values", () => {
    const result = parseYaml(`
name: "my test"
target: 'https://example.com'
    `);
    expect(result.name).toBe("my test");
    expect(result.target).toBe("https://example.com");
  });
});

describe("validateDefinition", () => {
  it("validates a correct definition", () => {
    const result = validateDefinition({
      name: "test",
      target: "https://example.com",
      stages: [{ visit: "/products" }, { measure: true }],
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.definition.name).toBe("test");
      expect(result.definition.device).toBe("desktop"); // default
      expect(result.definition.screenshots).toBe(true); // default
    }
  });

  it("rejects missing name", () => {
    const result = validateDefinition({
      target: "https://example.com",
      stages: [{ visit: "/products" }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0].message).toContain("name");
    }
  });

  it("rejects missing target", () => {
    const result = validateDefinition({
      name: "test",
      stages: [{ visit: "/products" }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0].message).toContain("target");
    }
  });

  it("rejects missing stages", () => {
    const result = validateDefinition({
      name: "test",
      target: "https://example.com",
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0].message).toContain("stages");
    }
  });

  it("rejects unknown action", () => {
    const result = validateDefinition({
      name: "test",
      target: "https://example.com",
      stages: [{ destroy: "/everything" }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors[0].message).toContain("unknown action");
    }
  });

  it("validates all known action types", () => {
    const result = validateDefinition({
      name: "full",
      target: "https://example.com",
      stages: [
        { visit: "/" },
        { click: "#btn" },
        { fill: ["#input", "text"] },
        { scroll: "bottom" },
        { wait_for: "/page" },
        { hover: ".menu" },
        { select: ["#dropdown", "opt1"] },
        { press: "Enter" },
        { measure: true },
      ],
    });
    expect(result.valid).toBe(true);
  });
});

describe("compileSteps", () => {
  const baseDef: JourneyDefinition = {
    name: "test",
    target: "https://shop.example.com",
    stages: [],
  };

  it("compiles visit with URL resolution", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [{ visit: "/products" }],
    });
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe("visit");
    expect(steps[0].target).toBe("https://shop.example.com/products");
    expect(steps[0].label).toBe("visit /products");
    expect(steps[0].index).toBe(0);
  });

  it("compiles visit with absolute URL", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [{ visit: "https://other.com/page" }],
    });
    expect(steps[0].target).toBe("https://other.com/page");
  });

  it("compiles click with text target", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [{ click: "Add to Cart" }],
    });
    expect(steps[0].action).toBe("click");
    expect(steps[0].target).toBe("Add to Cart");
    expect(steps[0].label).toBe('click "Add to Cart"');
  });

  it("compiles fill with selector and value", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [{ fill: ["#email", "user@test.com"] as [string, string] }],
    });
    expect(steps[0].action).toBe("fill");
    expect(steps[0].target).toBe("#email");
    expect(steps[0].value).toBe("user@test.com");
  });

  it("compiles wait_for with path", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [{ wait_for: "/checkout-confirm" }],
    });
    expect(steps[0].action).toBe("wait_for");
    expect(steps[0].target).toBe("/checkout-confirm");
    expect(steps[0].label).toBe("wait for /checkout-confirm");
  });

  it("compiles wait_for with selector", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [{ wait_for: "#success-message" }],
    });
    expect(steps[0].label).toBe('wait for "#success-message"');
  });

  it("compiles measure with default label", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [{ measure: true }],
    });
    expect(steps[0].action).toBe("measure");
    expect(steps[0].label).toBe("measure");
  });

  it("compiles measure with custom label", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [{ measure: "checkout-complete" } as any],
    });
    expect(steps[0].label).toBe("measure: checkout-complete");
  });

  it("assigns sequential indexes", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [
        { visit: "/" },
        { click: "Products" },
        { measure: true },
      ],
    });
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it("compiles all action types", () => {
    const steps = compileSteps({
      ...baseDef,
      stages: [
        { visit: "/home" },
        { click: "Login" },
        { fill: ["#user", "admin"] as [string, string] },
        { scroll: "bottom" },
        { wait_for: "/dashboard" },
        { hover: ".avatar" },
        { select: ["#role", "admin"] as [string, string] },
        { press: "Enter" },
        { measure: true },
      ],
    });
    expect(steps).toHaveLength(9);
    const actions = steps.map((s) => s.action);
    expect(actions).toEqual([
      "visit", "click", "fill", "scroll", "wait_for",
      "hover", "select", "press", "measure",
    ]);
  });
});

describe("parseJourney (end-to-end)", () => {
  it("parses a complete checkout YAML", () => {
    const yaml = `
name: checkout-happy-path
target: https://staging.example.com
stages:
  - visit /products
  - click "Add to Cart"
  - visit /cart
  - click "Checkout"
  - wait_for /checkout-confirm
  - measure
    `;
    const result = parseJourney(yaml);
    expect("errors" in result).toBe(false);
    if (!("errors" in result)) {
      expect(result.definition.name).toBe("checkout-happy-path");
      expect(result.definition.target).toBe("https://staging.example.com");
      expect(result.steps).toHaveLength(6);
      expect(result.steps[0].action).toBe("visit");
      expect(result.steps[0].target).toBe("https://staging.example.com/products");
      expect(result.steps[5].action).toBe("measure");
    }
  });

  it("returns errors for invalid YAML", () => {
    const result = parseJourney(`
stages:
  - visit /products
    `);
    expect("errors" in result).toBe(true);
    if ("errors" in result) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("parses the exact example from the docs", () => {
    const yaml = `
name: checkout-happy-path
target: https://staging.example.com
stages:
  - visit /products
  - click "first product card"
  - click "Add to Cart"
  - visit /cart
  - click "Checkout"
  - wait_for /checkout-confirm
  - measure
    `;
    const result = parseJourney(yaml);
    expect("errors" in result).toBe(false);
    if (!("errors" in result)) {
      expect(result.steps).toHaveLength(7);
      expect(result.steps[6].action).toBe("measure");
      // All steps before measure are journey instrumentation
      const beforeMeasure = result.steps.slice(0, 6);
      expect(beforeMeasure.every((s) => s.action !== "measure")).toBe(true);
    }
  });
});
