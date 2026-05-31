import { Test } from "@nestjs/testing";
import { AnalyticsController } from "./analytics.controller";
import { AnomaliesService } from "./anomalies.service";
import { ChangePointService } from "./change-point.service";
import { AttributionService } from "./attribution.service";
import { CanaryAnalysisService } from "./canary-analysis.service";

describe("AnalyticsController", () => {
  let controller: AnalyticsController;
  let mockAnomalies: Record<string, jest.Mock>;
  let mockChangePoint: Record<string, jest.Mock>;
  let mockAttribution: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockAnomalies = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({ id: "a-1" }),
      updateStatus: jest.fn().mockResolvedValue({ id: "a-1", status: "resolved" }),
      provideFeedback: jest.fn().mockResolvedValue({ id: "a-1", feedback: "correct" }),
      analyzeProject: jest.fn().mockResolvedValue([]),
    };
    mockChangePoint = {
      detectForProject: jest.fn().mockResolvedValue([]),
    };
    mockAttribution = {
      attributeRegression: jest.fn().mockResolvedValue({ metric: "lcp_ms", regression_ms: 500 }),
    };

    const module = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnomaliesService, useValue: mockAnomalies },
        { provide: ChangePointService, useValue: mockChangePoint },
        { provide: AttributionService, useValue: mockAttribution },
        { provide: CanaryAnalysisService, useValue: { analyze: jest.fn(), analyzeMultiMetric: jest.fn() } },
      ],
    }).compile();
    controller = module.get(AnalyticsController);
  });

  it("lists anomalies", async () => {
    await controller.listAnomalies("p-1", "open");
    expect(mockAnomalies.findAll).toHaveBeenCalledWith("p-1", "open", undefined);
  });

  it("gets anomaly by id", async () => {
    const result = await controller.getAnomaly("a-1");
    expect(result.id).toBe("a-1");
  });

  it("updates anomaly status", async () => {
    const result = await controller.updateAnomalyStatus("a-1", { status: "resolved" });
    expect(result.status).toBe("resolved");
  });

  it("provides feedback", async () => {
    const result = await controller.provideFeedback("a-1", { feedback: "correct" });
    expect(result.feedback).toBe("correct");
  });

  it("runs detection", async () => {
    await controller.runDetection({ project_id: "p-1" });
    expect(mockAnomalies.analyzeProject).toHaveBeenCalledWith("p-1", undefined);
  });

  it("detects change points", async () => {
    await controller.detectChangePoints({ project_id: "p-1", window: 30 });
    expect(mockChangePoint.detectForProject).toHaveBeenCalledWith("p-1", undefined, 30);
  });

  it("gets attribution", async () => {
    const result = await controller.attributeRegression("b-1", "r-1", "lcp_ms");
    expect(mockAttribution.attributeRegression).toHaveBeenCalledWith("b-1", "r-1", "lcp_ms");
    expect(result.metric).toBe("lcp_ms");
  });
});
