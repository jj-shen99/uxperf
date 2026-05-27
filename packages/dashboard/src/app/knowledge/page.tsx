"use client";

import { useState } from "react";
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

type KnowledgeTab = "metrics" | "lighthouse" | "optimization" | "methodology" | "thresholds" | "network";

const TABS: { key: KnowledgeTab; label: string }[] = [
  { key: "metrics", label: "Metrics & Glossary" },
  { key: "lighthouse", label: "Lighthouse Scores" },
  { key: "optimization", label: "Optimization" },
  { key: "methodology", label: "Testing Methodology" },
  { key: "thresholds", label: "Thresholds" },
  { key: "network", label: "Network Fundamentals" },
];

export default function KnowledgePage() {
  const [tab, setTab] = useState<KnowledgeTab>("metrics");

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Knowledge Base</h1>
        <p className="mt-1 text-sm text-gray-400">
          Performance metrics reference, optimization guidance, and testing methodology
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-900 p-1 border border-gray-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-indigo-600 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Metrics & Glossary Tab ─── */}
      {tab === "metrics" && (
        <div className="space-y-8">
          {/* Metric Relationship Diagram */}
          <MetricRelationshipDiagram />

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
        </div>
      )}

      {/* ─── Lighthouse Scores Tab ─── */}
      {tab === "lighthouse" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-white mb-1">Lighthouse Score Breakdown</h2>
              <p className="text-xs text-gray-500">
                Each Lighthouse category score is 0–100. Scores are computed by running audits, converting raw values to 0–1 via a
                <strong className="text-gray-300"> log-normal scoring curve</strong>, then applying category-specific weights.
                Scores &ge; 90 are <span className="text-green-400 font-medium">Good</span>, 50–89 are
                <span className="text-yellow-400 font-medium"> Needs Improvement</span>, and &lt; 50 are
                <span className="text-red-400 font-medium"> Poor</span>.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Performance */}
              <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
                <h3 className="text-sm font-semibold text-indigo-400 mb-2">Performance (Lighthouse 11)</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Measures how fast the page loads and becomes interactive. The score is a <strong className="text-gray-300">weighted average</strong> of 5 lab metrics, each scored on a log-normal curve derived from real HTTP Archive data.
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 border-b border-gray-700">
                      <th className="text-left py-1 pr-2">Metric</th>
                      <th className="text-right py-1 px-2">Weight</th>
                      <th className="text-right py-1">Good Threshold</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-400">
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">FCP (First Contentful Paint)</td><td className="text-right px-2">10%</td><td className="text-right text-green-400">&le; 1.8s</td></tr>
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">SI (Speed Index)</td><td className="text-right px-2">10%</td><td className="text-right text-green-400">&le; 3.4s</td></tr>
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">LCP (Largest Contentful Paint)</td><td className="text-right px-2">25%</td><td className="text-right text-green-400">&le; 2.5s</td></tr>
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">TBT (Total Blocking Time)</td><td className="text-right px-2">30%</td><td className="text-right text-green-400">&le; 200ms</td></tr>
                    <tr><td className="py-0.5 pr-2 font-medium text-gray-300">CLS (Cumulative Layout Shift)</td><td className="text-right px-2">25%</td><td className="text-right text-green-400">&le; 0.1</td></tr>
                  </tbody>
                </table>
                <div className="mt-3 rounded-md border border-indigo-900/40 bg-indigo-900/10 p-2">
                  <p className="text-[11px] text-indigo-300 font-medium">How to improve:</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                    <li>- Optimize images (WebP/AVIF, responsive sizes, lazy-load below fold)</li>
                    <li>- Remove render-blocking JS/CSS, defer non-critical scripts</li>
                    <li>- Reduce server response time (TTFB) with caching/CDN</li>
                    <li>- Code-split JS bundles, tree-shake unused modules</li>
                    <li>- Set explicit dimensions on images/videos to reduce CLS</li>
                  </ul>
                </div>
              </div>

              {/* Accessibility */}
              <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
                <h3 className="text-sm font-semibold text-purple-400 mb-2">Accessibility</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Runs ~50 automated audits based on the <strong className="text-gray-300">axe-core library</strong> and WCAG 2.1 guidelines. Each audit is pass/fail/not-applicable. The score = (passing audits &divide; applicable audits) &times; 100. All applicable audits are <strong className="text-gray-300">weighted equally</strong>.
                </p>
                <p className="text-xs text-gray-500 mb-2">Key audit categories:</p>
                <ul className="space-y-0.5 text-[11px] text-gray-400">
                  <li>- <strong className="text-gray-300">Color Contrast</strong> — text must have &ge; 4.5:1 contrast ratio</li>
                  <li>- <strong className="text-gray-300">Alt Text</strong> — all images need descriptive alt attributes</li>
                  <li>- <strong className="text-gray-300">ARIA</strong> — roles, labels, and states must be valid and complete</li>
                  <li>- <strong className="text-gray-300">Keyboard Navigation</strong> — all interactive elements must be focusable</li>
                  <li>- <strong className="text-gray-300">Semantic HTML</strong> — headings in order, landmarks present, form labels</li>
                  <li>- <strong className="text-gray-300">Document</strong> — valid lang attribute, meta viewport not blocking zoom</li>
                </ul>
                <div className="mt-3 rounded-md border border-purple-900/40 bg-purple-900/10 p-2">
                  <p className="text-[11px] text-purple-300 font-medium">How to improve:</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                    <li>- Fix color contrast issues (use a contrast checker)</li>
                    <li>- Add alt text to every image; use aria-label on icon buttons</li>
                    <li>- Ensure all form inputs have associated labels</li>
                    <li>- Use semantic elements (&lt;nav&gt;, &lt;main&gt;, &lt;header&gt;, &lt;button&gt;)</li>
                    <li>- Note: automated tests catch ~30% of real a11y issues — manual testing is also needed</li>
                  </ul>
                </div>
              </div>

              {/* Best Practices */}
              <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
                <h3 className="text-sm font-semibold text-cyan-400 mb-2">Best Practices</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Checks ~15 audits for modern web development standards and security. Like Accessibility, the score = (passing &divide; applicable) &times; 100 with <strong className="text-gray-300">equal weight per audit</strong>.
                </p>
                <p className="text-xs text-gray-500 mb-2">What it checks:</p>
                <ul className="space-y-0.5 text-[11px] text-gray-400">
                  <li>- <strong className="text-gray-300">HTTPS</strong> — page and all sub-resources served over HTTPS</li>
                  <li>- <strong className="text-gray-300">No console errors</strong> — no JS errors logged to the browser console</li>
                  <li>- <strong className="text-gray-300">Image aspect ratios</strong> — displayed size matches natural size</li>
                  <li>- <strong className="text-gray-300">Deprecated APIs</strong> — no use of deprecated web platform APIs</li>
                  <li>- <strong className="text-gray-300">CSP / XSS</strong> — Content Security Policy present, no XSS vulnerabilities</li>
                  <li>- <strong className="text-gray-300">Source maps</strong> — source maps detected for debugging</li>
                  <li>- <strong className="text-gray-300">Charset declaration</strong> — UTF-8 charset declared in first 1024 bytes</li>
                </ul>
                <div className="mt-3 rounded-md border border-cyan-900/40 bg-cyan-900/10 p-2">
                  <p className="text-[11px] text-cyan-300 font-medium">How to improve:</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                    <li>- Migrate all resources to HTTPS</li>
                    <li>- Fix JS errors visible in the browser console</li>
                    <li>- Serve images at their displayed dimensions</li>
                    <li>- Replace deprecated APIs (document.write, etc.)</li>
                    <li>- Add a Content Security Policy header</li>
                  </ul>
                </div>
              </div>

              {/* SEO */}
              <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
                <h3 className="text-sm font-semibold text-emerald-400 mb-2">SEO</h3>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">
                  Checks ~13 audits for baseline search-engine-optimization hygiene. Score = (passing &divide; applicable) &times; 100, <strong className="text-gray-300">equally weighted</strong>. This tests technical SEO — not content quality, backlinks, or domain authority.
                </p>
                <p className="text-xs text-gray-500 mb-2">What it checks:</p>
                <ul className="space-y-0.5 text-[11px] text-gray-400">
                  <li>- <strong className="text-gray-300">Meta description</strong> — present and not empty</li>
                  <li>- <strong className="text-gray-300">HTTP status</strong> — page returns 2xx status code</li>
                  <li>- <strong className="text-gray-300">Crawlable links</strong> — links use &lt;a href&gt;, not JS-only navigation</li>
                  <li>- <strong className="text-gray-300">robots.txt</strong> — valid and doesn&apos;t block page</li>
                  <li>- <strong className="text-gray-300">Indexable</strong> — no noindex meta tag or header</li>
                  <li>- <strong className="text-gray-300">Structured data</strong> — JSON-LD/microdata is valid (if present)</li>
                  <li>- <strong className="text-gray-300">Viewport meta</strong> — &lt;meta name=&quot;viewport&quot;&gt; is present</li>
                  <li>- <strong className="text-gray-300">Font legibility</strong> — text is &ge; 12px on mobile</li>
                  <li>- <strong className="text-gray-300">Tap targets</strong> — buttons/links have adequate spacing</li>
                </ul>
                <div className="mt-3 rounded-md border border-emerald-900/40 bg-emerald-900/10 p-2">
                  <p className="text-[11px] text-emerald-300 font-medium">How to improve:</p>
                  <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                    <li>- Add unique, descriptive &lt;title&gt; and &lt;meta description&gt; per page</li>
                    <li>- Use semantic heading hierarchy (h1 &rarr; h2 &rarr; h3)</li>
                    <li>- Ensure all links are crawlable &lt;a href=&quot;...&quot;&gt;</li>
                    <li>- Add a valid robots.txt and XML sitemap</li>
                    <li>- Set viewport meta for mobile responsiveness</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Parameters that affect scores */}
            <div className="rounded-md border border-gray-800 bg-gray-800/20 p-4">
              <h3 className="text-sm font-semibold text-yellow-400 mb-2">Test Parameters That Change Scores</h3>
              <p className="text-xs text-gray-400 leading-relaxed mb-3">
                The same URL can produce very different scores depending on how Lighthouse runs. These parameters are configurable in our test runner:
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Device (desktop / mobile)</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Mobile applies 4&times; CPU throttling and slower network (simulated 4G). Desktop has no CPU throttle and faster network. Switching from mobile &rarr; desktop typically <span className="text-green-400">increases Performance by 10–30 pts</span>.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Number of Iterations (n_runs)</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    We report the <span className="text-gray-300 font-medium">median</span> across iterations. More runs (5–10) reduces variance and gives a more stable score. Single runs can fluctuate &plusmn; 5–8 pts.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Viewport Size</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Affects which LCP element is in view, how images load, and CLS measurement. Narrow viewports may trigger different responsive layouts and larger CLS values.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Network Conditions</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Lighthouse simulates network throttling. Actual throughput of the test machine&apos;s network also matters. Testing from a slow connection increases TTFB and all loading metrics.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Server Warm/Cold State</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    First run after a deploy may have cold caches (CDN, DB, application). Subsequent runs with warm caches often produce <span className="text-green-400">better TTFB and overall scores</span>.
                  </p>
                </div>
                <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-200">Third-Party Scripts</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Ad networks, analytics, chat widgets, etc. can add 500ms–2s of TBT and degrade Performance score significantly. <span className="text-yellow-400">Blocking 3rd-parties</span> during testing isolates your own code&apos;s performance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Optimization Tab ─── */}
      {tab === "optimization" && (
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
                      <span className="mt-0.5 flex-shrink-0 text-indigo-500">&bull;</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Testing Methodology Tab ─── */}
      {tab === "methodology" && (
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
      )}

      {/* ─── Thresholds Tab ─── */}
      {tab === "thresholds" && (
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
                  { name: "LCP", good: "\u2264 2.5s", mid: "2.5s \u2013 4.0s", poor: "> 4.0s" },
                  { name: "FCP", good: "\u2264 1.8s", mid: "1.8s \u2013 3.0s", poor: "> 3.0s" },
                  { name: "INP", good: "\u2264 200ms", mid: "200ms \u2013 500ms", poor: "> 500ms" },
                  { name: "CLS", good: "\u2264 0.1", mid: "0.1 \u2013 0.25", poor: "> 0.25" },
                  { name: "TTFB", good: "\u2264 800ms", mid: "800ms \u2013 1.8s", poor: "> 1.8s" },
                  { name: "TBT", good: "\u2264 200ms", mid: "200ms \u2013 600ms", poor: "> 600ms" },
                  { name: "SI", good: "\u2264 3.4s", mid: "3.4s \u2013 5.8s", poor: "> 5.8s" },
                  { name: "TTI", good: "\u2264 3.8s", mid: "3.8s \u2013 7.3s", poor: "> 7.3s" },
                  { name: "Server Processing", good: "\u2264 200ms", mid: "200ms \u2013 500ms", poor: "> 500ms" },
                  { name: "Browser Rendering", good: "\u2264 1.0s", mid: "1.0s \u2013 2.5s", poor: "> 2.5s" },
                  { name: "Lighthouse Score", good: "\u2265 90", mid: "50 \u2013 89", poor: "< 50" },
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
      )}

      {/* ─── Network Fundamentals Tab ─── */}
      {tab === "network" && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
          <h2 className="text-sm font-medium text-gray-400 mb-2">Network & Server Fundamentals</h2>
          <p className="text-xs text-gray-500 mb-4">
            Before a browser can render anything it must complete several network handshakes. These phases compose <strong className="text-indigo-400">TTFB (Time to First Byte)</strong>.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
              <h3 className="text-sm font-semibold text-teal-300">DNS Lookup</h3>
              <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">
                The browser resolves the domain name (e.g. <code className="text-teal-400">www.example.com</code>) to an IP address by querying DNS servers. A cold lookup may take 20-120 ms; cached lookups are near-instant.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-gray-500">
                <li className="flex gap-2"><span className="text-teal-500">-</span>Minimize third-party domains to reduce extra DNS lookups</li>
                <li className="flex gap-2"><span className="text-teal-500">-</span>Use <code className="text-gray-400">&lt;link rel=&quot;dns-prefetch&quot;&gt;</code> for known origins</li>
                <li className="flex gap-2"><span className="text-teal-500">-</span>Typical budget: &lt; 50 ms</li>
              </ul>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
              <h3 className="text-sm font-semibold text-teal-400">TCP Connection</h3>
              <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">
                A three-way handshake (<code className="text-teal-400">SYN &rarr; SYN-ACK &rarr; ACK</code>) establishes a reliable connection. This adds one round-trip time (RTT) of latency, typically 20-100 ms depending on geographic distance.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-gray-500">
                <li className="flex gap-2"><span className="text-teal-500">-</span>Use a CDN to reduce RTT by placing servers closer to users</li>
                <li className="flex gap-2"><span className="text-teal-500">-</span>Enable <code className="text-gray-400">TCP Fast Open</code> where supported</li>
                <li className="flex gap-2"><span className="text-teal-500">-</span>HTTP/2 and HTTP/3 multiplex requests over a single connection</li>
              </ul>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
              <h3 className="text-sm font-semibold text-cyan-400">TLS Negotiation</h3>
              <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">
                For HTTPS, a TLS handshake follows TCP. The client and server exchange certificates, agree on a cipher suite, and derive session keys. TLS 1.2 requires 2 RTTs; TLS 1.3 needs only 1 RTT (0-RTT for resumption).
              </p>
              <ul className="mt-2 space-y-1 text-xs text-gray-500">
                <li className="flex gap-2"><span className="text-cyan-500">-</span>Upgrade to TLS 1.3 for faster handshakes</li>
                <li className="flex gap-2"><span className="text-cyan-500">-</span>Enable OCSP stapling to avoid extra certificate validation roundtrips</li>
                <li className="flex gap-2"><span className="text-cyan-500">-</span>Use session tickets / 0-RTT resumption for returning visitors</li>
              </ul>
            </div>
            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-4">
              <h3 className="text-sm font-semibold text-emerald-400">Server Response</h3>
              <p className="mt-1.5 text-xs text-gray-400 leading-relaxed">
                After the connection is established, the browser sends an HTTP request. The server processes it (routing, authentication, DB queries, template rendering) and sends back the first byte of the response. This is usually the largest contributor to TTFB.
              </p>
              <ul className="mt-2 space-y-1 text-xs text-gray-500">
                <li className="flex gap-2"><span className="text-emerald-500">-</span>Profile slow queries with <code className="text-gray-400">EXPLAIN ANALYZE</code></li>
                <li className="flex gap-2"><span className="text-emerald-500">-</span>Add caching layers (Redis, CDN edge caching, stale-while-revalidate)</li>
                <li className="flex gap-2"><span className="text-emerald-500">-</span>Consider streaming SSR to send the first byte sooner</li>
              </ul>
            </div>
          </div>
          <div className="mt-4 rounded-md border border-teal-900/50 bg-teal-900/10 p-3">
            <p className="text-xs text-teal-300 font-medium">TTFB = DNS + TCP + TLS + Server Response Time</p>
            <p className="mt-1 text-xs text-gray-400">
              A good TTFB is under 800 ms. Anything above 1.8 s is considered poor. Use the waterfall chart in browser DevTools (Network tab) to see the exact duration of each phase for your site.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
