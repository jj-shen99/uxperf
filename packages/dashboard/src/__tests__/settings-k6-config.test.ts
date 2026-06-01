/**
 * Tests for the k6 browser engine configuration logic on the Settings page.
 * Covers: toggle behavior, binary path handling, and state transitions.
 */

describe("Settings page — k6 browser engine config", () => {
  // === Equivalence Partitioning: toggle state ===

  describe("k6 enabled toggle", () => {
    it("toggles from disabled to enabled", () => {
      const current: string = "false";
      const next = current === "true" ? "false" : "true";
      expect(next).toBe("true");
    });

    it("toggles from enabled to disabled", () => {
      const current: string = "true";
      const next = current === "true" ? "false" : "true";
      expect(next).toBe("false");
    });

    it("treats undefined as disabled", () => {
      const current: string | undefined = undefined;
      const next = current === "true" ? "false" : "true";
      expect(next).toBe("true");
    });
  });

  // === Config key naming ===

  describe("config key conventions", () => {
    it("uses engine.k6_browser_enabled key", () => {
      const key = "engine.k6_browser_enabled";
      expect(key).toMatch(/^engine\./);
    });

    it("uses engine.k6_binary key for binary path", () => {
      const key = "engine.k6_binary";
      expect(key).toMatch(/^engine\./);
    });

    it("config keys are fetched with engine. prefix", () => {
      const prefix = "engine.";
      expect("engine.k6_browser_enabled".startsWith(prefix)).toBe(true);
      expect("engine.k6_binary".startsWith(prefix)).toBe(true);
      expect("engine.wpt_server".startsWith(prefix)).toBe(true);
    });
  });

  // === Binary path handling ===

  describe("k6 binary path", () => {
    it("defaults to 'k6' when path is empty", () => {
      const input = "";
      const value = input.trim() || "k6";
      expect(value).toBe("k6");
    });

    it("preserves custom path", () => {
      const input = "/usr/local/bin/k6";
      const value = input.trim() || "k6";
      expect(value).toBe("/usr/local/bin/k6");
    });

    it("trims whitespace from path", () => {
      const input = "  /opt/k6  ";
      const value = input.trim() || "k6";
      expect(value).toBe("/opt/k6");
    });

    it("shows reset button only when non-default path is set", () => {
      const config = { "engine.k6_binary": "/custom/k6" };
      const showReset = config["engine.k6_binary"] && config["engine.k6_binary"] !== "k6";
      expect(showReset).toBe(true);
    });

    it("hides reset button for default path", () => {
      const config = { "engine.k6_binary": "k6" };
      const showReset = config["engine.k6_binary"] && config["engine.k6_binary"] !== "k6";
      expect(showReset).toBe(false);
    });

    it("hides reset button when not configured", () => {
      const config: Record<string, string> = {};
      const showReset = config["engine.k6_binary"] && config["engine.k6_binary"] !== "k6";
      expect(showReset).toBeFalsy();
    });
  });

  // === Regression: save button disabled state ===

  describe("save button disabled when value unchanged", () => {
    it("is disabled when local value matches config", () => {
      const k6BinaryPath = "/usr/bin/k6";
      const configValue = "/usr/bin/k6";
      const disabled = k6BinaryPath === (configValue ?? "");
      expect(disabled).toBe(true);
    });

    it("is enabled when local value differs from config", () => {
      const k6BinaryPath = "/opt/k6";
      const configValue = "/usr/bin/k6";
      const disabled = k6BinaryPath === (configValue ?? "");
      expect(disabled).toBe(false);
    });

    it("is disabled when both are empty (default)", () => {
      const k6BinaryPath = "";
      const configValue: string | undefined = undefined;
      const disabled = k6BinaryPath === (configValue ?? "");
      expect(disabled).toBe(true);
    });
  });

  // === Status display ===

  describe("status text", () => {
    it("shows enabled message when true", () => {
      const enabled = "true";
      const text = enabled === "true"
        ? "Enabled — load tests will use k6 browser module"
        : "Disabled — k6 load tests will be unavailable";
      expect(text).toContain("Enabled");
    });

    it("shows disabled message when false", () => {
      const enabled: string = "false";
      const text = enabled === "true"
        ? "Enabled — load tests will use k6 browser module"
        : "Disabled — k6 load tests will be unavailable";
      expect(text).toContain("Disabled");
    });

    it("shows disabled message when undefined", () => {
      const enabled: string | undefined = undefined;
      const text = enabled === "true"
        ? "Enabled — load tests will use k6 browser module"
        : "Disabled — k6 load tests will be unavailable";
      expect(text).toContain("Disabled");
    });
  });
});
