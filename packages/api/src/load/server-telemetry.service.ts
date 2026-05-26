import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface ResourceSnapshot {
  load_run_id: string;
  host: string;
  timestamp: string;
  cpu_percent: number | null;
  memory_percent: number | null;
  memory_used_bytes: number | null;
  disk_io_read_bytes: number | null;
  disk_io_write_bytes: number | null;
  network_rx_bytes: number | null;
  network_tx_bytes: number | null;
  active_connections: number | null;
  http_request_rate: number | null;
  event_loop_lag_ms: number | null;
  nginx_active_connections: number | null;
  nginx_requests_per_sec: number | null;
  labels: Record<string, string>;
}

export interface PrometheusTarget {
  host: string;
  port: number;
  scrape_path: string;
  labels: Record<string, string>;
}

export interface TelemetrySummary {
  host: string;
  peak_cpu_percent: number;
  peak_memory_percent: number;
  avg_cpu_percent: number;
  avg_memory_percent: number;
  peak_connections: number;
  avg_event_loop_lag_ms: number;
  sample_count: number;
}

@Injectable()
export class ServerTelemetryService {
  private readonly logger = new Logger(ServerTelemetryService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Record a server resource snapshot.
   */
  async recordSnapshot(snapshot: ResourceSnapshot): Promise<void> {
    await this.db.query(
      `INSERT INTO server_resource_snapshots
        (load_run_id, host, timestamp, cpu_percent, memory_percent, memory_used_bytes,
         disk_io_read_bytes, disk_io_write_bytes, network_rx_bytes, network_tx_bytes,
         active_connections, http_request_rate, event_loop_lag_ms,
         nginx_active_connections, nginx_requests_per_sec, labels)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        snapshot.load_run_id,
        snapshot.host,
        snapshot.timestamp,
        snapshot.cpu_percent,
        snapshot.memory_percent,
        snapshot.memory_used_bytes,
        snapshot.disk_io_read_bytes,
        snapshot.disk_io_write_bytes,
        snapshot.network_rx_bytes,
        snapshot.network_tx_bytes,
        snapshot.active_connections,
        snapshot.http_request_rate,
        snapshot.event_loop_lag_ms,
        snapshot.nginx_active_connections,
        snapshot.nginx_requests_per_sec,
        JSON.stringify(snapshot.labels ?? {}),
      ],
    );
  }

  /**
   * Bulk record snapshots (batch insert).
   */
  async recordBatch(snapshots: ResourceSnapshot[]): Promise<number> {
    if (snapshots.length === 0) return 0;

    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    for (const s of snapshots) {
      const placeholders = [];
      for (const val of [
        s.load_run_id, s.host, s.timestamp, s.cpu_percent, s.memory_percent,
        s.memory_used_bytes, s.disk_io_read_bytes, s.disk_io_write_bytes,
        s.network_rx_bytes, s.network_tx_bytes, s.active_connections,
        s.http_request_rate, s.event_loop_lag_ms, s.nginx_active_connections,
        s.nginx_requests_per_sec, JSON.stringify(s.labels ?? {}),
      ]) {
        placeholders.push(`$${idx}`);
        params.push(val);
        idx++;
      }
      values.push(`(${placeholders.join(", ")})`);
    }

    await this.db.query(
      `INSERT INTO server_resource_snapshots
        (load_run_id, host, timestamp, cpu_percent, memory_percent, memory_used_bytes,
         disk_io_read_bytes, disk_io_write_bytes, network_rx_bytes, network_tx_bytes,
         active_connections, http_request_rate, event_loop_lag_ms,
         nginx_active_connections, nginx_requests_per_sec, labels)
       VALUES ${values.join(", ")}`,
      params,
    );

    return snapshots.length;
  }

  /**
   * Get time-series snapshots for a load run.
   */
  async getSnapshots(
    loadRunId: string,
    host?: string,
    limit = 1000,
  ): Promise<ResourceSnapshot[]> {
    const params: unknown[] = [loadRunId];
    let where = "load_run_id = $1";
    if (host) {
      params.push(host);
      where += ` AND host = $${params.length}`;
    }
    params.push(Math.min(limit, 5000));

    const result = await this.db.query<ResourceSnapshot>(
      `SELECT * FROM server_resource_snapshots
       WHERE ${where}
       ORDER BY timestamp ASC
       LIMIT $${params.length}`,
      params,
    );
    return result.rows;
  }

  /**
   * Compute telemetry summary per host for a load run.
   */
  async getSummary(loadRunId: string): Promise<TelemetrySummary[]> {
    const result = await this.db.query<TelemetrySummary>(
      `SELECT
        host,
        MAX(cpu_percent) AS peak_cpu_percent,
        MAX(memory_percent) AS peak_memory_percent,
        AVG(cpu_percent) AS avg_cpu_percent,
        AVG(memory_percent) AS avg_memory_percent,
        MAX(active_connections) AS peak_connections,
        AVG(event_loop_lag_ms) AS avg_event_loop_lag_ms,
        COUNT(*) AS sample_count
       FROM server_resource_snapshots
       WHERE load_run_id = $1
       GROUP BY host
       ORDER BY host`,
      [loadRunId],
    );
    return result.rows;
  }

  /**
   * Scrape Prometheus metrics from a target.
   * Scaffold — in production, this would parse the /metrics endpoint.
   */
  async scrapeTarget(target: PrometheusTarget): Promise<Record<string, number>> {
    const url = `http://${target.host}:${target.port}${target.scrape_path || "/metrics"}`;
    this.logger.debug(`Scraping ${url}`);

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        this.logger.warn(`Scrape failed for ${url}: HTTP ${response.status}`);
        return {};
      }
      const text = await response.text();
      return this.parsePrometheusText(text);
    } catch (err: any) {
      this.logger.warn(`Scrape error for ${url}: ${err.message}`);
      return {};
    }
  }

  /**
   * Parse Prometheus exposition format into key-value pairs.
   */
  parsePrometheusText(text: string): Record<string, number> {
    const metrics: Record<string, number> = {};
    for (const line of text.split("\n")) {
      if (line.startsWith("#") || line.trim() === "") continue;
      const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\s+([0-9eE.+-]+)/);
      if (match) {
        const value = parseFloat(match[2]);
        if (!isNaN(value)) {
          metrics[match[1]] = value;
        }
      }
    }
    return metrics;
  }

  /**
   * Convert scraped Prometheus metrics to a ResourceSnapshot.
   */
  prometheusToSnapshot(
    loadRunId: string,
    host: string,
    metrics: Record<string, number>,
    labels: Record<string, string> = {},
  ): ResourceSnapshot {
    return {
      load_run_id: loadRunId,
      host,
      timestamp: new Date().toISOString(),
      cpu_percent: metrics["process_cpu_seconds_total"] != null
        ? metrics["process_cpu_seconds_total"] * 100
        : metrics["node_cpu_percent"] ?? null,
      memory_percent: metrics["process_resident_memory_bytes"] != null
        ? null // would need total memory to compute percent
        : metrics["node_memory_percent"] ?? null,
      memory_used_bytes: metrics["process_resident_memory_bytes"] ?? null,
      disk_io_read_bytes: metrics["node_disk_read_bytes_total"] ?? null,
      disk_io_write_bytes: metrics["node_disk_written_bytes_total"] ?? null,
      network_rx_bytes: metrics["node_network_receive_bytes_total"] ?? null,
      network_tx_bytes: metrics["node_network_transmit_bytes_total"] ?? null,
      active_connections: metrics["node_netstat_Tcp_CurrEstab"] ?? null,
      http_request_rate: metrics["http_requests_total"] ?? null,
      event_loop_lag_ms: metrics["nodejs_eventloop_lag_seconds"]
        ? metrics["nodejs_eventloop_lag_seconds"] * 1000
        : null,
      nginx_active_connections: metrics["nginx_connections_active"] ?? null,
      nginx_requests_per_sec: metrics["nginx_http_requests_total"] ?? null,
      labels,
    };
  }
}
