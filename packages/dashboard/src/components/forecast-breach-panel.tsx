"use client";

/**
 * E-59: Forecast Breach Warning Panel
 *
 * Displays breach warnings for metrics that are projected to
 * exceed their budget thresholds. Shows urgency, confidence,
 * and a "Notify" button to dispatch alerts.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";

interface BreachWarning {
  metric: string;
  budget_threshold: number;
  will_breach: boolean;
  breach_date: string | null;
  days_until_breach: number | null;
  weeks_until_breach: number | null;
  current_trend: {
    direction: "improving" | "degrading" | "stable";
    slope_per_day: number;
    r_squared: number;
  };
  confidence: "high" | "medium" | "low";
  reason: string;
}

interface ForecastBreachPanelProps {
  warnings: BreachWarning[];
  projectId: string;
  budgets: { metric: string; threshold: number }[];
  onNotify?: (warnings: BreachWarning[]) => void;
  apiNotify?: (data: { project_id: string; budgets: { metric: string; threshold: number }[]; environment?: string }) => Promise<unknown>;
}

export function ForecastBreachPanel({
  warnings,
  projectId,
  budgets,
  apiNotify,
}: ForecastBreachPanelProps) {
  const queryClient = useQueryClient();

  const notifyMut = useMutation({
    mutationFn: () =>
      apiNotify
        ? apiNotify({ project_id: projectId, budgets })
        : Promise.resolve([]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (warnings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center gap-2">
          <span className="text-green-400 text-sm">✓</span>
          <span className="text-sm text-gray-400">
            No budget breaches projected in the forecast window.
          </span>
        </div>
      </div>
    );
  }

  const urgencyColor = (days: number | null) => {
    if (days == null) return "text-gray-400";
    if (days <= 7) return "text-red-400";
    if (days <= 21) return "text-yellow-400";
    return "text-blue-400";
  };

  const confidenceBadge = (c: string) => {
    switch (c) {
      case "high":
        return "bg-red-900/30 text-red-400 border-red-800";
      case "medium":
        return "bg-yellow-900/30 text-yellow-400 border-yellow-800";
      default:
        return "bg-gray-800 text-gray-400 border-gray-700";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 text-sm">⚠</span>
          <span className="text-sm font-medium text-yellow-300">
            {warnings.length} budget breach{warnings.length > 1 ? "es" : ""} projected
          </span>
        </div>
        {apiNotify && (
          <button
            onClick={() => notifyMut.mutate()}
            disabled={notifyMut.isPending}
            className="rounded-md bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-500 disabled:opacity-50 transition-colors"
          >
            {notifyMut.isPending ? "Sending…" : "Send Alerts"}
          </button>
        )}
      </div>

      {notifyMut.isSuccess && (
        <p className="text-xs text-green-400">
          ✓ Breach notifications dispatched successfully.
        </p>
      )}
      {notifyMut.isError && (
        <p className="text-xs text-red-400">
          Failed to send notifications: {(notifyMut.error as any)?.message ?? "Unknown error"}
        </p>
      )}

      {warnings.map((w, idx) => (
        <div
          key={w.metric + idx}
          className="rounded-lg border border-gray-800 bg-gray-900 p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-200">
                {w.metric}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${confidenceBadge(
                  w.confidence,
                )}`}
              >
                {w.confidence} confidence
              </span>
            </div>
            <span
              className={`text-sm font-mono font-bold ${urgencyColor(
                w.days_until_breach,
              )}`}
            >
              {w.weeks_until_breach != null
                ? `~${w.weeks_until_breach} weeks`
                : "—"}
            </span>
          </div>

          <p className="text-xs text-gray-400 mb-2">{w.reason}</p>

          <div className="flex flex-wrap gap-4 text-[10px] text-gray-500">
            <span>
              Budget:{" "}
              <span className="font-mono text-gray-300">
                {w.budget_threshold}
              </span>
            </span>
            {w.breach_date && (
              <span>
                Breach date:{" "}
                <span className="font-mono text-gray-300">
                  {w.breach_date}
                </span>
              </span>
            )}
            <span>
              Trend:{" "}
              <span
                className={`font-medium ${
                  w.current_trend.direction === "degrading"
                    ? "text-red-400"
                    : w.current_trend.direction === "improving"
                    ? "text-green-400"
                    : "text-gray-400"
                }`}
              >
                {w.current_trend.direction}
              </span>
              <span className="ml-1 text-gray-500">
                ({w.current_trend.slope_per_day > 0 ? "+" : ""}
                {w.current_trend.slope_per_day}/day)
              </span>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
