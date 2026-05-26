import { Test } from "@nestjs/testing";
import { ForecastingService } from "./forecasting.service";
import { DatabaseService } from "../database/database.service";

describe("ForecastingService", () => {
  let service: ForecastingService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ForecastingService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(ForecastingService);
  });

  describe("generateForecast", () => {
    it("returns empty forecast with insufficient data", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ day: "2024-01-01", avg_value: 100 }] });
      const result = await service.generateForecast({
        project_id: "p-1",
        metric: "lcp_ms",
      });
      expect(result.forecast_data).toHaveLength(0);
    });

    it("generates forecast with sufficient data", async () => {
      const days = Array.from({ length: 30 }, (_, i) => ({
        day: new Date(2024, 0, i + 1).toISOString().split("T")[0],
        avg_value: 200 + i * 2 + Math.sin(i) * 10,
      }));
      mockDb.query
        .mockResolvedValueOnce({ rows: days }) // fetchHistory
        .mockResolvedValueOnce({ rows: [{ id: "f-1" }] }); // saveForecast

      const result = await service.generateForecast({
        project_id: "p-1",
        metric: "lcp_ms",
        horizon_days: 14,
      });

      expect(result.forecast_data).toHaveLength(14);
      expect(result.trend_component.direction).toBeDefined();
      expect(result.accuracy.mape).toBeGreaterThanOrEqual(0);
    });
  });

  describe("fitTrend", () => {
    it("detects upward trend", () => {
      const history = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
        value: 100 + i * 5,
      }));
      const trend = service.fitTrend(history);
      expect(trend.slope_per_day).toBeGreaterThan(0);
      expect(trend.r_squared).toBeGreaterThan(0.9);
    });

    it("detects stable trend", () => {
      const history = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
        value: 100,
      }));
      const trend = service.fitTrend(history);
      expect(trend.direction).toBe("stable");
    });
  });

  describe("computeAccuracy", () => {
    it("computes accuracy metrics", () => {
      const history = [
        { date: "2024-01-01", value: 100 },
        { date: "2024-01-02", value: 200 },
        { date: "2024-01-03", value: 150 },
      ];
      const residuals = [5, -10, 8];
      const accuracy = service.computeAccuracy(history, residuals);
      expect(accuracy.mae).toBeGreaterThan(0);
      expect(accuracy.rmse).toBeGreaterThan(0);
      expect(accuracy.mape).toBeGreaterThan(0);
    });
  });
});
