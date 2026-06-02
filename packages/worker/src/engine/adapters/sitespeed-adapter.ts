/**
 * E-69: sitespeed.io engine adapter (real implementation).
 *
 * Integrates with sitespeed.io CLI or Docker container for synthetic
 * performance testing. Parses the JSON output files to extract web vitals,
 * Lighthouse-style timings, and page load metrics.
 *
 * Environment:
 *   SITESPEED_ENABLED      — set to "true" to enable
 *   SITESPEED_DOCKER_IMAGE — Docker image (default: sitespeedio/sitespeed.io:latest)
 *   SITESPEED_CLI_PATH     — path to local sitespeed.io binary (alternative to Docker)
 *   SITESPEED_USE_DOCKER   — "true" to run via Docker (default: false = CLI)
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
import { mkdirSync, readFileSync, existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SITESPEED_ENABLED = process.env.SITESPEED_ENABLED === "true";
const SITESPEED_DOCKER_IMAGE = process.env.SITESPEED_DOCKER_IMAGE ?? "sitespeedio/sitespeed.io:latest";
const SITESPEED_CLI_PATH = process.env.SITESPEED_CLI_PATH ?? "sitespeed.io";
const SITESPEED_USE_DOCKER = process.env.SITESPEED_USE_DOCKER === "true";

/** Parsed page-level result from sitespeed.io JSON output. */
export interface SitespeedPageResult {
  browserScripts?: {
    timings?: {
      firstPaint?: number;
      paintTiming?: { "first-contentful-paint"?: number };
      largestContentfulPaint?: { renderTime?: number; loadTime?: number };
      navigationTiming?: {
        domContentLoadedEventEnd?: number;
        loadEventEnd?: number;
        responseStart?: number;
        fetchStart?: number;
      };
    };
    pageinfo?: {
      cumulativeLayoutShift?: number;
      longTasks?: { totalBlockingTime?: number };
    };
  };
  statistics?: {
    timings?: {
      firstPaint?: { median?: number };
      paintTiming?: { "first-contentful-paint"?: { median?: number } };
      largestContentfulPaint?: { renderTime?: { median?: number } };
      navigationTiming?: {
        responseStart?: { median?: number };
        domContentLoadedEventEnd?: { median?: number };
        loadEventEnd?: { median?: number };
      };
    };
    pageinfo?: {
      cumulativeLayoutShift?: { median?: number };
      longTasks?: { totalBlockingTime?: { median?: number } };
    };
    requests?: { total?: { median?: number } };
    transferSize?: { total?: { median?: number } };
  };
}

export class SitespeedAdapter implements TestRunner {
  readonly name = "sitespeed";
  readonly supports = ["desktop", "mobile"];

  async isAvailable(): Promise<boolean> {
    if (!SITESPEED_ENABLED) return false;
    if (SITESPEED_USE_DOCKER) {
      return this.checkDocker();
    }
    return this.checkCli();
  }

  async run(request: EngineRunRequest): Promise<EngineRunResult> {
    const startedAt = new Date().toISOString();
    const start = Date.now();
    const outputDir = join(tmpdir(), `sitespeed-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });

    try {
      await this.executeSitespeed(request, outputDir);
      const pageResults = this.parseResults(outputDir, request.url);
      const metrics = this.aggregateMetrics(pageResults);
      const individualRuns = this.buildIndividualRuns(pageResults);

      this.cleanup(outputDir);

      return {
        success: true,
        url: request.url,
        n_runs: request.n_runs,
        device: request.device,
        metrics,
        individual_runs: individualRuns,
        duration_ms: Date.now() - start,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      };
    } catch (err: any) {
      this.cleanup(outputDir);
      return {
        success: false,
        url: request.url,
        n_runs: request.n_runs,
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

  /** Build CLI arguments for sitespeed.io. */
  buildArgs(request: EngineRunRequest, outputDir: string): string[] {
    const args = [
      request.url,
      "--outputFolder", outputDir,
      "-n", String(request.n_runs),
      "--browsertime.headless", "true",
    ];

    if (request.device === "mobile") {
      args.push(
        "--mobile",
        "--browsertime.viewPort", `${request.viewport?.width ?? 375}x${request.viewport?.height ?? 812}`,
      );
    } else {
      args.push(
        "--browsertime.viewPort", `${request.viewport?.width ?? 1920}x${request.viewport?.height ?? 1080}`,
      );
    }

    if (request.throttling) {
      if (request.throttling.cpu_slowdown) {
        args.push("--browsertime.chrome.CPUThrottlingRate", String(request.throttling.cpu_slowdown));
      }
      if (request.throttling.download_kbps || request.throttling.upload_kbps || request.throttling.latency_ms) {
        args.push(
          "--connectivity.profile", "custom",
          "--connectivity.downstreamKbps", String(request.throttling.download_kbps ?? 10000),
          "--connectivity.upstreamKbps", String(request.throttling.upload_kbps ?? 5000),
          "--connectivity.latency", String(request.throttling.latency_ms ?? 28),
        );
      }
    }

    return args;
  }

  /** Execute sitespeed.io via CLI or Docker. */
  private executeSitespeed(request: EngineRunRequest, outputDir: string): Promise<void> {
    const args = this.buildArgs(request, outputDir);

    if (SITESPEED_USE_DOCKER) {
      return this.executeDocker(args, outputDir);
    }
    return this.executeCli(args);
  }

  /** Run via local sitespeed.io CLI. */
  private executeCli(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(SITESPEED_CLI_PATH, args, { timeout: 300_000 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`sitespeed.io CLI failed: ${stderr || err.message}`));
          return;
        }
        resolve();
      });
    });
  }

  /** Run via Docker. */
  private executeDocker(args: string[], outputDir: string): Promise<void> {
    const dockerArgs = [
      "run", "--rm",
      "-v", `${outputDir}:/sitespeed.io/sitespeed-result`,
      SITESPEED_DOCKER_IMAGE,
      ...args,
      "--outputFolder", "/sitespeed.io/sitespeed-result",
    ];
    return new Promise((resolve, reject) => {
      execFile("docker", dockerArgs, { timeout: 600_000 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`sitespeed.io Docker failed: ${stderr || err.message}`));
          return;
        }
        resolve();
      });
    });
  }

  /** Parse sitespeed.io JSON result files from the output directory. */
  parseResults(outputDir: string, url: string): SitespeedPageResult[] {
    const results: SitespeedPageResult[] = [];

    // sitespeed.io writes results to pages/<domain>/<path>/
    const pagesDir = join(outputDir, "pages");
    if (!existsSync(pagesDir)) return results;

    const walkDir = (dir: string): void => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath);
          } else if (entry.name === "browsertime.pageSummary.json" || entry.name === "browsertime.run.json") {
            try {
              const raw = readFileSync(fullPath, "utf-8");
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                results.push(...parsed);
              } else {
                results.push(parsed);
              }
            } catch { /* skip unparseable files */ }
          }
        }
      } catch { /* skip unreadable dirs */ }
    };

    walkDir(pagesDir);
    return results;
  }

  /** Aggregate metrics across all page results (using statistics if available). */
  aggregateMetrics(results: SitespeedPageResult[]): AggregatedMetrics {
    if (results.length === 0) return {};

    // Prefer statistics (median across runs) from the summary
    const stats = results.find((r) => r.statistics)?.statistics;
    if (stats) {
      return {
        fcp_ms: stats.timings?.paintTiming?.["first-contentful-paint"]?.median ?? undefined,
        lcp_ms: stats.timings?.largestContentfulPaint?.renderTime?.median ?? undefined,
        ttfb_ms: stats.timings?.navigationTiming?.responseStart?.median ?? undefined,
        cls: stats.pageinfo?.cumulativeLayoutShift?.median ?? undefined,
        tbt_ms: stats.pageinfo?.longTasks?.totalBlockingTime?.median ?? undefined,
        dom_content_loaded_ms: stats.timings?.navigationTiming?.domContentLoadedEventEnd?.median ?? undefined,
        load_event_ms: stats.timings?.navigationTiming?.loadEventEnd?.median ?? undefined,
        total_requests: stats.requests?.total?.median ?? undefined,
        total_transfer_size_bytes: stats.transferSize?.total?.median ?? undefined,
      };
    }

    // Fallback: extract from the first browserScripts entry
    const first = results.find((r) => r.browserScripts);
    if (!first?.browserScripts) return {};

    const timings = first.browserScripts.timings;
    const pageinfo = first.browserScripts.pageinfo;
    const navTiming = timings?.navigationTiming;

    return {
      fcp_ms: timings?.paintTiming?.["first-contentful-paint"] ?? undefined,
      lcp_ms: timings?.largestContentfulPaint?.renderTime ?? timings?.largestContentfulPaint?.loadTime ?? undefined,
      ttfb_ms: navTiming ? (navTiming.responseStart ?? 0) - (navTiming.fetchStart ?? 0) : undefined,
      cls: pageinfo?.cumulativeLayoutShift ?? undefined,
      tbt_ms: pageinfo?.longTasks?.totalBlockingTime ?? undefined,
      dom_content_loaded_ms: navTiming?.domContentLoadedEventEnd ?? undefined,
      load_event_ms: navTiming?.loadEventEnd ?? undefined,
    };
  }

  /** Build individual run results from parsed page data. */
  buildIndividualRuns(results: SitespeedPageResult[]): SingleRunResult[] {
    return results
      .filter((r) => r.browserScripts)
      .map((r, i) => {
        const timings = r.browserScripts!.timings;
        const pageinfo = r.browserScripts!.pageinfo;
        const navTiming = timings?.navigationTiming;

        return {
          run_index: i,
          web_vitals: {
            fcp_ms: timings?.paintTiming?.["first-contentful-paint"],
            lcp_ms: timings?.largestContentfulPaint?.renderTime ?? timings?.largestContentfulPaint?.loadTime,
            ttfb_ms: navTiming ? (navTiming.responseStart ?? 0) - (navTiming.fetchStart ?? 0) : undefined,
            cls: pageinfo?.cumulativeLayoutShift,
          },
          lighthouse_scores: {},
          lighthouse_timings: {
            fcp_ms: timings?.paintTiming?.["first-contentful-paint"],
            lcp_ms: timings?.largestContentfulPaint?.renderTime,
            cls: pageinfo?.cumulativeLayoutShift,
            tbt_ms: pageinfo?.longTasks?.totalBlockingTime,
            ttfb_ms: navTiming ? (navTiming.responseStart ?? 0) - (navTiming.fetchStart ?? 0) : undefined,
          },
          total_requests: 0,
          total_transfer_size_bytes: 0,
          dom_content_loaded_ms: navTiming?.domContentLoadedEventEnd,
          load_event_ms: navTiming?.loadEventEnd,
        };
      });
  }

  /** Check if Docker is available with the sitespeed.io image. */
  private checkDocker(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile("docker", ["image", "inspect", SITESPEED_DOCKER_IMAGE], (err) => {
        resolve(!err);
      });
    });
  }

  /** Check if sitespeed.io CLI is available. */
  private checkCli(): Promise<boolean> {
    return new Promise((resolve) => {
      execFile(SITESPEED_CLI_PATH, ["--version"], (err) => {
        resolve(!err);
      });
    });
  }

  /** Remove temporary output directory. */
  private cleanup(dir: string): void {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch { /* noop */ }
  }
}

// Auto-register on import
registry.register(new SitespeedAdapter());
