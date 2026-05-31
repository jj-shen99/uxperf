/**
 * E-25 / E-26: Infrastructure configuration validation tests.
 *
 * Verifies Docker Compose structure and CI pipeline configuration
 * without requiring Docker or GitHub Actions to be running.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// =============================================================
// E-25: Docker Compose validation
// =============================================================

describe("Docker Compose configuration", () => {
  const composePath = resolve(__dirname, "../../../../docker/docker-compose.yml");
  let composeContent: string;

  beforeAll(() => {
    composeContent = readFileSync(composePath, "utf-8");
  });

  it("defines postgres service", () => {
    expect(composeContent).toContain("postgres:");
    expect(composeContent).toContain("postgres:16-alpine");
  });

  it("defines api service", () => {
    expect(composeContent).toContain("api:");
    expect(composeContent).toContain("api.Dockerfile");
  });

  it("defines dashboard service", () => {
    expect(composeContent).toContain("dashboard:");
    expect(composeContent).toContain("dashboard.Dockerfile");
  });

  it("defines worker service", () => {
    expect(composeContent).toContain("worker:");
    expect(composeContent).toContain("worker.Dockerfile");
  });

  it("defines migrate service", () => {
    expect(composeContent).toContain("migrate:");
    expect(composeContent).toContain("migrate.mjs");
  });

  it("api depends on postgres healthcheck", () => {
    expect(composeContent).toContain("service_healthy");
  });

  it("api depends on migration completion", () => {
    expect(composeContent).toContain("service_completed_successfully");
  });

  it("uses environment variable defaults for credentials", () => {
    expect(composeContent).toContain("${POSTGRES_USER:-perf}");
    expect(composeContent).toContain("${POSTGRES_PASSWORD:-perf}");
    expect(composeContent).toContain("${POSTGRES_DB:-perf_framework}");
  });

  it("build contexts point to parent directory", () => {
    // Compose file is in docker/, so context should be ..
    expect(composeContent).toContain("context: ..");
  });

  it("defines network isolation", () => {
    expect(composeContent).toContain("networks:");
    expect(composeContent).toContain("backend");
    expect(composeContent).toContain("frontend");
  });

  it("has restart policies", () => {
    expect(composeContent).toContain("restart: unless-stopped");
  });

  it("has resource limits", () => {
    expect(composeContent).toContain("resources:");
    expect(composeContent).toContain("limits:");
    expect(composeContent).toContain("memory:");
  });

  it("worker uses profile for opt-in", () => {
    expect(composeContent).toContain("profiles:");
    expect(composeContent).toContain("- worker");
  });

  it("defines pgdata volume", () => {
    expect(composeContent).toContain("pgdata:");
  });

  it("api has healthcheck", () => {
    // API service has its own healthcheck for downstream dependencies
    expect(composeContent).toContain("/api/v1/health");
  });
});

// =============================================================
// E-26: CI Pipeline validation
// =============================================================

describe("CI pipeline configuration", () => {
  const ciPath = resolve(__dirname, "../../../../.github/workflows/ci.yml");
  let ciContent: string;

  beforeAll(() => {
    ciContent = readFileSync(ciPath, "utf-8");
  });

  it("triggers on push to main", () => {
    expect(ciContent).toContain("push:");
    expect(ciContent).toContain("branches: [main");
  });

  it("triggers on pull requests to main", () => {
    expect(ciContent).toContain("pull_request:");
  });

  it("allows manual dispatch", () => {
    expect(ciContent).toContain("workflow_dispatch");
  });

  it("has concurrency control", () => {
    expect(ciContent).toContain("concurrency:");
    expect(ciContent).toContain("cancel-in-progress: true");
  });

  it("tests API package", () => {
    expect(ciContent).toContain("test-api:");
    expect(ciContent).toContain("--workspace=packages/api");
  });

  it("tests Worker package", () => {
    expect(ciContent).toContain("test-worker:");
    expect(ciContent).toContain("--workspace=packages/worker");
  });

  it("tests Dashboard package", () => {
    expect(ciContent).toContain("test-dashboard:");
    expect(ciContent).toContain("--workspace=packages/dashboard");
  });

  it("tests Shared package", () => {
    expect(ciContent).toContain("test-shared:");
    expect(ciContent).toContain("--workspace=packages/shared");
  });

  it("runs lint and build", () => {
    expect(ciContent).toContain("lint-and-build:");
    expect(ciContent).toContain("npm run lint");
    expect(ciContent).toContain("npm run build");
  });

  it("tests database migrations round-trip", () => {
    expect(ciContent).toContain("db-migration-test:");
    expect(ciContent).toContain("db:migrate");
  });

  it("tests migration idempotency", () => {
    expect(ciContent).toContain("idempotency check");
  });

  it("uses Node.js 20", () => {
    expect(ciContent).toContain("node-version: 20");
  });

  it("uses npm cache", () => {
    expect(ciContent).toContain("cache: npm");
  });
});
