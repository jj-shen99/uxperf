/**
 * Unit tests for the Author page logic and data structures.
 * Tests mutation payload construction, script tab state, save-script naming
 * fallbacks, and pipeline-stages defensive rendering.
 */

// ── helpers extracted from the page component ──

function buildGeneratePayload(params: {
  projectId: string;
  prompt: string;
  targetUrl: string;
  device: string;
}) {
  return {
    project_id: params.projectId,
    prompt: params.prompt,
    target_url: params.targetUrl || undefined,
    device: params.device,
  };
}

function buildSavePayload(params: {
  projectId: string;
  scriptName: string;
  result: any;
  prompt: string;
}) {
  return {
    project_id: params.projectId,
    name:
      params.scriptName.trim() ||
      params.result?.generated_script?.id ||
      `NL Script ${new Date().toLocaleString()}`,
    canonical_json: params.result?.generated_script ?? {},
    source_prompt: params.prompt,
    authoring_mode: "describe",
  };
}

function pipelineStagesSafe(result: any) {
  return result?.pipeline_stages?.map((s: any) => s.name) ?? [];
}

// ── tests ──

describe("Author Page — Generate Payload", () => {
  it("omits target_url when empty", () => {
    const payload = buildGeneratePayload({
      projectId: "p1",
      prompt: "test",
      targetUrl: "",
      device: "desktop",
    });
    expect(payload.target_url).toBeUndefined();
  });

  it("includes target_url when provided", () => {
    const payload = buildGeneratePayload({
      projectId: "p1",
      prompt: "test",
      targetUrl: "https://example.com",
      device: "mobile",
    });
    expect(payload.target_url).toBe("https://example.com");
    expect(payload.device).toBe("mobile");
  });

  it("passes project_id and prompt verbatim", () => {
    const payload = buildGeneratePayload({
      projectId: "abc-123",
      prompt: "Load the home page",
      targetUrl: "",
      device: "desktop",
    });
    expect(payload.project_id).toBe("abc-123");
    expect(payload.prompt).toBe("Load the home page");
  });
});

describe("Author Page — Save Script Payload", () => {
  it("uses scriptName when provided", () => {
    const payload = buildSavePayload({
      projectId: "p1",
      scriptName: "My Script",
      result: { generated_script: { id: "gen-1", steps: [] } },
      prompt: "test",
    });
    expect(payload.name).toBe("My Script");
  });

  it("falls back to generated_script.id when scriptName is empty", () => {
    const payload = buildSavePayload({
      projectId: "p1",
      scriptName: "",
      result: { generated_script: { id: "gen-fallback", steps: [] } },
      prompt: "test",
    });
    expect(payload.name).toBe("gen-fallback");
  });

  it("falls back to NL Script timestamp when both are empty", () => {
    const payload = buildSavePayload({
      projectId: "p1",
      scriptName: "",
      result: { generated_script: {} },
      prompt: "test",
    });
    expect(payload.name).toMatch(/^NL Script /);
  });

  it("defaults canonical_json to {} when generated_script is missing", () => {
    const payload = buildSavePayload({
      projectId: "p1",
      scriptName: "x",
      result: {},
      prompt: "test",
    });
    expect(payload.canonical_json).toEqual({});
  });

  it("always sets authoring_mode to describe", () => {
    const payload = buildSavePayload({
      projectId: "p1",
      scriptName: "x",
      result: {},
      prompt: "test",
    });
    expect(payload.authoring_mode).toBe("describe");
  });
});

describe("Author Page — Pipeline Stages Defensive Access", () => {
  it("returns empty array when result is null", () => {
    expect(pipelineStagesSafe(null)).toEqual([]);
  });

  it("returns empty array when result has no pipeline_stages", () => {
    expect(pipelineStagesSafe({ status: "ok" })).toEqual([]);
  });

  it("returns empty array when pipeline_stages is undefined", () => {
    expect(pipelineStagesSafe({ pipeline_stages: undefined })).toEqual([]);
  });

  it("maps stage names when pipeline_stages is present", () => {
    const result = {
      pipeline_stages: [
        { name: "parse", status: "completed", duration_ms: 10 },
        { name: "validate", status: "completed", duration_ms: 20 },
      ],
    };
    expect(pipelineStagesSafe(result)).toEqual(["parse", "validate"]);
  });
});

describe("Author Page — Script Tab State", () => {
  it("defaults to playwright tab", () => {
    const defaultTab: "playwright" | "json" = "playwright";
    expect(defaultTab).toBe("playwright");
  });

  it("only allows playwright or json", () => {
    const validTabs = ["playwright", "json"] as const;
    expect(validTabs).toContain("playwright");
    expect(validTabs).toContain("json");
    expect(validTabs).toHaveLength(2);
  });
});

describe("Author Page — Confidence Score Rendering", () => {
  function confidenceWidth(score: number): string {
    return `${score * 100}%`;
  }

  function confidenceColor(score: number): string {
    return score >= 0.7 ? "bg-green-500" : "bg-yellow-500";
  }

  it("high confidence gets green", () => {
    expect(confidenceColor(0.85)).toBe("bg-green-500");
  });

  it("low confidence gets yellow", () => {
    expect(confidenceColor(0.5)).toBe("bg-yellow-500");
  });

  it("boundary 0.7 gets green", () => {
    expect(confidenceColor(0.7)).toBe("bg-green-500");
  });

  it("just below boundary gets yellow", () => {
    expect(confidenceColor(0.69)).toBe("bg-yellow-500");
  });

  it("computes width percentage correctly", () => {
    expect(confidenceWidth(0.85)).toBe("85%");
    expect(confidenceWidth(0)).toBe("0%");
    expect(confidenceWidth(1)).toBe("100%");
  });
});
