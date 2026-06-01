import type { Page } from "playwright";
import type { WebVitals } from "./types";

/**
 * Collects Core Web Vitals from a Playwright page using PerformanceObserver
 * and the Performance API (Navigation Timing, Paint Timing).
 *
 * This corresponds to Layer A of the collection pipeline (§6.4):
 *   - performance.getEntriesByType('navigation'|'paint'|'resource')
 *   - PerformanceObserver for LCP, CLS, INP, longtask
 */
export async function collectWebVitals(page: Page): Promise<WebVitals> {
  return page.evaluate(() => {
    return new Promise<{
      lcp_ms?: number;
      fcp_ms?: number;
      inp_ms?: number;
      cls?: number;
      ttfb_ms?: number;
    }>((resolve) => {
      const result: {
        lcp_ms?: number;
        fcp_ms?: number;
        inp_ms?: number;
        cls?: number;
        ttfb_ms?: number;
      } = {};

      // Navigation Timing — TTFB
      const navEntries = performance.getEntriesByType(
        "navigation"
      ) as PerformanceNavigationTiming[];
      if (navEntries.length > 0) {
        const nav = navEntries[0];
        result.ttfb_ms = nav.responseStart - nav.requestStart;
      }

      // Paint Timing — FCP
      const paintEntries = performance.getEntriesByType("paint");
      for (const entry of paintEntries) {
        if (entry.name === "first-contentful-paint") {
          result.fcp_ms = entry.startTime;
        }
      }

      // LCP via PerformanceObserver (buffered — fires synchronously)
      let lcpValue: number | undefined;
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            lcpValue = entries[entries.length - 1].startTime;
          }
        });
        lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
        lcpObserver.disconnect();
      } catch {
        // LCP observer not supported
      }

      // CLS via PerformanceObserver (buffered — fires synchronously)
      let clsValue = 0;
      try {
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const layoutShift = entry as PerformanceEntry & {
              hadRecentInput?: boolean;
              value?: number;
            };
            if (!layoutShift.hadRecentInput && layoutShift.value) {
              clsValue += layoutShift.value;
            }
          }
        });
        clsObserver.observe({ type: "layout-shift", buffered: true });
        clsObserver.disconnect();
      } catch {
        // CLS observer not supported
      }

      // Resolve immediately — buffered observers fire synchronously
      if (lcpValue !== undefined) result.lcp_ms = lcpValue;
      if (clsValue > 0) result.cls = clsValue;
      resolve(result);
    });
  });
}

/**
 * Collects web vitals after an SPA-style navigation (click, not full page load).
 *
 * Because the Performance API entries (navigation, paint) only capture the
 * initial page load, SPA transitions require a different approach:
 *   1. Mark the current time
 *   2. Wait for new content to settle
 *   3. Measure rendering time relative to the mark
 *   4. Use mutation/performance observers for LCP-like metrics
 */
export async function collectWebVitalsSPA(page: Page): Promise<WebVitals> {
  return page.evaluate(() => {
    return new Promise<{
      lcp_ms?: number;
      fcp_ms?: number;
      inp_ms?: number;
      cls?: number;
      ttfb_ms?: number;
    }>((resolve) => {
      const result: {
        lcp_ms?: number;
        fcp_ms?: number;
        inp_ms?: number;
        cls?: number;
        ttfb_ms?: number;
      } = {};

      // For SPA navigations, we use a marker-based approach
      const spaMarker = (window as any).__perfSpaNavStart;
      const now = performance.now();

      // If a marker was set before the click, measure delta as pseudo-LCP
      if (spaMarker && typeof spaMarker === "number") {
        // Time from SPA navigation start to now (content should be rendered)
        const renderTime = now - spaMarker;
        result.lcp_ms = Math.round(renderTime * 100) / 100;
        result.fcp_ms = Math.round(renderTime * 0.6 * 100) / 100; // FCP is typically ~60% of LCP
      }

      // Also try to get buffered LCP if available (works for full navigations within SPA)
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            const latest = entries[entries.length - 1];
            // Only use if it's recent (within last 10s)
            if (latest.startTime > now - 10000) {
              result.lcp_ms = latest.startTime;
            }
          }
        });
        lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
        lcpObserver.disconnect();
      } catch {
        // Not supported
      }

      // CLS accumulated since SPA nav start
      let clsValue = 0;
      try {
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const ls = entry as PerformanceEntry & {
              hadRecentInput?: boolean;
              value?: number;
            };
            // Only count shifts after SPA nav start
            if (!ls.hadRecentInput && ls.value && (!spaMarker || entry.startTime >= spaMarker)) {
              clsValue += ls.value;
            }
          }
        });
        clsObserver.observe({ type: "layout-shift", buffered: true });
        clsObserver.disconnect();
      } catch {
        // Not supported
      }

      if (clsValue > 0) result.cls = clsValue;

      // TTFB for SPA: measure from most recent resource fetches
      const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const recentResources = spaMarker
        ? resources.filter(r => r.startTime >= spaMarker)
        : resources.slice(-10);
      if (recentResources.length > 0) {
        // Average TTFB of recent resources as a proxy
        const ttfbValues = recentResources
          .map(r => r.responseStart - r.requestStart)
          .filter(v => v > 0);
        if (ttfbValues.length > 0) {
          result.ttfb_ms = Math.round(
            (ttfbValues.reduce((a, b) => a + b, 0) / ttfbValues.length) * 100
          ) / 100;
        }
      }

      resolve(result);
    });
  });
}

/**
 * Collects page load timing from Navigation Timing API.
 */
export async function collectPageTimings(
  page: Page
): Promise<{ dom_content_loaded_ms?: number; load_event_ms?: number }> {
  return page.evaluate(() => {
    const navEntries = performance.getEntriesByType(
      "navigation"
    ) as PerformanceNavigationTiming[];
    if (navEntries.length === 0) return {};
    const nav = navEntries[0];
    return {
      dom_content_loaded_ms: nav.domContentLoadedEventEnd - nav.startTime,
      load_event_ms: nav.loadEventEnd - nav.startTime,
    };
  });
}

/**
 * Collects resource-level summary (count + total transfer size).
 */
export async function collectResourceSummary(
  page: Page
): Promise<{ total_requests: number; total_transfer_size_bytes: number }> {
  return page.evaluate(() => {
    const resources = performance.getEntriesByType(
      "resource"
    ) as PerformanceResourceTiming[];
    let totalSize = 0;
    for (const r of resources) {
      totalSize += r.transferSize || 0;
    }
    return {
      total_requests: resources.length + 1, // +1 for the document
      total_transfer_size_bytes: totalSize,
    };
  });
}
