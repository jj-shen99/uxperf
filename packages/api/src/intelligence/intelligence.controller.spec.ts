import { Test } from "@nestjs/testing";
import { IntelligenceController } from "./intelligence.controller";
import { ShapAttributionService } from "./shap-attribution.service";
import { ForecastingService } from "./forecasting.service";
import { RumIngestionService } from "./rum-ingestion.service";
import { CruxIngestionService } from "./crux-ingestion.service";
import { CapacityPlanningService } from "./capacity-planning.service";
import { AuditService } from "./audit.service";
import { ApiKeysService } from "./api-keys.service";
import { MultiGeoService } from "./multi-geo.service";
import { RumAggregationService } from "./rum-aggregation.service";

describe("IntelligenceController", () => {
  let controller: IntelligenceController;
  const mockShap = { computeAttribution: jest.fn().mockResolvedValue({ confidence: 0.8 }), listAttributions: jest.fn().mockResolvedValue([]), getAttribution: jest.fn().mockResolvedValue(null) };
  const mockForecast = { generateForecast: jest.fn().mockResolvedValue({ forecast_data: [] }), listForecasts: jest.fn().mockResolvedValue([]) };
  const mockRum = { ingest: jest.fn().mockResolvedValue({ id: "r-1" }), ingestBatch: jest.fn().mockResolvedValue({ ingested: 2 }), getSummary: jest.fn().mockResolvedValue([]), getTrend: jest.fn().mockResolvedValue([]) };
  const mockCrux = { fetchAndStore: jest.fn().mockResolvedValue({}), listSnapshots: jest.fn().mockResolvedValue([]) };
  const mockCapacity = { generateReport: jest.fn().mockResolvedValue({}), listReports: jest.fn().mockResolvedValue([]), evaluateResourceFloor: jest.fn().mockResolvedValue({ overall_passed: true }), evaluateCapacityFloor: jest.fn().mockResolvedValue({ passed: true }) };
  const mockAudit = { query: jest.fn().mockResolvedValue([]), summary: jest.fn().mockResolvedValue([]) };
  const mockApiKeys = { create: jest.fn().mockResolvedValue({ key: "pfk_test" }), list: jest.fn().mockResolvedValue([]), revoke: jest.fn(), delete: jest.fn() };
  const mockGeo = { listLocations: jest.fn().mockReturnValue([]), dispatch: jest.fn().mockResolvedValue({ locations: [] }), getComparison: jest.fn().mockResolvedValue({ locations: [], comparison: [] }) };
  const mockRumAggregation = { aggregateHourly: jest.fn().mockResolvedValue([]), getHourlyTrend: jest.fn().mockResolvedValue([]), getDailySummary: jest.fn().mockResolvedValue([]), purgeRawEvents: jest.fn().mockResolvedValue({ deleted: 0 }) };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [IntelligenceController],
      providers: [
        { provide: ShapAttributionService, useValue: mockShap },
        { provide: ForecastingService, useValue: mockForecast },
        { provide: RumIngestionService, useValue: mockRum },
        { provide: CruxIngestionService, useValue: mockCrux },
        { provide: CapacityPlanningService, useValue: mockCapacity },
        { provide: AuditService, useValue: mockAudit },
        { provide: ApiKeysService, useValue: mockApiKeys },
        { provide: MultiGeoService, useValue: mockGeo },
        { provide: RumAggregationService, useValue: mockRumAggregation },
      ],
    }).compile();
    controller = module.get(IntelligenceController);
  });

  it("computes SHAP attribution", async () => {
    const result = await controller.computeAttribution({ project_id: "p-1", target_metric: "lcp_ms" });
    expect(result.confidence).toBe(0.8);
  });

  it("generates forecast", async () => {
    await controller.generateForecast({ project_id: "p-1", metric: "lcp_ms" });
    expect(mockForecast.generateForecast).toHaveBeenCalled();
  });

  it("ingests RUM event", async () => {
    const result = await controller.ingestRum({ project_id: "p-1", page_url: "/", origin: "https://example.com" });
    expect(result.id).toBe("r-1");
  });

  it("fetches CrUX", async () => {
    await controller.fetchCrux({ project_id: "p-1", origin: "https://example.com" });
    expect(mockCrux.fetchAndStore).toHaveBeenCalled();
  });

  it("generates capacity report", async () => {
    await controller.generateCapacityReport({ project_id: "p-1" });
    expect(mockCapacity.generateReport).toHaveBeenCalled();
  });

  it("queries audit log", async () => {
    await controller.queryAudit("p-1");
    expect(mockAudit.query).toHaveBeenCalled();
  });

  it("creates API key", async () => {
    const result = await controller.createApiKey({ project_id: "p-1", name: "CI" });
    expect(result.key).toBe("pfk_test");
  });

  it("lists geo locations", () => {
    controller.listGeoLocations();
    expect(mockGeo.listLocations).toHaveBeenCalled();
  });

  it("compares geo results", async () => {
    const result = await controller.compareGeoResults("run-1");
    expect(mockGeo.getComparison).toHaveBeenCalledWith("run-1");
    expect(result.comparison).toEqual([]);
  });
});
