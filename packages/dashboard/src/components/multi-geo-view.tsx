"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * E-62: Multi-Geo Dashboard View
 *
 * Side-by-side regional metrics with TTFB physics-floor annotation
 * and geo comparison for multi-region test runs.
 */

interface GeoLocation {
  id: string;
  label: string;
  region: string;
  provider: string;
  is_active: boolean;
}

interface GeoComparison {
  metric: string;
  best_region: string;
  worst_region: string;
  range_ms: number;
  values: Record<string, number>;
}

interface GeoRunResult {
  location: string;
  region: string;
  status: string;
  metrics: Record<string, number>;
  latency_offset_ms?: number;
}

// TTFB physics floor: speed of light in fiber ≈ 200,000 km/s
// Round-trip = 2 × distance / speed
const REGION_DISTANCES_KM: Record<string, Record<string, number>> = {
  "us-east-1": { "eu-west-1": 5550, "ap-southeast-1": 15300, "us-west-2": 3900 },
  "eu-west-1": { "us-east-1": 5550, "ap-southeast-1": 10300, "us-west-2": 8100 },
  "ap-southeast-1": { "us-east-1": 15300, "eu-west-1": 10300, "us-west-2": 13800 },
  "us-west-2": { "us-east-1": 3900, "eu-west-1": 8100, "ap-southeast-1": 13800 },
};

function physicsFloorMs(fromRegion: string, toRegion: string): number | null {
  const dist = REGION_DISTANCES_KM[fromRegion]?.[toRegion] ?? REGION_DISTANCES_KM[toRegion]?.[fromRegion];
  if (dist == null) return null;
  // Round-trip, fiber speed ≈ 200,000 km/s
  return Math.round((2 * dist / 200_000) * 1000);
}

const METRIC_LABELS: Record<string, string> = {
  lcp_ms: "LCP",
  fcp_ms: "FCP",
  ttfb_ms: "TTFB",
  cls: "CLS",
  performance_score: "Perf Score",
  tbt_ms: "TBT",
  inp_ms: "INP",
};

function fmtMetric(v: number | null | undefined, metric: string): string {
  if (v == null) return "—";
  if (metric === "cls") return v.toFixed(3);
  if (metric === "performance_score") return `${Math.round(v * 100)}`;
  return `${Math.round(v)}ms`;
}

interface MultiGeoViewProps {
  projectId: string;
}

export function MultiGeoView({ projectId }: MultiGeoViewProps) {
  const qc = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [dispatchUrl, setDispatchUrl] = useState("");
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);

  // Fetch available locations
  const { data: locations = [] } = useQuery<GeoLocation[]>({
    queryKey: ["geo-locations"],
    queryFn: () => api.intelligence.geo.locations(),
  });

  // Fetch runs with geo data
  const { data: runs = [] } = useQuery({
    queryKey: ["runs", projectId],
    queryFn: () => api.runs.list(projectId),
    enabled: !!projectId,
  });

  const geoRuns = runs.filter((r: any) => r.geo_locations && r.geo_locations.length > 0);

  // Fetch comparison for selected run
  const { data: comparison } = useQuery<{ locations: GeoRunResult[]; comparison: GeoComparison[] }>({
    queryKey: ["geo-compare", selectedRunId],
    queryFn: () => api.intelligence.geo.compare(selectedRunId!),
    enabled: !!selectedRunId,
  });

  // Dispatch mutation
  const dispatchMut = useMutation({
    mutationFn: (data: { project_id: string; url: string; locations: string[] }) =>
      api.intelligence.geo.dispatch(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runs", projectId] });
      setDispatchUrl("");
      setSelectedLocations([]);
    },
  });

  // Selected run geo data
  const selectedRun = geoRuns.find((r: any) => r.id === selectedRunId);

  // Build comparison grid from selected run
  const comparisonData = (() => {
    if (!selectedRun) return null;
    const geoLocs = selectedRun.geo_locations as string[];
    const metrics = selectedRun.metrics ?? {};
    // In real system, each location would have its own metrics
    // For scaffold, show the available metrics annotated with physics floor
    return { locations: geoLocs, metrics };
  })();

  const toggleLocation = (id: string) => {
    setSelectedLocations((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-6">
      {/* Location Map */}
      <div>
        <h3 className="text-sm font-medium text-gray-400 mb-3">Available Regions</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => toggleLocation(loc.id)}
              className={`rounded-lg border p-3 text-left transition ${
                selectedLocations.includes(loc.id)
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-gray-800 bg-gray-900 hover:border-gray-700"
              }`}
            >
              <span className="text-xs font-medium text-gray-200">{loc.label}</span>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
                <span>{loc.region}</span>
                <span className="rounded bg-gray-800 px-1">{loc.provider}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Dispatch Form */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm font-medium text-gray-200 mb-3">Dispatch Multi-Geo Run</h3>
        <div className="flex gap-2">
          <input
            type="text"
            value={dispatchUrl}
            onChange={(e) => setDispatchUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500"
          />
          <button
            onClick={() => {
              if (dispatchUrl && selectedLocations.length > 0) {
                dispatchMut.mutate({
                  project_id: projectId,
                  url: dispatchUrl,
                  locations: selectedLocations,
                });
              }
            }}
            disabled={!dispatchUrl || selectedLocations.length === 0 || dispatchMut.isPending}
            className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {dispatchMut.isPending ? "Dispatching..." : `Run in ${selectedLocations.length} region${selectedLocations.length !== 1 ? "s" : ""}`}
          </button>
        </div>
        {dispatchMut.isError && (
          <p className="mt-2 text-xs text-red-400">Error: {(dispatchMut.error as Error).message}</p>
        )}
      </div>

      {/* Geo Runs List */}
      {geoRuns.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">Multi-Geo Runs</h3>
          <div className="space-y-1">
            {geoRuns.slice(0, 10).map((r: any) => (
              <button
                key={r.id}
                onClick={() => setSelectedRunId(r.id)}
                className={`w-full text-left rounded-lg border p-3 transition ${
                  selectedRunId === r.id
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-gray-800 bg-gray-900 hover:border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-200">{r.id.slice(0, 12)}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    r.status === "completed" ? "bg-green-900/40 text-green-400" :
                    r.status === "running" ? "bg-blue-900/40 text-blue-400" :
                    "bg-gray-800 text-gray-400"
                  }`}>
                    {r.status}
                  </span>
                </div>
                <div className="mt-1 flex gap-1 flex-wrap">
                  {(r.geo_locations as string[]).map((loc: string) => (
                    <span key={loc} className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                      {loc}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Comparison Grid */}
      {comparisonData && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-400">Regional Comparison</h3>

          {/* TTFB Physics Floor */}
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">
              TTFB Physics Floor (Speed of Light in Fiber)
            </p>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-1 px-2">From → To</th>
                    {comparisonData.locations.map((loc) => (
                      <th key={loc} className="text-right py-1 px-2">{loc}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.locations.map((from) => (
                    <tr key={from} className="border-b border-gray-800/30">
                      <td className="py-1 px-2 font-medium text-gray-300">{from}</td>
                      {comparisonData.locations.map((to) => {
                        if (from === to) {
                          return <td key={to} className="py-1 px-2 text-right text-gray-600">—</td>;
                        }
                        const floor = physicsFloorMs(from, to);
                        return (
                          <td key={to} className="py-1 px-2 text-right font-mono text-yellow-400/80">
                            {floor != null ? `≥${floor}ms` : "?"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-gray-600">
              Minimum possible TTFB based on distance; actual TTFB includes processing, TLS, and network hops.
            </p>
          </div>

          {/* Metric comparison per region */}
          {comparisonData.metrics && Object.keys(comparisonData.metrics).length > 0 && (
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-800/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-400">Metric</th>
                    <th className="px-3 py-2 text-right text-gray-400">Value</th>
                    <th className="px-3 py-2 text-left text-gray-400">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {Object.entries(comparisonData.metrics).map(([key, val]) => (
                    <tr key={key} className="hover:bg-gray-800/30">
                      <td className="px-3 py-2 text-gray-200">{METRIC_LABELS[key] ?? key}</td>
                      <td className="px-3 py-2 text-right font-mono text-gray-300">
                        {fmtMetric(val as number, key)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-gray-800 text-gray-400">
                          aggregated
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {geoRuns.length === 0 && !dispatchMut.isPending && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          <p className="text-sm">No multi-geo runs yet.</p>
          <p className="mt-1 text-xs">Select regions above and dispatch a test to compare performance across geographies.</p>
        </div>
      )}
    </div>
  );
}
