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
const K6_BROWSER_ENABLED = process.env.K6_BROWSER_ENABLED === "true";

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

export interface K6Summary {
  metrics: {
    browser_web_vital_lcp?: { values: { avg: number; p95: number; med: number } };
    browser_web_vital_fcp?: { values: { avg: number; p95: number; med: number } };
    browser_web_vital_cls?: { values: { avg: number; p95: number; med: number } };
    browser_web_vital_ttfb?: { values: { avg: number; p95: number; med: number } };
    browser_web_vital_inp?: { values: { avg: number; p95: number; med: number } };
    http_req_duration?: { values: { avg: number; p95: number; p99: number; med: number } };
    http_reqs?: { values: { count: number; rate: number } };
    vus?: { values: { value: number; max: number } };
    vus_max?: { values: { value: number } };
    iterations?: { values: { count: number; rate: number } };
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
    if (!K6_BROWSER_ENABLED) return false;
    return new Promise((resolve) => {
      execFile(K6_BINARY, ["version"], (err) => {
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
      const metrics = this.extractMetrics(summary);
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
   * Generate a single-URL k6 browser script.
   */
  private generateSingleUrlK6Script(request: EngineRunRequest, profile: K6LoadProfile): string {
    const stages = profile.stages.map(
      (s) => `{ duration: '${s.duration_s}s', target: ${s.target_vus} }`,
    ).join(",\n      ");

    const viewport = request.viewport ?? { width: 1920, height: 1080 };

    return `
import { browser } from 'k6/browser';
import { check } from 'k6';

export const options = {
  scenarios: {
    browser_test: {
      executor: 'ramping-vus',
      stages: [
      ${stages}
      ],
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    'browser_web_vital_lcp': ['p(95)<2500'],
    'browser_web_vital_fcp': ['p(95)<1800'],
    'browser_web_vital_cls': ['p(95)<0.1'],
  },
};

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
    await page.close();
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
    const stages = profile.stages.map(
      (s) => `{ duration: '${s.duration_s}s', target: ${s.target_vus} }`,
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

export const options = {
  scenarios: {
    browser_journey: {
      executor: 'ramping-vus',
      stages: [
      ${stages}
      ],
      options: {
        browser: {
          type: 'chromium',
        },
      },
    },
  },
  thresholds: {
    'browser_web_vital_lcp': ['p(95)<2500'],
    'browser_web_vital_fcp': ['p(95)<1800'],
    'browser_web_vital_cls': ['p(95)<0.1'],
  },
};

export default async function () {
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width: ${viewport.width}, height: ${viewport.height} });
    await page.goto('${escUrl}', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

${stepCode}

  } finally {
    await page.close();
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
        "--summary-export", summaryPath,
        "--out", "json=stdout",
        scriptPath,
      ];

      execFile(K6_BINARY, args, { timeout: 600_000 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`k6 execution failed: ${stderr || err.message}`));
          return;
        }
        try {
          const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
          resolve(summary);
        } catch (parseErr: any) {
          reject(new Error(`Failed to parse k6 summary: ${parseErr.message}`));
        }
      });
    });
  }

  /**
   * Extract aggregated metrics from k6 summary.
   */
  private extractMetrics(summary: K6Summary): AggregatedMetrics {
    const m = summary.metrics;
    return {
      lcp_ms: m.browser_web_vital_lcp?.values?.p95 ?? m.browser_web_vital_lcp?.values?.avg,
      fcp_ms: m.browser_web_vital_fcp?.values?.p95 ?? m.browser_web_vital_fcp?.values?.avg,
      cls: m.browser_web_vital_cls?.values?.p95 ?? m.browser_web_vital_cls?.values?.avg,
      ttfb_ms: m.browser_web_vital_ttfb?.values?.p95 ?? m.browser_web_vital_ttfb?.values?.avg,
      inp_ms: m.browser_web_vital_inp?.values?.p95 ?? m.browser_web_vital_inp?.values?.avg,
      total_requests: m.http_reqs?.values?.count,
    };
  }

  /**
   * Build individual run results (one per VU iteration would be ideal;
   * k6 aggregates, so we create a single synthetic entry from the summary).
   */
  private buildIndividualRuns(summary: K6Summary, profile: K6LoadProfile): SingleRunResult[] {
    const m = summary.metrics;
    return [{
      run_index: 0,
      web_vitals: {
        lcp_ms: m.browser_web_vital_lcp?.values?.med,
        fcp_ms: m.browser_web_vital_fcp?.values?.med,
        cls: m.browser_web_vital_cls?.values?.med,
        ttfb_ms: m.browser_web_vital_ttfb?.values?.med,
        inp_ms: m.browser_web_vital_inp?.values?.med,
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
    if (m.http_req_duration?.values?.p95 && m.http_req_duration.values.p95 > 10000) {
      warnings.push(`HTTP request p95 duration ${m.http_req_duration.values.p95.toFixed(0)}ms exceeds 10s threshold`);
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
