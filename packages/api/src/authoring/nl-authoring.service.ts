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

    // Stage 3: Locator synthesis
    const locatorResult = await this.synthesizeLocators(
      intentResult.output,
      reconResult.output,
    );
    stages.push(locatorResult);

    // Stage 4: Script assembly
    const scriptResult = await this.assembleScript(
      intentResult.output,
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

    return {
      stage: 1,
      name: "intent_parse",
      status: "completed",
      duration_ms: Date.now() - start,
      output: { steps, raw_prompt: prompt },
    };
  }

  private async pageReconnaissance(
    targetUrl?: string,
  ): Promise<PipelineStageResult> {
    const start = Date.now();
    // In production: crawl target with headless browser, extract a11y tree
    return {
      stage: 2,
      name: "page_reconnaissance",
      status: targetUrl ? "completed" : "skipped",
      duration_ms: Date.now() - start,
      output: {
        target_url: targetUrl ?? null,
        a11y_tree: null, // placeholder — populated by actual browser crawl
        note: "Page recon requires headless browser; returning scaffold",
      },
    };
  }

  private async synthesizeLocators(
    intentOutput: Record<string, unknown>,
    reconOutput: Record<string, unknown>,
  ): Promise<PipelineStageResult> {
    const start = Date.now();
    const steps = (intentOutput.steps as { step: number; intent: string }[]) ?? [];

    const locators = steps.map((s) => ({
      step: s.step,
      intent: s.intent,
      primary: { strategy: "role", selector: `getByRole('button', {name: '${s.intent}'})` },
      fallbacks: [
        { strategy: "text", selector: `getByText('${s.intent}')` },
      ],
    }));

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
