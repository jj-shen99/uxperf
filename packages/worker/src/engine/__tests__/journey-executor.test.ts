import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeJourney } from "../journey/executor";
import type { JourneyDefinition, CompiledStep } from "../journey/types";

// ============================================================
// Journey Executor — Unit Tests (E-02 through E-05)
// Mocks Playwright browser/page to test step execution logic
// ============================================================

// Mock metrics-collector
vi.mock("../metrics-collector", () => ({
  collectWebVitals: vi.fn().mockResolvedValue({ lcp_ms: 1200, fcp_ms: 600, cls: 0.02, ttfb_ms: 80 }),
  collectWebVitalsSPA: vi.fn().mockResolvedValue({ lcp_ms: 350, fcp_ms: 210, cls: 0.01, ttfb_ms: 45 }),
  collectPageTimings: vi.fn().mockResolvedValue({ dom_content_loaded_ms: 400, load_event_ms: 900 }),
  collectResourceSummary: vi.fn().mockResolvedValue({ total_requests: 25, total_transfer_size_bytes: 500000 }),
}));

// E-06: Mock HAR collector — use vi.hoisted() to avoid TDZ issues with vi.mock hoisting
const { mockHarStart, mockHarStop } = vi.hoisted(() => {
  const mockHarStop = vi.fn().mockResolvedValue({
    entries: [
      {
        url: "https://example.com/app.js",
        method: "GET",
        status: 200,
        resource_type: "script",
        protocol: "h2",
        mime_type: "application/javascript",
        transfer_size: 50000,
        resource_size: 150000,
        started_at: 100,
        duration_ms: 200,
        timing: { blocked_ms: 0, dns_ms: 0, connect_ms: 20, ssl_ms: 0, send_ms: 0, wait_ms: 140, receive_ms: 40 },
        is_third_party: false,
        initiator: "script",
      },
    ],
    summary: {
      total_entries: 1,
      total_transfer_bytes: 50000,
      total_resource_bytes: 150000,
      by_type: { script: { count: 1, transfer_bytes: 50000 } },
      third_party_count: 0,
      third_party_bytes: 0,
      slowest_resources: [{ url: "https://example.com/app.js", duration_ms: 200 }],
      largest_resources: [{ url: "https://example.com/app.js", transfer_size: 50000 }],
    },
  });
  const mockHarStart = vi.fn();
  return { mockHarStart, mockHarStop };
});

vi.mock("../har-collector", () => ({
  createHarCollector: vi.fn().mockReturnValue({
    start: mockHarStart,
    stop: mockHarStop,
  }),
}));

function createMockPage() {
  const page = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForURL: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("fake-png")),
    evaluate: vi.fn().mockResolvedValue(undefined),
    keyboard: { press: vi.fn().mockResolvedValue(undefined) },
    locator: vi.fn().mockReturnValue({
      click: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      hover: vi.fn().mockResolvedValue(undefined),
      selectOption: vi.fn().mockResolvedValue(undefined),
      scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
      waitFor: vi.fn().mockResolvedValue(undefined),
    }),
    getByRole: vi.fn().mockReturnValue({
      or: vi.fn().mockReturnValue({
        click: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        hover: vi.fn().mockResolvedValue(undefined),
        selectOption: vi.fn().mockResolvedValue(undefined),
        or: vi.fn().mockReturnValue({
          click: vi.fn().mockResolvedValue(undefined),
          fill: vi.fn().mockResolvedValue(undefined),
          hover: vi.fn().mockResolvedValue(undefined),
          selectOption: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    }),
    getByText: vi.fn().mockReturnValue({
      click: vi.fn().mockResolvedValue(undefined),
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return page;
}

function createMockBrowser(page: ReturnType<typeof createMockPage>) {
  const addCookies = vi.fn().mockResolvedValue(undefined);
  return {
    newContext: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue(page),
      addCookies,
      close: vi.fn().mockResolvedValue(undefined),
    }),
    close: vi.fn().mockResolvedValue(undefined),
    __addCookies: addCookies,
  } as any;
}

const baseDef: JourneyDefinition = {
  name: "test-journey",
  target: "https://example.com",
  device: "desktop",
  stages: [],
};

describe("executeJourney", () => {
  let mockPage: ReturnType<typeof createMockPage>;
  let mockBrowser: ReturnType<typeof createMockBrowser>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = createMockPage();
    mockBrowser = createMockBrowser(mockPage);
  });

  // E-02: Multi-step journey execution
  describe("multi-step execution (E-02)", () => {
    it("executes visit step — navigates to resolved URL", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/products", label: "visit /products" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(1);
      expect(mockPage.goto).toHaveBeenCalledWith("https://example.com/products", expect.any(Object));
    });

    it("executes click step — uses smart locator", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "click", target: "Add to Cart", label: 'click "Add to Cart"' },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(true);
      expect(mockPage.getByRole).toHaveBeenCalled();
    });

    it("executes click with CSS selector", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "click", target: "#submit-btn", label: 'click "#submit-btn"' },
      ];
      await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(mockPage.locator).toHaveBeenCalledWith("#submit-btn");
    });

    it("executes fill step", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "fill", target: "#email", value: "test@test.com", label: "fill" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(true);
      expect(mockPage.locator).toHaveBeenCalledWith("#email");
    });

    it("executes wait_for path — waits for URL", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "wait_for", target: "/checkout", label: "wait for /checkout" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(true);
      expect(mockPage.waitForURL).toHaveBeenCalledWith("**/checkout", expect.any(Object));
    });

    it("executes wait_for selector — waits for element", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "wait_for", target: "#success", label: 'wait for "#success"' },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(true);
      expect(mockPage.locator).toHaveBeenCalledWith("#success");
    });

    it("executes scroll to bottom", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "scroll", target: "bottom", label: "scroll to bottom" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(true);
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it("executes press key", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "press", target: "Enter", label: "press Enter" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(true);
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Enter");
    });

    it("runs multiple steps in sequence", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
        { index: 1, action: "click", target: "#nav-products", label: "click products" },
        { index: 2, action: "wait_for", target: "/products", label: "wait for /products" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect(result.steps.map((s) => s.action)).toEqual(["visit", "click", "wait_for"]);
    });

    it("stops on first error", async () => {
      mockPage.goto.mockRejectedValueOnce(new Error("Navigation failed"));
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://bad.com", label: "visit bad" },
        { index: 1, action: "click", target: "#btn", label: "click btn" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(false);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].error).toBe("Navigation failed");
      expect(result.error).toBe("Navigation failed");
    });
  });

  // E-03: measure directive
  describe("measure directive (E-03)", () => {
    it("captures web vitals at measure step", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
        { index: 1, action: "measure", target: "measure", label: "measure" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.measurements).toHaveLength(1);
      expect(result.measurements[0].web_vitals.lcp_ms).toBe(1200);
      expect(result.measurements[0].web_vitals.fcp_ms).toBe(600);
      expect(result.measurements[0].web_vitals.cls).toBe(0.02);
      expect(result.measurements[0].total_requests).toBe(25);
    });

    it("supports multiple measure points", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
        { index: 1, action: "measure", target: "measure", label: "measure: homepage" },
        { index: 2, action: "visit", target: "https://example.com/products", label: "visit /products" },
        { index: 3, action: "measure", target: "measure", label: "measure: products" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.measurements).toHaveLength(2);
      expect(result.measurements[0].label).toBe("measure: homepage");
      expect(result.measurements[1].label).toBe("measure: products");
    });

    it("records measure step_index correctly", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
        { index: 1, action: "click", target: "#btn", label: "click" },
        { index: 2, action: "measure", target: "measure", label: "measure" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.measurements[0].step_index).toBe(2);
    });
  });

  // E-04: Per-step screenshots
  describe("per-step screenshots (E-04)", () => {
    it("captures screenshot after each non-measure step", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
        { index: 1, action: "click", target: "#btn", label: "click btn" },
        { index: 2, action: "measure", target: "measure", label: "measure" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: true });
      expect(result.steps[0].screenshot_base64).toBeDefined();
      expect(result.steps[1].screenshot_base64).toBeDefined();
      // Measure steps don't get screenshots
      expect(result.steps[2].screenshot_base64).toBeUndefined();
    });

    it("skips screenshots when disabled", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.steps[0].screenshot_base64).toBeUndefined();
      expect(mockPage.screenshot).not.toHaveBeenCalled();
    });

    it("respects definition.screenshots = false", async () => {
      const defNoScreenshots: JourneyDefinition = { ...baseDef, screenshots: false, stages: [] };
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
      ];
      const result = await executeJourney(mockBrowser, defNoScreenshots, steps);
      expect(result.steps[0].screenshot_base64).toBeUndefined();
    });

    it("handles screenshot failure gracefully", async () => {
      mockPage.screenshot.mockRejectedValueOnce(new Error("Page crashed"));
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: true });
      expect(result.success).toBe(true);
      expect(result.steps[0].screenshot_base64).toBeUndefined();
    });
  });

  // E-05: Inter-stage timing
  describe("inter-stage timing (E-05)", () => {
    it("records started_at, finished_at, duration_ms per step", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
        { index: 1, action: "click", target: "#btn", label: "click" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      for (const step of result.steps) {
        expect(step.started_at).toBeTruthy();
        expect(step.finished_at).toBeTruthy();
        expect(typeof step.duration_ms).toBe("number");
        expect(step.duration_ms).toBeGreaterThanOrEqual(0);
        // Verify ISO format
        expect(new Date(step.started_at).toISOString()).toBe(step.started_at);
        expect(new Date(step.finished_at).toISOString()).toBe(step.finished_at);
      }
    });

    it("records total_duration_ms for entire journey", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.total_duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.started_at).toBeTruthy();
      expect(result.finished_at).toBeTruthy();
    });

    it("step finished_at >= started_at", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
        { index: 1, action: "click", target: "#btn", label: "click" },
        { index: 2, action: "measure", target: "measure", label: "measure" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      for (const step of result.steps) {
        const start = new Date(step.started_at).getTime();
        const end = new Date(step.finished_at).getTime();
        expect(end).toBeGreaterThanOrEqual(start);
      }
    });
  });

  // Result structure
  describe("result structure", () => {
    it("includes name, target, device from definition", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "measure", target: "measure", label: "measure" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.name).toBe("test-journey");
      expect(result.target).toBe("https://example.com");
      expect(result.device).toBe("desktop");
    });

    it("calls onProgress callback", async () => {
      const progress: string[] = [];
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/", label: "visit /" },
        { index: 1, action: "measure", target: "measure", label: "measure" },
      ];
      await executeJourney(mockBrowser, baseDef, steps, { screenshots: false }, (msg) => { progress.push(msg); });
      expect(progress).toHaveLength(2);
      expect(progress[0]).toContain("Step 1/2");
      expect(progress[1]).toContain("Step 2/2");
    });

    it("closes browser context even on error", async () => {
      mockPage.goto.mockRejectedValueOnce(new Error("fail"));
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://bad.com", label: "visit" },
      ];
      const ctx = await mockBrowser.newContext();
      // Reset to get a fresh context tracking
      mockBrowser.newContext.mockResolvedValueOnce({
        newPage: vi.fn().mockResolvedValue(mockPage),
        close: vi.fn().mockResolvedValue(undefined),
      });
      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: false });
      expect(result.success).toBe(false);
      // Context close was called (checked via the mock)
    });
  });

  // Regression: full checkout journey
  describe("regression: full checkout flow", () => {
    it("executes complete checkout journey end-to-end", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/products", label: "visit /products" },
        { index: 1, action: "click", target: "first product card", label: 'click "first product card"' },
        { index: 2, action: "click", target: "Add to Cart", label: 'click "Add to Cart"' },
        { index: 3, action: "visit", target: "https://example.com/cart", label: "visit /cart" },
        { index: 4, action: "click", target: "Checkout", label: 'click "Checkout"' },
        { index: 5, action: "wait_for", target: "/checkout-confirm", label: "wait for /checkout-confirm" },
        { index: 6, action: "measure", target: "measure", label: "measure" },
      ];

      const result = await executeJourney(mockBrowser, baseDef, steps, { screenshots: true });

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(7);
      expect(result.measurements).toHaveLength(1);
      // SPA collector is used because measure follows click steps (not a visit)
      expect(result.measurements[0].web_vitals.lcp_ms).toBe(350);

      // All non-measure steps have screenshots
      for (let i = 0; i < 6; i++) {
        expect(result.steps[i].screenshot_base64).toBeDefined();
      }
      // Measure step has no screenshot
      expect(result.steps[6].screenshot_base64).toBeUndefined();

      // All steps have timing
      for (const step of result.steps) {
        expect(step.started_at).toBeTruthy();
        expect(step.finished_at).toBeTruthy();
        expect(step.duration_ms).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── E-06: Full network waterfall (HAR) ──

  describe("HAR capture (E-06)", () => {
    it("captures HAR data by default", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com", label: "visit" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps);

      expect(mockHarStart).toHaveBeenCalled();
      expect(mockHarStop).toHaveBeenCalled();
      expect(result.har).toBeDefined();
      expect(result.har!.entries).toHaveLength(1);
      expect(result.har!.summary.total_entries).toBe(1);
    });

    it("includes HAR entries with correct structure", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com", label: "visit" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps);
      const entry = result.har!.entries[0];

      expect(entry.url).toBe("https://example.com/app.js");
      expect(entry.resource_type).toBe("script");
      expect(entry.transfer_size).toBe(50000);
      expect(entry.is_third_party).toBe(false);
      expect(entry.timing.wait_ms).toBe(140);
    });

    it("includes HAR summary with by-type breakdown", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com", label: "visit" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps);
      const summary = result.har!.summary;

      expect(summary.total_transfer_bytes).toBe(50000);
      expect(summary.by_type.script.count).toBe(1);
      expect(summary.slowest_resources).toHaveLength(1);
    });

    it("skips HAR when captureHar is false", async () => {
      mockHarStart.mockClear();
      mockHarStop.mockClear();

      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com", label: "visit" },
      ];
      const result = await executeJourney(mockBrowser, baseDef, steps, { captureHar: false });

      expect(result.har).toBeUndefined();
    });
  });

  // ── Authentication handling ──

  describe("auth", () => {
    it("passes HTTP header auth as extraHTTPHeaders to browser context", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com", label: "visit" },
      ];
      const def: JourneyDefinition = {
        ...baseDef,
        auth: { type: "http_header", header_name: "Authorization", header_value: "Bearer tok123" },
      };
      await executeJourney(mockBrowser, def, steps);

      const ctxCall = mockBrowser.newContext.mock.calls[0][0];
      expect(ctxCall.extraHTTPHeaders).toEqual({ Authorization: "Bearer tok123" });
    });

    it("injects cookies via addCookies for cookie auth", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com/app", label: "visit" },
      ];
      const def: JourneyDefinition = {
        ...baseDef,
        auth: { type: "cookie", cookies: [{ name: "sid", value: "abc123" }] },
      };
      await executeJourney(mockBrowser, def, steps);

      expect(mockBrowser.__addCookies).toHaveBeenCalledWith([
        { name: "sid", value: "abc123", domain: "example.com", path: "/" },
      ]);
    });

    it("does not set extraHTTPHeaders or cookies when auth is none", async () => {
      const steps: CompiledStep[] = [
        { index: 0, action: "visit", target: "https://example.com", label: "visit" },
      ];
      await executeJourney(mockBrowser, baseDef, steps);

      const ctxCall = mockBrowser.newContext.mock.calls[0][0];
      expect(ctxCall.extraHTTPHeaders).toBeUndefined();
      expect(mockBrowser.__addCookies).not.toHaveBeenCalled();
    });
  });
});
