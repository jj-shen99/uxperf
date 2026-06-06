/**
 * E-83: Engine adapter protocol tests
 *
 * Tests the EngineAdapter interface, EngineAdapterRegistry,
 * lifecycle hooks, resolution, and error handling.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EngineAdapter,
  EngineAdapterMetadata,
  EngineAdapterRegistry,
} from "../engine-adapter";
import type { EngineRunRequest, EngineRunResult } from "../types";

// ── Test helper: minimal adapter factory ─────────────────────

function createMockAdapter(
  overrides: Partial<EngineAdapterMetadata> & { available?: boolean; runResult?: Partial<EngineRunResult> } = {},
): EngineAdapter {
  const metadata: EngineAdapterMetadata = {
    name: overrides.name ?? "test-adapter",
    displayName: overrides.displayName ?? "Test Adapter",
    description: overrides.description ?? "A test adapter",
    supportedDevices: overrides.supportedDevices ?? ["desktop", "mobile"],
    supportsLoadTesting: overrides.supportsLoadTesting ?? false,
    producesLighthouseScores: overrides.producesLighthouseScores ?? true,
    requiredEnvVars: overrides.requiredEnvVars ?? [],
    optionalEnvVars: overrides.optionalEnvVars ?? [],
  };

  return {
    metadata,
    run: vi.fn().mockResolvedValue({
      success: true,
      url: "https://example.com",
      n_runs: 1,
      device: "desktop",
      metrics: {},
      individual_runs: [],
      duration_ms: 100,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      ...overrides.runResult,
    } as EngineRunResult),
    isAvailable: vi.fn().mockResolvedValue(overrides.available ?? true),
    onRegister: vi.fn(),
    onDestroy: vi.fn(),
    validateRequest: vi.fn(),
  };
}

const baseRequest: EngineRunRequest = {
  url: "https://example.com",
  n_runs: 3,
  device: "desktop",
  viewport: { width: 1920, height: 1080 },
};

// ── Tests ────────────────────────────────────────────────────

describe("EngineAdapterRegistry", () => {
  let registry: EngineAdapterRegistry;

  beforeEach(() => {
    registry = new EngineAdapterRegistry();
  });

  describe("register", () => {
    it("registers an adapter successfully", async () => {
      const adapter = createMockAdapter({ name: "alpha" });
      await registry.register(adapter);
      expect(registry.get("alpha")).toBe(adapter);
    });

    it("calls onRegister during registration", async () => {
      const adapter = createMockAdapter({ name: "beta" });
      await registry.register(adapter);
      expect(adapter.onRegister).toHaveBeenCalledTimes(1);
    });

    it("throws on duplicate name", async () => {
      const a1 = createMockAdapter({ name: "dup" });
      const a2 = createMockAdapter({ name: "dup" });
      await registry.register(a1);
      await expect(registry.register(a2)).rejects.toThrow('already registered');
    });
  });

  describe("unregister", () => {
    it("removes an adapter and calls onDestroy", async () => {
      const adapter = createMockAdapter({ name: "removable" });
      await registry.register(adapter);
      const removed = await registry.unregister("removable");
      expect(removed).toBe(true);
      expect(adapter.onDestroy).toHaveBeenCalledTimes(1);
      expect(registry.get("removable")).toBeUndefined();
    });

    it("returns false for non-existent adapter", async () => {
      const removed = await registry.unregister("nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("list", () => {
    it("returns all registered adapters", async () => {
      await registry.register(createMockAdapter({ name: "a1" }));
      await registry.register(createMockAdapter({ name: "a2" }));
      await registry.register(createMockAdapter({ name: "a3" }));
      expect(registry.list()).toHaveLength(3);
    });

    it("returns empty array when no adapters registered", () => {
      expect(registry.list()).toHaveLength(0);
    });
  });

  describe("listMetadata", () => {
    it("returns metadata for all adapters", async () => {
      await registry.register(createMockAdapter({ name: "pw", displayName: "Playwright" }));
      await registry.register(createMockAdapter({ name: "k6", displayName: "k6 Browser" }));
      const meta = registry.listMetadata();
      expect(meta).toHaveLength(2);
      expect(meta[0].displayName).toBe("Playwright");
      expect(meta[1].displayName).toBe("k6 Browser");
    });
  });

  describe("listAvailable", () => {
    it("returns only available adapters", async () => {
      await registry.register(createMockAdapter({ name: "avail", available: true }));
      await registry.register(createMockAdapter({ name: "unavail", available: false }));
      const available = await registry.listAvailable();
      expect(available).toHaveLength(1);
      expect(available[0].metadata.name).toBe("avail");
    });

    it("handles isAvailable throwing", async () => {
      const adapter = createMockAdapter({ name: "throws" });
      (adapter.isAvailable as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("check failed"));
      await registry.register(adapter);
      const available = await registry.listAvailable();
      expect(available).toHaveLength(0);
    });
  });

  describe("resolve", () => {
    it("resolves by explicit engine name", async () => {
      const pw = createMockAdapter({ name: "playwright-lighthouse" });
      const k6 = createMockAdapter({ name: "k6_browser" });
      await registry.register(pw);
      await registry.register(k6);

      const resolved = await registry.resolve({ ...baseRequest, engine: "k6_browser" });
      expect(resolved.metadata.name).toBe("k6_browser");
    });

    it("throws for unknown engine name", async () => {
      await expect(
        registry.resolve({ ...baseRequest, engine: "nonexistent" }),
      ).rejects.toThrow("not registered");
    });

    it("throws for unavailable engine", async () => {
      const adapter = createMockAdapter({ name: "down", available: false });
      await registry.register(adapter);
      await expect(
        registry.resolve({ ...baseRequest, engine: "down" }),
      ).rejects.toThrow("not available");
    });

    it("resolves first available when no engine specified", async () => {
      await registry.register(createMockAdapter({ name: "first", available: false }));
      await registry.register(createMockAdapter({ name: "second", available: true }));
      const resolved = await registry.resolve(baseRequest);
      expect(resolved.metadata.name).toBe("second");
    });

    it("throws when no adapters are available", async () => {
      await registry.register(createMockAdapter({ name: "none", available: false }));
      await expect(registry.resolve(baseRequest)).rejects.toThrow("No engine adapters available");
    });

    it("calls validateRequest when resolving", async () => {
      const adapter = createMockAdapter({ name: "validated" });
      await registry.register(adapter);
      await registry.resolve({ ...baseRequest, engine: "validated" });
      expect(adapter.validateRequest).toHaveBeenCalledWith(expect.objectContaining({ url: "https://example.com" }));
    });

    it("throws when validateRequest throws", async () => {
      const adapter = createMockAdapter({ name: "invalid" });
      (adapter.validateRequest as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Mobile not supported");
      });
      await registry.register(adapter);
      await expect(
        registry.resolve({ ...baseRequest, engine: "invalid" }),
      ).rejects.toThrow("Mobile not supported");
    });
  });

  describe("destroyAll", () => {
    it("destroys all adapters", async () => {
      const a1 = createMockAdapter({ name: "d1" });
      const a2 = createMockAdapter({ name: "d2" });
      await registry.register(a1);
      await registry.register(a2);
      await registry.destroyAll();
      expect(registry.list()).toHaveLength(0);
      expect(a1.onDestroy).toHaveBeenCalledTimes(1);
      expect(a2.onDestroy).toHaveBeenCalledTimes(1);
    });
  });
});

describe("EngineAdapter interface contract", () => {
  it("adapter run returns valid EngineRunResult", async () => {
    const adapter = createMockAdapter({
      name: "contract-test",
      runResult: {
        success: true,
        url: "https://example.com",
        metrics: { lcp_ms: 1200, fcp_ms: 800 },
      },
    });

    const result = await adapter.run(baseRequest);
    expect(result.success).toBe(true);
    expect(result.url).toBe("https://example.com");
    expect(result.metrics).toBeDefined();
    expect(result.metrics.lcp_ms).toBe(1200);
    expect(result.individual_runs).toBeDefined();
    expect(typeof result.duration_ms).toBe("number");
    expect(result.started_at).toBeDefined();
    expect(result.finished_at).toBeDefined();
  });

  it("metadata has all required fields", () => {
    const adapter = createMockAdapter({
      name: "meta-test",
      displayName: "Meta Test Adapter",
      description: "Tests metadata",
      supportedDevices: ["desktop"],
      supportsLoadTesting: false,
      producesLighthouseScores: true,
      requiredEnvVars: ["FOO_KEY"],
      optionalEnvVars: ["BAR_DEBUG"],
    });

    expect(adapter.metadata.name).toBe("meta-test");
    expect(adapter.metadata.displayName).toBe("Meta Test Adapter");
    expect(adapter.metadata.supportedDevices).toContain("desktop");
    expect(adapter.metadata.requiredEnvVars).toContain("FOO_KEY");
    expect(adapter.metadata.optionalEnvVars).toContain("BAR_DEBUG");
  });
});
