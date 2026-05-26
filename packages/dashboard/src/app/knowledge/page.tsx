"use client";

import { MetricTooltip, METRIC_GLOSSARY } from "@/components/metric-tooltip";
import { MetricRelationshipDiagram } from "@/components/metric-relationship-diagram";

const OPTIMIZATION_TIPS: { metric: string; tips: string[] }[] = [
  {
    metric: "Server Processing",
    tips: [
      "Add database query indexes for frequently filtered columns",
      "Implement server-side caching (Redis, Memcached) for repeated queries",
      "Use connection pooling to reduce DB connection overhead",
      "Profile slow queries with EXPLAIN ANALYZE and optimize N+1 patterns",
      "Consider read replicas for heavy read workloads",
    ],
  },
  {
    metric: "Browser Rendering",
    tips: [
      "Defer non-critical CSS and JS with async/defer attributes",
      "Minimize DOM depth and node count (target < 1,500 nodes)",
      "Use CSS containment (contain: layout paint) for complex sections",
      "Lazy-load below-the-fold images and components",
      "Avoid layout thrashing — batch DOM reads before writes",
    ],
  },
  {
    metric: "LCP",
    tips: [
      "Preload the LCP image or resource with <link rel='preload'>",
      "Serve images in modern formats (WebP, AVIF) with responsive sizes",
      "Ensure the server responds quickly (optimize TTFB)",
      "Remove render-blocking resources from the critical path",
      "Use fetchpriority='high' on the LCP element",
    ],
  },
  {
    metric: "CLS",
    tips: [
      "Always set explicit width and height on images and videos",
      "Reserve space for dynamic content (ads, embeds) with min-height",
      "Avoid inserting content above the viewport after initial load",
      "Use CSS transform animations instead of layout-triggering properties",
      "Load web fonts with font-display: swap and preload key fonts",
    ],
  },
  {
    metric: "INP",
    tips: [
      "Break long tasks into smaller chunks using requestIdleCallback or scheduler.yield()",
      "Debounce rapid user inputs (scroll, resize, keypress)",
      "Move heavy computation to Web Workers",
      "Reduce JavaScript bundle size with code splitting",
      "Use event delegation to minimize event listener overhead",
    ],
  },
  {
    metric: "TTFB",
    tips: [
      "Use a CDN to serve content closer to users",
      "Enable HTTP/2 or HTTP/3 for multiplexed connections",
      "Implement stale-while-revalidate caching strategies",
      "Reduce DNS lookups by limiting third-party origins",
      "Consider edge-side rendering (SSR at CDN edge) for dynamic pages",
    ],
  },
];

const TESTING_METHODOLOGY = [
  {
    title: "Lab vs. Field Data",
    content:
      "Lab data (Lighthouse, WebPageTest) is collected in controlled environments with simulated throttling. Field data (CrUX, RUM) reflects real user experiences. Both are essential: lab data for debugging and field data for monitoring real-world impact.",
  },
  {
    title: "Statistical Significance",
    content:
      "Single test runs have high variance. Run at least 3–5 iterations per configuration and use median values. For A/B comparisons, use a minimum of 20–30 samples per variant and apply statistical tests (t-test, Mann-Whitney U) before drawing conclusions.",
  },
  {
    title: "Cache States",
    content:
      "Cold (empty cache) and Warm (primed cache) produce very different metrics. Test both to understand first-visit vs. repeat-visit performance. Production Replay mode simulates realistic cache patterns from real user sessions.",
  },
  {
    title: "Device & Network Profiles",
    content:
      "Desktop on fast WiFi hides performance issues that mobile users on 4G experience. Always test with mobile CPU throttling (4× slowdown) and network throttling (Regular 4G: 1.6 Mbps down / 750 Kbps up / 150 ms RTT) to catch regressions early.",
  },
  {
    title: "Load Testing Strategy",
    content:
      "Start with baseline single-user tests, then ramp VUs gradually (10 → 50 → 100 → peak). Monitor server telemetry alongside browser metrics to identify saturation points. The correlation between VU count and metric degradation reveals backend bottlenecks.",
  },
];

const METRIC_CATEGORIES = [
  {
    category: "User-Centric Metrics (Core Web Vitals)",
    metrics: ["LCP", "INP", "CLS"],
    description: "The three metrics Google uses for page experience ranking. These directly impact user satisfaction and search ranking.",
  },
  {
    category: "Loading Metrics",
    metrics: ["TTFB", "FCP", "SI"],
    description: "Measures of how quickly content becomes visible. TTFB captures server responsiveness, FCP shows first paint, and SI measures visual completeness over time.",
  },
  {
    category: "Interactivity Metrics",
    metrics: ["TTI", "TBT", "INP"],
    description: "Measures of when and how well the page responds to user input. Long tasks on the main thread delay interactivity.",
  },
  {
    category: "Server & Rendering Phases",
    metrics: ["Server Processing", "Browser Rendering"],
    description: "Decomposition of total page load time into server-side (DB, app logic, serialization) and client-side (DOM, CSSOM, layout, paint) phases.",
  },
  {
    category: "Composite Scores",
    metrics: ["Lighthouse Score"],
    description: "Weighted aggregate of lab metrics. Useful as a single summary number, but always investigate individual metrics when scores change.",
  },
];

export default function KnowledgePage() {
  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Knowledge Base</h1>
        <p className="mt-1 text-sm text-gray-400">
          Performance metrics reference, optimization guidance, and testing methodology
        </p>
      </div>

      {/* Metric Relationship Diagram */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Metric Relationships & Timeline</h2>
        <p className="text-xs text-gray-500 mb-4">
          Interactive diagram showing how each metric maps to the page-load timeline. Hover over any metric to highlight its dependencies.
        </p>
        <MetricRelationshipDiagram />
      </div>

      {/* Metric Categories */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Metric Categories</h2>
        <div className="space-y-4">
          {METRIC_CATEGORIES.map((cat) => (
            <div key={cat.category} className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
              <h3 className="text-sm font-semibold text-indigo-400">{cat.category}</h3>
              <p className="mt-1 text-xs text-gray-400">{cat.description}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {cat.metrics.map((m) => (
                  <MetricTooltip key={m} metricKey={m} className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-0.5 text-xs text-gray-300 hover:border-indigo-500 cursor-help" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full Glossary */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Performance Metrics Glossary</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(METRIC_GLOSSARY).map(([key, info]) => (
            <div key={key} className="rounded-md border border-gray-800 bg-gray-800/40 p-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-indigo-400">{info.name}</span>
                <span className="text-xs text-gray-500">{info.full}</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">{info.description}</p>
              <p className="mt-1 text-[10px] text-gray-600">Good: {info.good} · Unit: {info.unit}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Optimization Tips */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Optimization Guide</h2>
        <p className="text-xs text-gray-500 mb-4">
          Actionable tips to improve each metric. Prioritize Server Processing and LCP for the biggest user-perceived gains.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OPTIMIZATION_TIPS.map((section) => (
            <div key={section.metric} className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
              <MetricTooltip metricKey={section.metric} className="text-sm font-semibold text-indigo-400 mb-2" />
              <ul className="mt-2 space-y-1.5">
                {section.tips.map((tip, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-400">
                    <span className="mt-0.5 flex-shrink-0 text-indigo-500">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Testing Methodology */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Testing Methodology</h2>
        <div className="space-y-4">
          {TESTING_METHODOLOGY.map((section) => (
            <div key={section.title} className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
              <h3 className="text-sm font-semibold text-gray-200">{section.title}</h3>
              <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">{section.content}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Thresholds Reference */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400 mb-4">Threshold Quick Reference</h2>
        <div className="overflow-hidden rounded-md border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Metric</th>
                <th className="px-4 py-2 text-center text-xs text-green-500">Good</th>
                <th className="px-4 py-2 text-center text-xs text-yellow-500">Needs Improvement</th>
                <th className="px-4 py-2 text-center text-xs text-red-500">Poor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {[
                { name: "LCP", good: "≤ 2.5s", mid: "2.5s – 4.0s", poor: "> 4.0s" },
                { name: "FCP", good: "≤ 1.8s", mid: "1.8s – 3.0s", poor: "> 3.0s" },
                { name: "INP", good: "≤ 200ms", mid: "200ms – 500ms", poor: "> 500ms" },
                { name: "CLS", good: "≤ 0.1", mid: "0.1 – 0.25", poor: "> 0.25" },
                { name: "TTFB", good: "≤ 800ms", mid: "800ms – 1.8s", poor: "> 1.8s" },
                { name: "TBT", good: "≤ 200ms", mid: "200ms – 600ms", poor: "> 600ms" },
                { name: "SI", good: "≤ 3.4s", mid: "3.4s – 5.8s", poor: "> 5.8s" },
                { name: "TTI", good: "≤ 3.8s", mid: "3.8s – 7.3s", poor: "> 7.3s" },
                { name: "Server Processing", good: "≤ 200ms", mid: "200ms – 500ms", poor: "> 500ms" },
                { name: "Browser Rendering", good: "≤ 1.0s", mid: "1.0s – 2.5s", poor: "> 2.5s" },
                { name: "Lighthouse Score", good: "≥ 90", mid: "50 – 89", poor: "< 50" },
              ].map((row) => (
                <tr key={row.name} className="hover:bg-gray-800/30">
                  <td className="px-4 py-2 font-medium text-gray-200">{row.name}</td>
                  <td className="px-4 py-2 text-center text-green-400 text-xs">{row.good}</td>
                  <td className="px-4 py-2 text-center text-yellow-400 text-xs">{row.mid}</td>
                  <td className="px-4 py-2 text-center text-red-400 text-xs">{row.poor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
