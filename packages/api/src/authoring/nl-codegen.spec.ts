import { Test } from "@nestjs/testing";
import { NlAuthoringService } from "./nl-authoring.service";
import { DatabaseService } from "../database/database.service";

/**
 * NL Authoring — Playwright Code Generation Tests (E-07)
 *
 * §7.3: "The output should be a real executable Playwright test, not just JSON."
 */

describe("NlAuthoringService — generatePlaywrightCode (E-07)", () => {
  let service: NlAuthoringService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        NlAuthoringService,
        { provide: DatabaseService, useValue: { query: jest.fn() } },
      ],
    }).compile();
    service = module.get(NlAuthoringService);
  });

  it("generates valid Playwright test structure", () => {
    const script = {
      source_prompt: "Click login button",
      target_url: "https://example.com",
      device: "desktop",
      steps: [
        { intent: "click Login", locators: { primary: { selector: "getByRole('button', {name: 'Login'})" } } },
      ],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);

    expect(code).toContain("import { test, expect } from '@playwright/test'");
    expect(code).toContain("test('Click login button'");
    expect(code).toContain("async ({ page })");
    expect(code).toContain("await page.goto('https://example.com')");
    expect(code).toContain(".click()");
  });

  it("generates mobile device configuration", () => {
    const script = {
      target_url: "https://example.com",
      device: "mobile",
      steps: [],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);

    expect(code).toContain("import { devices }");
    expect(code).toContain("test.use({ ...devices['Pixel 5'] })");
  });

  it("handles navigation intents", () => {
    const script = {
      target_url: "https://example.com",
      steps: [
        { intent: "go to https://example.com/products", locators: {} },
      ],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);
    expect(code).toContain("await page.goto('https://example.com/products')");
    expect(code).toContain("waitForLoadState('networkidle')");
  });

  it("handles click intents with CSS selectors", () => {
    const script = {
      target_url: "https://example.com",
      steps: [
        { intent: "click the submit button", locators: { primary: { selector: "#submit-btn" } } },
      ],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);
    expect(code).toContain("page.locator('#submit-btn').click()");
  });

  it("handles type/fill intents", () => {
    const script = {
      target_url: "https://example.com",
      steps: [
        { intent: "type 'hello' into #search", locators: {} },
      ],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);
    expect(code).toContain(".fill(");
    expect(code).toContain("hello");
  });

  it("handles scroll intents", () => {
    const script = {
      target_url: "https://example.com",
      steps: [
        { intent: "scroll to bottom", locators: {} },
      ],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);
    expect(code).toContain("window.scrollTo(0, document.body.scrollHeight)");
  });

  it("handles wait intents", () => {
    const script = {
      target_url: "https://example.com",
      steps: [
        { intent: "wait for page to settle", locators: {} },
      ],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);
    expect(code).toContain("waitForLoadState('networkidle')");
  });

  it("includes performance assertions when present", () => {
    const script = {
      target_url: "https://example.com",
      steps: [],
      metrics: {
        assertions: [{ metric: "lcp", p95_max_ms: 2500 }],
      },
    };

    const code = service.generatePlaywrightCode(script);
    expect(code).toContain("Performance assertions");
    expect(code).toContain("timing.loadEvent");
    expect(code).toContain("toBeLessThan(2500)");
  });

  it("escapes single quotes in strings", () => {
    const script = {
      source_prompt: "Click 'Add to Cart'",
      target_url: "https://example.com",
      steps: [
        { intent: "click Add to Cart", locators: {} },
      ],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);
    expect(code).toContain("Click \\'Add to Cart\\'");
  });

  it("handles multi-step flow", () => {
    const script = {
      target_url: "https://shop.example.com",
      steps: [
        { intent: "click Products", locators: { primary: { selector: "getByText('Products')" } } },
        { intent: "click Add to Cart", locators: {} },
        { intent: "go to https://shop.example.com/cart", locators: {} },
        { intent: "wait for checkout", locators: {} },
      ],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);
    const lines = code.split("\n");
    // Verify all steps appear in order
    const productIdx = lines.findIndex((l) => l.includes("Products"));
    const cartIdx = lines.findIndex((l) => l.includes("Add to Cart"));
    const gotoIdx = lines.findIndex((l) => l.includes("/cart"));
    expect(productIdx).toBeLessThan(cartIdx);
    expect(cartIdx).toBeLessThan(gotoIdx);
  });

  it("handles empty steps gracefully", () => {
    const script = {
      target_url: "https://example.com",
      steps: [],
      metrics: { assertions: [] },
    };

    const code = service.generatePlaywrightCode(script);
    expect(code).toContain("test(");
    expect(code).toContain("});");
  });
});
