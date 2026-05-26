import { Test } from "@nestjs/testing";
import { AuthoringController } from "./authoring.controller";
import { NlAuthoringService } from "./nl-authoring.service";

describe("AuthoringController", () => {
  let controller: AuthoringController;
  let mockService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockService = {
      generate: jest.fn().mockResolvedValue({
        id: "gen-1",
        status: "validated",
        pipeline_stages: [],
      }),
      listLogs: jest.fn().mockResolvedValue([{ id: "gen-1" }]),
      getPolicyEnvelope: jest.fn().mockResolvedValue({
        domain_allowlist: ["example.com"],
        environment_restriction: "staging",
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [AuthoringController],
      providers: [{ provide: NlAuthoringService, useValue: mockService }],
    }).compile();
    controller = module.get(AuthoringController);
  });

  it("generates script from prompt", async () => {
    const result = await controller.generate({
      project_id: "p-1",
      prompt: "click login",
    });
    expect(mockService.generate).toHaveBeenCalled();
    expect(result.id).toBe("gen-1");
  });

  it("lists generation logs", async () => {
    const result = await controller.listLogs("p-1");
    expect(mockService.listLogs).toHaveBeenCalledWith("p-1", undefined);
    expect(result).toHaveLength(1);
  });

  it("gets policy envelope", async () => {
    const result = await controller.getPolicyEnvelope("p-1");
    expect(result.domain_allowlist).toContain("example.com");
  });
});
