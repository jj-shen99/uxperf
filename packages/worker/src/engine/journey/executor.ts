/**
 * Journey Executor (E-02 through E-05).
 *
 * Runs compiled journey steps against a real browser via Playwright.
 * - E-02: Multi-step journey execution (visit, click, fill, etc.)
 * - E-03: `measure` directive — captures Web Vitals on demand
 * - E-04: Per-step screenshots (base64 PNG)
 * - E-05: Inter-stage timing (start/end/duration per step)
 */

import type { Page, Browser, BrowserContext } from "playwright";
import type {
  CompiledStep,
  JourneyDefinition,
  JourneyResult,
  StepResult,
  MeasureResult,
} from "./types";
import {
  collectWebVitals,
  collectPageTimings,
  collectResourceSummary,
} from "../metrics-collector";
import { createHarCollector, HarResult } from "../har-collector";

export interface ExecutorOptions {
  screenshots?: boolean;         // default true
  screenshotFullPage?: boolean;  // default false
  stepTimeout?: number;          // ms, default 30000
  settleDelay?: number;          // ms after navigation, default 1000
  captureHar?: boolean;          // E-06: capture full network waterfall, default true
}

const DEFAULT_OPTIONS: Required<ExecutorOptions> = {
  screenshots: true,
  screenshotFullPage: false,
  stepTimeout: 30_000,
  settleDelay: 1_000,
  captureHar: true,
};

/**
 * Execute a journey against an already-launched browser.
 * Caller is responsible for browser lifecycle.
 */
export async function executeJourney(
  browser: Browser,
  definition: JourneyDefinition,
  steps: CompiledStep[],
  options?: ExecutorOptions,
  onProgress?: (msg: string) => void | Promise<void>,
): Promise<JourneyResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (definition.screenshots === false) opts.screenshots = false;

  const journeyStart = new Date();
  const stepResults: StepResult[] = [];
  const measurements: MeasureResult[] = [];

  const viewport = definition.viewport ?? { width: 1280, height: 720 };
  const context: BrowserContext = await browser.newContext({
    viewport,
    userAgent:
      definition.device === "mobile"
        ? "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
        : undefined,
  });

  const page: Page = await context.newPage();
  let lastError: string | undefined;

  // E-06: Start HAR collector before navigation
  const harCollector = opts.captureHar
    ? createHarCollector(page, definition.target)
    : null;
  harCollector?.start();

  try {
    for (const step of steps) {
      const stepStart = new Date();
      await onProgress?.(`Step ${step.index + 1}/${steps.length}: ${step.label}`);

      let error: string | undefined;
      try {
        await executeStep(page, step, opts);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        lastError = error;
      }

      const stepEnd = new Date();
      const durationMs = stepEnd.getTime() - stepStart.getTime();

      // E-04: Per-step screenshot
      let screenshotBase64: string | undefined;
      if (opts.screenshots && step.action !== "measure") {
        try {
          const buf = await page.screenshot({
            fullPage: opts.screenshotFullPage,
            type: "png",
          });
          screenshotBase64 = buf.toString("base64");
        } catch {
          // Screenshot may fail if page crashed
        }
      }

      stepResults.push({
        index: step.index,
        action: step.action,
        label: step.label,
        started_at: stepStart.toISOString(),
        finished_at: stepEnd.toISOString(),
        duration_ms: durationMs,
        screenshot_base64: screenshotBase64,
        error,
      });

      // E-03: measure directive
      if (step.action === "measure") {
        try {
          const [vitals, timings, resources] = await Promise.all([
            collectWebVitals(page),
            collectPageTimings(page),
            collectResourceSummary(page),
          ]);
          measurements.push({
            label: step.label,
            step_index: step.index,
            web_vitals: vitals,
            dom_content_loaded_ms: timings.dom_content_loaded_ms,
            load_event_ms: timings.load_event_ms,
            total_requests: resources.total_requests,
            total_transfer_size_bytes: resources.total_transfer_size_bytes,
          });
        } catch (err) {
          measurements.push({
            label: step.label,
            step_index: step.index,
            web_vitals: {},
          });
        }
      }

      // Stop on error
      if (error) break;
    }
  } finally {
    // E-06: Stop HAR collector and capture results
    var harResult: HarResult | undefined;
    if (harCollector) {
      try {
        harResult = await harCollector.stop();
      } catch {
        // HAR collection may fail if context already closed
      }
    }
    await context.close();
  }

  const journeyEnd = new Date();

  return {
    name: definition.name,
    target: definition.target,
    device: definition.device ?? "desktop",
    success: !lastError,
    steps: stepResults,
    measurements,
    har: harResult,
    total_duration_ms: journeyEnd.getTime() - journeyStart.getTime(),
    started_at: journeyStart.toISOString(),
    finished_at: journeyEnd.toISOString(),
    error: lastError,
  };
}

/**
 * Execute a single compiled step against a Playwright page.
 */
async function executeStep(
  page: Page,
  step: CompiledStep,
  opts: Required<ExecutorOptions>,
): Promise<void> {
  const timeout = opts.stepTimeout;

  switch (step.action) {
    case "visit":
      await page.goto(step.target, { waitUntil: "load", timeout });
      await page.waitForTimeout(opts.settleDelay);
      break;

    case "click":
      await resolveLocator(page, step.target).click({ timeout });
      await page.waitForTimeout(Math.min(opts.settleDelay, 500));
      break;

    case "fill":
      await resolveLocator(page, step.target).fill(step.value ?? "", { timeout });
      break;

    case "scroll":
      if (step.target === "bottom") {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      } else if (step.target === "top") {
        await page.evaluate(() => window.scrollTo(0, 0));
      } else {
        await resolveLocator(page, step.target).scrollIntoViewIfNeeded({ timeout });
      }
      await page.waitForTimeout(300);
      break;

    case "wait_for":
      if (step.target.startsWith("/")) {
        await page.waitForURL(`**${step.target}`, { timeout });
      } else {
        await resolveLocator(page, step.target).waitFor({ state: "visible", timeout });
      }
      break;

    case "hover":
      await resolveLocator(page, step.target).hover({ timeout });
      break;

    case "select":
      await resolveLocator(page, step.target).selectOption(step.value ?? "", { timeout });
      break;

    case "press":
      await page.keyboard.press(step.target);
      break;

    case "measure":
      // Measurement is handled after step execution in executeJourney
      await page.waitForTimeout(opts.settleDelay);
      break;

    default:
      throw new Error(`Unknown action: ${step.action}`);
  }
}

/**
 * Smart locator resolution.
 * Supports:
 *   - CSS selectors: "#id", ".class", "div > span"
 *   - Text-based: "Add to Cart" → getByText or getByRole(button)
 *   - XPath: "//div[@id='foo']"
 */
function resolveLocator(page: Page, selector: string) {
  // XPath
  if (selector.startsWith("//") || selector.startsWith("(//")) {
    return page.locator(`xpath=${selector}`);
  }

  // CSS-like: starts with #, ., [, or contains > + ~
  if (/^[#.\[]|[>+~]/.test(selector)) {
    return page.locator(selector);
  }

  // data-testid
  if (selector.startsWith("data-testid=")) {
    return page.locator(`[${selector}]`);
  }

  // Treat as text — try getByRole(button/link) first, fall back to getByText
  return page.getByRole("button", { name: selector }).or(
    page.getByRole("link", { name: selector }).or(
      page.getByText(selector, { exact: false })
    )
  );
}
