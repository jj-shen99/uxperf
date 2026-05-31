/**
 * RUM SDK Tests (E-38 + E-41)
 *
 * Tests the SDK's beacon building, sampling, queueing, flushing,
 * and custom metrics collection logic.
 *
 * Note: web-vitals integration is tested via the initRum path;
 * unit tests mock the DOM/performance APIs.
 */

// Mock web-vitals before importing
jest.mock("web-vitals", () => ({
  onLCP: jest.fn(),
  onFCP: jest.fn(),
  onINP: jest.fn(),
  onCLS: jest.fn(),
  onTTFB: jest.fn(),
}));

import {
  initRum,
  destroyRum,
  sendBeacon,
  flush,
  collectCustomMetrics,
  rumMark,
  RumConfig,
  RumBeacon,
} from "./rum";

// ── DOM / Performance mocks ────────────────────────────────

const mockSendBeacon = jest.fn().mockReturnValue(true);
const mockFetch = jest.fn().mockResolvedValue({ ok: true });

const mockPerformanceEntries: Record<string, any[]> = {
  navigation: [{
    type: "navigate",
    startTime: 0,
    domInteractive: 500,
    domComplete: 1200,
    loadEventEnd: 1300,
  }],
  resource: [
    { transferSize: 5000 },
    { transferSize: 3000 },
  ],
  measure: [],
};

beforeAll(() => {
  Object.defineProperty(global, "navigator", {
    value: {
      userAgent: "Mozilla/5.0 TestAgent",
      sendBeacon: mockSendBeacon,
      connection: { effectiveType: "4g" },
    },
    writable: true,
  });

  Object.defineProperty(global, "location", {
    value: {
      href: "https://example.com/page",
      origin: "https://example.com",
    },
    writable: true,
  });

  Object.defineProperty(global, "document", {
    value: {
      addEventListener: jest.fn(),
      visibilityState: "visible",
    },
    writable: true,
  });

  Object.defineProperty(global, "window", {
    value: {
      addEventListener: jest.fn(),
    },
    writable: true,
  });

  Object.defineProperty(global, "performance", {
    value: {
      getEntriesByType: (type: string) => mockPerformanceEntries[type] ?? [],
      mark: jest.fn(),
      measure: jest.fn(),
    },
    writable: true,
  });

  Object.defineProperty(global, "crypto", {
    value: { randomUUID: () => "test-session-uuid" },
    writable: true,
  });

  global.fetch = mockFetch as any;
  global.Blob = jest.fn((parts, opts) => ({ parts, type: opts?.type })) as any;
});

afterEach(() => {
  destroyRum();
  mockSendBeacon.mockClear();
  mockFetch.mockClear();
  jest.clearAllMocks();
});

const baseConfig: RumConfig = {
  endpoint: "https://perf.example.com/api/intelligence/rum/ingest",
  projectId: "proj-1",
  sampleRate: 1.0,
  sessionId: "test-session",
  debug: false,
};

// ── E-38: Core SDK ──────────────────────────────────────────

describe("RUM SDK (E-38)", () => {
  it("initializes without error", () => {
    expect(() => initRum(baseConfig)).not.toThrow();
  });

  it("skips initialization in SSR (no window)", () => {
    const origWindow = global.window;
    delete (global as any).window;
    expect(() => initRum(baseConfig)).not.toThrow();
    global.window = origWindow;
  });

  it("registers visibilitychange and pagehide listeners", () => {
    initRum(baseConfig);
    expect(document.addEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    expect(window.addEventListener).toHaveBeenCalledWith(
      "pagehide",
      expect.any(Function),
    );
  });

  it("samples out when sampleRate is 0", () => {
    // With sampleRate=0, Math.random() (always >= 0) will never be < 0
    initRum({ ...baseConfig, sampleRate: 0 });
    sendBeacon();
    flush();
    expect(mockSendBeacon).not.toHaveBeenCalled();
  });

  it("builds beacon with correct fields", () => {
    initRum(baseConfig);
    sendBeacon();
    flush();
    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
    const blob = mockSendBeacon.mock.calls[0][1];
    const payload = JSON.parse(blob.parts[0]);
    const beacon: RumBeacon = payload.events[0];

    expect(beacon.project_id).toBe("proj-1");
    expect(beacon.page_url).toBe("https://example.com/page");
    expect(beacon.origin).toBe("https://example.com");
    expect(beacon.device_type).toBe("desktop");
    expect(beacon.connection_type).toBe("4g");
    expect(beacon.session_id).toBe("test-session");
    expect(beacon.nav_type).toBe("navigate");
    expect(beacon.sample_rate).toBe(1.0);
    expect(beacon.user_agent).toContain("TestAgent");
    expect(beacon.recorded_at).toBeDefined();
  });

  it("includes navigation timings", () => {
    initRum(baseConfig);
    sendBeacon();
    flush();
    const payload = JSON.parse(mockSendBeacon.mock.calls[0][1].parts[0]);
    const beacon = payload.events[0];
    expect(beacon.dom_interactive_ms).toBe(500);
    expect(beacon.dom_complete_ms).toBe(1200);
    expect(beacon.load_event_ms).toBe(1300);
  });

  it("includes resource metrics", () => {
    initRum(baseConfig);
    sendBeacon();
    flush();
    const payload = JSON.parse(mockSendBeacon.mock.calls[0][1].parts[0]);
    const beacon = payload.events[0];
    expect(beacon.total_transfer_bytes).toBe(8000); // 5000 + 3000
    expect(beacon.resource_count).toBe(2);
  });

  it("includes custom labels and feature flags", () => {
    initRum({
      ...baseConfig,
      labels: { team: "platform" },
      featureFlags: { dark_mode: "on" },
    });
    sendBeacon();
    flush();
    const payload = JSON.parse(mockSendBeacon.mock.calls[0][1].parts[0]);
    const beacon = payload.events[0];
    expect(beacon.labels.team).toBe("platform");
    expect(beacon.labels.ff_dark_mode).toBe("on");
  });

  it("includes build_hash when configured", () => {
    initRum({ ...baseConfig, buildHash: "abc123" });
    sendBeacon();
    flush();
    const payload = JSON.parse(mockSendBeacon.mock.calls[0][1].parts[0]);
    expect(payload.events[0].build_hash).toBe("abc123");
  });

  it("flushes when queue reaches maxQueueSize", () => {
    initRum({ ...baseConfig, maxQueueSize: 3 });
    sendBeacon();
    sendBeacon();
    expect(mockSendBeacon).not.toHaveBeenCalled();
    sendBeacon(); // 3rd beacon triggers flush
    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(mockSendBeacon.mock.calls[0][1].parts[0]);
    expect(payload.events).toHaveLength(3);
  });

  it("sends to batch endpoint", () => {
    initRum(baseConfig);
    sendBeacon();
    flush();
    const url = mockSendBeacon.mock.calls[0][0];
    expect(url).toBe("https://perf.example.com/api/intelligence/rum/ingest/batch");
  });

  it("falls back to fetch when sendBeacon fails", () => {
    mockSendBeacon.mockReturnValueOnce(false);
    initRum(baseConfig);
    sendBeacon();
    flush();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("destroyRum clears state", () => {
    initRum(baseConfig);
    sendBeacon();
    destroyRum();
    flush(); // should be no-op after destroy
    expect(mockSendBeacon).not.toHaveBeenCalled();
  });
});

// ── E-41: Custom Journey Metrics ─────────────────────────────

describe("Custom Journey Metrics (E-41)", () => {
  it("collectCustomMetrics returns empty when no measures exist", () => {
    mockPerformanceEntries.measure = [];
    expect(collectCustomMetrics()).toEqual({});
  });

  it("collectCustomMetrics collects performance.measure entries", () => {
    mockPerformanceEntries.measure = [
      { name: "time-to-cart", duration: 1234.56 },
      { name: "checkout-flow", duration: 567.89 },
    ];
    const metrics = collectCustomMetrics();
    expect(metrics["time-to-cart"]).toBe(1234.56);
    expect(metrics["checkout-flow"]).toBe(567.89);
    mockPerformanceEntries.measure = [];
  });

  it("rumMark creates a mark and returns a measure function", () => {
    const end = rumMark("test-journey");
    expect(performance.mark).toHaveBeenCalledWith("test-journey__start");
    end();
    expect(performance.measure).toHaveBeenCalledWith("test-journey", "test-journey__start");
  });

  it("includes custom metrics in beacon when collectCustomMetrics enabled", () => {
    mockPerformanceEntries.measure = [
      { name: "custom-metric", duration: 999 },
    ];
    initRum({ ...baseConfig, collectCustomMetrics: true });
    sendBeacon();
    flush();
    const payload = JSON.parse(mockSendBeacon.mock.calls[0][1].parts[0]);
    expect(payload.events[0].custom_metrics).toEqual({ "custom-metric": 999 });
    mockPerformanceEntries.measure = [];
  });

  it("excludes custom metrics when collectCustomMetrics is false", () => {
    mockPerformanceEntries.measure = [
      { name: "custom-metric", duration: 999 },
    ];
    initRum({ ...baseConfig, collectCustomMetrics: false });
    sendBeacon();
    flush();
    const payload = JSON.parse(mockSendBeacon.mock.calls[0][1].parts[0]);
    expect(payload.events[0].custom_metrics).toBeUndefined();
    mockPerformanceEntries.measure = [];
  });
});
