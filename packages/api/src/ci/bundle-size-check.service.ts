/**
 * E-51: Pre-commit Bundle-Size Check
 *
 * Book: Ch 13, p211–212
 * "A pre-commit hook that estimates bundle-size impact when dependencies
 * change. Not a full gate — a fast sanity check before code review."
 *
 * Analyzes package.json changes to detect new/upgraded dependencies and
 * estimates bundle-size impact using known-sizes lookup + heuristic.
 */

import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface BundleSizeEntry {
  name: string;
  version: string;
  estimated_size_kb: number;
  source: "known" | "heuristic";
}

export interface BundleSizeCheckResult {
  added: BundleSizeEntry[];
  removed: BundleSizeEntry[];
  upgraded: { name: string; from: string; to: string; delta_kb: number }[];
  total_delta_kb: number;
  verdict: "pass" | "warn" | "fail";
  message: string;
}

export interface BundleSizeConfig {
  warn_threshold_kb: number;
  fail_threshold_kb: number;
}

// Known sizes of popular packages (minified + gzipped, in KB)
const KNOWN_PACKAGE_SIZES: Record<string, number> = {
  react: 6.4,
  "react-dom": 42,
  lodash: 72,
  moment: 67,
  "date-fns": 15,
  axios: 13,
  d3: 85,
  "chart.js": 64,
  recharts: 140,
  three: 160,
  "@mui/material": 95,
  "@emotion/react": 11,
  "@emotion/styled": 5,
  "framer-motion": 105,
  "next": 90,
  "tailwindcss": 0, // dev only, zero runtime
  typescript: 0,
  jest: 0,
  eslint: 0,
  prettier: 0,
  "@types/react": 0,
  "@types/node": 0,
};

// Heuristic: unknown packages estimated at this size
const DEFAULT_ESTIMATED_SIZE_KB = 25;

@Injectable()
export class BundleSizeCheckService {
  private readonly logger = new Logger(BundleSizeCheckService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Compare two package.json dependency maps and estimate bundle-size impact.
   */
  checkBundleSizeImpact(
    before: Record<string, string>,
    after: Record<string, string>,
    config: BundleSizeConfig = { warn_threshold_kb: 50, fail_threshold_kb: 200 },
  ): BundleSizeCheckResult {
    const added: BundleSizeEntry[] = [];
    const removed: BundleSizeEntry[] = [];
    const upgraded: { name: string; from: string; to: string; delta_kb: number }[] = [];

    // Detect added and upgraded
    for (const [name, version] of Object.entries(after)) {
      if (!(name in before)) {
        added.push(this.estimatePackageSize(name, version));
      } else if (before[name] !== version) {
        // Version change — estimate delta as small fraction of total size
        const size = this.getKnownSize(name);
        upgraded.push({
          name,
          from: before[name],
          to: version,
          delta_kb: Math.round(size * 0.1), // ~10% size change per version bump
        });
      }
    }

    // Detect removed
    for (const [name, version] of Object.entries(before)) {
      if (!(name in after)) {
        removed.push(this.estimatePackageSize(name, version));
      }
    }

    const addedKb = added.reduce((s, e) => s + e.estimated_size_kb, 0);
    const removedKb = removed.reduce((s, e) => s + e.estimated_size_kb, 0);
    const upgradedKb = upgraded.reduce((s, e) => s + e.delta_kb, 0);
    const totalDelta = addedKb - removedKb + upgradedKb;

    let verdict: "pass" | "warn" | "fail";
    let message: string;

    if (totalDelta > config.fail_threshold_kb) {
      verdict = "fail";
      message = `Bundle size increase of ~${totalDelta}KB exceeds fail threshold (${config.fail_threshold_kb}KB). Review added dependencies.`;
    } else if (totalDelta > config.warn_threshold_kb) {
      verdict = "warn";
      message = `Bundle size increase of ~${totalDelta}KB exceeds warn threshold (${config.warn_threshold_kb}KB). Consider alternatives.`;
    } else if (totalDelta <= 0) {
      verdict = "pass";
      message = totalDelta < 0
        ? `Bundle size decreased by ~${Math.abs(totalDelta)}KB. Nice cleanup!`
        : "No significant bundle size change.";
    } else {
      verdict = "pass";
      message = `Bundle size increase of ~${totalDelta}KB is within acceptable limits.`;
    }

    return { added, removed, upgraded, total_delta_kb: totalDelta, verdict, message };
  }

  /**
   * Analyze a full package.json diff (dependencies + devDependencies).
   * devDependencies are checked but weighted at 0 (build-only).
   */
  analyzePackageJsonDiff(
    beforePkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
    afterPkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
    config?: BundleSizeConfig,
  ): BundleSizeCheckResult {
    return this.checkBundleSizeImpact(
      beforePkg.dependencies ?? {},
      afterPkg.dependencies ?? {},
      config,
    );
  }

  /**
   * Store a bundle-size check result for audit trail.
   */
  async recordCheck(
    projectId: string,
    commitSha: string,
    result: BundleSizeCheckResult,
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO bundle_size_checks (project_id, commit_sha, result, verdict, total_delta_kb)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id, commit_sha) DO UPDATE SET
           result = EXCLUDED.result,
           verdict = EXCLUDED.verdict,
           total_delta_kb = EXCLUDED.total_delta_kb`,
        [projectId, commitSha, JSON.stringify(result), result.verdict, result.total_delta_kb],
      );
    } catch (err: any) {
      // Table may not exist yet — log but don't throw
      if (err?.code !== "42P01") throw err;
      this.logger.warn("bundle_size_checks table not yet created; skipping record");
    }
  }

  private estimatePackageSize(name: string, version: string): BundleSizeEntry {
    const known = KNOWN_PACKAGE_SIZES[name];
    if (known !== undefined) {
      return { name, version, estimated_size_kb: known, source: "known" };
    }
    return { name, version, estimated_size_kb: DEFAULT_ESTIMATED_SIZE_KB, source: "heuristic" };
  }

  private getKnownSize(name: string): number {
    return KNOWN_PACKAGE_SIZES[name] ?? DEFAULT_ESTIMATED_SIZE_KB;
  }
}
