/**
 * Playwright + Lighthouse engine adapter.
 * Wraps the existing runner behind the TestRunner interface.
 */
import type { TestRunner } from "../test-runner";
import type { EngineRunRequest, EngineRunResult } from "../types";
import { runPlaywrightLighthouse } from "../playwright-lighthouse-runner";
import { registry } from "../test-runner";

export class PlaywrightLighthouseAdapter implements TestRunner {
  readonly name = "playwright-lighthouse";
  readonly supports = ["desktop", "mobile"];

  async run(request: EngineRunRequest): Promise<EngineRunResult> {
    return runPlaywrightLighthouse(request);
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Playwright + chromium are accessible
      const pw = await import("playwright");
      return !!pw.chromium;
    } catch {
      return false;
    }
  }
}

// Auto-register on import
registry.register(new PlaywrightLighthouseAdapter());
