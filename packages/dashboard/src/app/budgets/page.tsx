"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import {
  DollarSign,
  Plus,
  Trash2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Monitor,
  Smartphone,
  Layers,
  TrendingDown,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface Budget {
  id: string;
  project_id: string;
  route: string;
  metric: string;
  device_class: "desktop" | "mobile" | "all";
  threshold: number;
  original_threshold: number;
  policy: "block" | "warn" | "info";
  variance_tolerance: number;
  auto_ratchet: boolean;
  ratchet_pct: number;
  enabled: boolean;
  last_ratcheted_at: string | null;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
}

const METRICS = [
  { value: "lcp_ms", label: "LCP (ms)", defaultThreshold: 2500 },
  { value: "fcp_ms", label: "FCP (ms)", defaultThreshold: 1800 },
  { value: "cls", label: "CLS", defaultThreshold: 0.1 },
  { value: "tbt_ms", label: "TBT (ms)", defaultThreshold: 200 },
  { value: "tti_ms", label: "TTI (ms)", defaultThreshold: 3800 },
  { value: "si_ms", label: "SI (ms)", defaultThreshold: 3400 },
  { value: "bundle_size_kb", label: "Bundle Size (KB)", defaultThreshold: 200 },
];

const DEVICE_ICON: Record<string, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  all: Layers,
};

const POLICY_COLORS: Record<string, string> = {
  block: "bg-red-500/10 text-red-400 border-red-500/30",
  warn: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/30",
};

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [ratchetLoading, setRatchetLoading] = useState(false);
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set(["*"]));

  // Create form state
  const [newBudget, setNewBudget] = useState({
    metric: "lcp_ms",
    route: "*",
    device_class: "all" as "desktop" | "mobile" | "all",
    threshold: 2500,
    policy: "warn" as "block" | "warn" | "info",
    variance_tolerance: 0,
    auto_ratchet: false,
    ratchet_pct: 5,
  });

  const loadBudgets = useCallback(async (projectId?: string) => {
    setLoading(true);
    try {
      const b = await api.budgets.list(projectId || undefined);
      setBudgets(b);
    } catch (e) {
      console.error("Failed to load budgets:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: fetch projects and auto-select the first one
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const p = await api.projects.list();
        if (cancelled) return;
        setProjects(p);
        const first = p.length > 0 ? p[0].id : "";
        setSelectedProject(first);
        const b = await api.budgets.list(first || undefined);
        if (cancelled) return;
        setBudgets(b);
      } catch (e) {
        console.error("Failed to load budgets:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  // Reload budgets when user changes project
  const handleProjectChange = useCallback((projectId: string) => {
    setSelectedProject(projectId);
    loadBudgets(projectId);
  }, [loadBudgets]);

  const load = useCallback(() => loadBudgets(selectedProject), [loadBudgets, selectedProject]);

  const handleCreate = async () => {
    if (!selectedProject) return;
    try {
      await api.budgets.create({ ...newBudget, project_id: selectedProject });
      setShowCreate(false);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this budget?")) return;
    try {
      await api.budgets.delete(id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleRatchet = async () => {
    if (!selectedProject) return;
    setRatchetLoading(true);
    try {
      const results = await api.budgets.ratchet(selectedProject);
      const ratcheted = Array.isArray(results) ? results.filter((r: any) => r.ratcheted).length : 0;
      alert(`Ratcheted ${ratcheted} budget(s)`);
      load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setRatchetLoading(false);
    }
  };

  // Group budgets by route
  const grouped = budgets.reduce<Record<string, Budget[]>>((acc, b) => {
    (acc[b.route] ??= []).push(b);
    return acc;
  }, {});

  const toggleRoute = (route: string) => {
    setExpandedRoutes((prev) => {
      const next = new Set(prev);
      next.has(route) ? next.delete(route) : next.add(route);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            Performance Budgets
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Route-level budgets with ratcheting, variance tolerance, and device-class segmentation
          </p>
          <div className="mt-3 rounded-md border border-gray-800 bg-gray-900/60 px-4 py-3 text-xs text-gray-400 leading-relaxed max-w-2xl">
            <p className="font-medium text-gray-300 mb-1">How Ratchet Budgets Work</p>
            <p>
              A <span className="text-emerald-400 font-medium">ratchet budget</span> automatically tightens its threshold when your performance improves.
              After each successful run, the threshold is reduced by the configured <span className="text-gray-200">Ratchet %</span>, ensuring
              your performance never regresses beyond the new baseline. The <span className="text-gray-200">Original</span> column preserves
              the initial threshold for reference.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRatchet}
            disabled={ratchetLoading || !selectedProject}
            className="flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            <TrendingDown className="h-3.5 w-3.5" />
            {ratchetLoading ? "Ratcheting..." : "Ratchet Budgets"}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Budget
          </button>
        </div>
      </div>

      {/* Project selector */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400">Project:</label>
        <select
          value={selectedProject}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button onClick={load} className="text-gray-500 hover:text-gray-300">
          <RefreshCw className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-600">{budgets.length} budget(s)</span>
      </div>

      {/* Budget list grouped by route */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : budgets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-700 p-8 text-center">
          <DollarSign className="mx-auto h-8 w-8 text-gray-600" />
          <p className="mt-2 text-sm text-gray-500">No budgets defined yet</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm text-indigo-400 hover:text-indigo-300"
          >
            Create your first budget
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).sort(([a], [b]) => a === "*" ? -1 : a.localeCompare(b)).map(([route, items]) => {
            const expanded = expandedRoutes.has(route);
            return (
              <div key={route} className="rounded-lg border border-gray-800 bg-gray-900/50">
                <button
                  onClick={() => toggleRoute(route)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-800/50"
                >
                  {expanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                  <span className="font-mono text-sm text-gray-300">{route === "*" ? "All Routes (default)" : route}</span>
                  <span className="ml-auto text-xs text-gray-600">{items.length} budget(s)</span>
                </button>
                {expanded && (
                  <div className="border-t border-gray-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500">
                          <th className="px-4 py-2 text-left font-medium" title="The performance metric being tracked (e.g. LCP, FCP, CLS)">Metric</th>
                          <th className="px-4 py-2 text-left font-medium" title="Which device class this budget applies to: desktop, mobile, or all">Device</th>
                          <th className="px-4 py-2 text-right font-medium" title="Current threshold — runs exceeding this value trigger the policy action. Lowered automatically when ratchet is on.">Threshold</th>
                          <th className="px-4 py-2 text-right font-medium" title="The initial threshold when this budget was first created, before any ratcheting">Original</th>
                          <th className="px-4 py-2 text-center font-medium" title="Action taken when a run exceeds the budget: Block (fail the gate), Warn (alert but pass), Info (log only)">Policy</th>
                          <th className="px-4 py-2 text-center font-medium" title="Allowed standard-deviation multiplier above the threshold before triggering. 0 = strict, higher = more lenient to natural variance.">Variance</th>
                          <th className="px-4 py-2 text-center font-medium" title="When enabled, the threshold is automatically tightened by the ratchet % after each passing run">Ratchet</th>
                          <th className="px-4 py-2 text-right font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {items.map((b) => {
                          const DeviceIcon = DEVICE_ICON[b.device_class] ?? Layers;
                          const ratcheted = b.threshold < b.original_threshold;
                          return (
                            <tr key={b.id} className="hover:bg-gray-800/30">
                              <td className="px-4 py-2 font-medium text-gray-300">
                                {METRICS.find((m) => m.value === b.metric)?.label ?? b.metric}
                              </td>
                              <td className="px-4 py-2">
                                <span className="flex items-center gap-1 text-gray-400">
                                  <DeviceIcon className="h-3.5 w-3.5" />
                                  {b.device_class}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-gray-300">
                                {b.threshold}
                                {ratcheted && (
                                  <TrendingDown className="ml-1 inline h-3 w-3 text-emerald-400" />
                                )}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-gray-500">
                                {b.original_threshold}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${POLICY_COLORS[b.policy]}`}>
                                  {b.policy}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center text-gray-400">
                                {b.variance_tolerance > 0 ? (
                                  <span className="text-xs">{b.variance_tolerance}x stddev</span>
                                ) : (
                                  <span className="text-xs text-gray-600">off</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {b.auto_ratchet ? (
                                  <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-400" />
                                ) : (
                                  <span className="text-xs text-gray-600">off</span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <button
                                  onClick={() => handleDelete(b.id)}
                                  className="text-gray-600 hover:text-red-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create budget modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-lg rounded-lg border border-gray-700 bg-gray-900 p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">New Budget</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Metric</label>
                  <select
                    value={newBudget.metric}
                    onChange={(e) => {
                      const m = METRICS.find((x) => x.value === e.target.value);
                      setNewBudget((p) => ({ ...p, metric: e.target.value, threshold: m?.defaultThreshold ?? p.threshold }));
                    }}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300"
                  >
                    {METRICS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Route</label>
                  <input
                    value={newBudget.route}
                    onChange={(e) => setNewBudget((p) => ({ ...p, route: e.target.value }))}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300"
                    placeholder="* (all routes)"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Threshold</label>
                  <input
                    type="number"
                    value={newBudget.threshold}
                    onChange={(e) => setNewBudget((p) => ({ ...p, threshold: Number(e.target.value) }))}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Device Class</label>
                  <select
                    value={newBudget.device_class}
                    onChange={(e) => setNewBudget((p) => ({ ...p, device_class: e.target.value as any }))}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300"
                  >
                    <option value="all">All</option>
                    <option value="desktop">Desktop</option>
                    <option value="mobile">Mobile</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Policy</label>
                  <select
                    value={newBudget.policy}
                    onChange={(e) => setNewBudget((p) => ({ ...p, policy: e.target.value as any }))}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300"
                  >
                    <option value="block">Block</option>
                    <option value="warn">Warn</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Variance Tolerance (stddev multiplier)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newBudget.variance_tolerance}
                    onChange={(e) => setNewBudget((p) => ({ ...p, variance_tolerance: Number(e.target.value) }))}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Ratchet %</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={newBudget.auto_ratchet}
                      onChange={(e) => setNewBudget((p) => ({ ...p, auto_ratchet: e.target.checked }))}
                      className="rounded border-gray-600"
                    />
                    <input
                      type="number"
                      step="1"
                      value={newBudget.ratchet_pct}
                      onChange={(e) => setNewBudget((p) => ({ ...p, ratchet_pct: Number(e.target.value) }))}
                      disabled={!newBudget.auto_ratchet}
                      className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-md border border-gray-700 px-4 py-1.5 text-sm text-gray-400 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm text-white hover:bg-indigo-500"
              >
                Create Budget
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
