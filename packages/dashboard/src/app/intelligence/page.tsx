"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";

const ratingColors: Record<string, string> = {
  good: "text-green-600 bg-green-50",
  "needs-improvement": "text-yellow-600 bg-yellow-50",
  poor: "text-red-600 bg-red-50",
};

export default function IntelligencePage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"forecast" | "rum" | "crux" | "attribution" | "capacity">("forecast");
  const [forecastMetric, setForecastMetric] = useState("lcp_ms");

  const { data: forecasts = [] } = useQuery({
    queryKey: ["forecasts", forecastMetric],
    queryFn: () => api.intelligence.forecast.list("default", forecastMetric),
    enabled: tab === "forecast",
  });

  const { data: rumSummary = [] } = useQuery({
    queryKey: ["rum-summary"],
    queryFn: () => api.intelligence.rum.summary("default"),
    enabled: tab === "rum",
  });

  const { data: cruxSnapshots = [] } = useQuery({
    queryKey: ["crux-snapshots"],
    queryFn: () => api.intelligence.crux.list("default"),
    enabled: tab === "crux",
  });

  const { data: attributions = [] } = useQuery({
    queryKey: ["attributions"],
    queryFn: () => api.intelligence.attribution.list("default"),
    enabled: tab === "attribution",
  });

  const { data: capacityReports = [] } = useQuery({
    queryKey: ["capacity-reports"],
    queryFn: () => api.intelligence.capacity.listReports("default"),
    enabled: tab === "capacity",
  });

  const generateForecast = useMutation({
    mutationFn: () => api.intelligence.forecast.generate({ project_id: "default", metric: forecastMetric, horizon_days: 30 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["forecasts"] }),
  });

  const tabs = [
    { key: "forecast", label: "Forecasting" },
    { key: "rum", label: "RUM" },
    { key: "crux", label: "CrUX" },
    { key: "attribution", label: "ML Attribution" },
    { key: "capacity", label: "Capacity" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          Advanced analytics: forecasting, RUM/CrUX ingestion, SHAP attribution, capacity planning
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Forecast Tab */}
      {tab === "forecast" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={forecastMetric} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForecastMetric(e.target.value)} className="rounded border bg-background px-3 py-1.5 text-sm">
              <option value="lcp_ms">LCP</option>
              <option value="fcp_ms">FCP</option>
              <option value="cls">CLS</option>
              <option value="ttfb_ms">TTFB</option>
              <option value="inp_ms">INP</option>
            </select>
            <button onClick={() => generateForecast.mutate()} disabled={generateForecast.isPending} className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50">
              Generate Forecast
            </button>
          </div>
          {forecasts.map((f: any) => (
            <div key={f.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div className="text-sm font-medium">{f.metric} — {f.horizon_days}-day forecast</div>
                <span className="text-xs text-muted-foreground">{new Date(f.computed_at).toLocaleString()}</span>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded border bg-background p-2">
                  <div className="text-xs text-muted-foreground">Trend</div>
                  <div className="font-medium text-sm">{f.trend_component?.direction} ({f.trend_component?.slope_per_day?.toFixed(2)}/day)</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-xs text-muted-foreground">R²</div>
                  <div className="font-medium text-sm">{f.trend_component?.r_squared?.toFixed(3)}</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-xs text-muted-foreground">MAPE</div>
                  <div className="font-medium text-sm">{f.accuracy?.mape?.toFixed(1)}%</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-xs text-muted-foreground">Weekly Pattern</div>
                  <div className="font-medium text-sm">{f.seasonal_component?.has_weekly_pattern ? "Yes" : "No"}</div>
                </div>
              </div>
              {f.forecast_data?.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Next 7 days: {f.forecast_data.slice(0, 7).map((p: any) => `${p.date}: ${p.yhat.toFixed(0)}`).join(" → ")}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* RUM Tab */}
      {tab === "rum" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Real User Monitoring — p75 Summary</h3>
          {rumSummary.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No RUM data. Integrate the SDK to start collecting field metrics.</div>}
          {rumSummary.map((s: any, i: number) => (
            <div key={i} className="rounded-lg border bg-card p-4">
              <div className="flex justify-between">
                <span className="text-sm font-medium">{s.origin}</span>
                <span className="text-xs text-muted-foreground">{s.device_type} · {s.sample_count} samples</span>
              </div>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {[["LCP", s.lcp_p75, "ms"], ["FCP", s.fcp_p75, "ms"], ["INP", s.inp_p75, "ms"], ["CLS", s.cls_p75, ""], ["TTFB", s.ttfb_p75, "ms"]].map(([label, val, unit]) => (
                  <div key={label as string} className="rounded border bg-background p-2 text-center">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-mono text-sm">{val != null ? `${Number(val).toFixed(label === "CLS" ? 3 : 0)}${unit}` : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CrUX Tab */}
      {tab === "crux" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Chrome User Experience Report Snapshots</h3>
          {cruxSnapshots.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No CrUX data. Configure CRUX_API_KEY to fetch field data.</div>}
          {cruxSnapshots.map((s: any) => (
            <div key={s.id} className="rounded-lg border bg-card p-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">{s.origin} ({s.form_factor})</span>
                <span className="text-xs text-muted-foreground">{s.collection_period_start} → {s.collection_period_end}</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  ["LCP", s.lcp_p75_ms, s.lcp_rating, "ms"],
                  ["FCP", s.fcp_p75_ms, s.fcp_rating, "ms"],
                  ["INP", s.inp_p75_ms, s.inp_rating, "ms"],
                  ["CLS", s.cls_p75, s.cls_rating, ""],
                  ["TTFB", s.ttfb_p75_ms, s.ttfb_rating, "ms"],
                ].map(([label, val, rating, unit]) => (
                  <div key={label as string} className="rounded border bg-background p-2 text-center">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="font-mono text-sm">{val != null ? `${Number(val).toFixed(label === "CLS" ? 3 : 0)}${unit}` : "—"}</div>
                    {rating && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${ratingColors[rating as string] ?? ""}`}>{rating}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ML Attribution Tab */}
      {tab === "attribution" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">SHAP-based Feature Attribution</h3>
          {attributions.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No attributions yet. Run attribution analysis from the anomalies view.</div>}
          {attributions.map((a: any) => (
            <div key={a.id} className="rounded-lg border bg-card p-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">{a.target_metric}</span>
                <span className="text-xs text-muted-foreground">Confidence: {(a.confidence * 100).toFixed(0)}%</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{a.explanation}</p>
              {a.top_contributors?.length > 0 && (
                <div className="space-y-1">
                  {a.top_contributors.map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-32 font-mono text-xs truncate">{f.feature}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${f.direction === "positive" ? "bg-red-400" : "bg-green-400"}`}
                          style={{ width: `${Math.min(Math.abs(f.shap_value) * 100, 100)}%` }} />
                      </div>
                      <span className="text-xs w-14 text-right font-mono">{f.shap_value.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Capacity Tab */}
      {tab === "capacity" && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Capacity Planning Reports</h3>
          {capacityReports.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No capacity reports. Generate one from completed load runs.</div>}
          {capacityReports.map((r: any) => (
            <div key={r.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded border bg-background p-2">
                  <div className="text-xs text-muted-foreground">Max Sustainable VUs</div>
                  <div className="text-lg font-bold">{r.max_sustainable_vus ?? "—"}</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-xs text-muted-foreground">Headroom</div>
                  <div className="text-lg font-bold">{r.headroom_percent != null ? `${r.headroom_percent}%` : "—"}</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-xs text-muted-foreground">Runs Analyzed</div>
                  <div className="text-lg font-bold">{r.load_runs_analyzed?.length ?? 0}</div>
                </div>
                <div className="rounded border bg-background p-2">
                  <div className="text-xs text-muted-foreground">Horizon</div>
                  <div className="text-lg font-bold">{r.forecast_horizon_days}d</div>
                </div>
              </div>
              {r.recommendations?.length > 0 && (
                <div className="space-y-1">
                  {r.recommendations.map((rec: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm rounded bg-muted/50 p-2">
                      <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${rec.priority === "high" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{rec.priority}</span>
                      <div>
                        <span className="font-medium">{rec.resource}:</span> {rec.recommendation}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
