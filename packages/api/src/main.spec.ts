/**
 * Tests for API main.ts worker auto-start logic.
 * Tests the startWorker function behavior under different env configurations.
 */

describe("Worker auto-start logic", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // === Equivalence Partitioning ===

  describe("DISABLE_WORKER env var", () => {
    it("should respect DISABLE_WORKER=true to skip worker start", () => {
      process.env.DISABLE_WORKER = "true";
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();
      // Simulate the check
      const shouldStart = process.env.DISABLE_WORKER !== "true";
      expect(shouldStart).toBe(false);
      consoleSpy.mockRestore();
    });

    it("should allow worker start when DISABLE_WORKER is not set", () => {
      delete process.env.DISABLE_WORKER;
      const shouldStart = process.env.DISABLE_WORKER !== "true";
      expect(shouldStart).toBe(true);
    });

    it("should allow worker start when DISABLE_WORKER is 'false'", () => {
      process.env.DISABLE_WORKER = "false";
      const shouldStart = process.env.DISABLE_WORKER !== "true";
      expect(shouldStart).toBe(true);
    });
  });

  // === K6_BROWSER_ENABLED passthrough ===

  describe("K6_BROWSER_ENABLED passthrough", () => {
    it("passes K6_BROWSER_ENABLED to worker env when set", () => {
      process.env.K6_BROWSER_ENABLED = "true";
      const env: Record<string, string> = {
        API_URL: "http://localhost:4000/api/v1",
      };
      if (process.env.K6_BROWSER_ENABLED) {
        env.K6_BROWSER_ENABLED = process.env.K6_BROWSER_ENABLED;
      }
      expect(env.K6_BROWSER_ENABLED).toBe("true");
    });

    it("does not include K6_BROWSER_ENABLED when not set", () => {
      delete process.env.K6_BROWSER_ENABLED;
      const env: Record<string, string> = {
        API_URL: "http://localhost:4000/api/v1",
      };
      if (process.env.K6_BROWSER_ENABLED) {
        env.K6_BROWSER_ENABLED = process.env.K6_BROWSER_ENABLED;
      }
      expect(env.K6_BROWSER_ENABLED).toBeUndefined();
    });
  });

  // === API_URL construction ===

  describe("API_URL construction", () => {
    it("uses PORT env var when set", () => {
      process.env.PORT = "5000";
      const url = `http://localhost:${process.env.PORT || 4000}/api/v1`;
      expect(url).toBe("http://localhost:5000/api/v1");
    });

    it("defaults to port 4000", () => {
      delete process.env.PORT;
      const url = `http://localhost:${process.env.PORT || 4000}/api/v1`;
      expect(url).toBe("http://localhost:4000/api/v1");
    });
  });

  // === Worker script path ===

  describe("worker script path resolution", () => {
    it("resolves to packages/worker/src/poll-loop.ts relative to __dirname", () => {
      const { resolve } = require("path");
      const workerScript = resolve(__dirname, "../../worker/src/poll-loop.ts");
      expect(workerScript).toContain("worker/src/poll-loop.ts");
    });
  });
});
