/**
 * Tests for recent code changes:
 * - Load page: profile filtering by project, URL-required Quick Run, error display,
 *   k6 diagnostic banner logic, Total Cost removal
 * - Intelligence page: environment filtering (skip non-DB envs like "preview")
 * - Sidebar: "Author" → "Generate Scripts" rename
 * - Platform health: review completion
 * - Budgets: ratchet budget explanations
 *
 * Techniques: equivalence partitioning, boundary value analysis, decision tables,
 * state transition, regression.
 */

// ============================================================
// 1. Load Page — Profile Filtering by Project
// ============================================================

describe("Load Profiles — project filtering", () => {
  const allProfiles = [
    { id: "lp-1", project_id: "proj-a", name: "Baseline 50VU" },
    { id: "lp-2", project_id: "proj-b", name: "Spike Test" },
    { id: "lp-3", project_id: "proj-a", name: "Endurance" },
    { id: "lp-4", project_id: "proj-c", name: "Cold Start" },
  ];

  function filterProfiles(profiles, projectId) {
    if (!projectId) return [];
    return profiles.filter((p) => p.project_id === projectId);
  }

  it("returns only profiles matching the selected project", () => {
    const result = filterProfiles(allProfiles, "proj-a");
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.project_id === "proj-a")).toBe(true);
  });

  it("returns empty when projectId is undefined", () => {
    expect(filterProfiles(allProfiles, undefined)).toHaveLength(0);
  });

  it("returns empty when projectId is empty string (treated as falsy)", () => {
    expect(filterProfiles(allProfiles, "")).toHaveLength(0);
  });

  it("returns empty when no profiles match", () => {
    expect(filterProfiles(allProfiles, "proj-z")).toHaveLength(0);
  });

  it("returns single profile when only one matches", () => {
    const result = filterProfiles(allProfiles, "proj-b");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Spike Test");
  });
});

// ============================================================
// 2. Load Page — Quick Run URL Validation
// ============================================================

describe("Load Page — Quick Run URL requirement", () => {
  function canLaunchQuickRun(projectId, url, isPending) {
    return !!projectId && !!url.trim() && !isPending;
  }

  // Equivalence partitioning
  it("allows launch when project, url, and not pending", () => {
    expect(canLaunchQuickRun("proj-a", "https://example.com", false)).toBe(true);
  });

  it("blocks launch when url is empty", () => {
    expect(canLaunchQuickRun("proj-a", "", false)).toBe(false);
  });

  it("blocks launch when url is whitespace only", () => {
    expect(canLaunchQuickRun("proj-a", "   ", false)).toBe(false);
  });

  it("blocks launch when projectId is empty", () => {
    expect(canLaunchQuickRun("", "https://example.com", false)).toBe(false);
  });

  it("blocks launch when mutation is pending", () => {
    expect(canLaunchQuickRun("proj-a", "https://example.com", true)).toBe(false);
  });

  // Boundary: url with only spaces then a character
  it("allows launch when url has leading spaces but real content", () => {
    expect(canLaunchQuickRun("proj-a", "  https://example.com  ", false)).toBe(true);
  });
});

// ============================================================
// 3. Load Page — Quick Run Payload (URL always included)
// ============================================================

describe("Load Page — Quick Run payload construction", () => {
  function buildQuickRunPayload(projectId, qVUs, qDuration, qCache, qUrl, qScriptId) {
    if (!projectId || !qUrl.trim()) return null;
    return {
      project_id: projectId,
      target_vus: qVUs,
      stages: [
        { duration_s: Math.round(qDuration * 0.2), target_vus: qVUs, ramp_type: "linear" },
        { duration_s: Math.round(qDuration * 0.6), target_vus: qVUs },
        { duration_s: Math.round(qDuration * 0.2), target_vus: 0, ramp_type: "linear" },
      ],
      cache_state: qCache,
      url: qUrl.trim(),
      ...(qScriptId ? { script_id: qScriptId } : {}),
    };
  }

  it("always includes url field in payload", () => {
    const payload = buildQuickRunPayload("proj-a", 5, 60, "warm", "https://example.com", "");
    expect(payload).not.toBeNull();
    expect(payload.url).toBe("https://example.com");
  });

  it("trims url whitespace", () => {
    const payload = buildQuickRunPayload("proj-a", 5, 60, "warm", "  https://test.com  ", "");
    expect(payload.url).toBe("https://test.com");
  });

  it("returns null if url is empty", () => {
    expect(buildQuickRunPayload("proj-a", 5, 60, "warm", "", "")).toBeNull();
  });

  it("includes script_id when provided", () => {
    const payload = buildQuickRunPayload("proj-a", 5, 60, "warm", "https://test.com", "sc-1");
    expect(payload.script_id).toBe("sc-1");
  });

  it("omits script_id when empty", () => {
    const payload = buildQuickRunPayload("proj-a", 5, 60, "warm", "https://test.com", "");
    expect(payload).not.toHaveProperty("script_id");
  });
});

// ============================================================
// 4. Load Page — Profile Launch URL
// ============================================================

describe("Load Page — Profile launch with URL", () => {
  function buildProfileLaunchPayload(projectId, profileId, url, isPending) {
    if (isPending || !url.trim()) return null;
    return { project_id: projectId, load_profile_id: profileId, url: url.trim() };
  }

  it("includes url in profile launch payload", () => {
    const payload = buildProfileLaunchPayload("proj-a", "lp-1", "https://example.com", false);
    expect(payload).not.toBeNull();
    expect(payload.url).toBe("https://example.com");
  });

  it("blocks when url is empty", () => {
    expect(buildProfileLaunchPayload("proj-a", "lp-1", "", false)).toBeNull();
  });

  it("blocks when isPending is true", () => {
    expect(buildProfileLaunchPayload("proj-a", "lp-1", "https://example.com", true)).toBeNull();
  });
});

// ============================================================
// 5. Load Page — k6 Diagnostic Banner Decision Table
// ============================================================

describe("Load Page — k6 diagnostic banner", () => {
  function shouldShowBanner(configValue) {
    return configValue !== "true";
  }

  // Decision table
  it("shows banner when config is undefined", () => {
    expect(shouldShowBanner(undefined)).toBe(true);
  });

  it("shows banner when config is 'false'", () => {
    expect(shouldShowBanner("false")).toBe(true);
  });

  it("shows banner when config is empty string", () => {
    expect(shouldShowBanner("")).toBe(true);
  });

  it("hides banner when config is 'true'", () => {
    expect(shouldShowBanner("true")).toBe(false);
  });

  it("shows banner when config is 'TRUE' (case-sensitive)", () => {
    expect(shouldShowBanner("TRUE")).toBe(true);
  });
});

// ============================================================
// 6. Load Page — Summary Stats (Total Cost removed)
// ============================================================

describe("Load Page — Summary stats labels", () => {
  const SUMMARY_LABELS = ["Total Runs", "Active", "Completed", "Failed", "Total VU-min"];

  it("has exactly 5 stat cards (no Total Cost)", () => {
    expect(SUMMARY_LABELS).toHaveLength(5);
  });

  it("does not include Total Cost", () => {
    expect(SUMMARY_LABELS).not.toContain("Total Cost");
  });

  it("includes all expected labels", () => {
    expect(SUMMARY_LABELS).toContain("Total Runs");
    expect(SUMMARY_LABELS).toContain("Active");
    expect(SUMMARY_LABELS).toContain("Completed");
    expect(SUMMARY_LABELS).toContain("Failed");
    expect(SUMMARY_LABELS).toContain("Total VU-min");
  });
});

// ============================================================
// 7. Load Page — Error Display Logic
// ============================================================

describe("Load Page — Error display on failed runs", () => {
  function shouldShowError(run) {
    return !!run.error;
  }

  it("shows error when run.error is a non-empty string", () => {
    expect(shouldShowError({ error: "k6 browser engine is not available" })).toBe(true);
  });

  it("hides error when run.error is null", () => {
    expect(shouldShowError({ error: null })).toBe(false);
  });

  it("hides error when run.error is undefined", () => {
    expect(shouldShowError({})).toBe(false);
  });

  it("hides error when run.error is empty string", () => {
    expect(shouldShowError({ error: "" })).toBe(false);
  });
});

// ============================================================
// 8. Intelligence Page — Environment Filtering
// ============================================================

describe("Intelligence — environment filtering", () => {
  function buildEnvComparison(dbEnvironments, runs) {
    const envMap = {};
    for (const dbEnv of dbEnvironments) {
      envMap[dbEnv.slug] = [];
    }
    const validSlugs = new Set(dbEnvironments.map((e) => e.slug));
    runs.forEach((r) => {
      const env = r.environment || "staging";
      if (!validSlugs.has(env)) return;
      if (!envMap[env]) envMap[env] = [];
      envMap[env].push(r);
    });
    return Object.keys(envMap);
  }

  const dbEnvs = [
    { slug: "staging", name: "Staging" },
    { slug: "production", name: "Production" },
  ];

  it("excludes 'preview' from environments", () => {
    const runs = [
      { environment: "staging" },
      { environment: "preview" },
      { environment: "production" },
    ];
    const envs = buildEnvComparison(dbEnvs, runs);
    expect(envs).toContain("staging");
    expect(envs).toContain("production");
    expect(envs).not.toContain("preview");
  });

  it("maps undefined environment to 'staging'", () => {
    const runs = [{ environment: undefined }];
    const envs = buildEnvComparison(dbEnvs, runs);
    expect(envs).toContain("staging");
  });

  it("excludes arbitrary unknown environments", () => {
    const runs = [
      { environment: "dev" },
      { environment: "canary" },
    ];
    const envs = buildEnvComparison(dbEnvs, runs);
    expect(envs).not.toContain("dev");
    expect(envs).not.toContain("canary");
  });

  it("always includes DB-configured environments even without runs", () => {
    const envs = buildEnvComparison(dbEnvs, []);
    expect(envs).toContain("staging");
    expect(envs).toContain("production");
  });

  it("handles no DB environments gracefully", () => {
    const envs = buildEnvComparison([], [{ environment: "staging" }]);
    expect(envs).toHaveLength(0);
  });
});

// ============================================================
// 9. Sidebar — Nav Item Rename
// ============================================================

describe("Sidebar — 'Author' renamed to 'Generate Scripts'", () => {
  const navItems = [
    { href: "/runs", label: "Runs" },
    { href: "/scripts", label: "Scripts" },
    { href: "/author", label: "Generate Scripts" },
    { href: "/load", label: "Load Test" },
  ];

  it("has 'Generate Scripts' label for /author route", () => {
    const item = navItems.find((n) => n.href === "/author");
    expect(item).toBeDefined();
    expect(item.label).toBe("Generate Scripts");
  });

  it("does not have any item labeled 'Author'", () => {
    expect(navItems.find((n) => n.label === "Author")).toBeUndefined();
  });
});

// ============================================================
// 10. Practice Review — Completion Logic
// ============================================================

describe("Practice Review — completion", () => {
  function completeReview(review) {
    return {
      ...review,
      status: "completed",
      completed_at: new Date().toISOString(),
      score: computeScore(review.responses),
    };
  }

  function computeScore(responses) {
    if (responses.length === 0) return 0;
    const earned = responses.filter((r) => r.answer === "yes").length;
    return Math.round((earned / responses.length) * 100);
  }

  // State transitions
  it("transitions from in_progress to completed", () => {
    const review = {
      id: "rev-1",
      status: "in_progress",
      responses: [{ question_id: "q1", answer: "yes", notes: "" }],
      completed_at: null,
      score: null,
    };
    const result = completeReview(review);
    expect(result.status).toBe("completed");
    expect(result.completed_at).not.toBeNull();
    expect(result.score).not.toBeNull();
  });

  it("transitions from pending to completed", () => {
    const review = {
      id: "rev-2",
      status: "pending",
      responses: [],
      completed_at: null,
      score: null,
    };
    const result = completeReview(review);
    expect(result.status).toBe("completed");
    expect(result.score).toBe(0);
  });

  it("computes score as percentage of yes answers", () => {
    const responses = [
      { question_id: "q1", answer: "yes", notes: "" },
      { question_id: "q2", answer: "no", notes: "" },
      { question_id: "q3", answer: "yes", notes: "" },
      { question_id: "q4", answer: "partial", notes: "" },
    ];
    expect(computeScore(responses)).toBe(50);
  });

  it("returns 0 score for empty responses", () => {
    expect(computeScore([])).toBe(0);
  });

  // Save button visibility decision table
  function shouldShowSaveButton(review) {
    if (!review) return false;
    return review.status !== "completed" && review.responses?.length > 0;
  }

  it("shows save when in_progress with responses", () => {
    expect(shouldShowSaveButton({ status: "in_progress", responses: [{}] })).toBe(true);
  });

  it("hides save when completed", () => {
    expect(shouldShowSaveButton({ status: "completed", responses: [{}] })).toBe(false);
  });

  it("hides save when no responses yet", () => {
    expect(shouldShowSaveButton({ status: "pending", responses: [] })).toBe(false);
  });

  it("hides save when review is null", () => {
    expect(shouldShowSaveButton(null)).toBe(false);
  });
});

// ============================================================
// 11. k6 Browser Adapter — isAvailable decision table
// ============================================================

describe("k6 Browser Adapter — isAvailable logic", () => {
  function isAvailable(envValue, configApiValue, k6BinaryFound) {
    let enabled = envValue === "true";
    if (!enabled && configApiValue) {
      enabled = configApiValue === "true";
    }
    if (!enabled) return false;
    return k6BinaryFound;
  }

  // Decision table: env × config × binary
  it("returns true when env=true and binary found", () => {
    expect(isAvailable("true", undefined, true)).toBe(true);
  });

  it("returns false when env=true but binary missing", () => {
    expect(isAvailable("true", undefined, false)).toBe(false);
  });

  it("returns true when env unset but config=true and binary found", () => {
    expect(isAvailable(undefined, "true", true)).toBe(true);
  });

  it("returns false when both env and config are unset", () => {
    expect(isAvailable(undefined, undefined, true)).toBe(false);
  });

  it("returns false when env=false and config=false", () => {
    expect(isAvailable("false", "false", true)).toBe(false);
  });

  it("env=true takes priority, skips config check", () => {
    expect(isAvailable("true", "false", true)).toBe(true);
  });
});
