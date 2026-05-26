"use client";

import Link from "next/link";
import { MetricTooltip, METRIC_GLOSSARY } from "@/components/metric-tooltip";
import { MetricRelationshipDiagram } from "@/components/metric-relationship-diagram";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-400">
          Frontend Performance Testing Framework
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <MetricTooltip metricKey="LCP" className="text-sm text-gray-400" />
          <div className="mt-2 text-2xl font-semibold text-gray-100">—<span className="ml-1 text-sm font-normal text-gray-500">ms</span></div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <MetricTooltip metricKey="FCP" className="text-sm text-gray-400" />
          <div className="mt-2 text-2xl font-semibold text-gray-100">—<span className="ml-1 text-sm font-normal text-gray-500">ms</span></div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <MetricTooltip metricKey="CLS" className="text-sm text-gray-400" />
          <div className="mt-2 text-2xl font-semibold text-gray-100">—</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
          <MetricTooltip metricKey="Lighthouse Score" className="text-sm text-gray-400" />
          <div className="mt-2 text-2xl font-semibold text-gray-100">—<span className="ml-1 text-sm font-normal text-gray-500">/100</span></div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400">Quick Actions</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/runs" className="rounded-md border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 transition-colors">
            Launch a Test Run
          </Link>
          <Link href="/scripts" className="rounded-md border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 transition-colors">
            Manage Scripts
          </Link>
          <Link href="/results" className="rounded-md border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 transition-colors">
            View Results
          </Link>
          <Link href="/trends" className="rounded-md border border-gray-700 bg-gray-800 px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 transition-colors">
            View Trends
          </Link>
        </div>
      </div>

      {/* Metric Relationships Diagram */}
      <MetricRelationshipDiagram />

      {/* Metric Glossary */}
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
              <p className="mt-1 text-[10px] text-gray-600">Good: {info.good}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400">Getting Started</h2>
        <div className="mt-4 space-y-3 text-sm text-gray-300">
          <p>
            Create a project, author or upload a test script, then launch a run to measure
            <MetricTooltip metricKey="LCP" className="mx-1 text-indigo-300" />,
            <MetricTooltip metricKey="FCP" className="mx-1 text-indigo-300" />,
            <MetricTooltip metricKey="INP" className="mx-1 text-indigo-300" />,
            <MetricTooltip metricKey="CLS" className="mx-1 text-indigo-300" />,
            <MetricTooltip metricKey="TTFB" className="mx-1 text-indigo-300" />,
            and <MetricTooltip metricKey="Lighthouse Score" className="mx-1 text-indigo-300" />.
          </p>
          <p className="text-gray-500">
            Results are tracked over time with statistical baselines and quality gates
            for CI/CD integration.
          </p>
        </div>
      </div>
    </div>
  );
}
