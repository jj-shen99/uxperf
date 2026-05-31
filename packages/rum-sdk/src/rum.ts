/**
 * RUM SDK — Lightweight Real User Monitoring (E-38)
 *
 * Book: Ch 6, p93–97; Ch 15, p253
 * "Every performance practice needs a RUM pillar. Without field data,
 * you are optimizing for a lab that no user inhabits."
 *
 * Collects Core Web Vitals (LCP, FCP, INP, CLS, TTFB) plus custom
 * journey metrics via performance.mark()/measure(). Beacons are sent
 * via navigator.sendBeacon for reliability.
 *
 * Usage:
 *   import { initRum } from '@perf-platform/rum-sdk';
 *   initRum({
 *     endpoint: 'https://perf.example.com/api/intelligence/rum/ingest',
 *     projectId: 'my-project-id',
 *     sampleRate: 0.1,
 *   });
 */

// ── Types ────────────────────────────────────────────────────

export interface RumConfig {
  /** URL of the RUM ingestion endpoint */
  endpoint: string;
  /** Project ID to tag beacons with */
  projectId: string;
  /** Sampling rate (0–1). Default 1.0 (100%) */
  sampleRate?: number;
  /** Session ID override. Auto-generated if omitted */
  sessionId?: string;
  /** Build hash / version for deploy tracking */
  buildHash?: string;
  /** Feature flag exposures to attach to every beacon */
  featureFlags?: Record<string, string>;
  /** Custom labels to attach to every beacon */
  labels?: Record<string, string>;
  /** Whether to collect custom marks/measures (E-41). Default true */
  collectCustomMetrics?: boolean;
  /** Debounce interval for batching beacons (ms). Default 5000 */
  batchInterval?: number;
  /** Max queue size before force-flushing. Default 10 */
  maxQueueSize?: number;
  /** Debug mode — logs to console. Default false */
  debug?: boolean;
}

export interface RumBeacon {
  project_id: string;
  page_url: string;
  origin: string;
  device_type: string;
  connection_type: string | null;
  country_code: string | null;
  lcp_ms: number | null;
  fcp_ms: number | null;
  inp_ms: number | null;
  cls: number | null;
  ttfb_ms: number | null;
  dom_interactive_ms: number | null;
  dom_complete_ms: number | null;
  load_event_ms: number | null;
  total_transfer_bytes: number | null;
  resource_count: number | null;
  user_agent: string;
  session_id: string;
  nav_type: string;
  sample_rate: number;
  labels: Record<string, string>;
  recorded_at: string;
  custom_metrics?: Record<string, number>;
  build_hash?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function detectDeviceType(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Mobi|Android/i.test(ua)) return "mobile";
  if (/Tablet|iPad/i.test(ua)) return "tablet";
  return "desktop";
}

function getConnectionType(): string | null {
  const nav = navigator as any;
  return nav?.connection?.effectiveType ?? null;
}

function getNavigationType(): string {
  if (typeof performance === "undefined") return "navigate";
  const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return entries[0]?.type ?? "navigate";
}

function getNavigationTimings(): {
  dom_interactive_ms: number | null;
  dom_complete_ms: number | null;
  load_event_ms: number | null;
  transfer_bytes: number | null;
  resource_count: number | null;
} {
  if (typeof performance === "undefined") {
    return { dom_interactive_ms: null, dom_complete_ms: null, load_event_ms: null, transfer_bytes: null, resource_count: null };
  }
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  return {
    dom_interactive_ms: nav ? Math.round(nav.domInteractive - nav.startTime) : null,
    dom_complete_ms: nav ? Math.round(nav.domComplete - nav.startTime) : null,
    load_event_ms: nav ? Math.round(nav.loadEventEnd - nav.startTime) : null,
    transfer_bytes: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0) || null,
    resource_count: resources.length || null,
  };
}

// ── E-41: Custom Journey Metrics ──────────────────────────────

/**
 * Collect custom marks and measures created by the application.
 *
 * Book: Ch 6, p98–100
 * "Standard Vitals tell you about the platform; custom marks tell you
 * about the user journey. time-to-cart-confirmation is yours alone."
 *
 * Usage in app code:
 *   performance.mark('cart-start');
 *   // ... user interacts ...
 *   performance.mark('cart-confirmed');
 *   performance.measure('time-to-cart-confirmation', 'cart-start', 'cart-confirmed');
 */
export function collectCustomMetrics(): Record<string, number> {
  if (typeof performance === "undefined") return {};
  const metrics: Record<string, number> = {};
  const measures = performance.getEntriesByType("measure") as PerformanceMeasure[];
  for (const m of measures) {
    metrics[m.name] = Math.round(m.duration * 100) / 100;
  }
  return metrics;
}

/**
 * Convenience: create a performance.mark and return a function to end-measure.
 *
 * Usage:
 *   const end = rumMark('checkout-flow');
 *   // ... user action ...
 *   end(); // creates performance.measure('checkout-flow', ...)
 */
export function rumMark(name: string): () => void {
  const startMark = `${name}__start`;
  performance.mark(startMark);
  return () => {
    performance.measure(name, startMark);
  };
}

// ── SDK Core ──────────────────────────────────────────────────

let _config: RumConfig | null = null;
let _queue: RumBeacon[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _vitals: Partial<Record<string, number>> = {};

function shouldSample(rate: number): boolean {
  return Math.random() < rate;
}

function log(...args: unknown[]) {
  if (_config?.debug) console.log("[rum-sdk]", ...args);
}

function buildBeacon(overrides?: Partial<RumBeacon>): RumBeacon {
  const cfg = _config!;
  const timings = getNavigationTimings();
  const customMetrics = cfg.collectCustomMetrics !== false ? collectCustomMetrics() : {};

  return {
    project_id: cfg.projectId,
    page_url: location.href,
    origin: location.origin,
    device_type: detectDeviceType(),
    connection_type: getConnectionType(),
    country_code: null, // resolved server-side from IP
    lcp_ms: _vitals.lcp ?? null,
    fcp_ms: _vitals.fcp ?? null,
    inp_ms: _vitals.inp ?? null,
    cls: _vitals.cls ?? null,
    ttfb_ms: _vitals.ttfb ?? null,
    dom_interactive_ms: timings.dom_interactive_ms,
    dom_complete_ms: timings.dom_complete_ms,
    load_event_ms: timings.load_event_ms,
    total_transfer_bytes: timings.transfer_bytes,
    resource_count: timings.resource_count,
    user_agent: navigator.userAgent,
    session_id: cfg.sessionId ?? generateSessionId(),
    nav_type: getNavigationType(),
    sample_rate: cfg.sampleRate ?? 1.0,
    labels: {
      ...cfg.labels,
      ...Object.fromEntries(
        Object.entries(cfg.featureFlags ?? {}).map(([k, v]) => [`ff_${k}`, v]),
      ),
    },
    recorded_at: new Date().toISOString(),
    custom_metrics: Object.keys(customMetrics).length > 0 ? customMetrics : undefined,
    build_hash: cfg.buildHash,
    ...overrides,
  };
}

/**
 * Flush the beacon queue via sendBeacon (or fetch fallback).
 */
export function flush(): void {
  if (_queue.length === 0) return;
  const beacons = [..._queue];
  _queue = [];

  const endpoint = _config?.endpoint;
  if (!endpoint) return;

  const payload = JSON.stringify({ events: beacons });
  log(`Flushing ${beacons.length} beacon(s)`);

  const batchUrl = endpoint.replace(/\/ingest\/?$/, "/ingest/batch");

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    const sent = navigator.sendBeacon(batchUrl, blob);
    if (!sent) {
      log("sendBeacon failed, falling back to fetch");
      fetchFallback(batchUrl, payload);
    }
  } else {
    fetchFallback(batchUrl, payload);
  }
}

function fetchFallback(url: string, payload: string): void {
  fetch(url, {
    method: "POST",
    body: payload,
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch((e) => log("Fetch fallback failed:", e));
}

function enqueue(beacon: RumBeacon): void {
  _queue.push(beacon);
  const maxSize = _config?.maxQueueSize ?? 10;
  if (_queue.length >= maxSize) {
    flush();
  }
}

function scheduleFlush(): void {
  if (_flushTimer) return;
  const interval = _config?.batchInterval ?? 5000;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    flush();
    // Re-schedule if SDK is still active and queue may accumulate
    if (_config) scheduleFlush();
  }, interval);
}

/**
 * Initialize the RUM SDK.
 *
 * Subscribes to web-vitals metrics, listens for page visibility changes
 * (beacon on hide), and sets up periodic flushing.
 */
export function initRum(config: RumConfig): void {
  if (typeof window === "undefined") return; // SSR guard

  const sampleRate = config.sampleRate ?? 1.0;
  if (!shouldSample(sampleRate)) {
    log("Sampled out, RUM SDK inactive for this session");
    return;
  }

  _config = { ...config, sessionId: config.sessionId ?? generateSessionId() };
  _vitals = {};
  _queue = [];

  log("Initialized", { projectId: config.projectId, sampleRate });

  // Subscribe to Core Web Vitals
  import("web-vitals").then(({ onLCP, onFCP, onINP, onCLS, onTTFB }) => {
    onLCP((m) => { _vitals.lcp = m.value; log("LCP:", m.value); });
    onFCP((m) => { _vitals.fcp = m.value; log("FCP:", m.value); });
    onINP((m) => { _vitals.inp = m.value; log("INP:", m.value); });
    onCLS((m) => { _vitals.cls = m.value; log("CLS:", m.value); });
    onTTFB((m) => { _vitals.ttfb = m.value; log("TTFB:", m.value); });
  }).catch((e) => log("web-vitals import failed:", e));

  // Beacon on page hide (most reliable for SPA)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      enqueue(buildBeacon());
      flush();
    }
  });

  // Beacon on pagehide (fallback for iOS)
  window.addEventListener("pagehide", () => {
    enqueue(buildBeacon());
    flush();
  });

  // Periodic flush
  scheduleFlush();
}

/**
 * Manually send a beacon with current vitals + custom metrics.
 * Useful for SPA route changes.
 */
export function sendBeacon(overrides?: Partial<RumBeacon>): void {
  if (!_config) return;
  enqueue(buildBeacon(overrides));
  scheduleFlush();
}

/**
 * Teardown the SDK (for tests or SPA cleanup).
 */
export function destroyRum(): void {
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = null;
  _config = null;
  _queue = [];
  _vitals = {};
}

// Re-export E-41 helpers
export { collectCustomMetrics as getCustomMetrics };
