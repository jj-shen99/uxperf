import { Test } from "@nestjs/testing";
import { ScheduleDispatcherService } from "./schedule-dispatcher.service";
import { SchedulesService } from "./schedules.service";
import { RunsService } from "../runs/runs.service";

// ============================================================
// Schedule Dispatcher — Unit Tests
// Techniques: EP, boundary, structural, decision tree
// ============================================================

describe("ScheduleDispatcherService", () => {
  let service: ScheduleDispatcherService;
  let mockSchedules: {
    findDueSchedules: jest.Mock;
    markExecuted: jest.Mock;
  };
  let mockRuns: { create: jest.Mock };

  beforeEach(async () => {
    mockSchedules = {
      findDueSchedules: jest.fn().mockResolvedValue([]),
      markExecuted: jest.fn().mockResolvedValue(undefined),
    };
    mockRuns = {
      create: jest.fn().mockResolvedValue({ id: "run-1" }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ScheduleDispatcherService,
        { provide: SchedulesService, useValue: mockSchedules },
        { provide: RunsService, useValue: mockRuns },
      ],
    }).compile();
    service = module.get(ScheduleDispatcherService);
  });

  afterEach(() => {
    // Prevent the interval from running during tests
    service.onModuleDestroy();
  });

  describe("tick", () => {
    it("dispatches nothing when no due schedules (boundary)", async () => {
      mockSchedules.findDueSchedules.mockResolvedValue([]);
      const dispatched = await service.tick();
      expect(dispatched).toBe(0);
      expect(mockRuns.create).not.toHaveBeenCalled();
    });

    it("creates runs for due schedules (primary path)", async () => {
      const schedule = {
        id: "s-1",
        project_id: "p-1",
        script_id: "sc-1",
        name: "Nightly",
        environment: "staging",
        config: { url: "https://example.com", n_runs: 3 },
        cron_expression: "0 2 * * *",
      };
      mockSchedules.findDueSchedules.mockResolvedValue([schedule]);

      const dispatched = await service.tick();

      expect(dispatched).toBe(1);
      expect(mockRuns.create).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: "p-1",
          script_id: "sc-1",
          schedule_id: "s-1",
          mode: "scheduled",
          environment: "staging",
        }),
      );
      expect(mockSchedules.markExecuted).toHaveBeenCalledWith("s-1");
    });

    it("dispatches multiple schedules (EP: multiple)", async () => {
      const schedules = [
        { id: "s-1", project_id: "p-1", script_id: null, name: "A", environment: "staging", config: { url: "https://a.com" } },
        { id: "s-2", project_id: "p-2", script_id: null, name: "B", environment: "prod", config: { url: "https://b.com" } },
      ];
      mockSchedules.findDueSchedules.mockResolvedValue(schedules);

      const dispatched = await service.tick();
      expect(dispatched).toBe(2);
      expect(mockRuns.create).toHaveBeenCalledTimes(2);
      expect(mockSchedules.markExecuted).toHaveBeenCalledTimes(2);
    });

    it("continues on individual schedule failure (structural: error path)", async () => {
      const schedules = [
        { id: "s-1", project_id: "p-1", script_id: null, name: "A", environment: "staging", config: {} },
        { id: "s-2", project_id: "p-2", script_id: null, name: "B", environment: "staging", config: {} },
      ];
      mockSchedules.findDueSchedules.mockResolvedValue(schedules);
      // First schedule fails, second succeeds
      mockRuns.create
        .mockRejectedValueOnce(new Error("DB error"))
        .mockResolvedValueOnce({ id: "run-2" });

      const dispatched = await service.tick();
      expect(dispatched).toBe(1);
      // markExecuted should only be called for the successful one
      expect(mockSchedules.markExecuted).toHaveBeenCalledTimes(1);
      expect(mockSchedules.markExecuted).toHaveBeenCalledWith("s-2");
    });

    it("handles findDueSchedules failure gracefully (structural: error path)", async () => {
      mockSchedules.findDueSchedules.mockRejectedValue(new Error("connection lost"));
      const dispatched = await service.tick();
      expect(dispatched).toBe(0);
    });

    it("prevents concurrent execution (decision tree: guard)", async () => {
      // Simulate a slow tick
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>((r) => { resolveFirst = r; });
      mockSchedules.findDueSchedules.mockImplementation(async () => {
        await firstPromise;
        return [];
      });

      const tick1 = service.tick();
      // Second tick while first is still running
      const tick2Result = await service.tick();
      expect(tick2Result).toBe(0); // Blocked by guard

      resolveFirst!();
      await tick1;
    });
  });
});
