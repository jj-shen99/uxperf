/**
 * Forecast Breach → Notification Wiring Tests (E-59)
 *
 * Book Ch 14, p179: "If the bundle has grown 3KB a week for the last quarter,
 * when will it cross the 200KB budget?"
 *
 * When a forecast crosses a budget threshold, auto-create a warning
 * notification ("budget breach in N weeks").
 */
import { Test } from "@nestjs/testing";
import { ForecastingService } from "./forecasting.service";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";

describe("ForecastingService — E-59 breach notification wiring", () => {
  let service: ForecastingService;
  let mockDb: { query: jest.Mock };
  let mockNotifications: { dispatch: jest.Mock };

  // Generate degrading history: starts at 1000, increases by 10/day
  function makeDegradingHistory(days: number): { day: string; avg_value: number }[] {
    const rows: { day: string; avg_value: number }[] = [];
    const base = new Date("2026-01-01");
    for (let i = 0; i < days; i++) {
      const d = new Date(base);
      d.setDate(d.getDate() + i);
      rows.push({
        day: d.toISOString().split("T")[0],
        avg_value: 1000 + i * 10,
      });
    }
    return rows;
  }

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    mockNotifications = { dispatch: jest.fn().mockResolvedValue(1) };

    const module = await Test.createTestingModule({
      providers: [
        ForecastingService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get(ForecastingService);
  });

  describe("checkAndNotifyBreaches", () => {
    it("dispatches notification for each breaching metric", async () => {
      const history = makeDegradingHistory(30);
      // fetchHistory returns degrading data
      mockDb.query.mockResolvedValueOnce({ rows: history });
      // saveForecast
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "f-1" }] });

      const warnings = await service.checkAndNotifyBreaches(
        "p-1",
        [{ metric: "lcp_ms", threshold: 2000 }],
      );

      // Should find a breach (1000 + 10/day → crosses 2000 around day 100)
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0].will_breach).toBe(true);
      expect(warnings[0].metric).toBe("lcp_ms");

      // Should have dispatched a notification
      expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
      expect(mockNotifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "forecast_breach",
          project_id: "p-1",
          title: "Forecast breach: lcp_ms",
          details: expect.objectContaining({
            metric: "lcp_ms",
            budget_threshold: 2000,
          }),
        }),
      );
    });

    it("does not dispatch when no breach is projected", async () => {
      // Flat history at 500 — will never reach 2000 in 90 days
      const history = Array.from({ length: 30 }, (_, i) => {
        const d = new Date("2026-01-01");
        d.setDate(d.getDate() + i);
        return { day: d.toISOString().split("T")[0], avg_value: 500 };
      });
      mockDb.query.mockResolvedValueOnce({ rows: history });
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "f-1" }] });

      const warnings = await service.checkAndNotifyBreaches(
        "p-1",
        [{ metric: "lcp_ms", threshold: 2000 }],
      );

      expect(warnings).toHaveLength(0);
      expect(mockNotifications.dispatch).not.toHaveBeenCalled();
    });

    it("dispatches for multiple breaching metrics", async () => {
      // Two metrics, both degrading
      const history = makeDegradingHistory(30);
      // First metric fetch + save
      mockDb.query.mockResolvedValueOnce({ rows: history });
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "f-1" }] });
      // Second metric fetch + save
      mockDb.query.mockResolvedValueOnce({ rows: history });
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "f-2" }] });

      const warnings = await service.checkAndNotifyBreaches("p-1", [
        { metric: "lcp_ms", threshold: 2000 },
        { metric: "fcp_ms", threshold: 2000 },
      ]);

      expect(warnings.length).toBeGreaterThanOrEqual(2);
      expect(mockNotifications.dispatch).toHaveBeenCalledTimes(warnings.length);
    });

    it("includes breach timing in notification details", async () => {
      const history = makeDegradingHistory(30);
      mockDb.query.mockResolvedValueOnce({ rows: history });
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "f-1" }] });

      await service.checkAndNotifyBreaches(
        "p-1",
        [{ metric: "lcp_ms", threshold: 2000 }],
      );

      const call = mockNotifications.dispatch.mock.calls[0][0];
      expect(call.details.breach_date).toBeDefined();
      expect(call.details.days_until_breach).toBeDefined();
      expect(call.details.weeks_until_breach).toBeDefined();
      expect(call.details.confidence).toBeDefined();
      expect(call.details.trend_direction).toBe("degrading");
    });

    it("does not throw if notification dispatch fails", async () => {
      const history = makeDegradingHistory(30);
      mockDb.query.mockResolvedValueOnce({ rows: history });
      mockDb.query.mockResolvedValueOnce({ rows: [{ id: "f-1" }] });
      mockNotifications.dispatch.mockRejectedValueOnce(new Error("Slack down"));

      // Should not throw
      const warnings = await service.checkAndNotifyBreaches(
        "p-1",
        [{ metric: "lcp_ms", threshold: 2000 }],
      );
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });

    it("handles insufficient data gracefully", async () => {
      // Only 3 data points — not enough for forecast
      mockDb.query.mockResolvedValueOnce({ rows: [
        { day: "2026-01-01", avg_value: 1000 },
        { day: "2026-01-02", avg_value: 1010 },
        { day: "2026-01-03", avg_value: 1020 },
      ]});

      const warnings = await service.checkAndNotifyBreaches(
        "p-1",
        [{ metric: "lcp_ms", threshold: 2000 }],
      );

      expect(warnings).toHaveLength(0);
      expect(mockNotifications.dispatch).not.toHaveBeenCalled();
    });
  });
});
