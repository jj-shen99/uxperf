import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

/**
 * Six-stage NL test authoring pipeline (§7.3):
 *   1. Intent parse — NL → structured intent tree
 *   2. Page reconnaissance — crawl target, extract a11y tree
 *   3. Locator synthesis — generate primary + ranked fallback locators
 *   4. Script assembly — compose canonical script with assertions
 *   5. Static validation — lint, type-check, dry-run
 *   6. Confidence + clarify — score steps, surface clarifying questions
 */

export interface NlGenerationRequest {
  project_id: string;
  user_id?: string;
  prompt: string;
  target_url?: string;
  device?: "desktop" | "mobile";
  network_profile?: string;
  model?: string; // LLM model override
}

export interface NlGenerationResult {
  id: string;
  status: "draft" | "validated" | "committed" | "failed";
  generated_script: Record<string, unknown> | null;
  confidence_scores: Record<string, number>[];
  clarifying_questions: string[];
  pipeline_stages: PipelineStageResult[];
  generation_time_ms: number;
}

export interface PipelineStageResult {
  stage: number;
  name: string;
  status: "completed" | "skipped" | "failed";
  duration_ms: number;
  output: Record<string, unknown>;
}

export interface PolicyEnvelope {
  domain_allowlist: string[];
  environment_restriction: "staging" | "production" | "any";
  destructive_action_denylist: string[];
  navigation_boundary: string[];
  rate_limit: { requests_per_minute: number; max_duration_s: number };
}

@Injectable()
export class NlAuthoringService {
  private readonly logger = new Logger(NlAuthoringService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Run the six-stage NL generation pipeline.
   * Currently a structured scaffold — LLM integration is pluggable.
   */
  async generate(request: NlGenerationRequest): Promise<NlGenerationResult> {
    const startTime = Date.now();
    const stages: PipelineStageResult[] = [];

    // Stage 1: Intent parse
    const intentResult = await this.parseIntent(request.prompt);
    stages.push(intentResult);

    // Stage 2: Page reconnaissance
    const reconResult = await this.pageReconnaissance(request.target_url);
    stages.push(reconResult);

    // Stage 2.5: If intent contains a loop ("each link"), expand into per-link steps
    let effectiveIntent = intentResult.output;
    if ((intentResult.output as any).has_loop && (reconResult.output as any).links?.length > 0) {
      const expandedSteps = this.expandLoopSteps(intentResult.output, reconResult.output);
      effectiveIntent = { ...intentResult.output, steps: expandedSteps, expanded: true };
      this.logger.log(`Loop expansion: ${(intentResult.output.steps as any[]).length} steps → ${expandedSteps.length} steps`);
    }

    // Stage 3: Locator synthesis
    const locatorResult = await this.synthesizeLocators(
      effectiveIntent,
      reconResult.output,
    );
    stages.push(locatorResult);

    // Stage 4: Script assembly
    const scriptResult = await this.assembleScript(
      effectiveIntent,
      locatorResult.output,
      request,
    );
    stages.push(scriptResult);

    // Stage 5: Static validation
    const validationResult = await this.validate(scriptResult.output);
    stages.push(validationResult);

    // Stage 6: Confidence + clarify
    const confidenceResult = await this.scoreConfidence(
      scriptResult.output,
      locatorResult.output,
    );
    stages.push(confidenceResult);

    const generationTimeMs = Date.now() - startTime;

    // Persist to audit log
    const logResult = await this.db.query<{ id: string }>(
      `INSERT INTO nl_generation_logs
        (project_id, user_id, prompt, target_url, pipeline_stages, generated_script,
         confidence_scores, clarifying_questions, model_version, generation_time_ms, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        request.project_id,
        request.user_id ?? null,
        request.prompt,
        request.target_url ?? null,
        JSON.stringify(stages),
        JSON.stringify(scriptResult.output.script ?? null),
        JSON.stringify(confidenceResult.output.scores ?? []),
        JSON.stringify(confidenceResult.output.questions ?? []),
        request.model ?? "scaffold-v1",
        generationTimeMs,
        validationResult.status === "completed" ? "validated" : "draft",
      ],
    );

    return {
      id: logResult.rows[0].id,
      status: validationResult.status === "completed" ? "validated" : "draft",
      generated_script: (scriptResult.output.script as Record<string, unknown>) ?? null,
      confidence_scores: (confidenceResult.output.scores as Record<string, number>[]) ?? [],
      clarifying_questions: (confidenceResult.output.questions as string[]) ?? [],
      pipeline_stages: stages,
      generation_time_ms: generationTimeMs,
    };
  }

  /**
   * List generation logs for a project.
   */
  async listLogs(projectId: string, limit = 20) {
    const result = await this.db.query(
      `SELECT id, project_id, prompt, target_url, status, generation_time_ms, created_at
       FROM nl_generation_logs
       WHERE project_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [projectId, Math.min(limit, 100)],
    );
    return result.rows;
  }

  /**
   * Get the runtime policy envelope for a project.
   */
  async getPolicyEnvelope(projectId: string): Promise<PolicyEnvelope> {
    const result = await this.db.query<{
      domain_allowlist: string[];
      environment_configs: Record<string, unknown>;
    }>(
      "SELECT domain_allowlist, environment_configs FROM projects WHERE id = $1",
      [projectId],
    );

    const project = result.rows[0];
    return {
      domain_allowlist: project?.domain_allowlist ?? [],
      environment_restriction: "staging",
      destructive_action_denylist: [
        "delete account",
        "remove all",
        "drop database",
        "admin/destroy",
      ],
      navigation_boundary: project?.domain_allowlist ?? [],
      rate_limit: { requests_per_minute: 60, max_duration_s: 300 },
    };
  }

  /**
   * E-07: Convert generated JSON script into runnable Playwright TypeScript code.
   * §7.3: "The output should be a real executable Playwright test, not just JSON."
   */
  generatePlaywrightCode(script: Record<string, unknown>): string {
    const steps = (script.steps as { intent: string; locators: any }[]) ?? [];
    const targetUrl = (script.target_url as string) ?? "https://example.com";
    const device = (script.device as string) ?? "desktop";

    const lines: string[] = [
      `import { test, expect } from '@playwright/test';`,
      ``,
    ];

    if (device === "mobile") {
      lines.push(`import { devices } from '@playwright/test';`);
      lines.push(``);
      lines.push(`test.use({ ...devices['Pixel 5'] });`);
      lines.push(``);
    }

    lines.push(`test('${this.escapeQuotes((script.source_prompt as string) ?? "Generated perf test")}', async ({ page }) => {`);
    lines.push(`  // Navigate to target`);
    lines.push(`  await page.goto('${this.escapeQuotes(targetUrl)}');`);
    lines.push(``);

    for (const step of steps) {
      const intent = step.intent ?? "";
      const locator = step.locators?.primary;
      lines.push(`  // ${intent}`);

      if (this.isMeasureIntent(intent)) {
        const label = intent.replace(/^measure:?\s*/i, "").replace(/^["']|["']$/g, "");
        lines.push(`  // Capture performance metrics: ${label}`);
        lines.push(`  await page.waitForLoadState('networkidle');`);
        lines.push(`  const metrics_${steps.indexOf(step)} = await page.evaluate(() => {`);
        lines.push(`    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;`);
        lines.push(`    const paint = performance.getEntriesByType('paint');`);
        lines.push(`    const fcp = paint.find(e => e.name === 'first-contentful-paint');`);
        lines.push(`    const lcp = paint.find(e => e.name === 'largest-contentful-paint');`);
        lines.push(`    return {`);
        lines.push(`      ttfb: nav ? nav.responseStart - nav.requestStart : 0,`);
        lines.push(`      fcp: fcp?.startTime ?? 0,`);
        lines.push(`      lcp: lcp?.startTime ?? 0,`);
        lines.push(`      loadEvent: nav ? nav.loadEventEnd - nav.startTime : 0,`);
        lines.push(`    };`);
        lines.push(`  });`);
        lines.push(`  console.log('Metrics [${this.escapeQuotes(label)}]:', JSON.stringify(metrics_${steps.indexOf(step)}));`);
      } else if (this.isGoBackIntent(intent)) {
        lines.push(`  await page.goto('${this.escapeQuotes(targetUrl)}');`);
        lines.push(`  await page.waitForLoadState('load');`);
      } else if (this.isNavigationIntent(intent)) {
        const url = this.extractUrl(intent) ?? targetUrl;
        lines.push(`  await page.goto('${this.escapeQuotes(url)}');`);
        lines.push(`  await page.waitForLoadState('networkidle');`);
      } else if (this.isClickIntent(intent)) {
        // Check for quoted text in intent: click on "Book Title"
        const quotedMatch = intent.match(/["'](.+?)["']/);
        const defaultSelector = quotedMatch
          ? `getByRole('link', {name: '${this.escapeQuotes(quotedMatch[1])}'})`
          : `getByRole('button', {name: '${this.escapeQuotes(intent)}'})`;
        const selector = locator?.selector ?? defaultSelector;
        if (selector.startsWith("getBy")) {
          lines.push(`  await page.${selector}.click();`);
        } else {
          lines.push(`  await page.locator('${this.escapeQuotes(selector)}').click();`);
        }
        lines.push(`  await page.waitForLoadState('load');`);
      } else if (this.isTypeIntent(intent)) {
        const { selector: sel, value } = this.extractTypeTarget(intent);
        const s = locator?.selector ?? sel;
        if (s.startsWith("getBy")) {
          lines.push(`  await page.${s}.fill('${this.escapeQuotes(value)}');`);
        } else {
          lines.push(`  await page.locator('${this.escapeQuotes(s)}').fill('${this.escapeQuotes(value)}');`);
        }
      } else if (this.isWaitIntent(intent)) {
        lines.push(`  await page.waitForLoadState('networkidle');`);
      } else if (this.isScrollIntent(intent)) {
        lines.push(`  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));`);
      } else {
        // Default: try to click the element
        const selector = locator?.selector ?? `getByText('${this.escapeQuotes(intent)}')`;
        if (selector.startsWith("getBy")) {
          lines.push(`  await page.${selector}.click();`);
        } else {
          lines.push(`  await page.locator('${this.escapeQuotes(selector)}').click();`);
        }
      }
      lines.push(``);
    }

    // Add performance assertions from metrics
    const assertions = (script as any)?.metrics?.assertions ?? [];
    if (assertions.length > 0) {
      lines.push(`  // Performance assertions`);
      lines.push(`  const timing = await page.evaluate(() => {`);
      lines.push(`    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;`);
      lines.push(`    const paint = performance.getEntriesByType('paint');`);
      lines.push(`    const fcp = paint.find(e => e.name === 'first-contentful-paint');`);
      lines.push(`    return {`);
      lines.push(`      ttfb: nav ? nav.responseStart - nav.requestStart : 0,`);
      lines.push(`      fcp: fcp?.startTime ?? 0,`);
      lines.push(`      loadEvent: nav ? nav.loadEventEnd - nav.startTime : 0,`);
      lines.push(`    };`);
      lines.push(`  });`);
      for (const a of assertions) {
        if (a.metric === "lcp" && a.p95_max_ms) {
          lines.push(`  expect(timing.loadEvent).toBeLessThan(${a.p95_max_ms});`);
        }
      }
    }

    lines.push(`});`);
    lines.push(``);

    return lines.join("\n");
  }

  private escapeQuotes(s: string): string {
    return s.replace(/'/g, "\\'").replace(/\n/g, "\\n");
  }

  private isMeasureIntent(intent: string): boolean {
    return /^measure:?\s/i.test(intent);
  }

  private isGoBackIntent(intent: string): boolean {
    return /\b(navigate back|go back|return to)\b/i.test(intent);
  }

  private isNavigationIntent(intent: string): boolean {
    return /\b(go to|navigate|visit|open|load)\b/i.test(intent);
  }

  private isClickIntent(intent: string): boolean {
    return /\b(click|tap|press|submit|select)\b/i.test(intent);
  }

  private isTypeIntent(intent: string): boolean {
    return /\b(type|fill|enter|input|write)\b/i.test(intent);
  }

  private isWaitIntent(intent: string): boolean {
    return /\b(wait|pause|settle)\b/i.test(intent);
  }

  private isScrollIntent(intent: string): boolean {
    return /\b(scroll|swipe)\b/i.test(intent);
  }

  private extractUrl(intent: string): string | null {
    const m = intent.match(/https?:\/\/[^\s'"]+/);
    return m ? m[0] : null;
  }

  private extractTypeTarget(intent: string): { selector: string; value: string } {
    // "type 'hello' into #search" or "fill email with test@example.com"
    const m1 = intent.match(/['"](.+?)['"].*?(?:into|in)\s+(.+)/i);
    if (m1) return { selector: m1[2].trim(), value: m1[1] };
    const m2 = intent.match(/(?:fill|type|enter)\s+(.+?)\s+(?:with|=)\s+(.+)/i);
    if (m2) return { selector: m2[1].trim(), value: m2[2].trim() };
    return { selector: "input", value: "test" };
  }

  // ---- Pipeline stages (scaffold — pluggable LLM integration) ----

  private async parseIntent(
    prompt: string,
  ): Promise<PipelineStageResult> {
    const start = Date.now();
    // Parse NL into structured steps
    const steps = prompt
      .split(/[,.]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s, i) => ({ step: i + 1, intent: s }));

    // Detect loop keywords ("each", "all", "every") that signal iteration over page elements
    const hasLoop = steps.some((s) =>
      /\b(each|all|every)\b/i.test(s.intent) &&
      /\b(link|button|item|card|product|book|result|element)s?\b/i.test(s.intent),
    );
    // Detect if user wants metrics for iterated items
    const wantsMetrics = steps.some((s) =>
      /\b(metric|measure|performance|vitals|lcp|fcp|cls)s?\b/i.test(s.intent),
    );

    return {
      stage: 1,
      name: "intent_parse",
      status: "completed",
      duration_ms: Date.now() - start,
      output: { steps, raw_prompt: prompt, has_loop: hasLoop, wants_metrics: wantsMetrics },
    };
  }

  private async pageReconnaissance(
    targetUrl?: string,
  ): Promise<PipelineStageResult> {
    const start = Date.now();
    if (!targetUrl) {
      return {
        stage: 2,
        name: "page_reconnaissance",
        status: "skipped",
        duration_ms: Date.now() - start,
        output: { target_url: null, links: [], headings: [] },
      };
    }

    // Fetch the page and extract links + headings via regex-based HTML parsing
    // (no browser dependency in the API process — lightweight recon)
    try {
      const res = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html",
        },
        signal: AbortSignal.timeout(15_000),
      });
      const html = await res.text();

      // Extract all <a> tags with href and visible text
      const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis;
      const links: { href: string; text: string }[] = [];
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        // Strip HTML tags from link text
        const text = match[2].replace(/<[^>]+>/g, "").trim();
        if (text && text.length > 1 && text.length < 200 && href && !href.startsWith("#") && !href.startsWith("javascript:")) {
          links.push({ href, text });
        }
      }

      // Extract headings for context
      const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis;
      const headings: string[] = [];
      while ((match = headingRegex.exec(html)) !== null) {
        const text = match[1].replace(/<[^>]+>/g, "").trim();
        if (text) headings.push(text);
      }

      // Deduplicate links by text
      const seen = new Set<string>();
      const uniqueLinks = links.filter((l) => {
        const key = l.text.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      this.logger.log(`Page recon: ${uniqueLinks.length} unique links, ${headings.length} headings from ${targetUrl}`);

      return {
        stage: 2,
        name: "page_reconnaissance",
        status: "completed",
        duration_ms: Date.now() - start,
        output: {
          target_url: targetUrl,
          links: uniqueLinks.slice(0, 100), // Cap at 100 links
          headings: headings.slice(0, 20),
          total_links_found: links.length,
          unique_links: uniqueLinks.length,
        },
      };
    } catch (err) {
      this.logger.warn(`Page recon failed for ${targetUrl}: ${err}`);
      return {
        stage: 2,
        name: "page_reconnaissance",
        status: "completed",
        duration_ms: Date.now() - start,
        output: {
          target_url: targetUrl,
          links: [],
          headings: [],
          error: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async synthesizeLocators(
    intentOutput: Record<string, unknown>,
    reconOutput: Record<string, unknown>,
  ): Promise<PipelineStageResult> {
    const start = Date.now();
    const steps = (intentOutput.steps as { step: number; intent: string }[]) ?? [];

    const locators = steps.map((s) => {
      // Extract quoted text from intents like: click on "Book Title"
      const quotedMatch = s.intent.match(/["'](.+?)["']/);
      const linkText = quotedMatch?.[1];

      if (linkText && /\bclick\b/i.test(s.intent)) {
        // Use getByRole('link') for click intents with quoted text (likely a link)
        return {
          step: s.step,
          intent: s.intent,
          primary: { strategy: "role", selector: `getByRole('link', {name: '${linkText}'})` },
          fallbacks: [
            { strategy: "text", selector: `getByText('${linkText}')` },
          ],
        };
      }

      return {
        step: s.step,
        intent: s.intent,
        primary: { strategy: "role", selector: `getByRole('button', {name: '${s.intent}'})` },
        fallbacks: [
          { strategy: "text", selector: `getByText('${s.intent}')` },
        ],
      };
    });

    return {
      stage: 3,
      name: "locator_synthesis",
      status: "completed",
      duration_ms: Date.now() - start,
      output: { locators },
    };
  }

  private async assembleScript(
    intentOutput: Record<string, unknown>,
    locatorOutput: Record<string, unknown>,
    request: NlGenerationRequest,
  ): Promise<PipelineStageResult> {
    const start = Date.now();
    const steps = (intentOutput.steps as { step: number; intent: string }[]) ?? [];
    const locators = (locatorOutput.locators as unknown[]) ?? [];

    const script = {
      id: `nl_${Date.now()}`,
      source_prompt: request.prompt,
      target_url: request.target_url,
      device: request.device ?? "desktop",
      steps: steps.map((s, i) => ({
        intent: s.intent,
        locators: locators[i] ?? {},
        post_conditions: {},
      })),
      metrics: {
        assertions: [{ metric: "lcp", p95_max_ms: 2500 }],
      },
    };

    return {
      stage: 4,
      name: "script_assembly",
      status: "completed",
      duration_ms: Date.now() - start,
      output: { script },
    };
  }

  /**
   * Expand loop intents into per-link steps using page reconnaissance data.
   * Called between intent parse and locator synthesis when a loop keyword is detected.
   */
  private expandLoopSteps(
    intentOutput: Record<string, unknown>,
    reconOutput: Record<string, unknown>,
  ): { step: number; intent: string }[] {
    const originalSteps = (intentOutput.steps as { step: number; intent: string }[]) ?? [];
    const links = (reconOutput.links as { href: string; text: string }[]) ?? [];
    const wantsMetrics = intentOutput.wants_metrics as boolean;

    if (links.length === 0) return originalSteps;

    // Find the loop step and the element type it references
    const loopStepIdx = originalSteps.findIndex((s) =>
      /\b(each|all|every)\b/i.test(s.intent) &&
      /\b(link|button|item|card|product|book|result|element)s?\b/i.test(s.intent),
    );
    if (loopStepIdx === -1) return originalSteps;

    // Determine filter keywords from the loop intent
    const loopIntent = originalSteps[loopStepIdx].intent.toLowerCase();
    const filterKeywords = this.extractFilterKeywords(loopIntent);

    // Filter links by keywords if present
    let targetLinks = links;
    if (filterKeywords.length > 0) {
      targetLinks = links.filter((l) => {
        const text = l.text.toLowerCase();
        const href = l.href.toLowerCase();
        return filterKeywords.some((kw) => text.includes(kw) || href.includes(kw));
      });
      // If filter is too aggressive, fall back to all links
      if (targetLinks.length === 0) targetLinks = links;
    }

    // Cap at 20 links to avoid excessive test duration
    targetLinks = targetLinks.slice(0, 20);

    // Build expanded steps:
    //  - Steps before the loop
    //  - For each link: visit page → click link → measure → go back
    //  - Steps after the loop (excluding metric-related steps already folded in)
    const before = originalSteps.slice(0, loopStepIdx);
    const after = originalSteps.slice(loopStepIdx + 1).filter(
      (s) => !/\b(metric|measure|performance|vitals)s?\b/i.test(s.intent),
    );

    const expanded: { step: number; intent: string }[] = [...before];
    let stepNum = before.length + 1;

    for (const link of targetLinks) {
      expanded.push({ step: stepNum++, intent: `click on "${link.text}"` });
      if (wantsMetrics) {
        expanded.push({ step: stepNum++, intent: `measure: "${link.text}"` });
      }
      expanded.push({ step: stepNum++, intent: `navigate back to ${reconOutput.target_url ?? "the page"}` });
    }

    for (const s of after) {
      expanded.push({ step: stepNum++, intent: s.intent });
    }

    return expanded;
  }

  /**
   * Extract content filter keywords from the loop intent.
   * E.g., "click on each book link" → ["book"]
   */
  private extractFilterKeywords(intent: string): string[] {
    // Remove common structural words
    const stripped = intent
      .replace(/\b(click|tap|go|visit|open|on|each|all|every|the|and|then|a|an|for)\b/gi, "")
      .replace(/\b(link|button|item|card|element|generate|performance|metrics?)s?\b/gi, "")
      .trim();
    return stripped
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, ""))
      .filter((w) => w.length > 2);
  }

  private async validate(
    scriptOutput: Record<string, unknown>,
  ): Promise<PipelineStageResult> {
    const start = Date.now();
    const script = scriptOutput.script as Record<string, unknown> | undefined;

    const checks = {
      has_steps: !!(script as any)?.steps?.length,
      has_target: !!(script as any)?.target_url,
      has_assertions: !!(script as any)?.metrics?.assertions?.length,
    };

    const allPassed = Object.values(checks).every(Boolean);

    return {
      stage: 5,
      name: "static_validation",
      status: allPassed ? "completed" : "failed",
      duration_ms: Date.now() - start,
      output: { checks, passed: allPassed },
    };
  }

  private async scoreConfidence(
    scriptOutput: Record<string, unknown>,
    locatorOutput: Record<string, unknown>,
  ): Promise<PipelineStageResult> {
    const start = Date.now();
    const locators = (locatorOutput.locators as { step: number; intent: string }[]) ?? [];

    // Confidence heuristic: role-based locators get high confidence
    const scores = locators.map((l) => ({
      step: l.step,
      confidence: 0.75, // scaffold default — real scoring uses locator uniqueness
      intent: l.intent,
    }));

    const lowConfidence = scores.filter((s) => s.confidence < 0.7);
    const questions = lowConfidence.map(
      (s) => `Step ${s.step}: "${s.intent}" — multiple elements may match. Please clarify.`,
    );

    return {
      stage: 6,
      name: "confidence_scoring",
      status: "completed",
      duration_ms: Date.now() - start,
      output: { scores, questions },
    };
  }
}
