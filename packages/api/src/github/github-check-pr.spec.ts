import { GitHubCheckService, GitHubCheckConfig } from "./github-check.service";
import { GateEvaluationOutcome } from "../gates/gates.service";

/**
 * GitHub Check Service — PR Comment Tests (E-33)
 *
 * Ch 13, p167: "One comment on the PR" with collapsible sections.
 */

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe("GitHubCheckService — upsertPrComment (E-33)", () => {
  let service: GitHubCheckService;

  const config: GitHubCheckConfig & { prNumber: number } = {
    owner: "my-org",
    repo: "my-app",
    sha: "abc123",
    token: "ghp_test",
    prNumber: 42,
  };

  const passedGate: GateEvaluationOutcome = {
    gate_id: "g-1", gate_name: "LCP Gate", policy: "block",
    status: "passed", metric: "lcp", actual_value: 2000,
    threshold: 2500, operator: "lte",
  };

  const failedBlockGate: GateEvaluationOutcome = {
    gate_id: "g-2", gate_name: "FCP Gate", policy: "block",
    status: "failed", metric: "fcp", actual_value: 3000,
    threshold: 1800, operator: "lte",
  };

  const failedWarnGate: GateEvaluationOutcome = {
    gate_id: "g-3", gate_name: "CLS Gate", policy: "warn",
    status: "failed", metric: "cls", actual_value: 0.15,
    threshold: 0.1, operator: "lte",
  };

  beforeEach(() => {
    service = new GitHubCheckService();
    mockFetch.mockReset();
  });

  it("creates a new PR comment when none exists", async () => {
    // List comments → none with marker
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 100, body: "unrelated comment" }],
    });
    // Create comment
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 200 }),
    });

    const result = await service.upsertPrComment(config, "run-1", [passedGate]);
    expect(result.created).toBe(true);
    expect(result.commentId).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("updates existing PR comment with marker", async () => {
    // List comments → found one with marker
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { id: 100, body: "unrelated" },
        { id: 150, body: "<!-- perf-framework-gate-summary -->\nold content" },
      ],
    });
    // Update (PATCH)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const result = await service.upsertPrComment(config, "run-2", [passedGate]);
    expect(result.created).toBe(false);
    expect(result.commentId).toBe(150);

    // Verify PATCH was called
    expect(mockFetch.mock.calls[1][0]).toContain("issues/comments/150");
    expect(mockFetch.mock.calls[1][1].method).toBe("PATCH");
  });

  it("includes collapsible blocking failures section", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => [],
    });
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ id: 300 }),
    });

    await service.upsertPrComment(config, "run-1", [failedBlockGate, passedGate]);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body).body;
    expect(body).toContain("<!-- perf-framework-gate-summary -->");
    expect(body).toContain("Blocking Failures");
    expect(body).toContain("<details open>");
    expect(body).toContain("FCP Gate");
    expect(body).toContain("Passed");
  });

  it("includes warnings section (collapsed by default)", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 301 }) });

    await service.upsertPrComment(config, "run-1", [failedWarnGate, passedGate]);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body).body;
    expect(body).toContain("Warnings");
    expect(body).toContain("CLS Gate");
  });

  it("includes dashboard link when provided", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 302 }) });

    await service.upsertPrComment(
      config, "run-1", [passedGate], "https://dash.example.com/runs/run-1",
    );

    const body = JSON.parse(mockFetch.mock.calls[1][1].body).body;
    expect(body).toContain("https://dash.example.com/runs/run-1");
    expect(body).toContain("View details");
  });

  it("skips when no token configured", async () => {
    const noToken = { ...config, token: "" };
    const result = await service.upsertPrComment(noToken, "run-1", [passedGate]);
    expect(result.commentId).toBeNull();
    expect(result.created).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles fetch failure gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await service.upsertPrComment(config, "run-1", [passedGate]);
    expect(result.commentId).toBeNull();
    expect(result.created).toBe(false);
  });

  it("handles failed comment list API call", async () => {
    // List fails → creates new
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ id: 400 }),
    });

    const result = await service.upsertPrComment(config, "run-1", [passedGate]);
    expect(result.created).toBe(true);
  });

  it("all-pass summary shows correct headline", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 500 }) });

    await service.upsertPrComment(config, "run-1", [passedGate]);

    const body = JSON.parse(mockFetch.mock.calls[1][1].body).body;
    expect(body).toContain("All 1 gate(s) passed");
  });
});
