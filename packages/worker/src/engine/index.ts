export { runPlaywrightLighthouse } from "./playwright-lighthouse-runner";
export { median, aggregateResults } from "./stats";
export { registry, TestRunnerRegistry } from "./test-runner";
export type { TestRunner } from "./test-runner";

// Journey engine (E-01 through E-05)
export { parseJourney, parseYaml, compileSteps, executeJourney } from "./journey";

// Auto-register engine adapters
import "./adapters/playwright-adapter";
import "./adapters/wpt-adapter";
import "./adapters/sitespeed-adapter";

export type {
  EngineRunRequest,
  EngineRunResult,
  SingleRunResult,
  AggregatedMetrics,
  WebVitals,
  LighthouseScores,
  LighthouseTimings,
} from "./types";
