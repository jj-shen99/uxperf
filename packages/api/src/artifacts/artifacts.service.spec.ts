import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ArtifactsService } from "./artifacts.service";

// ============================================================
// Artifacts Service — Unit Tests
// Techniques: EP, boundary, structural, primary path
// ============================================================

describe("ArtifactsService", () => {
  let service: ArtifactsService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "artifacts-test-"));
    process.env.ARTIFACTS_DIR = tmpDir;
    service = new ArtifactsService();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.ARTIFACTS_DIR;
  });

  // -- saveJson --
  describe("saveJson", () => {
    it("saves JSON file and returns relative path (primary path)", async () => {
      const relPath = await service.saveJson("run-1", "report.json", { score: 0.95 });
      expect(relPath).toBe("run-1/report.json");

      const filePath = path.join(tmpDir, relPath);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(content.score).toBe(0.95);
    });

    it("creates run directory if it doesn't exist", async () => {
      await service.saveJson("new-run", "data.json", {});
      expect(fs.existsSync(path.join(tmpDir, "new-run"))).toBe(true);
    });

    it("overwrites existing file (EP: re-save)", async () => {
      await service.saveJson("run-1", "data.json", { v: 1 });
      await service.saveJson("run-1", "data.json", { v: 2 });
      const content = JSON.parse(
        fs.readFileSync(path.join(tmpDir, "run-1/data.json"), "utf-8")
      );
      expect(content.v).toBe(2);
    });
  });

  // -- saveBuffer --
  describe("saveBuffer", () => {
    it("saves binary data and returns relative path", async () => {
      const buffer = Buffer.from("trace data");
      const relPath = await service.saveBuffer("run-1", "trace.zip", buffer);
      expect(relPath).toBe("run-1/trace.zip");
      expect(fs.existsSync(path.join(tmpDir, relPath))).toBe(true);
    });
  });

  // -- readJson --
  describe("readJson", () => {
    it("reads a previously saved JSON artifact (primary path)", async () => {
      await service.saveJson("run-1", "report.json", { lcp: 2500 });
      const data = (await service.readJson("run-1/report.json")) as any;
      expect(data.lcp).toBe(2500);
    });

    it("throws when file does not exist (boundary)", async () => {
      await expect(service.readJson("nonexistent/file.json")).rejects.toThrow();
    });
  });

  // -- exists --
  describe("exists", () => {
    it("returns true for existing artifact", async () => {
      await service.saveJson("run-1", "data.json", {});
      expect(service.exists("run-1/data.json")).toBe(true);
    });

    it("returns false for non-existing artifact", () => {
      expect(service.exists("run-1/nope.json")).toBe(false);
    });
  });

  // -- listForRun --
  describe("listForRun", () => {
    it("lists all artifacts for a run (primary path)", async () => {
      await service.saveJson("run-1", "a.json", {});
      await service.saveJson("run-1", "b.json", {});
      const files = await service.listForRun("run-1");
      expect(files).toHaveLength(2);
      expect(files).toContain("run-1/a.json");
      expect(files).toContain("run-1/b.json");
    });

    it("returns empty array when run directory doesn't exist (boundary)", async () => {
      const files = await service.listForRun("nonexistent-run");
      expect(files).toEqual([]);
    });
  });

  // -- getAbsolutePath --
  describe("getAbsolutePath", () => {
    it("returns full filesystem path", () => {
      const abs = service.getAbsolutePath("run-1/report.json");
      expect(abs).toBe(path.join(tmpDir, "run-1/report.json"));
    });
  });
});
