"use client";

import Link from "next/link";
import { MetricTooltip } from "@/components/metric-tooltip";
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

      {/* Knowledge Base Link */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-gray-400">Performance Metrics Glossary</h2>
            <p className="mt-1 text-xs text-gray-500">
              Full glossary, optimization tips, testing methodology, and threshold reference
            </p>
          </div>
          <Link href="/knowledge" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
            Knowledge Base →
          </Link>
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
