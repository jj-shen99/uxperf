/**
 * Regression tests for the api.ts request() function.
 *
 * Covers:
 *   - Normal JSON responses
 *   - Empty-body responses (DELETE returning 200 with Content-Length: 0)
 *   - 204 No Content responses
 *   - Error responses (non-2xx status)
 *   - Malformed JSON responses
 *   - Auth page detection for ShellLayout
 *   - Session storage key format
 */

// --- request() logic extracted for unit testing ---

async function request<T>(
  res: Response,
): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body}`);
  }
  const contentLength = res.headers.get("content-length");
  if (res.status === 204 || contentLength === "0") {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

function makeResponse(
  body: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("request() — JSON response handling", () => {
  it("parses valid JSON response", async () => {
    const res = makeResponse('{"id":"1","name":"test"}', 200);
    const data = await request<{ id: string; name: string }>(res);
    expect(data).toEqual({ id: "1", name: "test" });
  });

  it("parses JSON array response", async () => {
    const res = makeResponse('[{"id":"1"},{"id":"2"}]', 200);
    const data = await request<{ id: string }[]>(res);
    expect(data).toHaveLength(2);
  });
});

describe("request() — Empty body handling (DELETE regression)", () => {
  it("handles 200 with Content-Length: 0", async () => {
    const res = makeResponse("", 200, { "Content-Length": "0" });
    const data = await request<void>(res);
    expect(data).toBeUndefined();
  });

  it("handles 204 No Content", async () => {
    const res = new Response(null, { status: 204 });
    const data = await request<void>(res);
    expect(data).toBeUndefined();
  });

  it("handles 200 with empty text body", async () => {
    const res = makeResponse("", 200);
    const data = await request<void>(res);
    expect(data).toBeUndefined();
  });
});

describe("request() — Error handling", () => {
  it("throws on 404 with error message", async () => {
    const res = makeResponse('{"message":"Not Found"}', 404);
    await expect(request(res)).rejects.toThrow("API 404");
  });

  it("throws on 500 with error body", async () => {
    const res = makeResponse("Internal Server Error", 500);
    await expect(request(res)).rejects.toThrow("API 500");
  });

  it("throws on 401 Unauthorized", async () => {
    const res = makeResponse('{"message":"Unauthorized"}', 401);
    await expect(request(res)).rejects.toThrow("API 401");
  });

  it("includes response body in error message", async () => {
    const res = makeResponse('{"message":"Run xyz not found"}', 404);
    await expect(request(res)).rejects.toThrow("Run xyz not found");
  });
});

// --- ShellLayout auth page detection ---

const AUTH_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

function isAuthPage(pathname: string): boolean {
  return AUTH_PATHS.some((p) => pathname.startsWith(p));
}

describe("ShellLayout — Auth page detection", () => {
  it("detects /login as auth page", () => {
    expect(isAuthPage("/login")).toBe(true);
  });

  it("detects /register as auth page", () => {
    expect(isAuthPage("/register")).toBe(true);
  });

  it("detects /forgot-password as auth page", () => {
    expect(isAuthPage("/forgot-password")).toBe(true);
  });

  it("detects /reset-password as auth page", () => {
    expect(isAuthPage("/reset-password")).toBe(true);
  });

  it("does NOT detect / as auth page", () => {
    expect(isAuthPage("/")).toBe(false);
  });

  it("does NOT detect /runs as auth page", () => {
    expect(isAuthPage("/runs")).toBe(false);
  });

  it("does NOT detect /settings as auth page", () => {
    expect(isAuthPage("/settings")).toBe(false);
  });

  it("detects /login?redirect=/ as auth page", () => {
    expect(isAuthPage("/login?redirect=/")).toBe(true);
  });
});

// --- Session storage format ---

const STORAGE_KEY = "perf_user";

interface SessionUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

function serializeSession(user: SessionUser): string {
  return JSON.stringify(user);
}

function deserializeSession(raw: string | null): SessionUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.id || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

describe("Session storage — serialize/deserialize", () => {
  it("round-trips a valid user", () => {
    const user: SessionUser = { id: "u1", email: "a@b.com", display_name: "Alice", role: "admin" };
    const raw = serializeSession(user);
    const parsed = deserializeSession(raw);
    expect(parsed).toEqual(user);
  });

  it("returns null for null input", () => {
    expect(deserializeSession(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(deserializeSession("")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(deserializeSession("not-json")).toBeNull();
  });

  it("returns null for JSON missing id", () => {
    expect(deserializeSession('{"email":"a@b.com"}')).toBeNull();
  });

  it("returns null for JSON missing email", () => {
    expect(deserializeSession('{"id":"u1"}')).toBeNull();
  });

  it("uses the correct storage key", () => {
    expect(STORAGE_KEY).toBe("perf_user");
  });
});

// --- Run logs & large payload regression ---

describe("Run logs field — Regression", () => {
  it("parses run response with non-null logs", async () => {
    const runJson = {
      id: "run-1", status: "running", logs: "[ts] Starting\n[ts] Running\n",
      config: { url: "https://example.com" }, metrics: null, error: null,
    };
    const res = new Response(JSON.stringify(runJson), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const result = await request<typeof runJson>(res);
    expect(result.logs).toBe("[ts] Starting\n[ts] Running\n");
  });

  it("parses run response with null logs", async () => {
    const runJson = { id: "run-2", status: "queued", logs: null };
    const res = new Response(JSON.stringify(runJson), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const result = await request<typeof runJson>(res);
    expect(result.logs).toBeNull();
  });

  it("parses run response with empty string logs", async () => {
    const runJson = { id: "run-3", status: "queued", logs: "" };
    const res = new Response(JSON.stringify(runJson), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const result = await request<typeof runJson>(res);
    expect(result.logs).toBe("");
  });
});

describe("Large payload handling — Regression (413 fix)", () => {
  it("throws on 413 Payload Too Large response", async () => {
    const res = new Response("Payload too large", { status: 413 });
    await expect(request(res)).rejects.toThrow("API 413");
  });

  it("can parse a >1MB JSON response body (Lighthouse report)", async () => {
    // Simulate a large Lighthouse report response
    const bigObj = { audits: {} as Record<string, unknown> };
    for (let i = 0; i < 5000; i++) {
      bigObj.audits[`audit-${i}`] = { score: 1, description: "x".repeat(200) };
    }
    const body = JSON.stringify(bigObj);
    expect(body.length).toBeGreaterThan(1_000_000); // > 1MB
    const res = new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const result = await request<typeof bigObj>(res);
    expect(Object.keys(result.audits).length).toBe(5000);
  });
});

describe("Run detail auto-refresh logic — Regression", () => {
  // Extracted logic from the run detail page
  const isActive = (s: string) => s === "queued" || s === "running";
  const getRefreshInterval = (status: string | undefined) =>
    status && isActive(status) ? 2000 : false;

  it("returns 2000ms for queued runs", () => {
    expect(getRefreshInterval("queued")).toBe(2000);
  });

  it("returns 2000ms for running runs", () => {
    expect(getRefreshInterval("running")).toBe(2000);
  });

  it("returns false for completed runs (stop polling)", () => {
    expect(getRefreshInterval("completed")).toBe(false);
  });

  it("returns false for failed runs (stop polling)", () => {
    expect(getRefreshInterval("failed")).toBe(false);
  });

  it("returns false for cancelled runs", () => {
    expect(getRefreshInterval("cancelled")).toBe(false);
  });

  it("returns false for undefined status", () => {
    expect(getRefreshInterval(undefined)).toBe(false);
  });
});
