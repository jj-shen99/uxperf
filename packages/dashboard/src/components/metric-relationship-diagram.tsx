"use client";

/**
 * Interactive SVG diagram showing how web performance metrics relate
 * to the page-load timeline and to each other.
 */

import { useState } from "react";
import { METRIC_GLOSSARY } from "./metric-tooltip";

interface TimelinePhase {
  id: string;
  label: string;
  metricKey: string;
  x: number;      // % of timeline width
  color: string;
}

const PHASES: TimelinePhase[] = [
  { id: "ttfb", label: "TTFB",  metricKey: "TTFB", x: 25,  color: "#a78bfa" },
  { id: "fcp",  label: "FCP",   metricKey: "FCP",  x: 38,  color: "#60a5fa" },
  { id: "si",   label: "SI",    metricKey: "SI",   x: 50,  color: "#38bdf8" },
  { id: "lcp",  label: "LCP",   metricKey: "LCP",  x: 62,  color: "#34d399" },
  { id: "tti",  label: "TTI",   metricKey: "TTI",  x: 75,  color: "#fbbf24" },
  { id: "inp",  label: "INP",   metricKey: "INP",  x: 92,  color: "#f87171" },
];

// Sub-phases within TTFB (Nav Start → TTFB), shown as segmented bar
const TTFB_SUB_PHASES = [
  { id: "dns",    label: "DNS",          color: "#2dd4bf", pct: 0.20 },
  { id: "tcp",    label: "TCP + TLS",    color: "#14b8a6", pct: 0.30 },
  { id: "server", label: "Server Response", color: "#0d9488", pct: 0.50 },
];

const SPAN_METRICS = [
  { id: "transfer", label: "Transfer + Parse", metricKey: "Transfer + Parse", fromId: "ttfb", toId: "fcp", color: "#818cf8", y: 140 },
  { id: "render", label: "Content Rendering", metricKey: "Content Rendering", fromId: "fcp", toId: "lcp", color: "#06b6d4", y: 140 },
  { id: "tbt", label: "TBT", metricKey: "TBT", fromId: "fcp", toId: "tti", color: "#fb923c", y: 170 },
  { id: "cls", label: "CLS", metricKey: "CLS", fromId: "fcp", toId: "inp", color: "#e879f9", y: 200 },
];

const RELATIONSHIPS = [
  { from: "ttfb", to: "fcp",  label: "Transfer + HTML Parsing" },
  { from: "fcp",  to: "lcp",  label: "Content Rendering" },
  { from: "fcp",  to: "tti",  label: "Blocking spans (TBT)" },
  { from: "tti",  to: "inp",  label: "Interactive → Responsive" },
];

export function MetricRelationshipDiagram() {
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);
  const info = hoveredMetric ? METRIC_GLOSSARY[hoveredMetric] : null;

  const phaseMap: Record<string, TimelinePhase> = {
    nav: { id: "nav", label: "Nav Start", metricKey: "", x: 1, color: "#6b7280" },
    ...Object.fromEntries(PHASES.map((p) => [p.id, p])),
  };

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
      <h2 className="mb-2 text-sm font-medium text-gray-300">
        How Performance Metrics Relate
      </h2>
      <p className="mb-4 text-xs text-gray-500">
        Hover over any metric on the timeline to learn more. Metrics are ordered by when they occur during page load.
      </p>

      <div className="relative">
        <svg viewBox="0 0 800 290" className="w-full" style={{ minHeight: 420 }}>
          {/* Background grid */}
          <defs>
            <linearGradient id="timeline-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* Timeline bar */}
          <rect x="40" y="90" width="720" height="6" rx="3" fill="url(#timeline-grad)" />

          {/* Navigation Start marker */}
          {(() => {
            const navX = 40 + (1 / 100) * 720;
            return (
              <g>
                <line x1={navX} y1={60} x2={navX} y2={130} stroke="#6b7280" strokeWidth={1} opacity={0.5} />
                <circle cx={navX} cy={93} r={5} fill="#6b7280" fillOpacity={0.7} />
                <text x={navX} y={52} fill="#9ca3af" fontSize="10" fontWeight="600" textAnchor="middle">Nav Start</text>
              </g>
            );
          })()}

          {/* TTFB sub-phases: DNS → TCP+TLS → Server Response */}
          {(() => {
            const navX = 40 + (1 / 100) * 720;
            const ttfbX = 40 + (25 / 100) * 720;
            const totalW = ttfbX - navX;
            const barY = 118;
            const barH = 16;
            let cx = navX;
            return (
              <g>
                <text x={(navX + ttfbX) / 2} y={barY - 4} fill="#5eead4" fontSize="8" fontWeight="600" textAnchor="middle">TTFB breakdown</text>
                {TTFB_SUB_PHASES.map((sub) => {
                  const w = totalW * sub.pct;
                  const x = cx;
                  cx += w;
                  return (
                    <g key={sub.id}>
                      <rect x={x} y={barY} width={w} height={barH} rx={sub.id === "dns" ? 4 : 0} fill={sub.color} fillOpacity={0.25} stroke={sub.color} strokeWidth={0.5} />
                      <text x={x + w / 2} y={barY + barH / 2 + 3.5} fill={sub.color} fontSize="8" fontWeight="600" textAnchor="middle">{sub.label}</text>
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Phase labels */}
          <text x="760" y="82" fill="#6b7280" fontSize="9" textAnchor="end">Fully Loaded</text>

          {/* Relationship arrows */}
          {RELATIONSHIPS.map((rel, i) => {
            const from = phaseMap[rel.from];
            const to = phaseMap[rel.to];
            if (!from || !to) return null;
            const x1 = 40 + (from.x / 100) * 720;
            const x2 = 40 + (to.x / 100) * 720;
            return (
              <g key={i} opacity={hoveredMetric ? 0.15 : 0.35}>
                <line x1={x1} y1={93} x2={x2} y2={93} stroke="#4b5563" strokeWidth="1" strokeDasharray="4 3" />
                <text x={(x1 + x2) / 2} y={78} fill="#4b5563" fontSize="7" textAnchor="middle">{rel.label}</text>
              </g>
            );
          })}

          {/* Span metrics (TBT, CLS) */}
          {SPAN_METRICS.map((span) => {
            const from = phaseMap[span.fromId];
            const to = phaseMap[span.toId];
            if (!from || !to) return null;
            const x1 = 40 + (from.x / 100) * 720;
            const x2 = 40 + (to.x / 100) * 720;
            const isHovered = hoveredMetric === span.metricKey;
            return (
              <g
                key={span.id}
                onMouseEnter={() => setHoveredMetric(span.metricKey)}
                onMouseLeave={() => setHoveredMetric(null)}
                className="cursor-pointer"
                opacity={hoveredMetric && !isHovered ? 0.3 : 1}
              >
                <rect x={x1} y={span.y - 10} width={x2 - x1} height={20} rx={4} fill={span.color} fillOpacity={isHovered ? 0.3 : 0.12} stroke={span.color} strokeWidth={isHovered ? 1.5 : 0.5} strokeDasharray={isHovered ? "" : "4 2"} />
                <text x={(x1 + x2) / 2} y={span.y + 4} fill={span.color} fontSize="11" fontWeight="600" textAnchor="middle">{span.label}</text>
                {/* endpoints */}
                <circle cx={x1} cy={span.y} r={3} fill={span.color} />
                <circle cx={x2} cy={span.y} r={3} fill={span.color} />
              </g>
            );
          })}

          {/* Phase markers */}
          {PHASES.map((phase) => {
            const cx = 40 + (phase.x / 100) * 720;
            const isHovered = hoveredMetric === phase.metricKey;
            return (
              <g
                key={phase.id}
                onMouseEnter={() => setHoveredMetric(phase.metricKey)}
                onMouseLeave={() => setHoveredMetric(null)}
                className="cursor-pointer"
                opacity={hoveredMetric && !isHovered ? 0.3 : 1}
              >
                {/* vertical line */}
                <line x1={cx} y1={60} x2={cx} y2={130} stroke={phase.color} strokeWidth={isHovered ? 2 : 1} opacity={isHovered ? 0.8 : 0.4} />
                {/* circle on timeline */}
                <circle cx={cx} cy={93} r={isHovered ? 8 : 6} fill={phase.color} fillOpacity={isHovered ? 1 : 0.8} stroke={isHovered ? "#fff" : "none"} strokeWidth={1.5} />
                {/* label above */}
                <text x={cx} y={52} fill={isHovered ? "#fff" : phase.color} fontSize={isHovered ? "13" : "11"} fontWeight="700" textAnchor="middle">{phase.label}</text>
                {/* time label below */}
                <text x={cx} y={140} fill="#6b7280" fontSize="8" textAnchor="middle">
                  {METRIC_GLOSSARY[phase.metricKey]?.good ?? ""}
                </text>
              </g>
            );
          })}

          {/* Legend */}
          <text x="400" y="240" fill="#4b5563" fontSize="8" textAnchor="middle">
            Timeline markers = when each metric is measured · Spans = metrics measured across a range
          </text>
          <text x="400" y="252" fill="#4b5563" fontSize="8" textAnchor="middle">
            TTFB = DNS + TCP/TLS + Server Response · Transfer + Parse fills TTFB→FCP · Content Rendering fills FCP→LCP
          </text>
        </svg>

        {/* Tooltip panel */}
        {info && (
          <div className="absolute top-2 right-2 z-50 w-64 rounded-lg border border-gray-700 bg-gray-800 p-3 shadow-xl pointer-events-none">
            <p className="text-xs font-bold text-indigo-400">{info.full}</p>
            <p className="mt-1 text-xs text-gray-300 leading-relaxed">{info.description}</p>
            <p className="mt-1.5 text-[10px] text-gray-500">Good threshold: {info.good}</p>
          </div>
        )}
      </div>

      {/* Relationship summary */}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-teal-400">Server Side</p>
          <p className="mt-1 text-xs text-gray-400">Server Processing (DNS, TCP, TLS, routing, DB queries, response generation) makes up TTFB. After the first byte arrives, Transfer + Parse fills the gap to FCP.</p>
        </div>
        <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">Content Rendering</p>
          <p className="mt-1 text-xs text-gray-400">After first paint (FCP), the browser continues loading images, web fonts, and deferred resources until the largest element is fully rendered (LCP). This span measures FCP → LCP.</p>
        </div>
        <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">Loading</p>
          <p className="mt-1 text-xs text-gray-400">TTFB → FCP → SI → LCP track how fast content appears on screen.</p>
        </div>
        <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">Interactivity</p>
          <p className="mt-1 text-xs text-gray-400">TBT measures blocking between FCP and TTI. INP tracks runtime responsiveness.</p>
        </div>
        <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-pink-400">Visual Stability</p>
          <p className="mt-1 text-xs text-gray-400">CLS captures unexpected layout shifts throughout the entire page lifecycle.</p>
        </div>
      </div>
    </div>
  );
}
