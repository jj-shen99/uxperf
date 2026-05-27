/**
 * Worker poll loop — claims queued runs from the API and executes them.
 *
 * Usage:
 *   npx tsx src/poll-loop.ts
 *
 * Environment:
 *   API_URL  — base URL of the API (default: http://localhost:4000/api/v1)
 *   POLL_INTERVAL_MS — poll interval in ms (default: 5000)
 */
import { runPlaywrightLighthouse } from "./engine/index";

const API_URL = process.env.API_URL ?? "http://localhost:4000/api/v1";
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);

interface ClaimedRun {
  id: string;
  project_id: string;
  script_id?: string;
  config: {
    url: string;
    device?: string;
    n_runs?: number;
    viewport?: { width: number; height: number };
  };
  environment: string;
}

async function claimRun(): Promise<ClaimedRun | null> {
  try {
    const res = await fetch(`${API_URL}/runs/claim`, { method: "POST" });
    if (!res.ok) {
      if (res.status === 201 || res.status === 200) return await res.json();
      return null;
    }
    const text = await res.text();
    if (!text || text === "null" || text === "") return null;
    return JSON.parse(text);
  } catch (e) {
    console.error(`[worker] Failed to claim run: ${e}`);
    return null;
  }
}

async function completeRun(
  runId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/runs/${runId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[worker] Failed to complete run ${runId}: ${res.status}`);
    }
  } catch (e) {
    console.error(`[worker] Error completing run ${runId}: ${e}`);
  }
}

async function postLog(runId: string, message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  console.log(`[worker] ${message}`);
  try {
    await fetch(`${API_URL}/runs/${runId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: line }),
    });
  } catch {
    // best-effort — don't block execution if log post fails
  }
}

async function executeRun(run: ClaimedRun): Promise<void> {
  const startedAt = new Date().toISOString();
  const nRuns = run.config.n_runs ?? 3;

  await postLog(run.id, `Starting run — URL: ${run.config.url}`);
  await postLog(run.id, `Config: ${nRuns} iteration(s), device: ${run.config.device ?? "desktop"}, env: ${run.environment}`);
  await postLog(run.id, `Engine: playwright_lighthouse`);

  try {
    await postLog(run.id, `Launching Chromium browser...`);

    const result = await runPlaywrightLighthouse(
      {
        url: run.config.url,
        n_runs: nRuns,
        device: (run.config.device as "desktop" | "mobile") ?? "desktop",
        viewport: run.config.viewport ?? { width: 1920, height: 1080 },
      },
      (msg) => postLog(run.id, msg),
    );

    if (result.success) {
      const m = result.metrics ?? {};
      await postLog(run.id, `Test completed successfully in ${(result.duration_ms / 1000).toFixed(1)}s`);
      await postLog(run.id, `Results — LCP: ${m.lcp_ms != null ? Math.round(m.lcp_ms as number) + "ms" : "N/A"}, FCP: ${m.fcp_ms != null ? Math.round(m.fcp_ms as number) + "ms" : "N/A"}, CLS: ${m.cls != null ? (m.cls as number).toFixed(3) : "N/A"}`);
      await postLog(run.id, `Lighthouse: ${m.lighthouse_performance_score != null ? Math.round((m.lighthouse_performance_score as number) * 100) + "/100" : "N/A"}`);
    } else {
      await postLog(run.id, `Test failed: ${result.error ?? "unknown error"}`);
    }

    // Extract lighthouse report from first individual run (if available)
    const lighthouseReport = result.individual_runs?.[0]?.lighthouse_report_json ?? null;

    await postLog(run.id, `Saving results...`);
    await completeRun(run.id, {
      success: result.success,
      metrics: result.metrics,
      lighthouse_report: lighthouseReport,
      error: result.error,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });

    await postLog(run.id, `Run finished.`);
  } catch (e) {
    await postLog(run.id, `Run crashed: ${e}`);
    await completeRun(run.id, {
      success: false,
      error: String(e),
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
  }
}

async function pollLoop(): Promise<void> {
  console.log(`[worker] Poll loop started — API: ${API_URL}, interval: ${POLL_INTERVAL}ms`);

  while (true) {
    const run = await claimRun();
    if (run) {
      await executeRun(run);
      // Check for more immediately
      continue;
    }
    // No work — wait before polling again
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

pollLoop().catch((e) => {
  console.error(`[worker] Fatal error: ${e}`);
  process.exit(1);
});
