import { Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export interface CruxQueryInput {
  project_id: string;
  origin: string;
  form_factor?: string;
  api_key?: string;
}

export interface CruxSnapshot {
  id?: string;
  project_id: string;
  origin: string;
  form_factor: string;
  collection_period_start: string;
  collection_period_end: string;
  lcp_p75_ms: number | null;
  fcp_p75_ms: number | null;
  inp_p75_ms: number | null;
  cls_p75: number | null;
  ttfb_p75_ms: number | null;
  lcp_rating: string | null;
  fcp_rating: string | null;
  inp_rating: string | null;
  cls_rating: string | null;
  ttfb_rating: string | null;
  lcp_histogram: unknown;
  fcp_histogram: unknown;
  inp_histogram: unknown;
  cls_histogram: unknown;
  ttfb_histogram: unknown;
}

@Injectable()
export class CruxIngestionService {
  private readonly logger = new Logger(CruxIngestionService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Fetch and store a CrUX snapshot for an origin.
   *
   * In production, this calls the Chrome UX Report API:
   * POST https://chromeuxreport.googleapis.com/v1/records:queryRecord
   *
   * This scaffold parses the standard CrUX API response format.
   */
  async fetchAndStore(input: CruxQueryInput): Promise<CruxSnapshot> {
    const apiKey = input.api_key ?? process.env.CRUX_API_KEY ?? "";
    const formFactor = input.form_factor ?? "ALL_FORM_FACTORS";

    let rawResponse: any;
    try {
      rawResponse = await this.queryCruxApi(input.origin, formFactor, apiKey);
    } catch (err: any) {
      this.logger.warn(`CrUX API call failed for ${input.origin}: ${err.message}`);
      rawResponse = null;
    }

    const snapshot = this.parseResponse(input.project_id, input.origin, formFactor, rawResponse);
    await this.saveSnapshot(snapshot, rawResponse);
    return snapshot;
  }

  /**
   * Query the CrUX API (scaffold — requires CRUX_API_KEY).
   */
  private async queryCruxApi(origin: string, formFactor: string, apiKey: string): Promise<any> {
    if (!apiKey) {
      this.logger.debug("No CrUX API key configured; returning null");
      return null;
    }

    const url = `https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${apiKey}`;
    const body = {
      origin,
      formFactor: formFactor !== "ALL_FORM_FACTORS" ? formFactor : undefined,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`CrUX API returned ${response.status}`);
    }

    return response.json();
  }

  /**
   * Parse a CrUX API response into a snapshot.
   */
  parseResponse(
    projectId: string,
    origin: string,
    formFactor: string,
    raw: any,
  ): CruxSnapshot {
    const record = raw?.record;
    const metrics = record?.metrics ?? {};
    const collectionPeriod = record?.collectionPeriod ?? {};

    const extractP75 = (metric: any): number | null => {
      const percentiles = metric?.percentiles;
      return percentiles?.p75 != null ? Number(percentiles.p75) : null;
    };

    const extractRating = (metric: any): string | null => {
      if (!metric?.histogram) return null;
      const good = metric.histogram[0]?.density ?? 0;
      const ni = metric.histogram[1]?.density ?? 0;
      if (good >= 0.75) return "good";
      if (good + ni >= 0.75) return "needs-improvement";
      return "poor";
    };

    return {
      project_id: projectId,
      origin,
      form_factor: formFactor,
      collection_period_start: collectionPeriod.firstDate?.year
        ? `${collectionPeriod.firstDate.year}-${String(collectionPeriod.firstDate.month).padStart(2, "0")}-${String(collectionPeriod.firstDate.day).padStart(2, "0")}`
        : new Date().toISOString().split("T")[0],
      collection_period_end: collectionPeriod.lastDate?.year
        ? `${collectionPeriod.lastDate.year}-${String(collectionPeriod.lastDate.month).padStart(2, "0")}-${String(collectionPeriod.lastDate.day).padStart(2, "0")}`
        : new Date().toISOString().split("T")[0],
      lcp_p75_ms: extractP75(metrics.largest_contentful_paint),
      fcp_p75_ms: extractP75(metrics.first_contentful_paint),
      inp_p75_ms: extractP75(metrics.interaction_to_next_paint),
      cls_p75: extractP75(metrics.cumulative_layout_shift),
      ttfb_p75_ms: extractP75(metrics.experimental_time_to_first_byte),
      lcp_rating: extractRating(metrics.largest_contentful_paint),
      fcp_rating: extractRating(metrics.first_contentful_paint),
      inp_rating: extractRating(metrics.interaction_to_next_paint),
      cls_rating: extractRating(metrics.cumulative_layout_shift),
      ttfb_rating: extractRating(metrics.experimental_time_to_first_byte),
      lcp_histogram: metrics.largest_contentful_paint?.histogram ?? null,
      fcp_histogram: metrics.first_contentful_paint?.histogram ?? null,
      inp_histogram: metrics.interaction_to_next_paint?.histogram ?? null,
      cls_histogram: metrics.cumulative_layout_shift?.histogram ?? null,
      ttfb_histogram: metrics.experimental_time_to_first_byte?.histogram ?? null,
    };
  }

  private async saveSnapshot(snapshot: CruxSnapshot, rawResponse: any): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `INSERT INTO crux_snapshots
        (project_id, origin, form_factor, collection_period_start, collection_period_end,
         lcp_p75_ms, fcp_p75_ms, inp_p75_ms, cls_p75, ttfb_p75_ms,
         lcp_rating, fcp_rating, inp_rating, cls_rating, ttfb_rating,
         lcp_histogram, fcp_histogram, inp_histogram, cls_histogram, ttfb_histogram,
         raw_response)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id`,
      [
        snapshot.project_id, snapshot.origin, snapshot.form_factor,
        snapshot.collection_period_start, snapshot.collection_period_end,
        snapshot.lcp_p75_ms, snapshot.fcp_p75_ms, snapshot.inp_p75_ms,
        snapshot.cls_p75, snapshot.ttfb_p75_ms,
        snapshot.lcp_rating, snapshot.fcp_rating, snapshot.inp_rating,
        snapshot.cls_rating, snapshot.ttfb_rating,
        JSON.stringify(snapshot.lcp_histogram), JSON.stringify(snapshot.fcp_histogram),
        JSON.stringify(snapshot.inp_histogram), JSON.stringify(snapshot.cls_histogram),
        JSON.stringify(snapshot.ttfb_histogram),
        JSON.stringify(rawResponse),
      ],
    );
    return r.rows[0].id;
  }

  async listSnapshots(projectId: string, origin?: string, limit = 30): Promise<any[]> {
    const params: unknown[] = [projectId];
    let where = "project_id = $1";
    if (origin) {
      params.push(origin);
      where += ` AND origin = $${params.length}`;
    }
    params.push(limit);
    const r = await this.db.query(
      `SELECT * FROM crux_snapshots WHERE ${where} ORDER BY collection_period_end DESC LIMIT $${params.length}`,
      params,
    );
    return r.rows;
  }
}
