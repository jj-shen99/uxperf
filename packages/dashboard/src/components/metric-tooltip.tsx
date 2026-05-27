"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export const METRIC_GLOSSARY: Record<string, { name: string; full: string; description: string; good: string; unit: string }> = {
  LCP: {
    name: "LCP",
    full: "Largest Contentful Paint",
    description: "Measures how long it takes for the largest visible content element (image, video, or text block) to render on screen. It reflects the perceived load speed of the page.",
    good: "≤ 2,500 ms",
    unit: "ms",
  },
  FCP: {
    name: "FCP",
    full: "First Contentful Paint",
    description: "Measures the time from navigation start to when the first text or image is painted on screen. It tells users that the page is loading and content is starting to appear.",
    good: "≤ 1,800 ms",
    unit: "ms",
  },
  CLS: {
    name: "CLS",
    full: "Cumulative Layout Shift",
    description: "Quantifies how much the page layout shifts unexpectedly during loading. A low CLS means elements don't jump around, providing a more stable visual experience.",
    good: "≤ 0.1",
    unit: "",
  },
  TTFB: {
    name: "TTFB",
    full: "Time to First Byte",
    description: "Measures the time between the browser requesting a page and receiving the first byte of the response from the server. It reflects server responsiveness and network latency.",
    good: "≤ 800 ms",
    unit: "ms",
  },
  INP: {
    name: "INP",
    full: "Interaction to Next Paint",
    description: "Measures the latency of every click, tap, and keyboard interaction throughout the page lifecycle, and reports the worst-case delay. It captures overall page responsiveness.",
    good: "≤ 200 ms",
    unit: "ms",
  },
  TBT: {
    name: "TBT",
    full: "Total Blocking Time",
    description: "The total time between FCP and TTI where the main thread was blocked long enough to prevent input responsiveness. High TBT means the page feels sluggish to interact with.",
    good: "≤ 200 ms",
    unit: "ms",
  },
  TTI: {
    name: "TTI",
    full: "Time to Interactive",
    description: "Measures when the page becomes fully interactive — meaning the main thread is free enough to respond to user input within 50ms. It indicates when a user can reliably interact with the page.",
    good: "≤ 3,800 ms",
    unit: "ms",
  },
  SI: {
    name: "SI",
    full: "Speed Index",
    description: "Measures how quickly the contents of a page are visually populated. It captures the overall visual loading experience by analyzing the progression of visual completeness over time.",
    good: "≤ 3,400 ms",
    unit: "ms",
  },
  "Lighthouse Score": {
    name: "Lighthouse Score",
    full: "Lighthouse Performance Score",
    description: "A weighted composite score (0-100) calculated from lab metrics including FCP, SI, LCP, TBT, and CLS. A higher score indicates better page performance. Scores ≥ 90 are considered good.",
    good: "≥ 90",
    unit: "/100",
  },
  "Server Processing": {
    name: "Server Processing",
    full: "Server Processing Time",
    description: "The time the server spends handling the request — including routing, executing application logic, querying the database, and serialising the response. It is a major component of TTFB: TTFB ≈ DNS + TCP + TLS + Server Processing. Reducing DB query time, adding caching, or optimising backend code directly lowers this metric.",
    good: "≤ 200 ms",
    unit: "ms",
  },
  "Content Rendering": {
    name: "Content Rendering",
    full: "Content Rendering (FCP → LCP)",
    description: "The time between first paint and when the largest content element finishes rendering. After FCP, the browser continues loading images, web fonts, and deferred resources. Render-blocking resources, large images, and expensive JS execution widen this gap.",
    good: "≤ 1,000 ms",
    unit: "ms",
  },
};

interface MetricTooltipProps {
  metricKey: string;
  children?: React.ReactNode;
  className?: string;
}

export function MetricTooltip({ metricKey, children, className = "" }: MetricTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const info = METRIC_GLOSSARY[metricKey];
  if (!info) return <span className={className}>{children ?? metricKey}</span>;

  const TOOLTIP_W = 320; // w-80
  const GAP = 8;

  const handleEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Horizontal: try to center, clamp to viewport edges
      let left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      left = Math.max(8, Math.min(left, vw - TOOLTIP_W - 8));

      // Vertical: prefer above; fall below if not enough room
      let top: number;
      if (rect.top > 200) {
        top = rect.top - GAP; // position above — bottom edge of tooltip here (using transform)
      } else {
        top = rect.bottom + GAP;
      }

      setCoords({ top, left });
    }
    setOpen(true);
  };

  const handleLeave = () => {
    setOpen(false);
    setCoords(null);
  };

  // Determine if tooltip renders above or below
  const above = coords != null && ref.current != null && coords.top <= ref.current.getBoundingClientRect().top;

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center gap-1 ${className}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children ?? info.name}
      <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-gray-600 text-[9px] text-gray-500 cursor-help">?</span>
      {open && coords && typeof document !== "undefined" &&
        createPortal(
          <span
            className="fixed z-[9999] w-80 rounded-lg border border-gray-700 bg-gray-800 p-3 shadow-2xl text-left"
            style={{
              top: coords.top,
              left: coords.left,
              transform: above ? "translateY(-100%)" : undefined,
              pointerEvents: "none",
            }}
          >
            <span className="block text-xs font-semibold text-indigo-400">{info.full}</span>
            <span className="mt-1 block text-xs text-gray-300 leading-relaxed whitespace-normal break-words">{info.description}</span>
            <span className="mt-2 block text-[10px] text-gray-500">Good threshold: {info.good}</span>
          </span>,
          document.body,
        )
      }
    </span>
  );
}
