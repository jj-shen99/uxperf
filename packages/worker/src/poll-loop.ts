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
import { runPlaywrightLighthouse, executeJourney } from "./engine/index";
import { K6BrowserAdapter } from "./engine/adapters/k6-browser-adapter";
import type { K6RunRequest, K6ScriptStep } from "./engine/adapters/k6-browser-adapter";
import type { CompiledStep, JourneyDefinition, StepAction } from "./engine/journey/types";

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

async function fetchScript(scriptId: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_URL}/scripts/${scriptId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Convert NL-authored script steps (intent/locators) to CompiledStep[]
 * that the journey executor understands.
 */
function convertToCompiledSteps(
  nlSteps: { intent: string; locators?: any }[],
  targetUrl: string,
): CompiledStep[] {
  const compiled: CompiledStep[] = [];

  for (let i = 0; i < nlSteps.length; i++) {
    const s = nlSteps[i];
    const intent = s.intent ?? "";
    const lower = intent.toLowerCase();

    if (/^measure/i.test(lower)) {
      compiled.push({ index: i, action: "measure", target: "measure", label: intent });
    } else if (/\b(navigate back|go back|return to)\b/i.test(lower)) {
      const url = intent.match(/https?:\/\/[^\s'"]+/)?.[0] ?? targetUrl;
      compiled.push({ index: i, action: "visit", target: url, label: intent });
    } else if (/\b(go to|navigate|visit|open|load)\b/i.test(lower)) {
      const url = intent.match(/https?:\/\/[^\s'"]+/)?.[0] ?? targetUrl;
      compiled.push({ index: i, action: "visit", target: url, label: intent });
    } else if (/\b(click|tap|press|submit|select)\b/i.test(lower)) {
      const quoted = intent.match(/["'](.+?)["']/)?.[1];
      const locator = s.locators?.primary?.selector;
      const target = locator ?? quoted ?? intent.replace(/^click\s+(on\s+)?/i, "").trim();
      compiled.push({ index: i, action: "click", target, label: intent });
    } else if (/\b(type|fill|enter|input|write)\b/i.test(lower)) {
      const m = intent.match(/["'](.+?)["'].*?(?:into|in)\s+(.+)/i);
      compiled.push({
        index: i,
        action: "fill",
        target: m?.[2]?.trim() ?? "input",
        value: m?.[1] ?? "test",
        label: intent,
      });
    } else if (/\b(wait|pause|settle)\b/i.test(lower)) {
      compiled.push({ index: i, action: "wait_for", target: "body", label: intent });
    } else if (/\b(scroll|swipe)\b/i.test(lower)) {
      compiled.push({ index: i, action: "scroll", target: "bottom", label: intent });
    } else {
      // Default: treat as click
      const quoted = intent.match(/["'](.+?)["']/)?.[1];
      compiled.push({ index: i, action: "click", target: quoted ?? intent, label: intent });
    }
  }
  return compiled;
}

/**
 * Check if a script has explicit measure steps.
 */
function hasJourneyMeasureSteps(steps: any[]): boolean {
  return steps.some((s: any) => /^measure/i.test((s.intent ?? "").trim()));
}

/**
 * Auto-inject measure steps after navigation/click steps when no explicit
 * measure intents exist. This ensures per-link web vitals are always captured.
 */
function autoInjectMeasureSteps(
  steps: { intent: string; locators?: any }[],
): { intent: string; locators?: any }[] {
  if (hasJourneyMeasureSteps(steps)) return steps;

  const result: { intent: string; locators?: any }[] = [];
  for (const step of steps) {
    result.push(step);
    const lower = (step.intent ?? "").toLowerCase();
    // After navigation or click steps, auto-insert a measure step
    if (/\b(go to|navigate|visit|open|load|click|tap|press|submit)\b/i.test(lower)) {
      const label = (step.intent.match(/["'](.+?)["']/)?.[1]
        ?? step.intent.replace(/^(click|navigate|go to|visit|open|load|tap|press|submit)\s+(on\s+|to\s+)?/i, "").trim())
        || `after step ${result.length}`;
      result.push({ intent: `measure: "${label}"` });
    }
  }
  return result;
}

async function executeRun(run: ClaimedRun): Promise<void> {
  const startedAt = new Date().toISOString();
  const nRuns = run.config.n_runs ?? 3;

  await postLog(run.id, `Starting run — URL: ${run.config.url}`);
  await postLog(run.id, `Config: ${nRuns} iteration(s), device: ${run.config.device ?? "desktop"}, env: ${run.environment}`);

  // Check if this run has a multi-step journey script
  let script: any = null;
  if (run.script_id) {
    await postLog(run.id, `Fetching script ${run.script_id}...`);
    script = await fetchScript(run.script_id);
  }

  const nlSteps = script?.canonical_json?.steps ?? [];
  const useJourney = nlSteps.length > 0;

  if (useJourney) {
    // Auto-inject measure steps if the script doesn't have any
    if (!hasJourneyMeasureSteps(nlSteps)) {
      await postLog(run.id, `Script has ${nlSteps.length} step(s) but no measure intents — auto-injecting measure steps`);
      script = {
        ...script,
        canonical_json: {
          ...script.canonical_json,
          steps: autoInjectMeasureSteps(nlSteps),
        },
      };
      const injectedSteps = script.canonical_json.steps;
      const measureCount = injectedSteps.filter((s: any) => /^measure/i.test(s.intent ?? "")).length;
      await postLog(run.id, `Injected ${measureCount} measure step(s) → ${injectedSteps.length} total steps`);
    }
    await postLog(run.id, `Engine: journey (${script.canonical_json.steps.length} steps, multi-link)`);
    await executeJourneyRun(run, script, startedAt);
  } else {
    await postLog(run.id, `Engine: playwright_lighthouse`);
    await executeSingleUrlRun(run, nRuns, startedAt);
  }
}

/**
 * Execute a multi-step journey run using the journey executor.
 */
async function executeJourneyRun(
  run: ClaimedRun,
  script: any,
  startedAt: string,
): Promise<void> {
  try {
    const targetUrl = script.canonical_json?.target_url ?? run.config.url;
    const nlSteps = script.canonical_json?.steps ?? [];
    const compiledSteps = convertToCompiledSteps(nlSteps, targetUrl);
    const device = (run.config.device as "desktop" | "mobile") ?? "desktop";

    const definition: JourneyDefinition = {
      name: script.name ?? "NL Journey",
      target: targetUrl,
      device,
      viewport: run.config.viewport ?? (device === "mobile" ? { width: 375, height: 812 } : { width: 1920, height: 1080 }),
      screenshots: true,
      stages: [],
    };

    await postLog(run.id, `Launching Chromium browser for journey...`);
    await postLog(run.id, `Steps: ${compiledSteps.map((s) => s.label).join(" → ")}`);

    const pw = await import("playwright");
    const browser = await pw.chromium.launch({ headless: true });

    try {
      const journeyResult = await executeJourney(
        browser,
        definition,
        compiledSteps,
        { screenshots: true },
        (msg) => postLog(run.id, msg),
      );

      // Build metrics from first measurement (primary page metrics)
      const primaryMeasure = journeyResult.measurements[0];
      const metrics: Record<string, unknown> = {
        ...(primaryMeasure?.web_vitals ?? {}),
        measurements: journeyResult.measurements,
        journey_steps: journeyResult.steps.length,
        journey_success: journeyResult.success,
        journey_duration_ms: journeyResult.total_duration_ms,
      };

      if (journeyResult.success) {
        await postLog(run.id, `Journey completed: ${journeyResult.measurements.length} measurement(s) in ${(journeyResult.total_duration_ms / 1000).toFixed(1)}s`);
        for (const m of journeyResult.measurements) {
          const wv = m.web_vitals;
          await postLog(run.id, `  ${m.label} — LCP: ${wv.lcp_ms != null ? Math.round(wv.lcp_ms) + "ms" : "—"}, FCP: ${wv.fcp_ms != null ? Math.round(wv.fcp_ms) + "ms" : "—"}, CLS: ${wv.cls?.toFixed(3) ?? "—"}`);
        }
      } else {
        await postLog(run.id, `Journey failed: ${journeyResult.error ?? "unknown error"}`);
      }

      await postLog(run.id, `Saving results...`);
      await completeRun(run.id, {
        success: journeyResult.success,
        metrics,
        error: journeyResult.error,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      });

      await postLog(run.id, `Run finished.`);
    } finally {
      await browser.close();
    }
  } catch (e) {
    await postLog(run.id, `Journey run crashed: ${e}`);
    await completeRun(run.id, {
      success: false,
      error: String(e),
      started_at: startedAt,
      finished_at: new Date().toISOString(),
    });
  }
}

/**
 * Execute a single-URL Playwright + Lighthouse run.
 */
async function executeSingleUrlRun(
  run: ClaimedRun,
  nRuns: number,
  startedAt: string,
): Promise<void> {
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

// =====================================================
// Load Run Execution (k6-based load testing)
// =====================================================

interface ClaimedLoadRun {
  id: string;
  project_id: string;
  script_id?: string;
  url: string;
  engine: string;
  target_vus: number;
  stages: { duration_s: number; target_vus: number; ramp_type?: string }[];
  cache_state: string;
}

async function claimLoadRun(): Promise<ClaimedLoadRun | null> {
  try {
    const res = await fetch(`${API_URL}/load/runs/claim`, { method: "POST" });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text === "null" || text === "") return null;
    return JSON.parse(text);
  } catch (e) {
    console.error(`[worker] Failed to claim load run: ${e}`);
    return null;
  }
}

async function completeLoadRun(
  loadRunId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/load/runs/${loadRunId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[worker] Failed to complete load run ${loadRunId}: ${res.status}`);
    }
  } catch (e) {
    console.error(`[worker] Error completing load run ${loadRunId}: ${e}`);
  }
}

async function executeLoadRun(loadRun: ClaimedLoadRun): Promise<void> {
  const startedAt = new Date().toISOString();
  console.log(`[worker:load] Executing load run ${loadRun.id}: ${loadRun.target_vus} VUs, engine=${loadRun.engine}, url=${loadRun.url}`);

  if (!loadRun.url) {
    console.error(`[worker:load] No URL for load run ${loadRun.id} — project may not have environment_configs set`);
    await completeLoadRun(loadRun.id, {
      success: false,
      error: "No URL configured for project. Set environment_configs on the project.",
    });
    return;
  }

  const k6 = new K6BrowserAdapter();
  const available = await k6.isAvailable();
  if (!available) {
    console.error(`[worker:load] k6 is not available — set K6_BROWSER_ENABLED=true and ensure k6 binary is on PATH`);
    await completeLoadRun(loadRun.id, {
      success: false,
      error: "k6 browser engine is not available on this worker.",
    });
    return;
  }

  try {
    // Fetch script steps if script_id is set
    let scriptSteps: K6ScriptStep[] | undefined;
    if (loadRun.script_id) {
      const script = await fetchScript(loadRun.script_id);
      if (script?.canonical_json?.steps) {
        const nlSteps = script.canonical_json.steps;
        scriptSteps = convertToCompiledSteps(
          hasJourneyMeasureSteps(nlSteps) ? nlSteps : autoInjectMeasureSteps(nlSteps),
          script.canonical_json.target_url ?? loadRun.url,
        ).map((s) => ({
          intent: s.label,
          action: s.action as K6ScriptStep["action"],
          target: s.target,
          value: s.value,
          label: s.label,
        }));
      }
    }

    const request: K6RunRequest = {
      url: loadRun.url,
      n_runs: loadRun.target_vus,
      device: "desktop",
      viewport: { width: 1920, height: 1080 },
      engine: "k6_browser",
      load_profile: {
        stages: loadRun.stages.map((s) => ({
          duration_s: s.duration_s,
          target_vus: s.target_vus,
        })),
        target_vus: loadRun.target_vus,
        cache_state: loadRun.cache_state as "cold" | "warm" | "production_replay",
      },
      script_steps: scriptSteps,
    };

    console.log(`[worker:load] Running k6 with ${loadRun.stages.length} stage(s), ${loadRun.target_vus} VUs`);
    const result = await k6.run(request);

    const durationS = (Date.now() - new Date(startedAt).getTime()) / 1000;
    const vuMinutes = loadRun.stages.reduce((acc, s) => {
      return acc + (s.target_vus * s.duration_s) / 60;
    }, 0);

    console.log(`[worker:load] Load run ${loadRun.id} ${result.success ? "completed" : "failed"} in ${durationS.toFixed(1)}s`);

    await completeLoadRun(loadRun.id, {
      success: result.success,
      metrics_summary: result.metrics,
      actual_peak_vus: loadRun.target_vus,
      vu_minutes: Math.round(vuMinutes * 10) / 10,
      duration_s: Math.round(durationS),
      error: result.error,
    });
  } catch (e) {
    console.error(`[worker:load] Load run ${loadRun.id} crashed: ${e}`);
    await completeLoadRun(loadRun.id, {
      success: false,
      error: String(e),
    });
  }
}

// =====================================================
// Main Poll Loop
// =====================================================

async function pollLoop(): Promise<void> {
  console.log(`[worker] Poll loop started — API: ${API_URL}, interval: ${POLL_INTERVAL}ms`);

  while (true) {
    // Try to claim a regular run first
    const run = await claimRun();
    if (run) {
      await executeRun(run);
      continue;
    }

    // Then try to claim a load run
    const loadRun = await claimLoadRun();
    if (loadRun) {
      await executeLoadRun(loadRun);
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
