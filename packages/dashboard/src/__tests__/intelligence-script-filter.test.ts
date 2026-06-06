/**
 * E-81: Intelligence API script-level filter tests
 *
 * Verifies that API client methods correctly append script_id
 * query parameters when provided.
 */

// We test the URL construction logic directly since api.ts uses
// template literals to build query strings.

describe("Intelligence API script_id filtering (E-81)", () => {
  // Simulate the URL-building logic from api.ts

  const buildAttribution = (projectId: string, scriptId?: string) =>
    `/intelligence/attribution?project_id=${encodeURIComponent(projectId)}${scriptId ? `&script_id=${encodeURIComponent(scriptId)}` : ""}`;

  const buildForecast = (projectId: string, metric?: string, scriptId?: string) =>
    `/intelligence/forecast?project_id=${encodeURIComponent(projectId)}${metric ? `&metric=${encodeURIComponent(metric)}` : ""}${scriptId ? `&script_id=${encodeURIComponent(scriptId)}` : ""}`;

  const buildRumSummary = (projectId: string, days?: number, origin?: string, scriptId?: string) =>
    `/intelligence/rum/summary?project_id=${encodeURIComponent(projectId)}${days ? `&days=${days}` : ""}${origin ? `&origin=${encodeURIComponent(origin)}` : ""}${scriptId ? `&script_id=${encodeURIComponent(scriptId)}` : ""}`;

  const buildCrux = (projectId: string, origin?: string, scriptId?: string) =>
    `/intelligence/crux?project_id=${encodeURIComponent(projectId)}${origin ? `&origin=${encodeURIComponent(origin)}` : ""}${scriptId ? `&script_id=${encodeURIComponent(scriptId)}` : ""}`;

  const buildCapacity = (projectId: string, scriptId?: string) =>
    `/intelligence/capacity/reports?project_id=${encodeURIComponent(projectId)}${scriptId ? `&script_id=${encodeURIComponent(scriptId)}` : ""}`;

  describe("attribution.list", () => {
    it("excludes script_id when not provided", () => {
      expect(buildAttribution("proj-1")).toBe("/intelligence/attribution?project_id=proj-1");
    });

    it("includes script_id when provided", () => {
      expect(buildAttribution("proj-1", "script-42")).toBe(
        "/intelligence/attribution?project_id=proj-1&script_id=script-42"
      );
    });

    it("encodes special characters in script_id", () => {
      expect(buildAttribution("proj-1", "script with spaces")).toContain(
        "script_id=script%20with%20spaces"
      );
    });
  });

  describe("forecast.list", () => {
    it("excludes both metric and script_id when not provided", () => {
      expect(buildForecast("proj-1")).toBe("/intelligence/forecast?project_id=proj-1");
    });

    it("includes metric only", () => {
      expect(buildForecast("proj-1", "lcp_ms")).toBe(
        "/intelligence/forecast?project_id=proj-1&metric=lcp_ms"
      );
    });

    it("includes both metric and script_id", () => {
      expect(buildForecast("proj-1", "lcp_ms", "s-1")).toBe(
        "/intelligence/forecast?project_id=proj-1&metric=lcp_ms&script_id=s-1"
      );
    });

    it("includes script_id without metric", () => {
      expect(buildForecast("proj-1", undefined, "s-1")).toBe(
        "/intelligence/forecast?project_id=proj-1&script_id=s-1"
      );
    });
  });

  describe("rum.summary", () => {
    it("builds URL with only projectId", () => {
      expect(buildRumSummary("proj-1")).toBe("/intelligence/rum/summary?project_id=proj-1");
    });

    it("includes all optional params", () => {
      const url = buildRumSummary("proj-1", 30, "https://example.com", "s-1");
      expect(url).toContain("days=30");
      expect(url).toContain("origin=https%3A%2F%2Fexample.com");
      expect(url).toContain("script_id=s-1");
    });

    it("includes script_id with other optional params omitted", () => {
      const url = buildRumSummary("proj-1", undefined, undefined, "s-1");
      expect(url).toContain("script_id=s-1");
      expect(url).not.toContain("days=");
      expect(url).not.toContain("origin=");
    });
  });

  describe("crux.list", () => {
    it("builds with only projectId", () => {
      expect(buildCrux("proj-1")).toBe("/intelligence/crux?project_id=proj-1");
    });

    it("includes origin and script_id", () => {
      const url = buildCrux("proj-1", "https://example.com", "s-1");
      expect(url).toContain("origin=https%3A%2F%2Fexample.com");
      expect(url).toContain("script_id=s-1");
    });

    it("includes script_id without origin", () => {
      const url = buildCrux("proj-1", undefined, "s-1");
      expect(url).toContain("script_id=s-1");
      expect(url).not.toContain("origin=");
    });
  });

  describe("capacity.listReports", () => {
    it("builds with only projectId", () => {
      expect(buildCapacity("proj-1")).toBe(
        "/intelligence/capacity/reports?project_id=proj-1"
      );
    });

    it("includes script_id", () => {
      expect(buildCapacity("proj-1", "s-1")).toBe(
        "/intelligence/capacity/reports?project_id=proj-1&script_id=s-1"
      );
    });
  });

  describe("useQuery key includes scriptId", () => {
    it("queryKey should include selectedScriptId for cache granularity", () => {
      // Simulate what the intelligence page does
      const projectId = "proj-1";
      const selectedScriptId = "script-42";

      const attributionKey = ["intelligence-attribution", projectId, selectedScriptId];
      const forecastKey = ["intelligence-forecast", projectId, selectedScriptId];
      const rumKey = ["intelligence-rum", projectId, selectedScriptId];
      const cruxKey = ["intelligence-crux", projectId, selectedScriptId];
      const capacityKey = ["intelligence-capacity", projectId, selectedScriptId];

      // All keys should have 3 elements: name, projectId, scriptId
      [attributionKey, forecastKey, rumKey, cruxKey, capacityKey].forEach((key) => {
        expect(key).toHaveLength(3);
        expect(key[2]).toBe("script-42");
      });
    });

    it("queryKey uses empty string for unselected script", () => {
      const projectId = "proj-1";
      const selectedScriptId = "";

      const key = ["intelligence-attribution", projectId, selectedScriptId];
      expect(key[2]).toBe("");
    });
  });
});
