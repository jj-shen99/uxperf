import { Test } from "@nestjs/testing";
import { SchedulesController } from "./schedules.controller";
import { SchedulesService } from "./schedules.service";

describe("SchedulesController", () => {
  let controller: SchedulesController;
  const mockService = {
    findAll: jest.fn().mockResolvedValue([{ id: "s-1", cron: "0 6 * * *" }]),
    findById: jest.fn().mockResolvedValue({ id: "s-1", cron: "0 6 * * *" }),
    create: jest.fn().mockResolvedValue({ id: "s-1" }),
    update: jest.fn().mockResolvedValue({ id: "s-1", cron: "0 8 * * *" }),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [{ provide: SchedulesService, useValue: mockService }],
    }).compile();
    controller = module.get(SchedulesController);
  });

  it("lists schedules", async () => {
    const result = await controller.findAll("p-1");
    expect(result).toHaveLength(1);
    expect(mockService.findAll).toHaveBeenCalledWith("p-1");
  });

  it("gets schedule by id", async () => {
    const result = await controller.findOne("s-1");
    expect(result.id).toBe("s-1");
  });

  it("creates schedule", async () => {
    const dto = { project_id: "p-1", script_id: "sc-1", cron: "0 6 * * *" } as any;
    await controller.create(dto);
    expect(mockService.create).toHaveBeenCalledWith(dto);
  });

  it("updates schedule", async () => {
    await controller.update("s-1", { cron: "0 8 * * *" } as any);
    expect(mockService.update).toHaveBeenCalledWith("s-1", { cron: "0 8 * * *" });
  });

  it("deletes schedule", async () => {
    await controller.remove("s-1");
    expect(mockService.delete).toHaveBeenCalledWith("s-1");
  });
});
