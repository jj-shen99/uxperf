/**
 * k6 browser engine adapter for concurrent load testing (Phase 3.5, §14.5).
 *
 * Integrates k6 browser module as a load engine. In production, this spawns
 * a k6 subprocess with a generated browser script. For the adapter layer,
 * we expose the standard TestRunner interface.
 *
 * Environment:
 *   K6_BINARY — path to k6 binary (default: "k6")
 *   K6_BROWSER_ENABLED — set to "true" to enable (default: false)
 */
import type { TestRunner } from "../test-runner";
import type {
  EngineRunRequest,
  EngineRunResult,
  AggregatedMetrics,
  SingleRunResult,
} from "../types";
import { registry } from "../test-runner";
import { execFile } from "child_process";
import { writeFileSync, mkdirSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const K6_BINARY = process.env.K6_BINARY ?? "k6";
const API_URL = process.env.API_URL ?? "http://localhost:4000/api/v1";

export interface K6LoadProfile {
  stages: K6Stage[];
  target_vus: number;
  cache_state: "cold" | "warm" | "production_replay";
  ui_server_targets?: UiServerTarget[];
}

export interface K6Stage {
  duration_s: number;
  target_vus: number;
  ramp_type?: "linear" | "step";
}

export interface UiServerTarget {
  host: string;
  port: number;
  scrape_path?: string;
  labels?: Record<string, string>;
}

export interface K6ScriptStep {
  intent: string;
  action: "visit" | "click" | "fill" | "scroll" | "wait_for" | "measure";
  target: string;
  value?: string;
  label: string;
}

export interface K6RunRequest extends EngineRunRequest {
  engine: "k6_browser";
  load_profile: K6LoadProfile;
  script_steps?: K6ScriptStep[];
}

/** Metric values may use "p95" (--summary-export) or "p(95)" (handleSummary) */
interface K6MetricValues {
  avg?: number;
  med?: number;
  min?: number;
  max?: number;
  p95?: number;
  p99?: number;
  "p(90)"?: number;
  "p(95)"?: number;
  "p(99)"?: number;
  count?: number;
  rate?: number;
  value?: number;
  [key: string]: number | undefined;
}

export interface K6Summary {
  metrics: {
    browser_web_vital_lcp?: { values: K6MetricValues };
    browser_web_vital_fcp?: { values: K6MetricValues };
    browser_web_vital_cls?: { values: K6MetricValues };
    browser_web_vital_ttfb?: { values: K6MetricValues };
    browser_web_vital_inp?: { values: K6MetricValues };
    http_req_duration?: { values: K6MetricValues };
    http_reqs?: { values: K6MetricValues };
    vus?: { values: K6MetricValues };
    vus_max?: { values: K6MetricValues };
    iterations?: { values: K6MetricValues };
    [key: string]: any;
  };
  root_group?: {
    checks?: { name: string; passes: number; fails: number }[];
  };
}

export class K6BrowserAdapter implements TestRunner {
  readonly name = "k6_browser";
  readonly supports = ["desktop", "mobile"];

  async isAvailable(): Promise<boolean> {
    // Check env var first (dynamic read so restarts with new env work)
    let enabled = process.env.K6_BROWSER_ENABLED === "true";

    // Fallback: check the config API (Settings UI toggle sets engine.k6_browser_enabled)
    if (!enabled) {
      try {
        const res = await fetch(`${API_URL}/config/engine.k6_browser_enabled`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          enabled = data?.value === "true";
        }
      } catch { /* config API unreachable — use env only */ }
    }

    if (!enabled) return false;
    return new Promise((resolve) => {
      execFile(K6_BINARY, ["version"], { timeout: 5000 }, (err) => {
        resolve(!err);
      });
    });
  }

  async run(request: EngineRunRequest): Promise<EngineRunResult> {
    const startedAt = new Date().toISOString();
    const start = Date.now();

    const k6Request = request as K6RunRequest;
    const loadProfile = k6Request.load_profile ?? {
      stages: [{ duration_s: 30, target_vus: 1 }],
      target_vus: 1,
      cache_state: "warm" as const,
    };

    try {
      const scriptContent = this.generateK6Script(request, loadProfile);
      const tmpDir = join(tmpdir(), `k6-run-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      const scriptPath = join(tmpDir, "script.js");
      const summaryPath = join(tmpDir, "summary.json");
      writeFileSync(scriptPath, scriptContent, "utf-8");

      const summary = await this.executeK6(scriptPath, summaryPath);
      console.log(`[k6-adapter] Summary metric keys: ${Object.keys(summary.metrics ?? {}).join(", ")}`);
      const sampleKey = Object.keys(summary.metrics ?? {}).find(k => k.includes("lcp") || k.includes("LCP") || k.includes("web_vital"));
      if (sampleKey) console.log(`[k6-adapter] Sample metric "${sampleKey}":`, JSON.stringify(summary.metrics[sampleKey]));
      else console.log(`[k6-adapter] No web vital metrics found. Full keys:`, Object.keys(summary.metrics ?? {}));
      const metrics = this.extractMetrics(summary);
      console.log(`[k6-adapter] Extracted metrics:`, JSON.stringify(metrics));
      const individualRuns = this.buildIndividualRuns(summary, loadProfile);

      // Cleanup
      try { unlinkSync(scriptPath); unlinkSync(summaryPath); } catch { /* noop */ }

      return {
        success: true,
        url: request.url,
        n_runs: loadProfile.target_vus,
        device: request.device,
        metrics,
        individual_runs: individualRuns,
        duration_ms: Date.now() - start,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        success: false,
        url: request.url,
        n_runs: 0,
        device: request.device,
        metrics: {},
        individual_runs: [],
        error: err.message ?? String(err),
        duration_ms: Date.now() - start,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Generate a k6 browser script from the run request and load profile.
   */
  generateK6Script(request: EngineRunRequest, profile: K6LoadProfile): string {
    const k6Request = request as K6RunRequest;
    if (k6Request.script_steps && k6Request.script_steps.length > 0) {
      return this.generateJourneyK6Script(request, profile, k6Request.script_steps);
    }
    return this.generateSingleUrlK6Script(request, profile);
  }

  /**
   * Expand stages for k6: "step" ramp_type becomes an instant jump (1s) then
   * a hold, while "linear" (default) maps 1:1 to a k6 ramping-vus stage.
   */
  private expandStagesForK6(stages: K6Stage[], maxVUs: number): { duration: string; target: number }[] {
    const out: { duration: string; target: number }[] = [];
    for (const s of stages) {
      const cappedVUs = Math.min(s.target_vus, maxVUs);
      if (s.ramp_type === "step") {
        // Instant jump to target, then hold for the remainder
        out.push({ duration: "1s", target: cappedVUs });
        if (s.duration_s > 1) {
          out.push({ duration: `${s.duration_s - 1}s`, target: cappedVUs });
        }
      } else {
        out.push({ duration: `${s.duration_s}s`, target: cappedVUs });
      }
    }
    return out;
  }

  private generateSingleUrlK6Script(request: EngineRunRequest, profile: K6LoadProfile): string {
    // Cap concurrent browser VUs — each Chromium takes ~300-500MB RAM
    const maxBrowserVUs = parseInt(process.env.MAX_BROWSER_VUS || "2", 10);
    const expanded = this.expandStagesForK6(profile.stages, maxBrowserVUs);
    const stages = expanded.map(
      (s) => `{ duration: '${s.duration}', target: ${s.target} }`,
    ).join(",\n      ");

    const viewport = request.viewport ?? { width: 1920, height: 1080 };

    return `
import { browser } from 'k6/browser';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(75)', 'p(90)', 'p(95)', 'p(99)', 'count'],
  scenarios: {
    browser_test: {
      executor: 'ramping-vus',
      stages: [
      ${stages}
      ],
      gracefulStop: '10s',
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    'browser_web_vital_lcp': [{ threshold: 'p(95)<2500', abortOnFail: false }],
    'browser_web_vital_fcp': [{ threshold: 'p(95)<1800', abortOnFail: false }],
    'browser_web_vital_cls': [{ threshold: 'p(95)<0.1', abortOnFail: false }],
  },
};

export function handleSummary(data) {
  const path = __ENV.SUMMARY_PATH || '/tmp/k6-summary.json';
  return {
    [path]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: false }),
  };
}

export default async function () {
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: ${viewport.width}, height: ${viewport.height} });
    await page.goto('${request.url}', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    check(page, {
      'page loaded': (p) => p.url() !== 'about:blank',
    });
  } finally {
    try { await page.close(); } catch (_) { /* browser context may already be gone */ }
  }
}
`;
  }

  /**
   * Generate a multi-step journey k6 browser script from compiled steps.
   * Each VU executes the full journey; measure steps capture web vitals.
   */
  generateJourneyK6Script(
    request: EngineRunRequest,
    profile: K6LoadProfile,
    steps: K6ScriptStep[],
  ): string {
    // Cap concurrent browser VUs — each Chromium takes ~300-500MB RAM
    const maxBrowserVUs = parseInt(process.env.MAX_BROWSER_VUS || "2", 10);
    const expanded = this.expandStagesForK6(profile.stages, maxBrowserVUs);
    const stages = expanded.map(
      (s) => `{ duration: '${s.duration}', target: ${s.target} }`,
    ).join(",\n      ");

    const viewport = request.viewport ?? { width: 1920, height: 1080 };
    const escUrl = request.url.replace(/'/g, "\\'");

    // Build step code
    const stepCode = steps.map((step) => {
      const safeTarget = step.target.replace(/'/g, "\\'");
      const safeLabel = step.label.replace(/'/g, "\\'");
      switch (step.action) {
        case "visit":
          return `    await page.goto('${safeTarget}', { waitUntil: 'networkidle' });\n    await page.waitForTimeout(1000);`;
        case "click":
          return `    await page.locator('${safeTarget}').first().click();\n    await page.waitForTimeout(2000);`;
        case "fill":
          return `    await page.locator('${safeTarget}').first().fill('${(step.value ?? '').replace(/'/g, "\\\'")}');`;
        case "scroll":
          return `    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));\n    await page.waitForTimeout(500);`;
        case "wait_for":
          return `    await page.waitForTimeout(2000);`;
        case "measure":
          return `    // Measure: ${safeLabel}\n    await page.waitForTimeout(1000);\n    check(page, { '${safeLabel} loaded': (p) => p.url() !== 'about:blank' });`;
        default:
          return `    // Unknown step: ${safeLabel}`;
      }
    }).join("\n\n");

    return `
import { browser } from 'k6/browser';
import { check } from 'k6';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(75)', 'p(90)', 'p(95)', 'p(99)', 'count'],
  scenarios: {
    browser_journey: {
      executor: 'ramping-vus',
      stages: [
      ${stages}
      ],
      gracefulStop: '10s',
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    'browser_web_vital_lcp': [{ threshold: 'p(95)<2500', abortOnFail: false }],
    'browser_web_vital_fcp': [{ threshold: 'p(95)<1800', abortOnFail: false }],
    'browser_web_vital_cls': [{ threshold: 'p(95)<0.1', abortOnFail: false }],
  },
};

export function handleSummary(data) {
  const path = __ENV.SUMMARY_PATH || '/tmp/k6-summary.json';
  return {
    [path]: JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: false }),
  };
}

export default async function () {
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: ${viewport.width}, height: ${viewport.height} });
    await page.goto('${escUrl}', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

${stepCode}

  } finally {
    try { await page.close(); } catch (_) { /* browser context may already be gone */ }
  }
}
`;
  }

  /**
   * Execute k6 and parse the JSON summary output.
   */
  private executeK6(scriptPath: string, summaryPath: string): Promise<K6Summary> {
    return new Promise((resolve, reject) => {
      const args = [
        "run",
        scriptPath,
      ];
      const env = { ...process.env, SUMMARY_PATH: summaryPath };

      execFile(K6_BINARY, args, { timeout: 600_000, maxBuffer: 50 * 1024 * 1024, env }, (err, stdout, stderr) => {
        // k6 exits non-zero on threshold violations (code 99) or warnings.
        // If the summary file was written, the test completed — use it.
        try {
          const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
          resolve(summary);
          return;
        } catch {
          // Summary file missing or unparseable — fall through to error
        }
        if (err) {
          reject(new Error(`k6 execution failed: ${stderr || err.message}`));
          return;
        }
        reject(new Error("k6 finished but produced no summary output"));
      });
    });
  }

  /**
   * Extract aggregated metrics from k6 summary.
   * Stores both a top-level p95 value (backward-compat) and the full
   * percentile breakdown so the load-results service can display rich data.
   */
  private extractMetrics(summary: K6Summary): AggregatedMetrics {
    const m = summary.metrics;
    const pctVal = (v: any, p: string) => v?.[`p(${p})`] ?? v?.[`p${p}`];
    const val = (metric: any) => pctVal(metric?.values, "95") ?? metric?.values?.avg;

    const breakdown = (metric: any) => {
      const v = metric?.values;
      if (!v) return undefined;
      return {
        min: v.min,
        med: v.med,
        avg: v.avg,
        p75: pctVal(v, "75"),
        p90: pctVal(v, "90"),
        p95: pctVal(v, "95"),
        p99: pctVal(v, "99"),
        max: v.max,
        count: v.count,
      };
    };

    return {
      lcp_ms: val(m.browser_web_vital_lcp),
      fcp_ms: val(m.browser_web_vital_fcp),
      cls: val(m.browser_web_vital_cls),
      ttfb_ms: val(m.browser_web_vital_ttfb),
      inp_ms: val(m.browser_web_vital_inp),
      total_requests: m.http_reqs?.values?.count,
      percentiles: {
        lcp_ms: breakdown(m.browser_web_vital_lcp),
        fcp_ms: breakdown(m.browser_web_vital_fcp),
        cls: breakdown(m.browser_web_vital_cls),
        ttfb_ms: breakdown(m.browser_web_vital_ttfb),
        inp_ms: breakdown(m.browser_web_vital_inp),
      },
    };
  }

  /**
   * Build individual run results (one per VU iteration would be ideal;
   * k6 aggregates, so we create a single synthetic entry from the summary).
   */
  private buildIndividualRuns(summary: K6Summary, profile: K6LoadProfile): SingleRunResult[] {
    const m = summary.metrics;
    const med = (metric: any) => metric?.values?.med ?? metric?.values?.avg;
    return [{
      run_index: 0,
      web_vitals: {
        lcp_ms: med(m.browser_web_vital_lcp),
        fcp_ms: med(m.browser_web_vital_fcp),
        cls: med(m.browser_web_vital_cls),
        ttfb_ms: med(m.browser_web_vital_ttfb),
        inp_ms: med(m.browser_web_vital_inp),
      },
      lighthouse_scores: {},
      lighthouse_timings: {},
      total_requests: m.http_reqs?.values?.count ?? 0,
      total_transfer_size_bytes: 0,
    }];
  }

  /**
   * Check for saturation signals in the k6 summary.
   */
  checkSaturation(summary: K6Summary): { saturated: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const m = summary.metrics;

    // Check if http_req_duration p95 > 10s (likely saturated)
    const reqP95 = m.http_req_duration?.values?.["p(95)"] ?? m.http_req_duration?.values?.p95;
    if (reqP95 && reqP95 > 10000) {
      warnings.push(`HTTP request p95 duration ${reqP95.toFixed(0)}ms exceeds 10s threshold`);
    }

    // Check dropped iterations
    if (m.iterations?.values?.rate && m.vus_max?.values?.value) {
      const expectedRate = m.vus_max.values.value;
      if (m.iterations.values.rate < expectedRate * 0.5) {
        warnings.push(`Iteration rate ${m.iterations.values.rate.toFixed(1)}/s is below 50% of expected VU count`);
      }
    }

    return { saturated: warnings.length > 0, warnings };
  }
}

// Register with the global registry
const k6Adapter = new K6BrowserAdapter();
registry.register(k6Adapter);

export { k6Adapter };
