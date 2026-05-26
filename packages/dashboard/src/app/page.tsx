import { Activity, Gauge, Zap, Eye } from "lucide-react";

function MetricCard({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-100">
        {value}
        <span className="ml-1 text-sm font-normal text-gray-500">{unit}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-400">
          Frontend Performance Testing Framework — Phase 0
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="LCP" value="—" unit="ms" icon={Eye} />
        <MetricCard label="FCP" value="—" unit="ms" icon={Zap} />
        <MetricCard label="CLS" value="—" unit="" icon={Activity} />
        <MetricCard label="Lighthouse" value="—" unit="/100" icon={Gauge} />
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400">Getting Started</h2>
        <div className="mt-4 space-y-3 text-sm text-gray-300">
          <p>
            Run your first performance test with the Engine PoC:
          </p>
          <pre className="rounded-md bg-gray-800 p-3 text-xs text-green-400 overflow-x-auto">
            npm run worker:run -- --url https://example.com --runs 3
          </pre>
          <p className="text-gray-500">
            The engine runs Playwright + Lighthouse N times and reports median
            Core Web Vitals (LCP, FCP, INP, CLS, TTFB) and Lighthouse scores.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-medium text-gray-400">
          Phase 0 Deliverables
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-gray-300">
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Repo scaffolding &amp; CI setup
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Data-model draft (Postgres schema)
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Engine PoC: Playwright + Lighthouse
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Architecture spike
          </li>
        </ul>
      </div>
    </div>
  );
}
