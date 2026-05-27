import { chromium } from "playwright";
import type {
  EngineRunRequest,
  EngineRunResult,
  SingleRunResult,
  AggregatedMetrics,
  LighthouseScores,
  LighthouseTimings,
} from "./types";
import {
  collectWebVitals,
  collectPageTimings,
  collectResourceSummary,
} from "./metrics-collector";
import { median, aggregateResults } from "./stats";

/**
 * Run Lighthouse against a URL using the provided Chrome port.
 * Lighthouse is imported dynamically because it's ESM-only.
 */
async function runLighthouse(
  url: string,
  port: number,
  device: "desktop" | "mobile"
): Promise<{
  scores: LighthouseScores;
  timings: LighthouseTimings;
  report: unknown;
}> {
  const lighthouse = (await import("lighthouse")).default;

  const flags = {
    port,
    output: "json" as const,
    logLevel: "error" as const,
    onlyCategories: [
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ],
  };

  const config =
    device === "desktop"
      ? (await import("lighthouse/core/config/desktop-config.js")).default
      : undefined;

  const result = await lighthouse(url, flags, config);

  if (!result || !result.lhr) {
    return {
      scores: {},
      timings: {},
      report: null,
    };
  }

  const lhr = result.lhr;

  const scores: LighthouseScores = {
    performance: lhr.categories?.performance?.score ?? undefined,
    accessibility: lhr.categories?.accessibility?.score ?? undefined,
    best_practices: lhr.categories?.["best-practices"]?.score ?? undefined,
    seo: lhr.categories?.seo?.score ?? undefined,
  };

  const audits = lhr.audits ?? {};
  const timings: LighthouseTimings = {
    fcp_ms: audits["first-contentful-paint"]?.numericValue,
    lcp_ms: audits["largest-contentful-paint"]?.numericValue,
    si_ms: audits["speed-index"]?.numericValue,
    tti_ms: audits["interactive"]?.numericValue,
    tbt_ms: audits["total-blocking-time"]?.numericValue,
    cls: audits["cumulative-layout-shift"]?.numericValue,
    ttfb_ms: audits["server-response-time"]?.numericValue,
  };

  return { scores, timings, report: lhr };
}

/**
 * Execute a single performance run: Playwright navigation + Lighthouse audit.
 *
 * This is the Engine PoC described in Phase 0 (§14.1):
 *   - Playwright drives a real Chromium session
 *   - Collects Core Web Vitals via browser APIs (Layer A, §6.4)
 *   - Runs Lighthouse for scoring and additional timing data
 *   - Emits structured metrics
 */
async function executeSingleRun(
  request: EngineRunRequest,
  runIndex: number
): Promise<SingleRunResult> {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      `--remote-debugging-port=${9222 + runIndex}`,
    ],
  });

  try {
    const context = await browser.newContext({
      viewport: request.viewport,
      userAgent:
        request.device === "mobile"
          ? "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          : undefined,
    });

    const page = await context.newPage();

    // Navigate and wait for load event (not networkidle — heavy sites never
    // reach networkidle due to continuous background requests like analytics,
    // chat widgets, etc.)
    await page.goto(request.url, {
      waitUntil: "load",
      timeout: 90_000,
    });

    // Allow page to settle for LCP/CLS observation
    await page.waitForTimeout(2000);

    // Collect metrics via browser APIs (Layer A)
    const [webVitals, pageTimings, resourceSummary] = await Promise.all([
      collectWebVitals(page),
      collectPageTimings(page),
      collectResourceSummary(page),
    ]);

    await context.close();

    // Run Lighthouse on the same URL using a fresh Chrome via chrome-launcher
    let lighthouseResult: {
      scores: LighthouseScores;
      timings: LighthouseTimings;
      report: unknown;
    } = { scores: {}, timings: {}, report: null };

    try {
      const chromeLauncher = await import("chrome-launcher");
      const chrome = await chromeLauncher.launch({
        chromeFlags: [
          "--headless",
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
        ],
      });

      try {
        lighthouseResult = await runLighthouse(
          request.url,
          chrome.port,
          request.device
        );
      } finally {
        await chrome.kill();
      }
    } catch (err) {
      console.warn(
        `Lighthouse run ${runIndex} failed:`,
        err instanceof Error ? err.message : err
      );
    }

    return {
      run_index: runIndex,
      web_vitals: webVitals,
      lighthouse_scores: lighthouseResult.scores,
      lighthouse_timings: lighthouseResult.timings,
      total_requests: resourceSummary.total_requests,
      total_transfer_size_bytes: resourceSummary.total_transfer_size_bytes,
      dom_content_loaded_ms: pageTimings.dom_content_loaded_ms,
      load_event_ms: pageTimings.load_event_ms,
      lighthouse_report_json: lighthouseResult.report,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Main engine entry point.
 * Runs Playwright + Lighthouse N times, aggregates via median, returns structured result.
 */
export async function runPlaywrightLighthouse(
  request: EngineRunRequest,
  onProgress?: (message: string) => void | Promise<void>,
): Promise<EngineRunResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const individualRuns: SingleRunResult[] = [];

  console.log(
    `Starting ${request.n_runs} run(s) against ${request.url} [${request.device}]`
  );

  try {
    for (let i = 0; i < request.n_runs; i++) {
      const iterMsg = `Iteration ${i + 1}/${request.n_runs}`;
      console.log(`  Run ${i + 1}/${request.n_runs}...`);
      await onProgress?.(`${iterMsg} — starting...`);
      const iterStart = Date.now();
      const result = await executeSingleRun(request, i);
      individualRuns.push(result);
      const iterSec = ((Date.now() - iterStart) / 1000).toFixed(1);
      const lcp = result.web_vitals.lcp_ms?.toFixed(0) ?? "n/a";
      const fcp = result.web_vitals.fcp_ms?.toFixed(0) ?? "n/a";
      const lhPerf = ((result.lighthouse_scores.performance ?? 0) * 100).toFixed(0);
      console.log(
        `  Run ${i + 1} complete — LCP: ${lcp}ms, FCP: ${fcp}ms, LH Perf: ${lhPerf}`
      );
      await onProgress?.(`${iterMsg} — done in ${iterSec}s (LCP: ${lcp}ms, FCP: ${fcp}ms, LH: ${lhPerf})`);
    }

    const metrics = aggregateResults(individualRuns);
    const finishedAt = new Date().toISOString();

    return {
      success: true,
      url: request.url,
      n_runs: request.n_runs,
      device: request.device,
      metrics,
      individual_runs: individualRuns,
      duration_ms: Date.now() - startMs,
      started_at: startedAt,
      finished_at: finishedAt,
    };
  } catch (err) {
    const finishedAt = new Date().toISOString();
    return {
      success: false,
      url: request.url,
      n_runs: request.n_runs,
      device: request.device,
      metrics: {},
      individual_runs: individualRuns,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - startMs,
      started_at: startedAt,
      finished_at: finishedAt,
    };
  }
}
