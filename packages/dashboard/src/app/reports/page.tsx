"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState, useMemo } from "react";
import { useProjects } from "@/hooks/use-projects";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const metricLabels: Record<string, string> = {
  lcp_ms: "LCP",
  fcp_ms: "FCP",
  cls: "CLS",
  ttfb_ms: "TTFB",
  inp_ms: "INP",
  tbt_ms: "TBT",
};

const CWV_THRESHOLDS: Record<string, { good: number; poor: number; unit: string }> = {
  lcp_ms: { good: 2500, poor: 4000, unit: "ms" },
  fcp_ms: { good: 1800, poor: 3000, unit: "ms" },
  cls: { good: 0.1, poor: 0.25, unit: "" },
  ttfb_ms: { good: 800, poor: 1800, unit: "ms" },
  inp_ms: { good: 200, poor: 500, unit: "ms" },
  tbt_ms: { good: 200, poor: 600, unit: "ms" },
};

function ratingColor(value: number, good: number, poor: number) {
  if (value <= good) return "#22c55e";
  if (value <= poor) return "#eab308";
  return "#ef4444";
}

const directionIcons: Record<string, string> = {
  improving: "↗ Improving",
  stable: "→ Stable",
  degrading: "↘ Degrading",
};
const directionColors: Record<string, string> = {
  improving: "text-green-400",
  stable: "text-gray-400",
  degrading: "text-red-400",
};

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const { projects, projectId, setProjectId } = useProjects();
  const [days, setDays] = useState(30);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const { data: allRuns = [], isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: () => api.runs.list(),
  });

  // Saved reports from API
  const { data: savedReports = [] } = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api.reports.list(projectId),
    enabled: !!projectId,
  });

  const generateMut = useMutation({
    mutationFn: () => api.reports.generate({ project_id: projectId, days }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports", projectId] }),
  });

  const completedRuns = useMemo(() =>
    allRuns
      .filter((r: any) => r.status === "completed" && r.metrics)
      .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [allRuns]
  );

  // Filter by date range
  const filteredRuns = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return completedRuns.filter((r: any) => new Date(r.created_at) >= cutoff);
  }, [completedRuns, days]);

  // Build run trend sparkline data
  const trendData = useMemo(() =>
    completedRuns.slice(-20).map((r: any, i: number) => ({
      idx: i + 1,
      lcp: r.metrics?.lcp_ms ?? null,
      fcp: r.metrics?.fcp_ms ?? null,
      lh: r.metrics?.lighthouse_performance_score != null ? Math.round(r.metrics.lighthouse_performance_score * 100) : null,
    })),
    [completedRuns]
  );

  // Performance distribution: count good/needs-improvement/poor for each CWV
  const distribution = useMemo(() => {
    const result: Record<string, { good: number; needsImprovement: number; poor: number }> = {};
    for (const key of ["lcp_ms", "fcp_ms", "cls", "ttfb_ms"]) {
      let good = 0, ni = 0, poor = 0;
      completedRuns.forEach((r: any) => {
        const v = r.metrics?.[key] as number | undefined;
        if (v == null) return;
        const t = CWV_THRESHOLDS[key];
        if (v <= t.good) good++;
        else if (v <= t.poor) ni++;
        else poor++;
      });
      result[key] = { good, needsImprovement: ni, poor };
    }
    return result;
  }, [completedRuns]);

  // Aggregated stats
  const aggStats = useMemo(() => {
    if (completedRuns.length === 0) return null;
    const metrics = ["lcp_ms", "fcp_ms", "cls", "ttfb_ms", "tbt_ms", "inp_ms"];
    const stats: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    for (const key of metrics) {
      const vals: number[] = [];
      completedRuns.forEach((r: any) => {
        const v = r.metrics?.[key] as number | undefined;
        if (v != null) vals.push(v);
      });
      if (vals.length > 0) {
        stats[key] = {
          avg: vals.reduce((a, b) => a + b, 0) / vals.length,
          min: Math.min(...vals),
          max: Math.max(...vals),
          count: vals.length,
        };
      }
    }
    return stats;
  }, [completedRuns]);

  // Run summary stats
  const runSummary = useMemo(() => {
    const runs = filteredRuns;
    const completed = runs.length;
    const allInRange = allRuns.filter((r: any) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      return new Date(r.created_at) >= cutoff;
    });
    const failed = allInRange.filter((r: any) => r.status === "failed").length;
    const total = allInRange.length;
    const passRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, failed, total, passRate };
  }, [filteredRuns, allRuns, days]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Reports</h1>
          <p className="mt-1 text-sm text-gray-400">
            Performance summaries with Core Web Vitals distribution, metric trends, and statistics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
          >
            <option value="">All projects</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={() => generateMut.mutate()}
            disabled={!projectId || generateMut.isPending}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {generateMut.isPending ? "Generating…" : "Generate Report"}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-gray-400">Loading data...</div>
      ) : completedRuns.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          No completed runs with metrics found. Run some performance tests to see reports.
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Total Runs ({days}d)</p>
              <p className="mt-1 text-2xl font-bold text-white">{runSummary.total}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Completed</p>
              <p className="mt-1 text-2xl font-bold text-green-400">{runSummary.completed}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Failed</p>
              <p className="mt-1 text-2xl font-bold text-red-400">{runSummary.failed}</p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">Pass Rate</p>
              <p className="mt-1 text-2xl font-bold text-white">{runSummary.passRate}%</p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${runSummary.passRate}%` }} />
              </div>
            </div>
          </div>

          {/* Performance Distribution */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
            <h3 className="mb-4 text-sm font-medium text-gray-300">Performance Distribution ({days}-day window)</h3>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(["lcp_ms", "fcp_ms", "cls", "ttfb_ms"] as const).map((key) => {
                const d = distribution[key];
                const total = d.good + d.needsImprovement + d.poor;
                if (total === 0) return null;
                return (
                  <div key={key} className="rounded-lg border border-gray-800 bg-gray-800/30 p-3">
                    <p className="text-xs font-medium text-gray-500">{metricLabels[key]}</p>
                    <div className="mt-2 flex h-4 w-full overflow-hidden rounded-full">
                      <div className="bg-green-500 transition-all" style={{ width: `${(d.good / total) * 100}%` }} />
                      <div className="bg-yellow-500 transition-all" style={{ width: `${(d.needsImprovement / total) * 100}%` }} />
                      <div className="bg-red-500 transition-all" style={{ width: `${(d.poor / total) * 100}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px]">
                      <span className="text-green-400">{d.good} Good</span>
                      <span className="text-yellow-400">{d.needsImprovement} NI</span>
                      <span className="text-red-400">{d.poor} Poor</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aggregated Metric Stats */}
          {aggStats && Object.keys(aggStats).length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-sm font-medium text-gray-300">Aggregated Metric Statistics ({days}-day window)</h3>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">Metric</th>
                      <th className="px-3 py-2 font-medium">Avg</th>
                      <th className="px-3 py-2 font-medium">Min</th>
                      <th className="px-3 py-2 font-medium">Max</th>
                      <th className="px-3 py-2 font-medium">Samples</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(aggStats).map(([key, s]: [string, any]) => {
                      const t = CWV_THRESHOLDS[key];
                      const color = t ? ratingColor(s.avg, t.good, t.poor) : "#818cf8";
                      const isCls = key === "cls";
                      const fmtVal = (v: number) => isCls ? v.toFixed(3) : `${Math.round(v)} ms`;
                      return (
                        <tr key={key} className="border-b border-gray-800/50">
                          <td className="px-3 py-2 font-medium text-gray-300">{metricLabels[key] ?? key}</td>
                          <td className="px-3 py-2 font-mono font-bold" style={{ color }}>{fmtVal(s.avg)}</td>
                          <td className="px-3 py-2 font-mono text-green-400">{fmtVal(s.min)}</td>
                          <td className="px-3 py-2 font-mono text-red-400">{fmtVal(s.max)}</td>
                          <td className="px-3 py-2 text-gray-500">{s.count}</td>
                          <td className="px-3 py-2">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LCP/FCP Trend Sparkline */}
          {trendData.length > 1 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-sm font-medium text-gray-300">Recent LCP & FCP Trend (last 20 runs)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="idx" stroke="#6b7280" fontSize={11} label={{ value: "Run #", position: "insideBottom", offset: -2, fill: "#6b7280", fontSize: 10 }} />
                  <YAxis stroke="#6b7280" fontSize={11} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: "12px" }}
                  />
                  <Line type="monotone" dataKey="lcp" name="LCP (ms)" stroke="#818cf8" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                  <Line type="monotone" dataKey="fcp" name="FCP (ms)" stroke="#34d399" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Lighthouse Score Trend */}
          {trendData.some((d) => d.lh != null) && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-sm font-medium text-gray-300">Lighthouse Performance Score Trend</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="idx" stroke="#6b7280" fontSize={11} />
                  <YAxis stroke="#6b7280" fontSize={11} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: "12px" }}
                  />
                  <Line type="monotone" dataKey="lh" name="LH Score" stroke="#fb923c" strokeWidth={2} dot={{ r: 2 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Score Explanations */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6 space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-white mb-1">Lighthouse Score Breakdown</h2>
          <p className="text-xs text-gray-500">
            Each Lighthouse category score is 0–100. Scores are computed by running audits, converting raw values to 0–1 via a
            <strong className="text-gray-300"> log-normal scoring curve</strong>, then applying category-specific weights.
            Scores ≥ 90 are <span className="text-green-400 font-medium">Good</span>, 50–89 are
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
                <tr><td className="py-0.5 pr-2 font-medium text-gray-300">FCP (First Contentful Paint)</td><td className="text-right px-2">10%</td><td className="text-right text-green-400">≤ 1.8s</td></tr>
                <tr><td className="py-0.5 pr-2 font-medium text-gray-300">SI (Speed Index)</td><td className="text-right px-2">10%</td><td className="text-right text-green-400">≤ 3.4s</td></tr>
                <tr><td className="py-0.5 pr-2 font-medium text-gray-300">LCP (Largest Contentful Paint)</td><td className="text-right px-2">25%</td><td className="text-right text-green-400">≤ 2.5s</td></tr>
                <tr><td className="py-0.5 pr-2 font-medium text-gray-300">TBT (Total Blocking Time)</td><td className="text-right px-2">30%</td><td className="text-right text-green-400">≤ 200ms</td></tr>
                <tr><td className="py-0.5 pr-2 font-medium text-gray-300">CLS (Cumulative Layout Shift)</td><td className="text-right px-2">25%</td><td className="text-right text-green-400">≤ 0.1</td></tr>
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
              Runs ~50 automated audits based on the <strong className="text-gray-300">axe-core library</strong> and WCAG 2.1 guidelines. Each audit is pass/fail/not-applicable. The score = (passing audits ÷ applicable audits) × 100. All applicable audits are <strong className="text-gray-300">weighted equally</strong>.
            </p>
            <p className="text-xs text-gray-500 mb-2">Key audit categories:</p>
            <ul className="space-y-0.5 text-[11px] text-gray-400">
              <li>- <strong className="text-gray-300">Color Contrast</strong> — text must have ≥ 4.5:1 contrast ratio</li>
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
              Checks ~15 audits for modern web development standards and security. Like Accessibility, the score = (passing ÷ applicable) × 100 with <strong className="text-gray-300">equal weight per audit</strong>.
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
              Checks ~13 audits for baseline search-engine-optimization hygiene. Score = (passing ÷ applicable) × 100, <strong className="text-gray-300">equally weighted</strong>. This tests technical SEO — not content quality, backlinks, or domain authority.
            </p>
            <p className="text-xs text-gray-500 mb-2">What it checks:</p>
            <ul className="space-y-0.5 text-[11px] text-gray-400">
              <li>- <strong className="text-gray-300">Meta description</strong> — present and not empty</li>
              <li>- <strong className="text-gray-300">HTTP status</strong> — page returns 2xx status code</li>
              <li>- <strong className="text-gray-300">Crawlable links</strong> — links use &lt;a href&gt;, not JS-only navigation</li>
              <li>- <strong className="text-gray-300">robots.txt</strong> — valid and doesn't block page</li>
              <li>- <strong className="text-gray-300">Indexable</strong> — no noindex meta tag or header</li>
              <li>- <strong className="text-gray-300">Structured data</strong> — JSON-LD/microdata is valid (if present)</li>
              <li>- <strong className="text-gray-300">Viewport meta</strong> — &lt;meta name="viewport"&gt; is present</li>
              <li>- <strong className="text-gray-300">Font legibility</strong> — text is ≥ 12px on mobile</li>
              <li>- <strong className="text-gray-300">Tap targets</strong> — buttons/links have adequate spacing</li>
            </ul>
            <div className="mt-3 rounded-md border border-emerald-900/40 bg-emerald-900/10 p-2">
              <p className="text-[11px] text-emerald-300 font-medium">How to improve:</p>
              <ul className="mt-1 space-y-0.5 text-[10px] text-gray-400">
                <li>- Add unique, descriptive &lt;title&gt; and &lt;meta description&gt; per page</li>
                <li>- Use semantic heading hierarchy (h1 → h2 → h3)</li>
                <li>- Ensure all links are crawlable &lt;a href="..."&gt;</li>
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
                Mobile applies 4× CPU throttling and slower network (simulated 4G). Desktop has no CPU throttle and faster network. Switching from mobile → desktop typically <span className="text-green-400">increases Performance by 10–30 pts</span>.
              </p>
            </div>
            <div className="rounded-md border border-gray-700 bg-gray-800/40 p-3">
              <p className="text-xs font-semibold text-gray-200">Number of Iterations (n_runs)</p>
              <p className="text-[10px] text-gray-500 mt-1">
                We report the <span className="text-gray-300 font-medium">median</span> across iterations. More runs (5–10) reduces variance and gives a more stable score. Single runs can fluctuate ± 5–8 pts.
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
                Lighthouse simulates network throttling. Actual throughput of the test machine's network also matters. Testing from a slow connection increases TTFB and all loading metrics.
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
                Ad networks, analytics, chat widgets, etc. can add 500ms–2s of TBT and degrade Performance score significantly. <span className="text-yellow-400">Blocking 3rd-parties</span> during testing isolates your own code's performance.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Previous Reports */}
      {savedReports.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Previous Reports</h2>
          <div className="space-y-2">
            {savedReports.slice(0, 20).map((r: any) => {
              const isExpanded = expandedReportId === r.id;
              const rpt = r.data as any;
              return (
                <div key={r.id} className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
                  <button
                    onClick={() => setExpandedReportId(isExpanded ? null : r.id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-indigo-900/30 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
                        {r.report_type ?? "executive"}
                      </span>
                      <span className="text-sm text-gray-300">
                        {new Date(r.period_start).toLocaleDateString()} — {new Date(r.period_end).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500">
                        {new Date(r.generated_at).toLocaleString()}
                      </span>
                      <span className="text-gray-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {isExpanded && rpt && (
                    <div className="border-t border-gray-800 px-4 py-4 space-y-4">
                      {/* CWV p75 */}
                      {rpt.core_web_vitals && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-2">Core Web Vitals (p75)</h4>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                            {[
                              { label: "LCP", value: rpt.core_web_vitals.lcp_p75_ms, key: "lcp_ms", fmt: (v: number) => `${v.toFixed(0)} ms` },
                              { label: "FCP", value: rpt.core_web_vitals.fcp_p75_ms, key: "fcp_ms", fmt: (v: number) => `${v.toFixed(0)} ms` },
                              { label: "CLS", value: rpt.core_web_vitals.cls_p75, key: "cls", fmt: (v: number) => v.toFixed(3) },
                              { label: "INP", value: rpt.core_web_vitals.inp_p75_ms, key: "inp_ms", fmt: (v: number) => `${v.toFixed(0)} ms` },
                              { label: "TTFB", value: rpt.core_web_vitals.ttfb_p75_ms, key: "ttfb_ms", fmt: (v: number) => `${v.toFixed(0)} ms` },
                            ].map((item) => {
                              const t = CWV_THRESHOLDS[item.key];
                              const color = item.value != null && t ? ratingColor(item.value, t.good, t.poor) : "#6b7280";
                              return (
                                <div key={item.key} className="rounded-md border border-gray-800 bg-gray-800/30 p-2">
                                  <p className="text-[10px] text-gray-500">{item.label}</p>
                                  <p className="text-sm font-mono font-bold" style={{ color }}>
                                    {item.value != null ? item.fmt(item.value) : "—"}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Run & Gate stats row */}
                      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                        {rpt.run_stats && (
                          <>
                            <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                              <p className="text-[10px] text-gray-500">Total Runs</p>
                              <p className="text-lg font-bold text-white">{rpt.run_stats.total_runs}</p>
                              <div className="mt-1 flex gap-2 text-[10px]">
                                <span className="text-green-400">{rpt.run_stats.completed} pass</span>
                                <span className="text-red-400">{rpt.run_stats.failed} fail</span>
                              </div>
                              <div className="mt-1.5 h-1 w-full rounded-full bg-gray-800 overflow-hidden">
                                <div className="h-full rounded-full bg-green-500" style={{ width: `${rpt.run_stats.pass_rate}%` }} />
                              </div>
                              <p className="mt-0.5 text-[10px] text-gray-500">{rpt.run_stats.pass_rate}% pass rate</p>
                            </div>
                          </>
                        )}
                        {rpt.gate_stats && (
                          <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                            <p className="text-[10px] text-gray-500">Gate Evaluations</p>
                            <p className="text-lg font-bold text-white">{rpt.gate_stats.total_evaluations}</p>
                            <div className="mt-1 flex gap-2 text-[10px]">
                              <span className="text-green-400">{rpt.gate_stats.passed} pass</span>
                              <span className="text-red-400">{rpt.gate_stats.failed} fail</span>
                            </div>
                            <div className="mt-1.5 h-1 w-full rounded-full bg-gray-800 overflow-hidden">
                              <div className="h-full rounded-full bg-green-500" style={{ width: `${rpt.gate_stats.pass_rate}%` }} />
                            </div>
                            <p className="mt-0.5 text-[10px] text-gray-500">{rpt.gate_stats.pass_rate}% pass rate</p>
                          </div>
                        )}
                        {rpt.anomalies && (
                          <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                            <p className="text-[10px] text-gray-500">Anomalies</p>
                            <p className="text-lg font-bold text-white">{rpt.anomalies.total}</p>
                            <div className="mt-1 flex gap-2 text-[10px]">
                              <span className="text-red-400">{rpt.anomalies.critical} critical</span>
                              <span className="text-green-400">{rpt.anomalies.resolved} resolved</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Trend Directions */}
                      {rpt.trend_direction && Object.keys(rpt.trend_direction).length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-2">Trend Directions</h4>
                          <div className="flex flex-wrap gap-3">
                            {Object.entries(rpt.trend_direction).map(([metric, direction]) => (
                              <div key={metric} className="rounded-md border border-gray-800 bg-gray-800/30 px-3 py-1.5 text-center">
                                <p className="text-[10px] text-gray-500">{metricLabels[metric] ?? metric}</p>
                                <p className={`text-xs font-semibold ${directionColors[direction as string] ?? "text-gray-400"}`}>
                                  {directionIcons[direction as string] ?? direction}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
