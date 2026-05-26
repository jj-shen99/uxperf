/**
 * WebPageTest (WPT) private-instance engine adapter.
 * Opt-in, rate-limited integration per §14.3.
 *
 * Environment:
 *   WPT_SERVER  — WPT instance URL (e.g. https://wpt.example.com)
 *   WPT_API_KEY — API key for the WPT instance
 */
import type { TestRunner } from "../test-runner";
import type {
  EngineRunRequest,
  EngineRunResult,
  AggregatedMetrics,
  SingleRunResult,
} from "../types";
import { registry } from "../test-runner";

const WPT_SERVER = process.env.WPT_SERVER ?? "";
const WPT_API_KEY = process.env.WPT_API_KEY ?? "";
const WPT_POLL_INTERVAL_MS = 10_000;
const WPT_MAX_WAIT_MS = 300_000; // 5 minutes max wait

interface WptTestResult {
  data: {
    id: string;
    statusCode: number;
    statusText: string;
    median?: {
      firstView?: {
        TTFB?: number;
        firstContentfulPaint?: number;
        largestContentfulPaint?: number;
        cumulativeLayoutShift?: number;
        totalBlockingTime?: number;
        SpeedIndex?: number;
        loadTime?: number;
        fullyLoaded?: number;
        requests?: number;
        bytesIn?: number;
        domContentLoadedEventStart?: number;
      };
    };
  };
}

export class WptAdapter implements TestRunner {
  readonly name = "wpt";
  readonly supports = ["desktop", "mobile"];

  async run(request: EngineRunRequest): Promise<EngineRunResult> {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    try {
      const testId = await this.submitTest(request);
      const result = await this.pollForResult(testId);
      const metrics = this.extractMetrics(result);

      return {
        success: true,
        url: request.url,
        n_runs: request.n_runs,
        device: request.device,
        metrics,
        individual_runs: [],
        duration_ms: Date.now() - startMs,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      };
    } catch (err) {
      return {
        success: false,
        url: request.url,
        n_runs: request.n_runs,
        device: request.device,
        metrics: {},
        individual_runs: [],
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - startMs,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!WPT_SERVER || !WPT_API_KEY) return false;
    try {
      const res = await fetch(`${WPT_SERVER}/getTesters.php?f=json&k=${WPT_API_KEY}`, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async submitTest(request: EngineRunRequest): Promise<string> {
    const params = new URLSearchParams({
      url: request.url,
      f: "json",
      k: WPT_API_KEY,
      runs: String(request.n_runs),
      fvonly: "1",
      lighthouse: "1",
      ...(request.device === "mobile"
        ? { mobile: "1", mobileDevice: "Pixel5" }
        : {}),
    });

    const res = await fetch(`${WPT_SERVER}/runtest.php?${params}`);
    if (!res.ok) {
      throw new Error(`WPT submit failed: ${res.status} ${res.statusText}`);
    }

    const body = await res.json();
    if (body.statusCode !== 200) {
      throw new Error(`WPT submit error: ${body.statusText}`);
    }

    return body.data.testId;
  }

  private async pollForResult(testId: string): Promise<WptTestResult> {
    const deadline = Date.now() + WPT_MAX_WAIT_MS;

    while (Date.now() < deadline) {
      const res = await fetch(
        `${WPT_SERVER}/jsonResult.php?test=${testId}&f=json&k=${WPT_API_KEY}`,
      );

      if (res.ok) {
        const body = await res.json();
        if (body.statusCode === 200) return body as WptTestResult;
        if (body.statusCode >= 400) {
          throw new Error(`WPT test failed: ${body.statusText}`);
        }
      }

      await new Promise((r) => setTimeout(r, WPT_POLL_INTERVAL_MS));
    }

    throw new Error(`WPT test ${testId} timed out after ${WPT_MAX_WAIT_MS}ms`);
  }

  private extractMetrics(result: WptTestResult): AggregatedMetrics {
    const fv = result.data?.median?.firstView;
    if (!fv) return {};

    return {
      ttfb_ms: fv.TTFB,
      fcp_ms: fv.firstContentfulPaint,
      lcp_ms: fv.largestContentfulPaint,
      cls: fv.cumulativeLayoutShift != null
        ? fv.cumulativeLayoutShift / 1000
        : undefined,
      tbt_ms: fv.totalBlockingTime,
      si_ms: fv.SpeedIndex,
      dom_content_loaded_ms: fv.domContentLoadedEventStart,
      load_event_ms: fv.loadTime,
      total_requests: fv.requests,
      total_transfer_size_bytes: fv.bytesIn,
    };
  }
}

// Auto-register on import
registry.register(new WptAdapter());
