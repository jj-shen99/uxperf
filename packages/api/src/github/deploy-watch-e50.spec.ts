/**
 * Deploy Watch Service Tests (E-50)
 *
 * Book Ch 14, p244: "After code deploys, the platform watches RUM for the
 * new build hash, compares against baseline, and posts pass/fail."
 */
import { Test } from "@nestjs/testing";
import { DeployWatchService } from "./deploy-watch.service";
import { GitHubCheckService } from "./github-check.service";
import { DatabaseService } from "../database/database.service";

describe("DeployWatchService (E-50)", () => {
  let service: DeployWatchService;
  let mockDb: { query: jest.Mock };
  let mockGitHub: { reportCommitStatus: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    mockGitHub = { reportCommitStatus: jest.fn().mockResolvedValue(null) };

    const module = await Test.createTestingModule({
      providers: [
        DeployWatchService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: GitHubCheckService, useValue: mockGitHub },
      ],
    }).compile();

    service = module.get(DeployWatchService);
  });

  describe("registerDeploy", () => {
    it("inserts a deploy watch record", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: "d-1", project_id: "proj-1", build_hash: "abc123",
          git_sha: "sha-1", status: "pending",
        }],
      });

      const result = await service.registerDeploy({
        project_id: "proj-1",
        build_hash: "abc123",
        git_sha: "sha-1",
      });

      expect(result.id).toBe("d-1");
      expect(result.status).toBe("pending");
      expect(mockDb.query.mock.calls[0][0]).toContain("INSERT INTO deploy_watches");
    });
  });

  describe("evaluateDeploy", () => {
    const mockDeploy = {
      id: "d-1",
      project_id: "proj-1",
      build_hash: "abc123",
      git_sha: "sha-1",
      environment: "production",
      status: "pending",
      deployed_at: new Date().toISOString(),
      rum_sample_count: 0,
    };

    it("returns pending when not enough RUM samples", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockDeploy] }) // getDeployById
        .mockResolvedValueOnce({ rows: [{ count: "10" }] }) // count RUM events
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update status

      const result = await service.evaluateDeploy("d-1");
      expect(result.status).toBe("pending");
      expect(result.rum_samples).toBe(10);
      expect(result.required_samples).toBe(30);
    });

    it("evaluates and passes when metrics are within threshold", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockDeploy] }) // getDeployById
        .mockResolvedValueOnce({ rows: [{ count: "50" }] }) // count RUM
        // For each of 5 metrics: p75 query + baseline query
        .mockResolvedValueOnce({ rows: [{ p75: 2000 }] }) // lcp deploy p75
        .mockResolvedValueOnce({ rows: [{ p75: 1900 }] }) // lcp baseline
        .mockResolvedValueOnce({ rows: [{ p75: 1500 }] }) // fcp deploy p75
        .mockResolvedValueOnce({ rows: [{ p75: 1400 }] }) // fcp baseline
        .mockResolvedValueOnce({ rows: [{ p75: 150 }] })  // inp deploy
        .mockResolvedValueOnce({ rows: [{ p75: 140 }] })  // inp baseline
        .mockResolvedValueOnce({ rows: [{ p75: 0.08 }] }) // cls deploy
        .mockResolvedValueOnce({ rows: [{ p75: 0.07 }] }) // cls baseline
        .mockResolvedValueOnce({ rows: [{ p75: 600 }] })  // ttfb deploy
        .mockResolvedValueOnce({ rows: [{ p75: 550 }] })  // ttfb baseline
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })  // update status
        .mockResolvedValueOnce({ rows: [{ github_owner: null }] }); // no github config

      const result = await service.evaluateDeploy("d-1");
      expect(result.status).toBe("passed");
      expect(result.metrics_evaluated).toHaveLength(5);
      expect(result.metrics_evaluated.every((m) => m.passed)).toBe(true);
    });

    it("fails when a metric regresses beyond threshold", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockDeploy] })
        .mockResolvedValueOnce({ rows: [{ count: "50" }] })
        // LCP regressed heavily: 3000 vs baseline 2000 = +50%
        .mockResolvedValueOnce({ rows: [{ p75: 3000 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 2000 }] })
        // Rest are fine
        .mockResolvedValueOnce({ rows: [{ p75: 1500 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 1400 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 150 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 140 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 0.08 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 0.07 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 600 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 550 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ github_owner: null }] });

      const result = await service.evaluateDeploy("d-1");
      expect(result.status).toBe("failed");
      expect(result.metrics_evaluated[0].passed).toBe(false);
      expect(result.metrics_evaluated[0].delta_pct).toBe(50);
    });

    it("posts commit status when GitHub config is available", async () => {
      mockDb.query
        .mockResolvedValueOnce({ rows: [mockDeploy] })
        .mockResolvedValueOnce({ rows: [{ count: "50" }] })
        .mockResolvedValueOnce({ rows: [{ p75: 2000 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 1900 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 1500 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 1400 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 150 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 140 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 0.08 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 0.07 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 600 }] })
        .mockResolvedValueOnce({ rows: [{ p75: 550 }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            github_owner: "my-org",
            github_repo: "my-app",
            github_token: "ghp_test",
            git_sha: "sha-1",
          }],
        });

      const result = await service.evaluateDeploy("d-1");
      expect(result.commit_status_posted).toBe(true);
      expect(mockGitHub.reportCommitStatus).toHaveBeenCalledTimes(1);
    });

    it("expires deploys older than 48 hours", async () => {
      const oldDeploy = {
        ...mockDeploy,
        deployed_at: new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString(),
      };
      mockDb.query
        .mockResolvedValueOnce({ rows: [oldDeploy] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update status

      const result = await service.evaluateDeploy("d-1");
      expect(result.status).toBe("expired");
    });

    it("skips already evaluated deploys", async () => {
      const evaluatedDeploy = { ...mockDeploy, status: "passed" };
      mockDb.query.mockResolvedValueOnce({ rows: [evaluatedDeploy] });

      const result = await service.evaluateDeploy("d-1");
      expect(result.status).toBe("passed");
      expect(result.metrics_evaluated).toHaveLength(0);
    });
  });

  describe("evaluateAllPending", () => {
    it("evaluates all pending deploys", async () => {
      mockDb.query
        .mockResolvedValueOnce({
          rows: [
            { id: "d-1", project_id: "p-1", status: "pending", deployed_at: new Date().toISOString(), build_hash: "h1", environment: "prod" },
            { id: "d-2", project_id: "p-2", status: "evaluating", deployed_at: new Date().toISOString(), build_hash: "h2", environment: "prod" },
          ],
        })
        // For each deploy: getById + count
        .mockResolvedValueOnce({ rows: [{ id: "d-1", status: "pending", deployed_at: new Date().toISOString(), project_id: "p-1", build_hash: "h1", environment: "prod", rum_sample_count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // update
        .mockResolvedValueOnce({ rows: [{ id: "d-2", status: "evaluating", deployed_at: new Date().toISOString(), project_id: "p-2", build_hash: "h2", environment: "prod", rum_sample_count: 0 }] })
        .mockResolvedValueOnce({ rows: [{ count: "5" }] })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // update

      const results = await service.evaluateAllPending();
      expect(results).toHaveLength(2);
    });
  });
});
