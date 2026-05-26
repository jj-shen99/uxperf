/**
 * sitespeed.io engine adapter (placeholder).
 * Will integrate with sitespeed.io CLI or Docker container.
 *
 * Environment:
 *   SITESPEED_ENABLED — set to "true" to enable
 *   SITESPEED_DOCKER_IMAGE — Docker image for sitespeed.io (default: sitespeedio/sitespeed.io:latest)
 */
import type { TestRunner } from "../test-runner";
import type { EngineRunRequest, EngineRunResult } from "../types";
import { registry } from "../test-runner";

const SITESPEED_ENABLED = process.env.SITESPEED_ENABLED === "true";

export class SitespeedAdapter implements TestRunner {
  readonly name = "sitespeed";
  readonly supports = ["desktop", "mobile"];

  async run(request: EngineRunRequest): Promise<EngineRunResult> {
    const startedAt = new Date().toISOString();
    // TODO: Implement sitespeed.io CLI/Docker invocation
    return {
      success: false,
      url: request.url,
      n_runs: request.n_runs,
      device: request.device,
      metrics: {},
      individual_runs: [],
      error: "sitespeed.io adapter not yet implemented",
      duration_ms: 0,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    };
  }

  async isAvailable(): Promise<boolean> {
    return SITESPEED_ENABLED;
  }
}

// Auto-register on import
registry.register(new SitespeedAdapter());
