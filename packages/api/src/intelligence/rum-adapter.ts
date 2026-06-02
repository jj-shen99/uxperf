/**
 * E-70: RUM adapter protocol.
 *
 * Allows swapping the RUM data source (default: own SDK; alternatives:
 * SpeedCurve, Datadog RUM, New Relic Browser). Provides a common ingestion
 * protocol that normalizes external beacons into the internal RumEvent format.
 *
 * Book Ch 15, p263: "Allow swapping the RUM data source — requires a common
 * RUM ingestion protocol that normalizes external beacons."
 */

import { RumEvent } from "./rum-ingestion.service";

/** Standardized beacon payload from any RUM provider. */
export interface RumBeacon {
  /** Metric values (may vary by provider). */
  lcp_ms?: number;
  fcp_ms?: number;
  inp_ms?: number;
  cls?: number;
  ttfb_ms?: number;
  dom_interactive_ms?: number;
  dom_complete_ms?: number;
  load_event_ms?: number;
  total_transfer_bytes?: number;
  resource_count?: number;
  /** Page and session context. */
  page_url: string;
  origin?: string;
  device_type?: string;
  connection_type?: string;
  country_code?: string;
  region?: string;
  user_agent?: string;
  session_id?: string;
  nav_type?: string;
  sample_rate?: number;
  recorded_at?: string;
  /** Custom labels / dimensions. */
  labels?: Record<string, string>;
  custom_metrics?: Record<string, number>;
  build_hash?: string;
}

/**
 * Abstract RUM adapter interface.
 * Each external provider implements this to normalize its data into RumEvent.
 */
export interface RumAdapter {
  /** Unique adapter name (e.g., "speedcurve", "datadog", "newrelic"). */
  readonly name: string;
  /** Validate incoming webhook/payload shape. */
  validate(payload: unknown): boolean;
  /** Normalize provider-specific payload into standard RumBeacon(s). */
  normalize(payload: unknown): RumBeacon[];
  /** Convert a normalized beacon into a full RumEvent for ingestion. */
  toRumEvent(beacon: RumBeacon, projectId: string): RumEvent;
}

/** Registry for RUM adapters. */
export class RumAdapterRegistry {
  private adapters = new Map<string, RumAdapter>();

  register(adapter: RumAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): RumAdapter | undefined {
    return this.adapters.get(name);
  }

  list(): RumAdapter[] {
    return Array.from(this.adapters.values());
  }

  names(): string[] {
    return Array.from(this.adapters.keys());
  }
}

/** Global registry singleton. */
export const rumAdapterRegistry = new RumAdapterRegistry();

// =============================================================================
// Built-in adapters
// =============================================================================

/** Default adapter for the platform's own RUM SDK (pass-through). */
export class NativeRumAdapter implements RumAdapter {
  readonly name = "native";

  validate(payload: unknown): boolean {
    if (!payload || typeof payload !== "object") return false;
    const p = payload as Record<string, unknown>;
    return typeof p.page_url === "string" && p.page_url.length > 0;
  }

  normalize(payload: unknown): RumBeacon[] {
    if (Array.isArray(payload)) return payload as RumBeacon[];
    return [payload as RumBeacon];
  }

  toRumEvent(beacon: RumBeacon, projectId: string): RumEvent {
    return {
      project_id: projectId,
      page_url: beacon.page_url,
      origin: beacon.origin ?? new URL(beacon.page_url).origin,
      device_type: beacon.device_type,
      connection_type: beacon.connection_type,
      country_code: beacon.country_code,
      region: beacon.region,
      lcp_ms: beacon.lcp_ms,
      fcp_ms: beacon.fcp_ms,
      inp_ms: beacon.inp_ms,
      cls: beacon.cls,
      ttfb_ms: beacon.ttfb_ms,
      dom_interactive_ms: beacon.dom_interactive_ms,
      dom_complete_ms: beacon.dom_complete_ms,
      load_event_ms: beacon.load_event_ms,
      total_transfer_bytes: beacon.total_transfer_bytes,
      resource_count: beacon.resource_count,
      user_agent: beacon.user_agent,
      session_id: beacon.session_id,
      nav_type: beacon.nav_type,
      sample_rate: beacon.sample_rate,
      labels: beacon.labels,
      recorded_at: beacon.recorded_at ?? new Date().toISOString(),
      custom_metrics: beacon.custom_metrics,
      build_hash: beacon.build_hash,
    };
  }
}

/**
 * SpeedCurve LUX adapter.
 * Normalizes SpeedCurve's webhook payload into standard beacons.
 */
export class SpeedCurveAdapter implements RumAdapter {
  readonly name = "speedcurve";

  validate(payload: unknown): boolean {
    if (!payload || typeof payload !== "object") return false;
    const p = payload as Record<string, unknown>;
    return typeof p.site === "string" || typeof p.url === "string";
  }

  normalize(payload: unknown): RumBeacon[] {
    const p = payload as Record<string, any>;

    // SpeedCurve sends array of tests or a single test
    const tests = Array.isArray(p.tests) ? p.tests : [p];

    return tests.map((t: any) => ({
      page_url: t.url ?? t.site ?? "",
      origin: t.url ? new URL(t.url).origin : t.site,
      device_type: t.device ?? (t.viewport_width < 768 ? "mobile" : "desktop"),
      lcp_ms: t.lux_lcp ?? t.lcp,
      fcp_ms: t.lux_fcp ?? t.fcp,
      inp_ms: t.lux_inp ?? t.inp,
      cls: t.lux_cls ?? t.cls,
      ttfb_ms: t.lux_ttfb ?? t.ttfb,
      load_event_ms: t.load_time ?? t.onload,
      user_agent: t.user_agent,
      country_code: t.country,
      recorded_at: t.timestamp ?? new Date().toISOString(),
      labels: { provider: "speedcurve", ...(t.labels ?? {}) },
    }));
  }

  toRumEvent(beacon: RumBeacon, projectId: string): RumEvent {
    return {
      project_id: projectId,
      page_url: beacon.page_url,
      origin: beacon.origin ?? "",
      device_type: beacon.device_type,
      country_code: beacon.country_code,
      lcp_ms: beacon.lcp_ms,
      fcp_ms: beacon.fcp_ms,
      inp_ms: beacon.inp_ms,
      cls: beacon.cls,
      ttfb_ms: beacon.ttfb_ms,
      load_event_ms: beacon.load_event_ms,
      user_agent: beacon.user_agent,
      recorded_at: beacon.recorded_at,
      labels: beacon.labels,
    };
  }
}

/**
 * Datadog RUM adapter.
 * Normalizes Datadog RUM webhook payloads into standard beacons.
 */
export class DatadogRumAdapter implements RumAdapter {
  readonly name = "datadog";

  validate(payload: unknown): boolean {
    if (!payload || typeof payload !== "object") return false;
    const p = payload as Record<string, unknown>;
    return typeof p.type === "string" || typeof p.view === "object";
  }

  normalize(payload: unknown): RumBeacon[] {
    const p = payload as Record<string, any>;

    // Datadog sends RUM events with a view object
    const events = Array.isArray(p.events) ? p.events : [p];

    return events.map((e: any) => {
      const view = e.view ?? {};
      const perf = view.performance_metrics ?? {};

      return {
        page_url: view.url ?? e.url ?? "",
        origin: view.url ? new URL(view.url).origin : "",
        device_type: e.device?.type ?? (e.context?.device_type ?? "desktop"),
        connection_type: e.connectivity?.effective_type,
        country_code: e.geo?.country,
        region: e.geo?.region,
        lcp_ms: perf.largest_contentful_paint ?? view.largest_contentful_paint,
        fcp_ms: perf.first_contentful_paint ?? view.first_contentful_paint,
        inp_ms: perf.interaction_to_next_paint ?? view.interaction_to_next_paint,
        cls: perf.cumulative_layout_shift ?? view.cumulative_layout_shift,
        ttfb_ms: perf.time_to_first_byte ?? view.time_to_first_byte,
        dom_complete_ms: perf.dom_complete ?? view.dom_complete,
        load_event_ms: perf.load_event ?? view.load_event_end,
        resource_count: view.resource?.count,
        total_transfer_bytes: view.resource?.size,
        user_agent: e.context?.user_agent ?? e.user_agent,
        session_id: e.session?.id,
        recorded_at: e.date ? new Date(e.date).toISOString() : new Date().toISOString(),
        labels: { provider: "datadog", application_id: e.application?.id ?? "" },
      };
    });
  }

  toRumEvent(beacon: RumBeacon, projectId: string): RumEvent {
    return {
      project_id: projectId,
      page_url: beacon.page_url,
      origin: beacon.origin ?? "",
      device_type: beacon.device_type,
      connection_type: beacon.connection_type,
      country_code: beacon.country_code,
      region: beacon.region,
      lcp_ms: beacon.lcp_ms,
      fcp_ms: beacon.fcp_ms,
      inp_ms: beacon.inp_ms,
      cls: beacon.cls,
      ttfb_ms: beacon.ttfb_ms,
      dom_complete_ms: beacon.dom_complete_ms,
      load_event_ms: beacon.load_event_ms,
      resource_count: beacon.resource_count,
      total_transfer_bytes: beacon.total_transfer_bytes,
      user_agent: beacon.user_agent,
      session_id: beacon.session_id,
      recorded_at: beacon.recorded_at,
      labels: beacon.labels,
    };
  }
}

/**
 * New Relic Browser adapter.
 * Normalizes New Relic Browser agent payloads.
 */
export class NewRelicRumAdapter implements RumAdapter {
  readonly name = "newrelic";

  validate(payload: unknown): boolean {
    if (!payload || typeof payload !== "object") return false;
    const p = payload as Record<string, unknown>;
    return typeof p.pageUrl === "string" || typeof p.requestUri === "string";
  }

  normalize(payload: unknown): RumBeacon[] {
    const p = payload as Record<string, any>;
    const events = Array.isArray(p) ? p : [p];

    return events.map((e: any) => ({
      page_url: e.pageUrl ?? e.requestUri ?? "",
      origin: (e.pageUrl ?? e.requestUri) ? new URL(e.pageUrl ?? e.requestUri).origin : "",
      device_type: e.deviceType ?? "desktop",
      country_code: e.countryCode,
      region: e.regionCode,
      lcp_ms: e.largestContentfulPaint,
      fcp_ms: e.firstContentfulPaint,
      inp_ms: e.interactionToNextPaint,
      cls: e.cumulativeLayoutShift,
      ttfb_ms: e.firstByte,
      dom_interactive_ms: e.domInteractive,
      dom_complete_ms: e.domComplete,
      load_event_ms: e.domContentLoadedEventEnd ?? e.windowLoad,
      user_agent: e.userAgentName,
      session_id: e.session,
      nav_type: e.navigationType,
      recorded_at: e.timestamp ? new Date(e.timestamp).toISOString() : new Date().toISOString(),
      labels: { provider: "newrelic", appId: e.appId ?? "" },
    }));
  }

  toRumEvent(beacon: RumBeacon, projectId: string): RumEvent {
    return {
      project_id: projectId,
      page_url: beacon.page_url,
      origin: beacon.origin ?? "",
      device_type: beacon.device_type,
      country_code: beacon.country_code,
      region: beacon.region,
      lcp_ms: beacon.lcp_ms,
      fcp_ms: beacon.fcp_ms,
      inp_ms: beacon.inp_ms,
      cls: beacon.cls,
      ttfb_ms: beacon.ttfb_ms,
      dom_interactive_ms: beacon.dom_interactive_ms,
      dom_complete_ms: beacon.dom_complete_ms,
      load_event_ms: beacon.load_event_ms,
      user_agent: beacon.user_agent,
      session_id: beacon.session_id,
      nav_type: beacon.nav_type,
      recorded_at: beacon.recorded_at,
      labels: beacon.labels,
    };
  }
}

// Auto-register built-in adapters
rumAdapterRegistry.register(new NativeRumAdapter());
rumAdapterRegistry.register(new SpeedCurveAdapter());
rumAdapterRegistry.register(new DatadogRumAdapter());
rumAdapterRegistry.register(new NewRelicRumAdapter());
