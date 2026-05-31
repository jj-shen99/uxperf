import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHarCollector, HarEntry } from "../har-collector";

/**
 * HAR Collector — Unit Tests (E-32)
 *
 * Tests the full network waterfall capture via mocked Playwright events.
 */

function createMockPage() {
  const listeners: Record<string, Function[]> = {};

  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    removeListener: vi.fn((event: string, handler: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((h) => h !== handler);
      }
    }),
    // Helper to simulate events
    _emit(event: string, ...args: unknown[]) {
      for (const handler of (listeners[event] ?? [])) {
        handler(...args);
      }
    },
    _listeners: listeners,
  } as any;
}

function createMockRequest(url: string, method = "GET", resourceType = "document") {
  return {
    url: () => url,
    method: () => method,
    resourceType: () => resourceType,
  };
}

function createMockResponse(
  request: ReturnType<typeof createMockRequest>,
  status: number,
  bodyContent = "response-body",
  headers: Record<string, string> = {},
) {
  return {
    request: () => request,
    status: () => status,
    body: vi.fn().mockResolvedValue(Buffer.from(bodyContent)),
    headers: () => ({
      "content-type": "text/html",
      ...headers,
    }),
  };
}

describe("createHarCollector", () => {
  let mockPage: ReturnType<typeof createMockPage>;

  beforeEach(() => {
    mockPage = createMockPage();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers request and response listeners on start", () => {
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();

    expect(mockPage.on).toHaveBeenCalledWith("request", expect.any(Function));
    expect(mockPage.on).toHaveBeenCalledWith("response", expect.any(Function));
  });

  it("removes listeners on stop", async () => {
    vi.useRealTimers();
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();
    await har.stop();

    expect(mockPage.removeListener).toHaveBeenCalledWith("request", expect.any(Function));
    expect(mockPage.removeListener).toHaveBeenCalledWith("response", expect.any(Function));
  });

  it("captures a request-response pair", async () => {
    vi.useRealTimers();
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();

    const req = createMockRequest("https://example.com/api/data", "GET", "fetch");
    mockPage._emit("request", req);

    const resp = createMockResponse(req, 200, "response-data", {
      "content-length": "13",
    });
    await mockPage._listeners.response[0](resp);

    const result = await har.stop();

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].url).toBe("https://example.com/api/data");
    expect(result.entries[0].method).toBe("GET");
    expect(result.entries[0].status).toBe(200);
    expect(result.entries[0].resource_type).toBe("fetch");
    expect(result.entries[0].is_third_party).toBe(false);
  });

  it("identifies third-party resources", async () => {
    vi.useRealTimers();
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();

    const req = createMockRequest("https://cdn.external.com/script.js", "GET", "script");
    mockPage._emit("request", req);

    const resp = createMockResponse(req, 200);
    await mockPage._listeners.response[0](resp);

    const result = await har.stop();
    expect(result.entries[0].is_third_party).toBe(true);
  });

  it("captures multiple resources", async () => {
    vi.useRealTimers();
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();

    const urls = [
      "https://example.com/",
      "https://example.com/style.css",
      "https://example.com/app.js",
      "https://cdn.example.com/image.png",
    ];
    const types = ["document", "stylesheet", "script", "image"];

    for (let i = 0; i < urls.length; i++) {
      const req = createMockRequest(urls[i], "GET", types[i]);
      mockPage._emit("request", req);
      const resp = createMockResponse(req, 200, "x".repeat((i + 1) * 100));
      await mockPage._listeners.response[0](resp);
    }

    const result = await har.stop();
    expect(result.entries).toHaveLength(4);
  });

  it("builds correct summary", async () => {
    vi.useRealTimers();
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();

    // Add 3 first-party, 2 third-party
    const entries = [
      { url: "https://example.com/", type: "document", size: 500, thirdParty: false },
      { url: "https://example.com/app.js", type: "script", size: 1000, thirdParty: false },
      { url: "https://example.com/style.css", type: "stylesheet", size: 300, thirdParty: false },
      { url: "https://cdn.other.com/tracker.js", type: "script", size: 200, thirdParty: true },
      { url: "https://fonts.google.com/font.woff2", type: "font", size: 800, thirdParty: true },
    ];

    for (const e of entries) {
      const req = createMockRequest(e.url, "GET", e.type);
      mockPage._emit("request", req);
      const resp = createMockResponse(req, 200, "x".repeat(e.size), {
        "content-length": String(e.size),
      });
      await mockPage._listeners.response[0](resp);
    }

    const result = await har.stop();

    expect(result.summary.total_entries).toBe(5);
    expect(result.summary.third_party_count).toBe(2);
    expect(result.summary.by_type.script.count).toBe(2);
    expect(result.summary.by_type.document.count).toBe(1);
    expect(result.summary.slowest_resources).toHaveLength(5);
    expect(result.summary.largest_resources).toHaveLength(5);
  });

  it("provides timing estimates for entries", async () => {
    vi.useRealTimers();
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();

    const req = createMockRequest("https://example.com/api", "GET", "fetch");
    mockPage._emit("request", req);

    const resp = createMockResponse(req, 200);
    await mockPage._listeners.response[0](resp);

    const result = await har.stop();
    const entry = result.entries[0];

    expect(entry.timing).toBeDefined();
    expect(entry.timing.wait_ms).toBeGreaterThanOrEqual(0);
    expect(entry.timing.receive_ms).toBeGreaterThanOrEqual(0);
  });

  it("handles response body failure gracefully", async () => {
    vi.useRealTimers();
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();

    const req = createMockRequest("https://example.com/video.mp4", "GET", "media");
    mockPage._emit("request", req);

    const resp = createMockResponse(req, 200);
    (resp.body as any).mockRejectedValueOnce(new Error("Cannot access body"));
    await mockPage._listeners.response[0](resp);

    const result = await har.stop();
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].transfer_size).toBe(0);
  });

  it("truncates long URLs", async () => {
    vi.useRealTimers();
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();

    const longUrl = "https://example.com/" + "a".repeat(300);
    const req = createMockRequest(longUrl, "GET", "fetch");
    mockPage._emit("request", req);

    const resp = createMockResponse(req, 200);
    await mockPage._listeners.response[0](resp);

    const result = await har.stop();
    expect(result.entries[0].url.length).toBeLessThanOrEqual(201); // 200 + "…"
  });

  it("returns empty result when no requests captured", async () => {
    vi.useRealTimers();
    const har = createHarCollector(mockPage, "https://example.com");
    har.start();
    const result = await har.stop();

    expect(result.entries).toHaveLength(0);
    expect(result.summary.total_entries).toBe(0);
    expect(result.summary.total_transfer_bytes).toBe(0);
  });
});
