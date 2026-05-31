import { Test } from "@nestjs/testing";
import { AnomaliesService } from "./anomalies.service";
import { ChangePointService } from "./change-point.service";
import { DatabaseService } from "../database/database.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Anomalies → Notification Wiring Tests (E-36)
 *
 * Ch 14, p181–182: "auto-dispatch on change-point detection"
 */

describe("AnomaliesService — notification wiring (E-36)", () => {
  let service: AnomaliesService;
  let mockDb: { query: jest.Mock };
  let mockChangePoint: { detectForProject: jest.Mock };
  let mockNotifications: { dispatch: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    mockChangePoint = { detectForProject: jest.fn() };
    mockNotifications = { dispatch: jest.fn().mockResolvedValue(1) };

    const module = await Test.createTestingModule({
      providers: [
        AnomaliesService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: ChangePointService, useValue: mockChangePoint },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get(AnomaliesService);
  });

  it("dispatches anomaly_detected notification when anomaly is created", async () => {
    mockChangePoint.detectForProject.mockResolvedValueOnce([
      {
        metric: "lcp_ms",
        detected: true,
        changeRunId: "run-99",
        severity: "critical",
        detector: "cusum",
        description: "LCP increased by 40%",
        details: { magnitude: 400 },
      },
    ]);

    // Dedup check → no existing
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    // Create anomaly
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        id: "anomaly-1",
        project_id: "p-1",
        metric: "lcp_ms",
        severity: "critical",
        detector: "cusum",
        description: "LCP increased by 40%",
      }],
    });

    await service.analyzeProject("p-1");

    expect(mockNotifications.dispatch).toHaveBeenCalledTimes(1);
    expect(mockNotifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "anomaly_detected",
        project_id: "p-1",
        title: "Anomaly detected: lcp_ms",
        message: "LCP increased by 40%",
        details: expect.objectContaining({
          anomaly_id: "anomaly-1",
          metric: "lcp_ms",
          severity: "critical",
          detector: "cusum",
        }),
      }),
    );
  });

  it("dispatches for each new anomaly separately", async () => {
    mockChangePoint.detectForProject.mockResolvedValueOnce([
      {
        metric: "lcp_ms", detected: true, changeRunId: "run-1",
        severity: "warning", detector: "cusum",
        description: "LCP regressed", details: {},
      },
      {
        metric: "fcp_ms", detected: true, changeRunId: "run-1",
        severity: "critical", detector: "ewma",
        description: "FCP regressed", details: {},
      },
    ]);

    // Dedup checks → neither exists
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "a-1", project_id: "p-1", metric: "lcp_ms", severity: "warning" }],
    });
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "a-2", project_id: "p-1", metric: "fcp_ms", severity: "critical" }],
    });

    await service.analyzeProject("p-1");

    expect(mockNotifications.dispatch).toHaveBeenCalledTimes(2);
  });

  it("does not dispatch for duplicate anomalies (dedup)", async () => {
    mockChangePoint.detectForProject.mockResolvedValueOnce([
      {
        metric: "lcp_ms", detected: true, changeRunId: "run-1",
        severity: "warning", detector: "cusum",
        description: "LCP regressed", details: {},
      },
    ]);

    // Dedup check → already exists
    mockDb.query.mockResolvedValueOnce({ rows: [{ id: "existing" }] });

    await service.analyzeProject("p-1");

    expect(mockNotifications.dispatch).not.toHaveBeenCalled();
  });

  it("does not fail if notification dispatch throws", async () => {
    mockChangePoint.detectForProject.mockResolvedValueOnce([
      {
        metric: "lcp_ms", detected: true, changeRunId: "run-1",
        severity: "warning", detector: "cusum",
        description: "LCP regressed", details: {},
      },
    ]);

    mockDb.query.mockResolvedValueOnce({ rows: [] });
    mockDb.query.mockResolvedValueOnce({
      rows: [{ id: "a-1", project_id: "p-1", metric: "lcp_ms" }],
    });
    mockNotifications.dispatch.mockRejectedValueOnce(new Error("Slack down"));

    // Should not throw
    const result = await service.analyzeProject("p-1");
    expect(result).toHaveLength(1);
  });

  it("skips undetected change points", async () => {
    mockChangePoint.detectForProject.mockResolvedValueOnce([
      { metric: "lcp_ms", detected: false, changeRunId: null },
    ]);

    await service.analyzeProject("p-1");

    expect(mockDb.query).not.toHaveBeenCalled();
    expect(mockNotifications.dispatch).not.toHaveBeenCalled();
  });
});
