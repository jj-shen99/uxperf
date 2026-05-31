import { Injectable, Logger } from "@nestjs/common";
import { GateEvaluationOutcome } from "../gates/gates.service";

export interface GitHubCheckConfig {
  owner: string;
  repo: string;
  sha: string;
  token: string;
}

export interface CheckRunPayload {
  name: string;
  head_sha: string;
  status: "completed";
  conclusion: "success" | "failure" | "neutral";
  output: {
    title: string;
    summary: string;
    text?: string;
  };
}

/**
 * Posts gate evaluation results as GitHub Check Runs (Checks API).
 * Requires a GitHub token (App installation token or PAT) with `checks:write`.
 *
 * §10.4 of design doc: "Report gate results as GitHub status checks."
 */
@Injectable()
export class GitHubCheckService {
  private readonly logger = new Logger(GitHubCheckService.name);

  /**
   * Report gate results for a run as a single GitHub Check Run.
   * Creates a check run named "perf-gates" with a summary of all gate outcomes.
   */
  async reportGateResults(
    config: GitHubCheckConfig,
    runId: string,
    outcomes: GateEvaluationOutcome[]
  ): Promise<{ checkRunId: number | null; posted: boolean }> {
    if (!config.token) {
      this.logger.warn("No GitHub token configured; skipping check run");
      return { checkRunId: null, posted: false };
    }

    const blockingFailed = outcomes.filter(
      (o) => o.status === "failed" && o.policy === "block"
    );
    const warnings = outcomes.filter(
      (o) => o.status === "failed" && o.policy !== "block"
    );
    const passed = outcomes.filter((o) => o.status === "passed");
    const skipped = outcomes.filter((o) => o.status === "skipped");

    const conclusion: "success" | "failure" | "neutral" =
      blockingFailed.length > 0
        ? "failure"
        : warnings.length > 0
          ? "neutral"
          : "success";

    const title = this.buildTitle(conclusion, blockingFailed.length, warnings.length);
    const summary = this.buildSummary(runId, passed, blockingFailed, warnings, skipped);
    const text = this.buildDetailsTable(outcomes);

    const payload: CheckRunPayload = {
      name: "perf-gates",
      head_sha: config.sha,
      status: "completed",
      conclusion,
      output: { title, summary, text },
    };

    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/check-runs`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`GitHub API error ${response.status}: ${body}`);
        return { checkRunId: null, posted: false };
      }

      const data = (await response.json()) as { id: number };
      this.logger.log(`Posted GitHub check run ${data.id} for ${config.owner}/${config.repo}@${config.sha}`);
      return { checkRunId: data.id, posted: true };
    } catch (error) {
      this.logger.error(`Failed to post GitHub check: ${error}`);
      return { checkRunId: null, posted: false };
    }
  }

  /**
   * Report gate results as a simpler commit status (Status API).
   * Useful when the caller doesn't have checks:write permission.
   */
  async reportCommitStatus(
    config: GitHubCheckConfig,
    runId: string,
    outcomes: GateEvaluationOutcome[],
    targetUrl?: string
  ): Promise<boolean> {
    if (!config.token) return false;

    const blockingFailed = outcomes.filter(
      (o) => o.status === "failed" && o.policy === "block"
    );
    const warnings = outcomes.filter(
      (o) => o.status === "failed" && o.policy !== "block"
    );

    const state: "success" | "failure" | "pending" =
      blockingFailed.length > 0 ? "failure" : "success";

    const description =
      blockingFailed.length > 0
        ? `${blockingFailed.length} blocking gate(s) failed`
        : warnings.length > 0
          ? `${warnings.length} warning(s), all blocking gates passed`
          : `All ${outcomes.length} gate(s) passed`;

    try {
      const response = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/statuses/${config.sha}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            state,
            description,
            context: "perf-framework/gates",
            target_url: targetUrl,
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`GitHub Status API error ${response.status}: ${body}`);
        return false;
      }

      this.logger.log(`Posted commit status '${state}' for ${config.sha.slice(0, 8)}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to post commit status: ${error}`);
      return false;
    }
  }

  /**
   * E-33: Post or update a single unified PR comment with collapsible sections.
   * Ch 13, p167: "One comment on the PR" — don't spam; upsert a single comment
   * identified by a marker, updating it on each new run.
   */
  async upsertPrComment(
    config: GitHubCheckConfig & { prNumber: number },
    runId: string,
    outcomes: GateEvaluationOutcome[],
    dashboardUrl?: string,
  ): Promise<{ commentId: number | null; created: boolean }> {
    if (!config.token) {
      this.logger.warn("No GitHub token; skipping PR comment");
      return { commentId: null, created: false };
    }

    const marker = "<!-- perf-framework-gate-summary -->";
    const body = this.buildPrCommentBody(marker, runId, outcomes, dashboardUrl);

    try {
      // Search for existing comment with our marker
      const existingId = await this.findExistingComment(config, marker);

      if (existingId) {
        // Update existing comment
        const resp = await fetch(
          `https://api.github.com/repos/${config.owner}/${config.repo}/issues/comments/${existingId}`,
          {
            method: "PATCH",
            headers: this.githubHeaders(config.token),
            body: JSON.stringify({ body }),
          },
        );
        if (!resp.ok) {
          this.logger.error(`Failed to update PR comment: ${resp.status}`);
          return { commentId: null, created: false };
        }
        this.logger.log(`Updated PR comment ${existingId} on PR #${config.prNumber}`);
        return { commentId: existingId, created: false };
      }

      // Create new comment
      const resp = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${config.prNumber}/comments`,
        {
          method: "POST",
          headers: this.githubHeaders(config.token),
          body: JSON.stringify({ body }),
        },
      );
      if (!resp.ok) {
        this.logger.error(`Failed to create PR comment: ${resp.status}`);
        return { commentId: null, created: false };
      }
      const data = (await resp.json()) as { id: number };
      this.logger.log(`Created PR comment ${data.id} on PR #${config.prNumber}`);
      return { commentId: data.id, created: true };
    } catch (error) {
      this.logger.error(`PR comment failed: ${error}`);
      return { commentId: null, created: false };
    }
  }

  private async findExistingComment(
    config: GitHubCheckConfig & { prNumber: number },
    marker: string,
  ): Promise<number | null> {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${config.owner}/${config.repo}/issues/${config.prNumber}/comments?per_page=100`,
        { headers: this.githubHeaders(config.token) },
      );
      if (!resp.ok) return null;
      const comments = (await resp.json()) as { id: number; body: string }[];
      const existing = comments.find((c) => c.body.includes(marker));
      return existing?.id ?? null;
    } catch {
      return null;
    }
  }

  private buildPrCommentBody(
    marker: string,
    runId: string,
    outcomes: GateEvaluationOutcome[],
    dashboardUrl?: string,
  ): string {
    const blockingFailed = outcomes.filter((o) => o.status === "failed" && o.policy === "block");
    const warnings = outcomes.filter((o) => o.status === "failed" && o.policy !== "block");
    const passed = outcomes.filter((o) => o.status === "passed");

    const icon = blockingFailed.length > 0 ? "\u274c" : warnings.length > 0 ? "\u26a0\ufe0f" : "\u2705";
    const headline = blockingFailed.length > 0
      ? `${blockingFailed.length} blocking gate(s) failed`
      : warnings.length > 0
        ? `${warnings.length} warning(s), all blocking gates passed`
        : `All ${outcomes.length} gate(s) passed`;

    const lines: string[] = [
      marker,
      `## ${icon} Performance Gate Results`,
      "",
      `**Run:** \`${runId}\` | **Result:** ${headline}`,
      dashboardUrl ? `**Dashboard:** [View details](${dashboardUrl})` : "",
      "",
    ];

    // Blocking failures section
    if (blockingFailed.length > 0) {
      lines.push("<details open>");
      lines.push(`<summary>\u274c Blocking Failures (${blockingFailed.length})</summary>\n`);
      lines.push(this.buildDetailsTable(blockingFailed));
      lines.push("\n</details>\n");
    }

    // Warnings section
    if (warnings.length > 0) {
      lines.push("<details>");
      lines.push(`<summary>\u26a0\ufe0f Warnings (${warnings.length})</summary>\n`);
      lines.push(this.buildDetailsTable(warnings));
      lines.push("\n</details>\n");
    }

    // Passed section
    if (passed.length > 0) {
      lines.push("<details>");
      lines.push(`<summary>\u2705 Passed (${passed.length})</summary>\n`);
      lines.push(this.buildDetailsTable(passed));
      lines.push("\n</details>\n");
    }

    lines.push("---");
    lines.push("*Posted by perf-framework*");

    return lines.filter((l) => l !== undefined).join("\n");
  }

  private githubHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  // -- Private helpers --

  private buildTitle(
    conclusion: string,
    blockingCount: number,
    warningCount: number
  ): string {
    if (conclusion === "failure") {
      return `${blockingCount} blocking gate${blockingCount !== 1 ? "s" : ""} failed`;
    }
    if (conclusion === "neutral") {
      return `${warningCount} warning${warningCount !== 1 ? "s" : ""} (non-blocking)`;
    }
    return "All performance gates passed";
  }

  private buildSummary(
    runId: string,
    passed: GateEvaluationOutcome[],
    blocked: GateEvaluationOutcome[],
    warnings: GateEvaluationOutcome[],
    skipped: GateEvaluationOutcome[]
  ): string {
    const lines: string[] = [
      `**Run:** \`${runId}\``,
      "",
      `| Status | Count |`,
      `|--------|-------|`,
      `| ✅ Passed | ${passed.length} |`,
      `| ❌ Blocked | ${blocked.length} |`,
      `| ⚠️ Warnings | ${warnings.length} |`,
      `| ⏭ Skipped | ${skipped.length} |`,
    ];
    return lines.join("\n");
  }

  private buildDetailsTable(outcomes: GateEvaluationOutcome[]): string {
    if (outcomes.length === 0) return "No gates evaluated.";

    const lines: string[] = [
      "| Gate | Metric | Threshold | Actual | Status | Quorum |",
      "|------|--------|-----------|--------|--------|--------|",
    ];

    for (const o of outcomes) {
      const statusIcon =
        o.status === "passed" ? "✅" : o.status === "failed" ? "❌" : "⏭";
      const actual = o.actual_value !== undefined ? String(o.actual_value) : "N/A";
      const quorum = o.quorum_detail
        ? `${o.quorum_detail.recent_failures}/${o.quorum_detail.window_size}`
        : "—";

      lines.push(
        `| ${o.gate_name} | ${o.metric} | ${o.operator} ${o.threshold} | ${actual} | ${statusIcon} ${o.status} | ${quorum} |`
      );
    }

    return lines.join("\n");
  }
}
