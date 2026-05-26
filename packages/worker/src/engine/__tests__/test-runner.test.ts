import { describe, it, expect, beforeEach } from "vitest";
import { TestRunnerRegistry } from "../test-runner";
import type { TestRunner } from "../test-runner";
import type { EngineRunRequest, EngineRunResult } from "../types";

class MockRunner implements TestRunner {
  readonly name: string;
  readonly supports: string[];
  private available: boolean;

  constructor(name: string, available = true) {
    this.name = name;
    this.supports = ["desktop"];
    this.available = available;
  }

  async run(request: EngineRunRequest): Promise<EngineRunResult> {
    return {
      success: true,
      url: request.url,
      n_runs: request.n_runs,
      device: request.device,
      metrics: { lcp_ms: 100 },
      individual_runs: [],
      duration_ms: 0,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.available;
  }
}

describe("TestRunnerRegistry", () => {
  let registry: TestRunnerRegistry;

  beforeEach(() => {
    registry = new TestRunnerRegistry();
  });

  it("registers and retrieves a runner by name", () => {
    const runner = new MockRunner("test-engine");
    registry.register(runner);
    expect(registry.get("test-engine")).toBe(runner);
  });

  it("returns undefined for unknown engine", () => {
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("lists all registered runners", () => {
    registry.register(new MockRunner("a"));
    registry.register(new MockRunner("b"));
    expect(registry.list()).toHaveLength(2);
  });

  it("listAvailable filters out unavailable runners", async () => {
    registry.register(new MockRunner("available", true));
    registry.register(new MockRunner("unavailable", false));
    const available = await registry.listAvailable();
    expect(available).toHaveLength(1);
    expect(available[0].name).toBe("available");
  });

  it("listAvailable handles isAvailable() errors gracefully", async () => {
    const errRunner = new MockRunner("error");
    errRunner.isAvailable = async () => { throw new Error("boom"); };
    registry.register(errRunner);
    const available = await registry.listAvailable();
    expect(available).toHaveLength(0);
  });

  describe("resolve", () => {
    it("returns explicitly requested engine", async () => {
      registry.register(new MockRunner("engine-a"));
      registry.register(new MockRunner("engine-b"));
      const request = { url: "https://a.com", n_runs: 1, device: "desktop" as const, viewport: { width: 1920, height: 1080 }, engine: "engine-b" };
      const runner = await registry.resolve(request);
      expect(runner.name).toBe("engine-b");
    });

    it("throws when requested engine is not registered", async () => {
      const request = { url: "https://a.com", n_runs: 1, device: "desktop" as const, viewport: { width: 1920, height: 1080 }, engine: "nope" };
      await expect(registry.resolve(request)).rejects.toThrow('Engine "nope" not registered');
    });

    it("throws when requested engine is not available", async () => {
      registry.register(new MockRunner("down", false));
      const request = { url: "https://a.com", n_runs: 1, device: "desktop" as const, viewport: { width: 1920, height: 1080 }, engine: "down" };
      await expect(registry.resolve(request)).rejects.toThrow('Engine "down" is not available');
    });

    it("returns first available engine when no engine specified", async () => {
      registry.register(new MockRunner("unavailable", false));
      registry.register(new MockRunner("available", true));
      const request = { url: "https://a.com", n_runs: 1, device: "desktop" as const, viewport: { width: 1920, height: 1080 } };
      const runner = await registry.resolve(request);
      expect(runner.name).toBe("available");
    });

    it("throws when no engines available", async () => {
      registry.register(new MockRunner("down", false));
      const request = { url: "https://a.com", n_runs: 1, device: "desktop" as const, viewport: { width: 1920, height: 1080 } };
      await expect(registry.resolve(request)).rejects.toThrow("No test runner engines available");
    });
  });

  describe("runner execution", () => {
    it("runs and returns result from registered runner", async () => {
      const runner = new MockRunner("test");
      registry.register(runner);
      const request: EngineRunRequest = {
        url: "https://example.com",
        n_runs: 3,
        device: "desktop",
        viewport: { width: 1920, height: 1080 },
      };
      const result = await runner.run(request);
      expect(result.success).toBe(true);
      expect(result.url).toBe("https://example.com");
    });
  });
});
