import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface GeoLocation {
  id: string;
  label: string;
  region: string;      // us-east-1, eu-west-1, ap-southeast-1, etc.
  provider: string;    // wpt, k6
  endpoint?: string;   // WPT server URL or k6 cloud region
  is_active: boolean;
}

export interface MultiGeoRunRequest {
  project_id: string;
  url: string;
  locations: string[];  // region IDs
  engine: "wpt" | "k6_browser";
  device?: string;
  n_runs?: number;
  load_profile_id?: string;
}

export interface GeoRunResult {
  location: string;
  region: string;
  status: "completed" | "failed" | "skipped";
  metrics: Record<string, number>;
  latency_offset_ms?: number;
  error?: string;
}

export interface MultiGeoResult {
  id: string;
  project_id: string;
  url: string;
  locations: GeoRunResult[];
  comparison: GeoComparison[];
}

export interface GeoComparison {
  metric: string;
  best_region: string;
  worst_region: string;
  range_ms: number;
  values: Record<string, number>;
}

@Injectable()
export class MultiGeoService {
  private readonly logger = new Logger(MultiGeoService.name);

  // Available geo locations (in production, sourced from config/DB)
  private readonly geoLocations: GeoLocation[] = [
    { id: "us-east-1", label: "US East (Virginia)", region: "us-east-1", provider: "k6", is_active: true },
    { id: "us-west-2", label: "US West (Oregon)", region: "us-west-2", provider: "k6", is_active: true },
    { id: "eu-west-1", label: "EU West (Ireland)", region: "eu-west-1", provider: "k6", is_active: true },
    { id: "ap-southeast-1", label: "Asia Pacific (Singapore)", region: "ap-southeast-1", provider: "k6", is_active: true },
    { id: "wpt-dulles", label: "WPT Dulles", region: "us-east-1", provider: "wpt", endpoint: "Dulles:Chrome", is_active: true },
    { id: "wpt-london", label: "WPT London", region: "eu-west-2", provider: "wpt", endpoint: "London:Chrome", is_active: true },
    { id: "wpt-sydney", label: "WPT Sydney", region: "ap-southeast-2", provider: "wpt", endpoint: "Sydney:Chrome", is_active: true },
  ];

  constructor(private readonly db: DatabaseService) {}

  /**
   * List available geo locations, optionally filtered by provider.
   */
  listLocations(provider?: string): GeoLocation[] {
    const locations = this.geoLocations.filter((l) => l.is_active);
    return provider ? locations.filter((l) => l.provider === provider) : locations;
  }

  /**
   * Dispatch a multi-geo test run.
   * Creates individual runs for each location and returns aggregated results.
   *
   * In production, this fans out to regional workers. The scaffold records
   * the geo_locations on the run row and returns a stub result.
   */
  async dispatch(request: MultiGeoRunRequest): Promise<MultiGeoResult> {
    const runId = crypto.randomUUID();
    const locations = request.locations.map((loc) =>
      this.geoLocations.find((g) => g.id === loc),
    ).filter((g): g is GeoLocation => g != null);

    if (locations.length === 0) {
      throw new Error("No valid geo locations specified");
    }

    this.logger.log(
      `Dispatching multi-geo run ${runId} to ${locations.length} locations for ${request.url}`,
    );

    // Record the multi-geo run
    await this.db.query(
      `INSERT INTO runs (id, project_id, config, status, engine, geo_locations)
       VALUES ($1, $2, $3, 'queued', $4, $5)`,
      [
        runId,
        request.project_id,
        JSON.stringify({ url: request.url, device: request.device ?? "desktop", n_runs: request.n_runs ?? 1 }),
        request.engine === "wpt" ? "wpt" : "k6_browser",
        locations.map((l) => l.id),
      ],
    );

    // Scaffold: return stub results (in production, each location executes independently)
    const geoResults: GeoRunResult[] = locations.map((loc) => ({
      location: loc.id,
      region: loc.region,
      status: "completed" as const,
      metrics: {},
      latency_offset_ms: 0,
    }));

    const comparison = this.compareResults(geoResults);

    return {
      id: runId,
      project_id: request.project_id,
      url: request.url,
      locations: geoResults,
      comparison,
    };
  }

  /**
   * Compare metrics across geo locations.
   */
  compareResults(results: GeoRunResult[]): GeoComparison[] {
    const completed = results.filter((r) => r.status === "completed" && Object.keys(r.metrics).length > 0);
    if (completed.length < 2) return [];

    const allMetrics = new Set<string>();
    for (const r of completed) {
      Object.keys(r.metrics).forEach((m) => allMetrics.add(m));
    }

    const comparisons: GeoComparison[] = [];
    for (const metric of allMetrics) {
      const values: Record<string, number> = {};
      for (const r of completed) {
        if (r.metrics[metric] != null) {
          values[r.location] = r.metrics[metric];
        }
      }

      const entries = Object.entries(values);
      if (entries.length < 2) continue;

      entries.sort((a, b) => a[1] - b[1]);
      comparisons.push({
        metric,
        best_region: entries[0][0],
        worst_region: entries[entries.length - 1][0],
        range_ms: Math.round((entries[entries.length - 1][1] - entries[0][1]) * 100) / 100,
        values,
      });
    }

    return comparisons;
  }

  /**
   * Fetch geo run results for a run and compute cross-region comparison.
   */
  async getComparison(runId: string): Promise<{ locations: GeoRunResult[]; comparison: GeoComparison[] }> {
    const result = await this.db.query<{
      geo_locations: string[];
      metrics: Record<string, number> | null;
      status: string;
    }>(
      "SELECT geo_locations, metrics, status FROM runs WHERE id = $1",
      [runId],
    );

    const run = result.rows[0];
    if (!run || !run.geo_locations) {
      return { locations: [], comparison: [] };
    }

    // Build stub results from stored geo_locations; in production these
    // would be fetched from per-region child run rows.
    const geoResults: GeoRunResult[] = run.geo_locations.map((loc) => ({
      location: loc,
      region: loc,
      status: (run.status === "completed" ? "completed" : "skipped") as GeoRunResult["status"],
      metrics: run.metrics ?? {},
    }));

    return {
      locations: geoResults,
      comparison: this.compareResults(geoResults),
    };
  }
}
