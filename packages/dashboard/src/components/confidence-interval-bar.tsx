"use client";

/**
 * E-42: Confidence Interval Bar Component
 *
 * Renders a horizontal bar showing a point estimate with
 * error bars representing the CI lower/upper bounds.
 * Used in gate results and metric health cards.
 */

interface ConfidenceIntervalBarProps {
  estimate: number;
  lower: number;
  upper: number;
  threshold?: number;
  label?: string;
  unit?: string;
  isReliable?: boolean;
  maxValue?: number;
  className?: string;
}

export function ConfidenceIntervalBar({
  estimate,
  lower,
  upper,
  threshold,
  label,
  unit = "",
  isReliable = true,
  maxValue,
  className = "",
}: ConfidenceIntervalBarProps) {
  const max = maxValue ?? Math.max(upper, threshold ?? 0) * 1.2;
  const pctLower = (lower / max) * 100;
  const pctEstimate = (estimate / max) * 100;
  const pctUpper = (upper / max) * 100;
  const pctThreshold = threshold ? (threshold / max) * 100 : null;

  const passesThreshold = threshold ? estimate <= threshold : true;

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">{label}</span>
          <span className="font-mono text-gray-300">
            {estimate.toFixed(1)}{unit}
            <span className="text-gray-500 ml-1">
              [{lower.toFixed(1)}–{upper.toFixed(1)}]
            </span>
          </span>
        </div>
      )}
      <div className="relative h-4 rounded bg-gray-800 overflow-hidden">
        {/* CI range */}
        <div
          className={`absolute top-1 h-2 rounded ${
            isReliable ? "bg-indigo-500/30" : "bg-gray-600/30"
          }`}
          style={{
            left: `${Math.max(pctLower, 0)}%`,
            width: `${Math.max(pctUpper - pctLower, 1)}%`,
          }}
        />
        {/* Point estimate */}
        <div
          className={`absolute top-0.5 h-3 w-1 rounded ${
            passesThreshold ? "bg-green-400" : "bg-red-400"
          }`}
          style={{ left: `${Math.min(pctEstimate, 99)}%` }}
        />
        {/* Threshold line */}
        {pctThreshold != null && (
          <div
            className="absolute top-0 h-full w-px bg-yellow-500/70"
            style={{ left: `${Math.min(pctThreshold, 100)}%` }}
            title={`Threshold: ${threshold}${unit}`}
          />
        )}
      </div>
      {!isReliable && (
        <p className="text-[10px] text-yellow-500/70 italic">
          Low sample size — CI may be unreliable
        </p>
      )}
    </div>
  );
}

/**
 * E-42: Gate Result with CI display
 *
 * Shows a gate evaluation outcome with confidence interval
 * visualization when CI data is available.
 */
interface GateResultCIProps {
  gateName: string;
  metric: string;
  status: "passed" | "failed" | "skipped";
  actualValue?: number;
  threshold?: number;
  computedThreshold?: number;
  baselineValue?: number;
  ciLower?: number;
  ciUpper?: number;
  ciReliable?: boolean;
  policy: string;
  unit?: string;
}

export function GateResultCI({
  gateName,
  metric,
  status,
  actualValue,
  threshold,
  computedThreshold,
  baselineValue,
  ciLower,
  ciUpper,
  ciReliable,
  policy,
  unit = "ms",
}: GateResultCIProps) {
  const statusColors = {
    passed: "border-green-800 bg-green-900/20",
    failed: "border-red-800 bg-red-900/20",
    skipped: "border-gray-700 bg-gray-800/20",
  };

  const statusBadge = {
    passed: "bg-green-900/50 text-green-400",
    failed: "bg-red-900/50 text-red-400",
    skipped: "bg-gray-800/50 text-gray-500",
  };

  const effectiveThreshold = computedThreshold ?? threshold;

  return (
    <div className={`rounded-lg border p-3 ${statusColors[status]}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{gateName}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge[status]}`}>
            {status}
          </span>
          <span className="text-[10px] text-gray-500 uppercase">{policy}</span>
        </div>
        <span className="text-xs text-gray-500">{metric}</span>
      </div>

      {actualValue != null && ciLower != null && ciUpper != null && (
        <ConfidenceIntervalBar
          estimate={actualValue}
          lower={ciLower}
          upper={ciUpper}
          threshold={effectiveThreshold}
          unit={unit}
          isReliable={ciReliable ?? true}
        />
      )}

      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-gray-500">
        {actualValue != null && (
          <span>Actual: <span className="font-mono text-gray-300">{actualValue.toFixed(1)}{unit}</span></span>
        )}
        {effectiveThreshold != null && (
          <span>Threshold: <span className="font-mono text-gray-300">{effectiveThreshold.toFixed(1)}{unit}</span></span>
        )}
        {baselineValue != null && (
          <span>Baseline: <span className="font-mono text-gray-300">{baselineValue.toFixed(1)}{unit}</span></span>
        )}
      </div>
    </div>
  );
}
