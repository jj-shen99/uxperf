import { Test } from "@nestjs/testing";
import { GatesController } from "./gates.controller";
import { GatesService } from "./gates.service";

describe("GatesController", () => {
  let controller: GatesController;
  const mockService = {
    findAll: jest.fn().mockResolvedValue([{ id: "g-1", name: "LCP Gate" }]),
    findById: jest.fn().mockResolvedValue({ id: "g-1", name: "LCP Gate" }),
    create: jest.fn().mockResolvedValue({ id: "g-1", name: "LCP Gate" }),
    update: jest.fn().mockResolvedValue({ id: "g-1", name: "Updated" }),
    delete: jest.fn().mockResolvedValue(undefined),
    getResultsForRun: jest.fn().mockResolvedValue([{ gate_id: "g-1", status: "passed" }]),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [GatesController],
      providers: [{ provide: GatesService, useValue: mockService }],
    }).compile();
    controller = module.get(GatesController);
  });

  it("lists gates", async () => {
    const result = await controller.findAll("p-1");
    expect(result).toHaveLength(1);
    expect(mockService.findAll).toHaveBeenCalledWith("p-1");
  });

  it("gets gate by id", async () => {
    const result = await controller.findOne("g-1");
    expect(result.id).toBe("g-1");
  });

  it("creates gate", async () => {
    const dto = { project_id: "p-1", name: "LCP Gate", metric: "lcp_ms", operator: "lte", threshold: 2500 } as any;
    await controller.create(dto);
    expect(mockService.create).toHaveBeenCalledWith(dto);
  });

  it("updates gate", async () => {
    await controller.update("g-1", { name: "Updated" } as any);
    expect(mockService.update).toHaveBeenCalledWith("g-1", { name: "Updated" });
  });

  it("deletes gate", async () => {
    await controller.remove("g-1");
    expect(mockService.delete).toHaveBeenCalledWith("g-1");
  });

  it("gets run results", async () => {
    const result = await controller.getRunResults("run-1");
    expect(result).toHaveLength(1);
    expect(mockService.getResultsForRun).toHaveBeenCalledWith("run-1");
  });
});
