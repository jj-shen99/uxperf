import { Test } from "@nestjs/testing";
import { ForecastingService, BreachWarning, ForecastPoint } from "./forecasting.service";
import { DatabaseService } from "../database/database.service";

/**
 * Forecasting Breach Warnings — Unit Tests (E-37)
 *
 * Ch 14, p179: "budget breach in N weeks" alerts.
 */

describe("ForecastingService — projectBreach (E-37)", () => {
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

  function mockHistory(
    days: number,
    startValue: number,
    slopePerDay: number,
  ) {
    const rows = [];
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      rows.push({
        day: d.toISOString().split("T")[0],
        avg_value: startValue + slopePerDay * i,
      });
    }
    return rows;
  }

  it("detects upcoming breach when trend is degrading", async () => {
    // LCP growing at 5ms/day from 2000ms, budget at 2500ms
    // Breach ~100 days out
    const history = mockHistory(30, 2000, 5);
    mockDb.query
      .mockResolvedValueOnce({ rows: history })  // fetchHistory
      .mockResolvedValueOnce({ rows: [{ id: "f-1" }] }); // saveForecast

    const result = await service.projectBreach({
      project_id: "p-1",
      metric: "lcp_ms",
      budget_threshold: 2500,
      horizon_days: 120,
    });

    expect(result.will_breach).toBe(true);
    expect(result.breach_date).toBeTruthy();
    expect(result.days_until_breach).toBeGreaterThan(0);
    expect(result.weeks_until_breach).toBeGreaterThan(0);
    expect(result.reason).toContain("lcp_ms");
    expect(result.reason).toContain("2500");
  });

  it("reports no breach when metric is stable and below budget", async () => {
    // Stable LCP around 1500ms, budget at 2500ms
    const history = mockHistory(30, 1500, 0.1);
    mockDb.query
      .mockResolvedValueOnce({ rows: history })
      .mockResolvedValueOnce({ rows: [{ id: "f-2" }] });

    const result = await service.projectBreach({
      project_id: "p-1",
      metric: "lcp_ms",
      budget_threshold: 2500,
    });

    expect(result.will_breach).toBe(false);
    expect(result.breach_date).toBeNull();
    expect(result.days_until_breach).toBeNull();
  });

  it("reports no breach when metric is improving", async () => {
    // LCP decreasing at -3ms/day from 2000ms, budget 2500ms
    const history = mockHistory(30, 2000, -3);
    mockDb.query
      .mockResolvedValueOnce({ rows: history })
      .mockResolvedValueOnce({ rows: [{ id: "f-3" }] });

    const result = await service.projectBreach({
      project_id: "p-1",
      metric: "lcp_ms",
      budget_threshold: 2500,
    });

    expect(result.will_breach).toBe(false);
    expect(result.current_trend.direction).toBe("improving");
  });

  it("returns low confidence when insufficient history", async () => {
    // Only 3 data points (< 7 required)
    const history = mockHistory(3, 2000, 10);
    mockDb.query.mockResolvedValueOnce({ rows: history });

    const result = await service.projectBreach({
      project_id: "p-1",
      metric: "lcp_ms",
      budget_threshold: 2500,
    });

    expect(result.will_breach).toBe(false);
    expect(result.confidence).toBe("low");
    expect(result.reason).toContain("Insufficient data");
  });

  it("checkAllBudgetBreaches returns sorted warnings", async () => {
    // Two budgets, both trending up
    // LCP: faster growth → sooner breach
    const lcpHistory = mockHistory(30, 2000, 8);
    const fcpHistory = mockHistory(30, 1000, 3);

    mockDb.query
      .mockResolvedValueOnce({ rows: lcpHistory })
      .mockResolvedValueOnce({ rows: [{ id: "f-4" }] })
      .mockResolvedValueOnce({ rows: fcpHistory })
      .mockResolvedValueOnce({ rows: [{ id: "f-5" }] });

    const warnings = await service.checkAllBudgetBreaches(
      "p-1",
      [
        { metric: "lcp_ms", threshold: 2500 },
        { metric: "fcp_ms", threshold: 1500 },
      ],
    );

    // Both should breach; sorted by urgency
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    if (warnings.length >= 2) {
      expect(warnings[0].days_until_breach!).toBeLessThanOrEqual(
        warnings[1].days_until_breach!,
      );
    }
  });

  it("checkAllBudgetBreaches filters out non-breaching metrics", async () => {
    // Stable metric well below budget
    const history = mockHistory(30, 500, 0);
    mockDb.query
      .mockResolvedValueOnce({ rows: history })
      .mockResolvedValueOnce({ rows: [{ id: "f-6" }] });

    const warnings = await service.checkAllBudgetBreaches(
      "p-1",
      [{ metric: "cls", threshold: 1000 }],
    );

    expect(warnings).toHaveLength(0);
  });
});
