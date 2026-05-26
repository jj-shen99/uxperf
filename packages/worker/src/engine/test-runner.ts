/**
 * Multi-engine TestRunner abstraction (Phase 2, §14.3).
 *
 * Provides a uniform interface for running performance tests across engines:
 *   - Playwright + Lighthouse (built-in)
 *   - WebPageTest (WPT) private-instance
 *   - sitespeed.io (future)
 *
 * Each engine adapter implements the TestRunner interface.
 */
import type { EngineRunRequest, EngineRunResult } from "./types";

export interface TestRunner {
  readonly name: string;
  readonly supports: string[]; // e.g. ["desktop", "mobile"]
  run(request: EngineRunRequest): Promise<EngineRunResult>;
  isAvailable(): Promise<boolean>;
}

/**
 * Registry of available test runner engines.
 */
export class TestRunnerRegistry {
  private runners = new Map<string, TestRunner>();

  register(runner: TestRunner): void {
    this.runners.set(runner.name, runner);
  }

  get(name: string): TestRunner | undefined {
    return this.runners.get(name);
  }

  list(): TestRunner[] {
    return Array.from(this.runners.values());
  }

  async listAvailable(): Promise<TestRunner[]> {
    const results = await Promise.all(
      this.list().map(async (r) => ({
        runner: r,
        available: await r.isAvailable().catch(() => false),
      })),
    );
    return results.filter((r) => r.available).map((r) => r.runner);
  }

  /**
   * Pick the best available runner for a request.
   * Priority: explicit engine from config > first available.
   */
  async resolve(
    request: EngineRunRequest & { engine?: string },
  ): Promise<TestRunner> {
    const engineName = (request as any).engine;
    if (engineName) {
      const runner = this.get(engineName);
      if (!runner) throw new Error(`Engine "${engineName}" not registered`);
      const available = await runner.isAvailable();
      if (!available) throw new Error(`Engine "${engineName}" is not available`);
      return runner;
    }

    const available = await this.listAvailable();
    if (available.length === 0) {
      throw new Error("No test runner engines available");
    }
    return available[0];
  }
}

/**
 * Global registry singleton — engines register themselves at import time.
 */
export const registry = new TestRunnerRegistry();
