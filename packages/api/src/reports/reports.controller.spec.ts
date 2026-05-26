import { Test } from "@nestjs/testing";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

describe("ReportsController", () => {
  let controller: ReportsController;
  let mockService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockService = {
      generateExecutiveReport: jest.fn().mockResolvedValue({ period: { days: 30 } }),
      listReports: jest.fn().mockResolvedValue([{ id: "rpt-1" }]),
      getReport: jest.fn().mockResolvedValue({ id: "rpt-1" }),
    };
    const module = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockService }],
    }).compile();
    controller = module.get(ReportsController);
  });

  it("generates executive report", async () => {
    const result = await controller.generateExecutive({ project_id: "p-1", days: 30 });
    expect(mockService.generateExecutiveReport).toHaveBeenCalledWith("p-1", 30, undefined);
    expect(result.period.days).toBe(30);
  });

  it("lists reports", async () => {
    const result = await controller.listReports("p-1", "executive");
    expect(mockService.listReports).toHaveBeenCalledWith("p-1", "executive", undefined);
    expect(result).toHaveLength(1);
  });

  it("gets report by id", async () => {
    const result = await controller.getReport("rpt-1");
    expect(result.id).toBe("rpt-1");
  });
});
