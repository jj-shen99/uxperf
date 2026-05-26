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

      // LCP via PerformanceObserver
      let lcpValue: number | undefined;
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length > 0) {
            lcpValue = entries[entries.length - 1].startTime;
          }
        });
        lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
        // Give observer time to fire
        setTimeout(() => {
          lcpObserver.disconnect();
        }, 0);
      } catch {
        // LCP observer not supported
      }

      // CLS via PerformanceObserver
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
        setTimeout(() => {
          clsObserver.disconnect();
        }, 0);
      } catch {
        // CLS observer not supported
      }

      // Allow observers to process buffered entries
      setTimeout(() => {
        if (lcpValue !== undefined) result.lcp_ms = lcpValue;
        if (clsValue > 0) result.cls = clsValue;
        resolve(result);
      }, 100);
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
