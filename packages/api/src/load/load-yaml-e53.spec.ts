import { Test } from "@nestjs/testing";
import { LoadYamlConfigService } from "./load-yaml-config.service";
import { LoadProfilesService } from "./load-profiles.service";

describe("LoadYamlConfigService (E-53)", () => {
  let service: LoadYamlConfigService;
  let mockProfiles: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockProfiles = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "lp-new", name: "test" }),
      update: jest.fn().mockResolvedValue({ id: "lp-1", name: "test" }),
      findById: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        LoadYamlConfigService,
        { provide: LoadProfilesService, useValue: mockProfiles },
      ],
    }).compile();
    service = module.get(LoadYamlConfigService);
  });

  describe("parseYaml", () => {
    it("parses basic load profile YAML", () => {
      const yaml = `
load_profiles:
  - name: Ramp Test
    target_vus: 50
    cache_state: warm
    stages:
      - ramp_to: 50
        duration: 2m
      - ramp_to: 50
        hold_for: 5m
      - ramp_to: 0
        ramp_down: 1m
`;
      const entries = service.parseYaml(yaml);
      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe("Ramp Test");
      expect(entries[0].target_vus).toBe(50);
      expect(entries[0].cache_state).toBe("warm");
      expect(entries[0].stages).toHaveLength(3);
    });

    it("parses multiple profiles", () => {
      const yaml = `
profiles:
  - name: Quick Smoke
    target_vus: 5
    stages:
      - ramp_to: 5
        duration: 30s
  - name: Full Load
    target_vus: 100
    stages:
      - ramp_to: 100
        duration: 5m
      - ramp_to: 100
        hold_for: 10m
`;
      const entries = service.parseYaml(yaml);
      expect(entries).toHaveLength(2);
      expect(entries[0].name).toBe("Quick Smoke");
      expect(entries[1].name).toBe("Full Load");
      expect(entries[1].stages).toHaveLength(2);
    });

    it("parses profiles with server targets", () => {
      const yaml = `
load_profiles:
  - name: With Targets
    target_vus: 20
    stages:
      - ramp_to: 20
        duration: 1m
    ui_server_targets:
      - host: web-01.prod
        port: 9090
        scrape_path: /metrics
`;
      const entries = service.parseYaml(yaml);
      expect(entries).toHaveLength(1);
      expect(entries[0].ui_server_targets).toHaveLength(1);
      expect(entries[0].ui_server_targets![0].host).toBe("web-01.prod");
      expect(entries[0].ui_server_targets![0].port).toBe(9090);
    });

    it("skips comments and empty lines", () => {
      const yaml = `
# This is a comment
load_profiles:
  # Another comment
  - name: Test
    target_vus: 10

    stages:
      - ramp_to: 10
        duration: 30s
`;
      const entries = service.parseYaml(yaml);
      expect(entries).toHaveLength(1);
    });
  });

  describe("convertStage", () => {
    it("converts duration string to seconds", () => {
      const stage = service.convertStage({ ramp_to: 50, duration: "2m" });
      expect(stage.duration_s).toBe(120);
      expect(stage.target_vus).toBe(50);
    });

    it("converts hold_for string", () => {
      const stage = service.convertStage({ ramp_to: 50, hold_for: "5m" });
      expect(stage.duration_s).toBe(300);
    });

    it("converts combined m/s duration", () => {
      const stage = service.convertStage({ ramp_to: 50, duration: "1m30s" });
      expect(stage.duration_s).toBe(90);
    });

    it("defaults to 60s when no duration specified", () => {
      const stage = service.convertStage({ ramp_to: 10 });
      expect(stage.duration_s).toBe(60);
    });
  });

  describe("parseDuration", () => {
    it("parses minutes", () => {
      expect(service.parseDuration("5m")).toBe(300);
    });

    it("parses seconds", () => {
      expect(service.parseDuration("30s")).toBe(30);
    });

    it("parses combined", () => {
      expect(service.parseDuration("2m30s")).toBe(150);
    });

    it("parses pure numbers as seconds", () => {
      expect(service.parseDuration("60")).toBe(60);
    });
  });

  describe("toCreateDto", () => {
    it("converts YAML entry to DTO", () => {
      const entry = {
        name: "Test Profile",
        target_vus: 50,
        description: "A test",
        cache_state: "cold" as const,
        stages: [{ ramp_to: 50, duration: "2m" }],
      };
      const dto = service.toCreateDto(entry, "proj-1");
      expect(dto.project_id).toBe("proj-1");
      expect(dto.name).toBe("Test Profile");
      expect(dto.target_vus).toBe(50);
      expect(dto.cache_state).toBe("cold");
      expect(dto.stages).toHaveLength(1);
      expect(dto.stages[0].duration_s).toBe(120);
    });
  });

  describe("syncFromYaml", () => {
    it("creates new profiles", async () => {
      const yaml = `
load_profiles:
  - name: New Profile
    target_vus: 20
    stages:
      - ramp_to: 20
        duration: 1m
`;
      const result = await service.syncFromYaml("proj-1", yaml);
      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect(mockProfiles.create).toHaveBeenCalledTimes(1);
    });

    it("updates existing profiles", async () => {
      mockProfiles.findAll.mockResolvedValueOnce([
        { id: "lp-1", name: "Existing Profile" },
      ]);
      const yaml = `
load_profiles:
  - name: Existing Profile
    target_vus: 40
    stages:
      - ramp_to: 40
        duration: 2m
`;
      const result = await service.syncFromYaml("proj-1", yaml);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(mockProfiles.update).toHaveBeenCalledTimes(1);
    });

    it("reports errors for invalid entries", async () => {
      mockProfiles.create.mockRejectedValueOnce(new Error("DB error"));
      const yaml = `
load_profiles:
  - name: Bad Profile
    target_vus: 20
    stages:
      - ramp_to: 20
        duration: 1m
`;
      const result = await service.syncFromYaml("proj-1", yaml);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("DB error");
    });
  });
});
