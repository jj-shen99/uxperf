/**
 * E-70: Tests for the RUM adapter protocol.
 *
 * Covers: NativeRumAdapter, SpeedCurveAdapter, DatadogRumAdapter,
 *         NewRelicRumAdapter, RumAdapterRegistry.
 * Techniques: equivalence partitioning, boundary value analysis, decision tables.
 */

import {
  rumAdapterRegistry,
  RumAdapterRegistry,
  NativeRumAdapter,
  SpeedCurveAdapter,
  DatadogRumAdapter,
  NewRelicRumAdapter,
  RumBeacon,
} from "./rum-adapter";

const PROJECT_ID = "proj-rum-test";

// ====== Registry ======

describe("RumAdapterRegistry", () => {
  it("should have built-in adapters registered", () => {
    const names = rumAdapterRegistry.names();
    expect(names).toContain("native");
    expect(names).toContain("speedcurve");
    expect(names).toContain("datadog");
    expect(names).toContain("newrelic");
  });

  it("should retrieve adapters by name", () => {
    expect(rumAdapterRegistry.get("native")).toBeDefined();
    expect(rumAdapterRegistry.get("speedcurve")).toBeDefined();
    expect(rumAdapterRegistry.get("nonexistent")).toBeUndefined();
  });

  it("should list all registered adapters", () => {
    const list = rumAdapterRegistry.list();
    expect(list.length).toBeGreaterThanOrEqual(4);
  });

  it("should allow registering custom adapters", () => {
    const reg = new RumAdapterRegistry();
    const custom: any = { name: "custom", validate: () => true, normalize: () => [], toRumEvent: () => ({}) };
    reg.register(custom);
    expect(reg.get("custom")).toBe(custom);
  });
});

// ====== NativeRumAdapter ======

describe("NativeRumAdapter", () => {
  const adapter = new NativeRumAdapter();

  describe("validate", () => {
    it("should accept payload with page_url string", () => {
      expect(adapter.validate({ page_url: "https://example.com" })).toBe(true);
    });

    it("should reject null/undefined", () => {
      expect(adapter.validate(null)).toBe(false);
      expect(adapter.validate(undefined)).toBe(false);
    });

    it("should reject payload without page_url", () => {
      expect(adapter.validate({ other: "value" })).toBe(false);
    });

    it("should reject empty page_url", () => {
      expect(adapter.validate({ page_url: "" })).toBe(false);
    });
  });

  describe("normalize", () => {
    it("should wrap single beacon in array", () => {
      const result = adapter.normalize({ page_url: "https://a.com", lcp_ms: 1500 });
      expect(result).toHaveLength(1);
      expect(result[0].page_url).toBe("https://a.com");
    });

    it("should pass through an array of beacons", () => {
      const beacons = [
        { page_url: "https://a.com" },
        { page_url: "https://b.com" },
      ];
      const result = adapter.normalize(beacons);
      expect(result).toHaveLength(2);
    });
  });

  describe("toRumEvent", () => {
    it("should map all beacon fields to RumEvent", () => {
      const beacon: RumBeacon = {
        page_url: "https://example.com/page",
        origin: "https://example.com",
        device_type: "mobile",
        lcp_ms: 1200,
        fcp_ms: 800,
        cls: 0.05,
        ttfb_ms: 150,
        session_id: "sess-1",
        user_agent: "TestAgent",
        labels: { env: "prod" },
        custom_metrics: { custom_timing: 42 },
        build_hash: "abc123",
      };

      const event = adapter.toRumEvent(beacon, PROJECT_ID);
      expect(event.project_id).toBe(PROJECT_ID);
      expect(event.page_url).toBe("https://example.com/page");
      expect(event.origin).toBe("https://example.com");
      expect(event.device_type).toBe("mobile");
      expect(event.lcp_ms).toBe(1200);
      expect(event.fcp_ms).toBe(800);
      expect(event.cls).toBe(0.05);
      expect(event.session_id).toBe("sess-1");
      expect(event.labels).toEqual({ env: "prod" });
      expect(event.custom_metrics).toEqual({ custom_timing: 42 });
      expect(event.build_hash).toBe("abc123");
    });

    it("should derive origin from page_url when origin not provided", () => {
      const beacon: RumBeacon = { page_url: "https://example.com/path" };
      const event = adapter.toRumEvent(beacon, PROJECT_ID);
      expect(event.origin).toBe("https://example.com");
    });
  });
});

// ====== SpeedCurveAdapter ======

describe("SpeedCurveAdapter", () => {
  const adapter = new SpeedCurveAdapter();

  describe("validate", () => {
    it("should accept payload with site", () => {
      expect(adapter.validate({ site: "example.com" })).toBe(true);
    });

    it("should accept payload with url", () => {
      expect(adapter.validate({ url: "https://example.com" })).toBe(true);
    });

    it("should reject empty object", () => {
      expect(adapter.validate({})).toBe(false);
    });

    it("should reject null", () => {
      expect(adapter.validate(null)).toBe(false);
    });
  });

  describe("normalize", () => {
    it("should normalize single SpeedCurve test result", () => {
      const payload = {
        url: "https://example.com",
        lux_lcp: 1800,
        lux_fcp: 900,
        lux_cls: 0.1,
        lux_ttfb: 200,
        device: "desktop",
        country: "US",
      };
      const beacons = adapter.normalize(payload);
      expect(beacons).toHaveLength(1);
      expect(beacons[0].lcp_ms).toBe(1800);
      expect(beacons[0].fcp_ms).toBe(900);
      expect(beacons[0].cls).toBe(0.1);
      expect(beacons[0].country_code).toBe("US");
      expect(beacons[0].labels?.provider).toBe("speedcurve");
    });

    it("should normalize array of tests", () => {
      const payload = {
        tests: [
          { url: "https://a.com", lux_lcp: 1000 },
          { url: "https://b.com", lux_lcp: 2000 },
        ],
      };
      const beacons = adapter.normalize(payload);
      expect(beacons).toHaveLength(2);
    });

    it("should fallback to fcp/lcp when lux_ prefix absent", () => {
      const payload = { url: "https://example.com", fcp: 500, lcp: 1100 };
      const beacons = adapter.normalize(payload);
      expect(beacons[0].fcp_ms).toBe(500);
      expect(beacons[0].lcp_ms).toBe(1100);
    });
  });

  describe("toRumEvent", () => {
    it("should create a valid RumEvent from beacon", () => {
      const beacon: RumBeacon = {
        page_url: "https://example.com",
        origin: "https://example.com",
        lcp_ms: 1500,
        labels: { provider: "speedcurve" },
      };
      const event = adapter.toRumEvent(beacon, PROJECT_ID);
      expect(event.project_id).toBe(PROJECT_ID);
      expect(event.lcp_ms).toBe(1500);
      expect(event.labels?.provider).toBe("speedcurve");
    });
  });
});

// ====== DatadogRumAdapter ======

describe("DatadogRumAdapter", () => {
  const adapter = new DatadogRumAdapter();

  describe("validate", () => {
    it("should accept payload with type", () => {
      expect(adapter.validate({ type: "view" })).toBe(true);
    });

    it("should accept payload with view object", () => {
      expect(adapter.validate({ view: { url: "https://example.com" } })).toBe(true);
    });

    it("should reject null", () => {
      expect(adapter.validate(null)).toBe(false);
    });

    it("should reject non-object", () => {
      expect(adapter.validate("string")).toBe(false);
    });
  });

  describe("normalize", () => {
    it("should extract metrics from view.performance_metrics", () => {
      const payload = {
        view: {
          url: "https://example.com",
          performance_metrics: {
            largest_contentful_paint: 2000,
            first_contentful_paint: 800,
            cumulative_layout_shift: 0.12,
            time_to_first_byte: 180,
            interaction_to_next_paint: 100,
          },
          resource: { count: 30, size: 256000 },
        },
        session: { id: "dd-sess-1" },
        application: { id: "dd-app-1" },
        date: 1700000000000,
        geo: { country: "DE", region: "BY" },
      };

      const beacons = adapter.normalize(payload);
      expect(beacons).toHaveLength(1);
      expect(beacons[0].lcp_ms).toBe(2000);
      expect(beacons[0].fcp_ms).toBe(800);
      expect(beacons[0].cls).toBe(0.12);
      expect(beacons[0].ttfb_ms).toBe(180);
      expect(beacons[0].inp_ms).toBe(100);
      expect(beacons[0].resource_count).toBe(30);
      expect(beacons[0].session_id).toBe("dd-sess-1");
      expect(beacons[0].country_code).toBe("DE");
      expect(beacons[0].labels?.provider).toBe("datadog");
    });

    it("should handle events array", () => {
      const payload = {
        events: [
          { view: { url: "https://a.com", largest_contentful_paint: 1000 } },
          { view: { url: "https://b.com", largest_contentful_paint: 1500 } },
        ],
      };
      const beacons = adapter.normalize(payload);
      expect(beacons).toHaveLength(2);
    });
  });

  describe("toRumEvent", () => {
    it("should preserve all fields from beacon", () => {
      const beacon: RumBeacon = {
        page_url: "https://example.com",
        origin: "https://example.com",
        lcp_ms: 1200,
        session_id: "dd-s1",
        country_code: "US",
        labels: { provider: "datadog", application_id: "app1" },
      };
      const event = adapter.toRumEvent(beacon, PROJECT_ID);
      expect(event.project_id).toBe(PROJECT_ID);
      expect(event.session_id).toBe("dd-s1");
      expect(event.labels?.provider).toBe("datadog");
    });
  });
});

// ====== NewRelicRumAdapter ======

describe("NewRelicRumAdapter", () => {
  const adapter = new NewRelicRumAdapter();

  describe("validate", () => {
    it("should accept payload with pageUrl", () => {
      expect(adapter.validate({ pageUrl: "https://example.com" })).toBe(true);
    });

    it("should accept payload with requestUri", () => {
      expect(adapter.validate({ requestUri: "https://example.com" })).toBe(true);
    });

    it("should reject empty object", () => {
      expect(adapter.validate({})).toBe(false);
    });
  });

  describe("normalize", () => {
    it("should extract metrics from New Relic event", () => {
      const payload = {
        pageUrl: "https://example.com/page",
        largestContentfulPaint: 1600,
        firstContentfulPaint: 700,
        cumulativeLayoutShift: 0.03,
        firstByte: 120,
        interactionToNextPaint: 80,
        domInteractive: 500,
        domComplete: 1200,
        windowLoad: 1400,
        deviceType: "mobile",
        countryCode: "JP",
        session: "nr-sess-1",
        appId: "nr-app-1",
      };

      const beacons = adapter.normalize(payload);
      expect(beacons).toHaveLength(1);
      expect(beacons[0].lcp_ms).toBe(1600);
      expect(beacons[0].fcp_ms).toBe(700);
      expect(beacons[0].cls).toBe(0.03);
      expect(beacons[0].ttfb_ms).toBe(120);
      expect(beacons[0].inp_ms).toBe(80);
      expect(beacons[0].dom_interactive_ms).toBe(500);
      expect(beacons[0].device_type).toBe("mobile");
      expect(beacons[0].country_code).toBe("JP");
      expect(beacons[0].labels?.provider).toBe("newrelic");
    });

    it("should handle array of events", () => {
      const payload = [
        { pageUrl: "https://a.com", largestContentfulPaint: 1000 },
        { pageUrl: "https://b.com", largestContentfulPaint: 2000 },
      ];
      const beacons = adapter.normalize(payload);
      expect(beacons).toHaveLength(2);
    });
  });

  describe("toRumEvent", () => {
    it("should preserve nav_type", () => {
      const beacon: RumBeacon = {
        page_url: "https://example.com",
        nav_type: "back_forward",
        labels: { provider: "newrelic", appId: "app1" },
      };
      const event = adapter.toRumEvent(beacon, PROJECT_ID);
      expect(event.nav_type).toBe("back_forward");
    });
  });
});

// ====== Cross-adapter decision table ======

describe("Decision table: adapter selection", () => {
  const scenarios = [
    { name: "native", payload: { page_url: "https://a.com" }, expected: "native" },
    { name: "speedcurve", payload: { site: "example.com" }, expected: "speedcurve" },
    { name: "datadog", payload: { type: "view" }, expected: "datadog" },
    { name: "newrelic", payload: { pageUrl: "https://a.com" }, expected: "newrelic" },
  ];

  it.each(scenarios)("should validate $name adapter payload", ({ payload, expected }) => {
    const adapter = rumAdapterRegistry.get(expected);
    expect(adapter).toBeDefined();
    expect(adapter!.validate(payload)).toBe(true);
  });

  it("should not cross-validate (native rejects datadog payload)", () => {
    const native = rumAdapterRegistry.get("native")!;
    expect(native.validate({ type: "view" })).toBe(false);
  });
});
