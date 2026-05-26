import type {
  RunStatus,
  RunMode,
  RunEngine,
  GatePolicy,
  GateResultStatus,
  AuthoringMode,
} from "./types";

// -- Enum sets (single source of truth for validation) --

const RUN_STATUSES: ReadonlySet<string> = new Set([
  "queued", "running", "completed", "failed", "cancelled",
]);
const RUN_MODES: ReadonlySet<string> = new Set([
  "stability", "load", "deep", "scheduled",
]);
const RUN_ENGINES: ReadonlySet<string> = new Set([
  "playwright_lighthouse", "k6_browser", "wpt", "sitespeed",
]);
const GATE_POLICIES: ReadonlySet<string> = new Set([
  "block", "warn", "page",
]);
const GATE_RESULT_STATUSES: ReadonlySet<string> = new Set([
  "passed", "failed", "skipped", "overridden",
]);
const AUTHORING_MODES: ReadonlySet<string> = new Set([
  "record", "template", "describe", "manual",
]);
const METRIC_NAMES: ReadonlySet<string> = new Set([
  "lcp", "fcp", "inp", "cls", "ttfb", "si", "tti", "tbt",
  "lighthouse_performance", "lighthouse_accessibility",
  "lighthouse_best_practices", "lighthouse_seo",
]);

// -- Type guard functions --

export function isValidRunStatus(value: string): value is RunStatus {
  return RUN_STATUSES.has(value);
}

export function isValidRunMode(value: string): value is RunMode {
  return RUN_MODES.has(value);
}

export function isValidRunEngine(value: string): value is RunEngine {
  return RUN_ENGINES.has(value);
}

export function isValidGatePolicy(value: string): value is GatePolicy {
  return GATE_POLICIES.has(value);
}

export function isValidGateResultStatus(value: string): value is GateResultStatus {
  return GATE_RESULT_STATUSES.has(value);
}

export function isValidAuthoringMode(value: string): value is AuthoringMode {
  return AUTHORING_MODES.has(value);
}

export function isValidMetricName(name: string): boolean {
  return METRIC_NAMES.has(name);
}

// -- Value validators --

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

export function isMetricWithinBudget(value: number, budget: number): boolean {
  if (!Number.isFinite(value) || !Number.isFinite(budget)) return false;
  return value <= budget;
}

// -- Composite validators --

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRunConfig(config: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (typeof config.url !== "string" || !isValidUrl(config.url)) {
    errors.push("config.url must be a valid HTTP/HTTPS URL");
  }

  if (config.n_runs !== undefined) {
    if (typeof config.n_runs !== "number" || !Number.isInteger(config.n_runs) || config.n_runs < 1 || config.n_runs > 100) {
      errors.push("config.n_runs must be an integer between 1 and 100");
    }
  }

  if (config.device !== undefined) {
    if (typeof config.device !== "string" || !["desktop", "mobile"].includes(config.device)) {
      errors.push('config.device must be "desktop" or "mobile"');
    }
  }

  if (config.viewport !== undefined) {
    const vp = config.viewport as Record<string, unknown>;
    if (typeof vp !== "object" || vp === null) {
      errors.push("config.viewport must be an object with width and height");
    } else {
      if (typeof vp.width !== "number" || vp.width < 1 || vp.width > 7680) {
        errors.push("config.viewport.width must be between 1 and 7680");
      }
      if (typeof vp.height !== "number" || vp.height < 1 || vp.height > 4320) {
        errors.push("config.viewport.height must be between 1 and 4320");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateEngineRunRequest(req: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  if (typeof req.url !== "string" || !isValidUrl(req.url)) {
    errors.push("url must be a valid HTTP/HTTPS URL");
  }

  if (typeof req.n_runs !== "number" || !Number.isInteger(req.n_runs) || req.n_runs < 1 || req.n_runs > 100) {
    errors.push("n_runs must be an integer between 1 and 100");
  }

  if (typeof req.device !== "string" || !["desktop", "mobile"].includes(req.device)) {
    errors.push('device must be "desktop" or "mobile"');
  }

  if (req.viewport !== undefined) {
    const vp = req.viewport as Record<string, unknown>;
    if (typeof vp !== "object" || vp === null) {
      errors.push("viewport must be an object with width and height");
    } else {
      if (typeof vp.width !== "number" || vp.width < 1) {
        errors.push("viewport.width must be a positive number");
      }
      if (typeof vp.height !== "number" || vp.height < 1) {
        errors.push("viewport.height must be a positive number");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
