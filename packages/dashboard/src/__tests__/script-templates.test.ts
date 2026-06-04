/**
 * Unit tests for script templates data integrity.
 * Validates that all templates have valid structure for the scripts system.
 */

const SCRIPT_TEMPLATES = [
  {
    name: "Homepage Lighthouse Audit",
    description: "Run a Lighthouse performance audit on a homepage URL.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}" },
        { action: "audit", categories: ["performance", "accessibility", "best-practices", "seo"] },
      ],
      config: { device: "desktop", throttling: "simulated3G", runs: 3 },
    },
  },
  {
    name: "SPA Navigation Flow",
    description: "Measure Core Web Vitals across multiple SPA page transitions.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}" },
        { action: "wait", selector: "[data-ready]", timeout_ms: 5000 },
        { action: "click", selector: "a[href='/dashboard']" },
        { action: "wait", selector: "[data-page='dashboard']", timeout_ms: 5000 },
        { action: "measure", metrics: ["lcp", "fcp", "cls", "inp", "ttfb"] },
        { action: "click", selector: "a[href='/settings']" },
        { action: "wait", selector: "[data-page='settings']", timeout_ms: 5000 },
        { action: "measure", metrics: ["lcp", "fcp", "cls", "inp"] },
      ],
      config: { device: "desktop", runs: 1 },
    },
  },
  {
    name: "E-Commerce Checkout",
    description: "Simulate a user browsing products and completing checkout.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}/products" },
        { action: "wait", selector: ".product-grid", timeout_ms: 5000 },
        { action: "measure", metrics: ["lcp", "fcp", "cls", "ttfb"] },
        { action: "click", selector: ".product-card:first-child" },
        { action: "wait", selector: ".product-detail", timeout_ms: 3000 },
        { action: "click", selector: "button.add-to-cart" },
        { action: "navigate", url: "{{TARGET_URL}}/cart" },
        { action: "measure", metrics: ["lcp", "cls", "inp"] },
        { action: "click", selector: "button.checkout" },
        { action: "wait", selector: ".checkout-form", timeout_ms: 5000 },
        { action: "measure", metrics: ["lcp", "fcp", "tbt", "tti"] },
      ],
      config: { device: "mobile", throttling: "simulated4G", runs: 3 },
    },
  },
  {
    name: "Login Flow",
    description: "Test performance of the login page and post-login redirect.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}/login" },
        { action: "measure", metrics: ["lcp", "fcp", "ttfb", "cls"] },
        { action: "type", selector: "input[name='email']", text: "test@example.com" },
        { action: "type", selector: "input[name='password']", text: "{{TEST_PASSWORD}}" },
        { action: "click", selector: "button[type='submit']" },
        { action: "wait", selector: "[data-page='dashboard']", timeout_ms: 10000 },
        { action: "measure", metrics: ["lcp", "fcp", "tti", "tbt"] },
      ],
      config: { device: "desktop", runs: 3 },
    },
  },
  {
    name: "API Health & TTFB Check",
    description: "Measure TTFB and server response time for key API endpoints.",
    canonical_json: {
      steps: [
        { action: "request", method: "GET", url: "{{TARGET_URL}}/api/health", expect_status: 200 },
        { action: "request", method: "GET", url: "{{TARGET_URL}}/api/v1/projects", expect_status: 200 },
        { action: "request", method: "GET", url: "{{TARGET_URL}}/api/v1/runs?limit=1", expect_status: 200 },
      ],
      config: { measure: ["ttfb", "server_processing_time"], runs: 5, parallel: false },
    },
  },
  {
    name: "Lazy-Load & Image Performance",
    description: "Scroll through a page to trigger lazy-loaded images and measure CLS/LCP.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}" },
        { action: "measure", metrics: ["fcp", "lcp", "cls"] },
        { action: "scroll", direction: "down", distance_px: 2000, speed: "slow" },
        { action: "wait", duration_ms: 2000 },
        { action: "measure", metrics: ["cls", "lcp"] },
        { action: "scroll", direction: "down", distance_px: 4000, speed: "slow" },
        { action: "wait", duration_ms: 2000 },
        { action: "measure", metrics: ["cls"] },
      ],
      config: { device: "mobile", throttling: "simulated4G", runs: 3 },
    },
  },
];

describe("Script Templates", () => {
  it("has at least 5 templates", () => {
    expect(SCRIPT_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it("every template has a name, description, and canonical_json", () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      expect(tpl.name).toBeTruthy();
      expect(tpl.name.length).toBeGreaterThan(3);
      expect(tpl.description).toBeTruthy();
      expect(tpl.description.length).toBeGreaterThan(10);
      expect(tpl.canonical_json).toBeDefined();
    }
  });

  it("every template has non-empty steps array", () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      const steps = (tpl.canonical_json as any).steps;
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
    }
  });

  it("every step has an action field", () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      const steps = (tpl.canonical_json as any).steps;
      for (const step of steps) {
        expect(step.action).toBeTruthy();
        expect(typeof step.action).toBe("string");
      }
    }
  });

  it("every template has a config object", () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      const config = (tpl.canonical_json as any).config;
      expect(config).toBeDefined();
      expect(typeof config).toBe("object");
    }
  });

  it("template names are unique", () => {
    const names = SCRIPT_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("canonical_json is serializable to JSON string and back", () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      const json = JSON.stringify(tpl.canonical_json, null, 2);
      const parsed = JSON.parse(json);
      expect(parsed).toEqual(tpl.canonical_json);
    }
  });

  it("templates with navigate steps have a url field", () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      const steps = (tpl.canonical_json as any).steps;
      for (const step of steps) {
        if (step.action === "navigate") {
          expect(step.url).toBeTruthy();
          expect(typeof step.url).toBe("string");
        }
      }
    }
  });

  it("templates use {{TARGET_URL}} placeholder in URLs", () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      const steps = (tpl.canonical_json as any).steps;
      const urlSteps = steps.filter((s: any) => s.url);
      expect(urlSteps.length).toBeGreaterThan(0);
      for (const step of urlSteps) {
        expect(step.url).toContain("{{TARGET_URL}}");
      }
    }
  });
});
