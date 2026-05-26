import { Test } from "@nestjs/testing";
import { ServerTelemetryService } from "./server-telemetry.service";
import { DatabaseService } from "../database/database.service";

describe("ServerTelemetryService", () => {
  let service: ServerTelemetryService;
  let mockDb: { query: jest.Mock };

  beforeEach(async () => {
    mockDb = { query: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [
        ServerTelemetryService,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();
    service = module.get(ServerTelemetryService);
  });

  describe("recordSnapshot", () => {
    it("inserts a snapshot", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });
      await service.recordSnapshot({
        load_run_id: "lr-1",
        host: "app-01",
        timestamp: new Date().toISOString(),
        cpu_percent: 45,
        memory_percent: 60,
        memory_used_bytes: null,
        disk_io_read_bytes: null,
        disk_io_write_bytes: null,
        network_rx_bytes: null,
        network_tx_bytes: null,
        active_connections: 120,
        http_request_rate: 500,
        event_loop_lag_ms: 12,
        nginx_active_connections: null,
        nginx_requests_per_sec: null,
        labels: { env: "staging" },
      });
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });
  });

  describe("getSnapshots", () => {
    it("returns snapshots for a load run", async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ host: "app-01", cpu_percent: 45 }] });
      const result = await service.getSnapshots("lr-1");
      expect(result).toHaveLength(1);
    });
  });

  describe("getSummary", () => {
    it("returns per-host summary", async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          host: "app-01",
          peak_cpu_percent: 85,
          peak_memory_percent: 72,
          avg_cpu_percent: 45,
          avg_memory_percent: 55,
          peak_connections: 200,
          avg_event_loop_lag_ms: 15,
          sample_count: 60,
        }],
      });
      const result = await service.getSummary("lr-1");
      expect(result[0].peak_cpu_percent).toBe(85);
    });
  });

  describe("parsePrometheusText", () => {
    it("parses Prometheus exposition format", () => {
      const text = `# HELP process_cpu_seconds_total
# TYPE process_cpu_seconds_total counter
process_cpu_seconds_total 0.45
process_resident_memory_bytes 52428800
node_cpu_percent 32.5
`;
      const result = service.parsePrometheusText(text);
      expect(result["process_cpu_seconds_total"]).toBe(0.45);
      expect(result["process_resident_memory_bytes"]).toBe(52428800);
      expect(result["node_cpu_percent"]).toBe(32.5);
    });

    it("skips comments and empty lines", () => {
      const result = service.parsePrometheusText("# comment\n\n");
      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe("prometheusToSnapshot", () => {
    it("converts metrics to snapshot", () => {
      const snap = service.prometheusToSnapshot("lr-1", "app-01", {
        process_cpu_seconds_total: 0.45,
        process_resident_memory_bytes: 52428800,
        nodejs_eventloop_lag_seconds: 0.012,
        nginx_connections_active: 45,
      });
      expect(snap.load_run_id).toBe("lr-1");
      expect(snap.cpu_percent).toBe(45);
      expect(snap.memory_used_bytes).toBe(52428800);
      expect(snap.event_loop_lag_ms).toBe(12);
      expect(snap.nginx_active_connections).toBe(45);
    });
  });
});
