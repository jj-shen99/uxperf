import { Test } from "@nestjs/testing";
import { BundleSizeCheckService } from "./bundle-size-check.service";
import { DatabaseService } from "../database/database.service";

describe("BundleSizeCheckService (E-51)", () => {
  let service: BundleSizeCheckService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
    const module = await Test.createTestingModule({
      providers: [
        BundleSizeCheckService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(BundleSizeCheckService);
  });

  describe("checkBundleSizeImpact", () => {
    it("returns pass when no dependencies change", () => {
      const result = service.checkBundleSizeImpact(
        { react: "^18.0.0", "react-dom": "^18.0.0" },
        { react: "^18.0.0", "react-dom": "^18.0.0" },
      );
      expect(result.verdict).toBe("pass");
      expect(result.total_delta_kb).toBe(0);
      expect(result.added).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });

    it("detects added dependencies with known sizes", () => {
      const result = service.checkBundleSizeImpact(
        { react: "^18.0.0" },
        { react: "^18.0.0", lodash: "^4.17.0" },
      );
      expect(result.added).toHaveLength(1);
      expect(result.added[0].name).toBe("lodash");
      expect(result.added[0].estimated_size_kb).toBe(72);
      expect(result.added[0].source).toBe("known");
      expect(result.total_delta_kb).toBe(72);
    });

    it("detects removed dependencies", () => {
      const result = service.checkBundleSizeImpact(
        { react: "^18.0.0", moment: "^2.29.0" },
        { react: "^18.0.0" },
      );
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].name).toBe("moment");
      expect(result.total_delta_kb).toBe(-67);
      expect(result.verdict).toBe("pass");
      expect(result.message).toContain("decreased");
    });

    it("detects version upgrades", () => {
      const result = service.checkBundleSizeImpact(
        { react: "^17.0.0" },
        { react: "^18.0.0" },
      );
      expect(result.upgraded).toHaveLength(1);
      expect(result.upgraded[0].from).toBe("^17.0.0");
      expect(result.upgraded[0].to).toBe("^18.0.0");
    });

    it("returns warn when delta exceeds warn threshold", () => {
      const result = service.checkBundleSizeImpact(
        {},
        { recharts: "^2.0.0" }, // 140KB
        { warn_threshold_kb: 50, fail_threshold_kb: 200 },
      );
      expect(result.verdict).toBe("warn");
      expect(result.message).toContain("exceeds warn threshold");
    });

    it("returns fail when delta exceeds fail threshold", () => {
      const result = service.checkBundleSizeImpact(
        {},
        { recharts: "^2.0.0", three: "^0.150.0" }, // 140 + 160 = 300KB
        { warn_threshold_kb: 50, fail_threshold_kb: 200 },
      );
      expect(result.verdict).toBe("fail");
      expect(result.message).toContain("exceeds fail threshold");
    });

    it("uses heuristic size for unknown packages", () => {
      const result = service.checkBundleSizeImpact(
        {},
        { "some-unknown-package": "^1.0.0" },
      );
      expect(result.added[0].source).toBe("heuristic");
      expect(result.added[0].estimated_size_kb).toBe(25);
    });

    it("treats dev-only packages as zero impact", () => {
      const result = service.checkBundleSizeImpact(
        {},
        { typescript: "^5.0.0", jest: "^29.0.0" },
      );
      expect(result.total_delta_kb).toBe(0);
      expect(result.verdict).toBe("pass");
    });
  });

  describe("analyzePackageJsonDiff", () => {
    it("analyzes full package.json diff", () => {
      const result = service.analyzePackageJsonDiff(
        { dependencies: { react: "^18.0.0" } },
        { dependencies: { react: "^18.0.0", axios: "^1.0.0" } },
      );
      expect(result.added).toHaveLength(1);
      expect(result.added[0].name).toBe("axios");
    });

    it("handles missing dependencies fields", () => {
      const result = service.analyzePackageJsonDiff({}, {});
      expect(result.total_delta_kb).toBe(0);
    });
  });

  describe("recordCheck", () => {
    it("persists bundle-size check result", async () => {
      const result = service.checkBundleSizeImpact({}, { axios: "^1.0.0" });
      await service.recordCheck("proj-1", "abc123", result);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO bundle_size_checks"),
        expect.arrayContaining(["proj-1", "abc123"]),
      );
    });

    it("handles missing table gracefully", async () => {
      mockDb.query.mockRejectedValueOnce({ code: "42P01" });
      const result = service.checkBundleSizeImpact({}, { axios: "^1.0.0" });
      await expect(service.recordCheck("proj-1", "abc123", result)).resolves.not.toThrow();
    });
  });
});
