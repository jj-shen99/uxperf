/**
 * Per-Severity Quorum (E-47) and Gate YAML Config (E-48) Tests
 */
import { Test } from "@nestjs/testing";
import { GatesService, QuorumConfig } from "./gates.service";
import { GateYamlConfigService } from "./gate-yaml-config.service";
import { DatabaseService } from "../database/database.service";
import { BaselinesService } from "../baselines/baselines.service";

describe("GatesService — Per-Severity Quorum (E-47)", () => {
  let service: GatesService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };

    const module = await Test.createTestingModule({
      providers: [
        GatesService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: BaselinesService, useValue: {} },
      ],
    }).compile();

    service = module.get(GatesService);
  });

  it("uses 1-of-3 quorum for warn/advisory gates", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] }); // no prior results

    const result = await service.checkQuorum("g-1", "proj-1", true, "warn");
    expect(result.requiredFailures).toBe(1);
    expect(result.windowSize).toBe(3);
    expect(result.shouldFail).toBe(true); // 1 >= 1
  });

  it("uses 3-of-5 quorum for block gates", async () => {
    // 1 prior failure + current failure = 2, need 3 → should NOT fail
    mockDb.query.mockResolvedValueOnce({
      rows: [{ status: "failed" }, { status: "passed" }, { status: "passed" }, { status: "passed" }],
    });

    const result = await service.checkQuorum("g-1", "proj-1", true, "block");
    expect(result.requiredFailures).toBe(3);
    expect(result.windowSize).toBe(5);
    expect(result.shouldFail).toBe(false); // 2 < 3
  });

  it("uses 4-of-5 quorum for page gates", async () => {
    // 3 prior failures + current = 4 → should fail for page
    mockDb.query.mockResolvedValueOnce({
      rows: [{ status: "failed" }, { status: "failed" }, { status: "failed" }, { status: "passed" }],
    });

    const result = await service.checkQuorum("g-1", "proj-1", true, "page");
    expect(result.requiredFailures).toBe(4);
    expect(result.windowSize).toBe(5);
    expect(result.shouldFail).toBe(true); // 4 >= 4
  });

  it("respects gate-level quorum override", async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ status: "failed" }],
    });

    const customQuorum: QuorumConfig = { window_size: 2, required_failures: 2 };
    const result = await service.checkQuorum("g-1", "proj-1", true, "block", customQuorum);
    expect(result.requiredFailures).toBe(2);
    expect(result.windowSize).toBe(2);
    expect(result.shouldFail).toBe(true); // 2 >= 2
  });

  it("defaults to block quorum when policy is unknown", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const result = await service.checkQuorum("g-1", "proj-1", true, "custom_policy");
    expect(result.requiredFailures).toBe(3);
    expect(result.windowSize).toBe(5);
  });

  it("queries correct LIMIT based on window size", async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    await service.checkQuorum("g-1", "proj-1", true, "warn");
    // warn = window_size 3, so LIMIT should be 2 (window_size - 1)
    expect(mockDb.query.mock.calls[0][1][2]).toBe(2);
  });
});

describe("GateYamlConfigService (E-48)", () => {
  let yamlService: GateYamlConfigService;
  let mockGates: any;

  beforeEach(() => {
    mockGates = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "new-gate" }),
      update: jest.fn().mockResolvedValue({}),
    };
    yamlService = new GateYamlConfigService(mockGates);
  });

  const sampleYaml = `
gates:
  - name: LCP Gate
    metric: lcp
    type: threshold
    operator: lte
    threshold: 2500
    policy: block
    quorum:
      window_size: 5
      required_failures: 3

  - name: FCP Baseline
    metric: fcp
    type: baseline_relative
    regression_pct: 10
    policy: warn

  - name: Statistical CLS
    metric: cls
    type: statistical
    stddev_multiplier: 2.5
    policy: advisory
`;

  describe("parseYaml", () => {
    it("parses multiple gate entries", () => {
      const config = yamlService.parseYaml(sampleYaml);
      expect(config.gates).toHaveLength(3);
    });

    it("parses threshold gate with operator", () => {
      const config = yamlService.parseYaml(sampleYaml);
      const lcp = config.gates[0];
      expect(lcp.name).toBe("LCP Gate");
      expect(lcp.metric).toBe("lcp");
      expect(lcp.type).toBe("threshold");
      expect(lcp.operator).toBe("lte");
      expect(lcp.threshold).toBe(2500);
      expect(lcp.policy).toBe("block");
    });

    it("parses quorum config", () => {
      const config = yamlService.parseYaml(sampleYaml);
      expect(config.gates[0].quorum).toEqual({
        window_size: 5,
        required_failures: 3,
      });
    });

    it("parses baseline_relative gate", () => {
      const config = yamlService.parseYaml(sampleYaml);
      const fcp = config.gates[1];
      expect(fcp.type).toBe("baseline_relative");
      expect(fcp.regression_pct).toBe(10);
      expect(fcp.policy).toBe("warn");
    });

    it("parses statistical gate", () => {
      const config = yamlService.parseYaml(sampleYaml);
      const cls = config.gates[2];
      expect(cls.type).toBe("statistical");
      expect(cls.stddev_multiplier).toBe(2.5);
    });

    it("handles empty YAML", () => {
      const config = yamlService.parseYaml("gates:\n");
      expect(config.gates).toEqual([]);
    });

    it("skips comments", () => {
      const yaml = `
gates:
  # This is a comment
  - name: Test Gate
    metric: lcp
    type: threshold
    threshold: 3000
`;
      const config = yamlService.parseYaml(yaml);
      expect(config.gates).toHaveLength(1);
      expect(config.gates[0].name).toBe("Test Gate");
    });
  });

  describe("toCreateDto", () => {
    it("converts YAML entry to CreateGateDto", () => {
      const entry = { name: "LCP Gate", metric: "lcp", type: "threshold" as const, threshold: 2500, operator: "lte", policy: "block" };
      const dto = yamlService.toCreateDto("proj-1", entry);
      expect(dto.project_id).toBe("proj-1");
      expect(dto.name).toBe("LCP Gate");
      expect(dto.definition.type).toBe("threshold");
      expect(dto.definition.threshold).toBe(2500);
      expect(dto.policy).toBe("block");
    });

    it("includes quorum config in definition", () => {
      const entry = {
        name: "G1", metric: "lcp", type: "threshold" as const,
        threshold: 2500, quorum: { window_size: 3, required_failures: 2 },
      };
      const dto = yamlService.toCreateDto("proj-1", entry);
      expect(dto.definition.quorum).toEqual({ window_size: 3, required_failures: 2 });
    });
  });

  describe("syncFromYaml", () => {
    it("creates gates that don't exist in DB", async () => {
      mockGates.findAll.mockResolvedValue([]);
      const result = await yamlService.syncFromYaml("proj-1", sampleYaml);
      expect(result.created).toHaveLength(3);
      expect(mockGates.create).toHaveBeenCalledTimes(3);
    });

    it("updates gates whose definition changed", async () => {
      mockGates.findAll.mockResolvedValue([
        { id: "g-1", name: "LCP Gate", definition: { type: "threshold", metric: "lcp", threshold: 2000 }, policy: "block", enabled: true },
      ]);
      const result = await yamlService.syncFromYaml("proj-1", sampleYaml);
      expect(result.updated).toContain("LCP Gate");
      expect(result.created).toHaveLength(2); // FCP and CLS are new
    });

    it("disables DB gates not in YAML", async () => {
      mockGates.findAll.mockResolvedValue([
        { id: "g-old", name: "Old Gate", definition: {}, policy: "block", enabled: true },
      ]);
      const result = await yamlService.syncFromYaml("proj-1", sampleYaml);
      expect(result.disabled).toContain("Old Gate");
      expect(mockGates.update).toHaveBeenCalledWith("g-old", { enabled: false });
    });

    it("leaves unchanged gates alone", async () => {
      const config = yamlService.parseYaml(sampleYaml);
      const dto = yamlService.toCreateDto("proj-1", config.gates[0]);
      mockGates.findAll.mockResolvedValue([
        { id: "g-1", name: "LCP Gate", definition: dto.definition, policy: dto.policy, enabled: true },
      ]);
      const result = await yamlService.syncFromYaml("proj-1", sampleYaml);
      expect(result.unchanged).toContain("LCP Gate");
    });
  });
});
