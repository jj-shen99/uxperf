import { Test } from "@nestjs/testing";
import { NlAuthoringService } from "./nl-authoring.service";
import { DatabaseService } from "../database/database.service";

describe("NlAuthoringService", () => {
  let service: NlAuthoringService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        NlAuthoringService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(NlAuthoringService);
  });

  describe("generate", () => {
    it("runs six-stage pipeline and returns result", async () => {
      // Mock DB insert returning ID
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "gen-1" }] });

      const result = await service.generate({
        project_id: "p-1",
        prompt: "Log in, search for headphones, add to cart",
        target_url: "https://shop.example.com",
      });

      expect(result.id).toBe("gen-1");
      expect(result.status).toBe("validated");
      expect(result.pipeline_stages).toHaveLength(6);
      expect(result.pipeline_stages[0].name).toBe("intent_parse");
      expect(result.pipeline_stages[1].name).toBe("page_reconnaissance");
      expect(result.pipeline_stages[2].name).toBe("locator_synthesis");
      expect(result.pipeline_stages[3].name).toBe("script_assembly");
      expect(result.pipeline_stages[4].name).toBe("static_validation");
      expect(result.pipeline_stages[5].name).toBe("confidence_scoring");
      expect(result.generated_script).toBeDefined();
      expect(result.generation_time_ms).toBeGreaterThanOrEqual(0);
    });

    it("parses multiple comma-separated steps from prompt", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "gen-2" }] });

      const result = await service.generate({
        project_id: "p-1",
        prompt: "click login, enter email, submit form",
      });

      const intentStage = result.pipeline_stages.find((s) => s.name === "intent_parse");
      const steps = (intentStage?.output as any)?.steps;
      expect(steps.length).toBe(3);
    });

    it("marks status as draft when no target_url (validation fails)", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "gen-3" }] });

      const result = await service.generate({
        project_id: "p-1",
        prompt: "just a prompt with no target",
      });

      // Without target_url, the script won't have target_url → validation fails
      expect(result.status).toBe("draft");
    });
  });

  describe("listLogs", () => {
    it("returns generation logs", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: "gen-1", prompt: "test prompt", status: "validated" }],
      });
      const result = await service.listLogs("p-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("getPolicyEnvelope", () => {
    it("returns policy with project allowlist", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ domain_allowlist: ["example.com"], environment_configs: {} }],
      });
      const policy = await service.getPolicyEnvelope("p-1");
      expect(policy.domain_allowlist).toContain("example.com");
      expect(policy.environment_restriction).toBe("staging");
      expect(policy.destructive_action_denylist.length).toBeGreaterThan(0);
      expect(policy.rate_limit.requests_per_minute).toBe(60);
    });

    it("returns defaults for missing project", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      const policy = await service.getPolicyEnvelope("missing");
      expect(policy.domain_allowlist).toEqual([]);
    });
  });
});
