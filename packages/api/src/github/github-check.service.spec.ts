import { GitHubCheckService, GitHubCheckConfig, CheckRunPayload } from "./github-check.service";
import { GateEvaluationOutcome } from "../gates/gates.service";

// ============================================================
// GitHub Check Service — Unit Tests
// Techniques: EP, decision tree, boundary, MC/DC
// ============================================================

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe("GitHubCheckService", () => {
  let service: GitHubCheckService;

  const config: GitHubCheckConfig = {
    owner: "my-org",
    repo: "my-app",
    sha: "abc123def456",
    token: "ghp_test_token",
  };

  const passedGate: GateEvaluationOutcome = {
    gate_id: "g-1",
    gate_name: "LCP Gate",
    policy: "block",
    status: "passed",
    metric: "lcp",
    actual_value: 2000,
    threshold: 2500,
    operator: "lte",
    quorum_detail: { recent_failures: 0, required_failures: 3, window_size: 5 },
  };

  const failedBlockGate: GateEvaluationOutcome = {
    gate_id: "g-2",
    gate_name: "FCP Gate",
    policy: "block",
    status: "failed",
    metric: "fcp",
    actual_value: 3000,
    threshold: 1800,
    operator: "lte",
    quorum_detail: { recent_failures: 3, required_failures: 3, window_size: 5 },
  };

  const failedWarnGate: GateEvaluationOutcome = {
    gate_id: "g-3",
    gate_name: "CLS Gate",
    policy: "warn",
    status: "failed",
    metric: "cls",
    actual_value: 0.15,
    threshold: 0.1,
    operator: "lte",
    quorum_detail: { recent_failures: 3, required_failures: 3, window_size: 5 },
  };

  const skippedGate: GateEvaluationOutcome = {
    gate_id: "g-4",
    gate_name: "TBT Gate",
    policy: "warn",
    status: "skipped",
    metric: "tbt",
    threshold: 200,
    operator: "lte",
  };

  beforeEach(() => {
    service = new GitHubCheckService();
    mockFetch.mockReset();
  });

  // ----------------------------------------------------------
  // reportGateResults — EP + decision tree
  // ----------------------------------------------------------
  describe("reportGateResults", () => {
    it("posts check run with conclusion 'success' when all gates pass", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 42 }),
      });

      const result = await service.reportGateResults(config, "run-1", [passedGate]);
      expect(result.posted).toBe(true);
      expect(result.checkRunId).toBe(42);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as CheckRunPayload;
      expect(body.conclusion).toBe("success");
      expect(body.head_sha).toBe("abc123def456");
      expect(body.name).toBe("perf-gates");
    });

    it("posts check run with conclusion 'failure' when blocking gate fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 43 }),
      });

      const result = await service.reportGateResults(config, "run-1", [
        passedGate,
        failedBlockGate,
      ]);
      expect(result.posted).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as CheckRunPayload;
      expect(body.conclusion).toBe("failure");
    });

    it("posts check run with conclusion 'neutral' when only warnings fail (decision tree)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 44 }),
      });

      const result = await service.reportGateResults(config, "run-1", [
        passedGate,
        failedWarnGate,
      ]);
      expect(result.posted).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as CheckRunPayload;
      expect(body.conclusion).toBe("neutral");
    });

    // EP: no token → skip
    it("skips posting when no token is configured", async () => {
      const noToken = { ...config, token: "" };
      const result = await service.reportGateResults(noToken, "run-1", [passedGate]);
      expect(result.posted).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    // EP: API returns error
    it("returns posted=false when GitHub API returns error", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "Bad credentials",
      });

      const result = await service.reportGateResults(config, "run-1", [passedGate]);
      expect(result.posted).toBe(false);
      expect(result.checkRunId).toBeNull();
    });

    // EP: network error
    it("returns posted=false on fetch failure", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await service.reportGateResults(config, "run-1", [passedGate]);
      expect(result.posted).toBe(false);
    });

    // Structural: includes skipped gates in output
    it("includes all gate types in output table", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 45 }),
      });

      await service.reportGateResults(config, "run-1", [
        passedGate,
        failedBlockGate,
        failedWarnGate,
        skippedGate,
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as CheckRunPayload;
      expect(body.output.summary).toContain("Passed");
      expect(body.output.summary).toContain("Blocked");
      expect(body.output.summary).toContain("Warnings");
      expect(body.output.summary).toContain("Skipped");
      expect(body.output.text).toContain("LCP Gate");
      expect(body.output.text).toContain("FCP Gate");
      expect(body.output.text).toContain("CLS Gate");
      expect(body.output.text).toContain("TBT Gate");
    });

    // MC/DC: conclusion depends independently on blockingFailed and warnings
    it("MC/DC: blocking failure overrides warnings", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 46 }),
      });

      // Both blocking AND warning gates fail
      await service.reportGateResults(config, "run-1", [
        failedBlockGate,
        failedWarnGate,
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body) as CheckRunPayload;
      expect(body.conclusion).toBe("failure"); // blocking takes precedence
    });
  });

  // ----------------------------------------------------------
  // reportCommitStatus — EP + decision tree
  // ----------------------------------------------------------
  describe("reportCommitStatus", () => {
    it("posts 'success' status when all gates pass", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const result = await service.reportCommitStatus(config, "run-1", [passedGate]);
      expect(result).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.state).toBe("success");
      expect(body.context).toBe("perf-framework/gates");
    });

    it("posts 'failure' status when blocking gate fails", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      const result = await service.reportCommitStatus(config, "run-1", [failedBlockGate]);
      expect(result).toBe(true);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.state).toBe("failure");
    });

    it("includes target_url when provided", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      await service.reportCommitStatus(config, "run-1", [passedGate], "https://dashboard.example.com/runs/run-1");
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.target_url).toBe("https://dashboard.example.com/runs/run-1");
    });

    it("returns false when no token", async () => {
      const result = await service.reportCommitStatus({ ...config, token: "" }, "run-1", [passedGate]);
      expect(result).toBe(false);
    });

    it("returns false on API error", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401, text: async () => "Unauthorized" });
      const result = await service.reportCommitStatus(config, "run-1", [passedGate]);
      expect(result).toBe(false);
    });
  });
});
