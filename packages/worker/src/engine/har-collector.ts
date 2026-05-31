/**
 * HAR Collector (E-32).
 *
 * Captures per-resource network waterfall data via Playwright's
 * page.on('response') and page.on('request') events.
 *
 * Book ref: Ch 6 & 14 — "full network waterfall" for diagnosis.
 */

import type { Page, Request, Response } from "playwright";

// ── Types ──────────────────────────────────────────────────────

export interface HarEntry {
  url: string;
  method: string;
  status: number;
  resource_type: string;           // script, stylesheet, image, font, xhr, fetch, etc.
  protocol: string;                // h2, http/1.1, etc.
  mime_type: string;
  transfer_size: number;           // bytes over the wire (compressed)
  resource_size: number;           // bytes after decompression
  started_at: number;              // ms since navigation start
  duration_ms: number;             // total time for request
  timing: HarTiming;
  is_third_party: boolean;
  initiator: string;               // script, parser, css, etc.
}

export interface HarTiming {
  blocked_ms: number;
  dns_ms: number;
  connect_ms: number;
  ssl_ms: number;
  send_ms: number;
  wait_ms: number;                 // TTFB for this resource
  receive_ms: number;
}

export interface HarSummary {
  total_entries: number;
  total_transfer_bytes: number;
  total_resource_bytes: number;
  by_type: Record<string, { count: number; transfer_bytes: number }>;
  third_party_count: number;
  third_party_bytes: number;
  slowest_resources: { url: string; duration_ms: number }[];
  largest_resources: { url: string; transfer_size: number }[];
}

export interface HarResult {
  entries: HarEntry[];
  summary: HarSummary;
}

// ── Collector ──────────────────────────────────────────────────

/**
 * Attach HAR listeners to a Playwright page.
 * Call `start()` before navigation and `stop()` after the page settles.
 *
 * Usage:
 *   const har = createHarCollector(page, "https://example.com");
 *   har.start();
 *   await page.goto("https://example.com/products");
 *   // ... interactions ...
 *   const result = await har.stop();
 */
export function createHarCollector(page: Page, baseOrigin: string) {
  const requests = new Map<string, { request: Request; startTime: number }>();
  const entries: HarEntry[] = [];
  let navStart = 0;
  let listening = false;

  const onRequest = (request: Request) => {
    requests.set(request.url() + ":" + request.method(), {
      request,
      startTime: Date.now(),
    });
  };

  const onResponse = async (response: Response) => {
    const request = response.request();
    const key = request.url() + ":" + request.method();
    const tracked = requests.get(key);
    if (!tracked) return;

    const endTime = Date.now();
    const startedAt = tracked.startTime - navStart;
    const durationMs = endTime - tracked.startTime;

    let transferSize = 0;
    let resourceSize = 0;
    try {
      const body = await response.body();
      resourceSize = body.length;
      // Approximate transfer size from headers
      const contentLength = response.headers()["content-length"];
      transferSize = contentLength ? parseInt(contentLength, 10) : resourceSize;
    } catch {
      // Response body may be unavailable for some resource types
    }

    const url = request.url();
    const isThirdParty = !isSameOrigin(url, baseOrigin);

    entries.push({
      url: truncateUrl(url),
      method: request.method(),
      status: response.status(),
      resource_type: request.resourceType(),
      protocol: extractProtocol(response),
      mime_type: response.headers()["content-type"] ?? "unknown",
      transfer_size: transferSize,
      resource_size: resourceSize,
      started_at: Math.max(0, startedAt),
      duration_ms: Math.max(0, durationMs),
      timing: estimateTiming(durationMs),
      is_third_party: isThirdParty,
      initiator: request.resourceType(),
    });

    requests.delete(key);
  };

  return {
    start() {
      navStart = Date.now();
      listening = true;
      page.on("request", onRequest);
      page.on("response", onResponse);
    },

    async stop(): Promise<HarResult> {
      if (listening) {
        page.removeListener("request", onRequest);
        page.removeListener("response", onResponse);
        listening = false;
      }

      // Wait briefly for any in-flight response handlers
      await new Promise((r) => setTimeout(r, 100));

      const summary = buildSummary(entries);
      return { entries, summary };
    },
  };
}

// ── Helpers ────────────────────────────────────────────────────

function isSameOrigin(url: string, baseOrigin: string): boolean {
  try {
    const u = new URL(url);
    const b = new URL(baseOrigin);
    return u.origin === b.origin;
  } catch {
    return false;
  }
}

function truncateUrl(url: string, maxLen = 200): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen) + "…";
}

function extractProtocol(response: Response): string {
  // Playwright doesn't expose protocol directly; check headers for hints
  const serverTiming = response.headers()["server-timing"];
  if (serverTiming && serverTiming.includes("h2")) return "h2";
  return "http/1.1";
}

/**
 * Estimate timing breakdown from total duration.
 * Real HAR would require CDP; this gives a reasonable approximation.
 */
function estimateTiming(totalMs: number): HarTiming {
  if (totalMs <= 0) {
    return { blocked_ms: 0, dns_ms: 0, connect_ms: 0, ssl_ms: 0, send_ms: 0, wait_ms: 0, receive_ms: 0 };
  }
  // Rough heuristic: TTFB is ~70% of total, receive ~20%, connect ~10%
  const waitMs = Math.round(totalMs * 0.7);
  const receiveMs = Math.round(totalMs * 0.2);
  const connectMs = Math.round(totalMs * 0.1);
  return {
    blocked_ms: 0,
    dns_ms: 0,
    connect_ms: connectMs,
    ssl_ms: 0,
    send_ms: 0,
    wait_ms: waitMs,
    receive_ms: receiveMs,
  };
}

function buildSummary(entries: HarEntry[]): HarSummary {
  const byType: Record<string, { count: number; transfer_bytes: number }> = {};
  let totalTransfer = 0;
  let totalResource = 0;
  let thirdPartyCount = 0;
  let thirdPartyBytes = 0;

  for (const e of entries) {
    totalTransfer += e.transfer_size;
    totalResource += e.resource_size;

    if (e.is_third_party) {
      thirdPartyCount++;
      thirdPartyBytes += e.transfer_size;
    }

    if (!byType[e.resource_type]) {
      byType[e.resource_type] = { count: 0, transfer_bytes: 0 };
    }
    byType[e.resource_type].count++;
    byType[e.resource_type].transfer_bytes += e.transfer_size;
  }

  const sorted = [...entries];
  const slowest = sorted
    .sort((a, b) => b.duration_ms - a.duration_ms)
    .slice(0, 5)
    .map((e) => ({ url: e.url, duration_ms: e.duration_ms }));

  const largest = [...entries]
    .sort((a, b) => b.transfer_size - a.transfer_size)
    .slice(0, 5)
    .map((e) => ({ url: e.url, transfer_size: e.transfer_size }));

  return {
    total_entries: entries.length,
    total_transfer_bytes: totalTransfer,
    total_resource_bytes: totalResource,
    by_type: byType,
    third_party_count: thirdPartyCount,
    third_party_bytes: thirdPartyBytes,
    slowest_resources: slowest,
    largest_resources: largest,
  };
}
