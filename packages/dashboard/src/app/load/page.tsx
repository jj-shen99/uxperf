"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState, useMemo } from "react";
import { useProjects } from "@/hooks/use-projects";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const STATUS_STYLES: Record<string, string> = {
  queued:    "bg-gray-700/40 text-gray-300",
  warming:   "bg-yellow-900/40 text-yellow-300",
  running:   "bg-blue-900/40 text-blue-300",
  cooling:   "bg-indigo-900/40 text-indigo-300",
  completed: "bg-green-900/40 text-green-300",
  failed:    "bg-red-900/40 text-red-300",
  cancelled: "bg-gray-800/40 text-gray-500",
};

const CACHE_OPTIONS = ["warm", "cold", "production_replay"] as const;
const ENGINE_OPTIONS = ["k6_browser", "playwright_lighthouse", "wpt", "sitespeed"] as const;

interface Stage {
  duration_s: number;
  target_vus: number;
  ramp_type?: "linear" | "step";
}

function StagePreview({ stages }: { stages: Stage[] }) {
  if (stages.length === 0) return null;
  const maxVus = Math.max(...stages.map((s) => s.target_vus), 1);
  const totalDur = stages.reduce((s, st) => s + st.duration_s, 0);
  if (totalDur === 0) return null;

  // Build a time-series of VU counts for area chart
  const points: { time: number; vus: number }[] = [];
  let elapsed = 0;
  let prevVus = 0;
  for (const stage of stages) {
    points.push({ time: elapsed, vus: prevVus });
    elapsed += stage.duration_s;
    points.push({ time: elapsed, vus: stage.target_vus });
    prevVus = stage.target_vus;
  }

  return (
    <ResponsiveContainer width="100%" height={100}>
      <AreaChart data={points} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="vuGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#818cf8" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" tick={{ fill: "#6b7280", fontSize: 9 }} tickFormatter={(v) => `${v}s`} />
        <YAxis tick={{ fill: "#6b7280", fontSize: 9 }} domain={[0, Math.ceil(maxVus * 1.1)]} />
        <Area type="stepAfter" dataKey="vus" stroke="#818cf8" fill="url(#vuGrad)" strokeWidth={1.5} />
        <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`${v} VUs`, "Virtual Users"]} labelFormatter={(v) => `${v}s`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function LoadTestingPage() {
  const queryClient = useQueryClient();
  const { projects, projectId, setProjectId } = useProjects();
  const { isAdmin } = useCurrentUser();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [showCreateProfile, setShowCreateProfile] = useState(false);
  const [showQuickRun, setShowQuickRun] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Profile form state
  const [profileMode, setProfileMode] = useState<"linear" | "custom">("linear");
  const [pName, setPName] = useState("");
  const [pDesc, setPDesc] = useState("");
  const [pVUs, setPVUs] = useState(10);
  const [pCache, setPCache] = useState<string>("warm");
  const [pEngine, setPEngine] = useState<string>("k6_browser");
  const [pRampUp, setPRampUp] = useState(30);
  const [pDuration, setPDuration] = useState(120);
  const [pStages, setPStages] = useState<Stage[]>([
    { duration_s: 30, target_vus: 10, ramp_type: "linear" },
    { duration_s: 60, target_vus: 10, ramp_type: "linear" },
    { duration_s: 30, target_vus: 0, ramp_type: "linear" },
  ]);

  // Quick run state
  const [qVUs, setQVUs] = useState(5);
  const [qDuration, setQDuration] = useState(60);
  const [qCache, setQCache] = useState<string>("warm");
  const [qUrl, setQUrl] = useState<string>("");
  const [qScriptId, setQScriptId] = useState<string>("");

  // Profile script state
  const [pScriptId, setPScriptId] = useState<string>("");
  const [profileLaunchUrl, setProfileLaunchUrl] = useState<string>("");
  const [launchingProfileId, setLaunchingProfileId] = useState<string | null>(null);

  // Edit profile state
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eVUs, setEVUs] = useState(10);
  const [eCache, setECache] = useState<string>("warm");
  const [eScriptId, setEScriptId] = useState<string>("");
  const [eStages, setEStages] = useState<Stage[]>([]);
  const [eTotalDuration, setETotalDuration] = useState(120);

  // Console log panel
  const [expandedRunLogs, setExpandedRunLogs] = useState<Set<string>>(new Set());

  // Queries
  const { data: engineConfig = {} } = useQuery({
    queryKey: ["config", "engine"],
    queryFn: () => api.config.getAll("engine."),
  });
  const k6Enabled = engineConfig["engine.k6_browser_enabled"] === "true";

  const { data: loadRuns = [], isLoading: runsLoading } = useQuery({
    queryKey: ["load-runs", projectId],
    queryFn: () => api.load.runs.list(projectId || undefined),
    refetchInterval: 5000,
  });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["load-profiles", projectId],
    queryFn: () => api.load.profiles.list(projectId || undefined),
    enabled: !!projectId,
  });

  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts", projectId],
    queryFn: () => api.scripts.list(projectId || undefined),
    enabled: !!projectId,
  });

  const { data: correlation } = useQuery({
    queryKey: ["load-correlation", selectedRun],
    queryFn: () => api.load.correlation(selectedRun!),
    enabled: !!selectedRun,
  });

  const { data: telemetrySummary } = useQuery({
    queryKey: ["load-telemetry", selectedRun],
    queryFn: () => api.load.telemetry.summary(selectedRun!),
    enabled: !!selectedRun,
  });

  // Mutations
  const createProfile = useMutation({
    mutationFn: (data: any) => api.load.profiles.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load-profiles"] });
      setShowCreateProfile(false);
      setPName(""); setPDesc("");
    },
  });

  const deleteProfile = useMutation({
    mutationFn: (id: string) => api.load.profiles.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["load-profiles"] }),
  });

  const [updateError, setUpdateError] = useState<string | null>(null);
  const updateProfile = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.load.profiles.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load-profiles"] });
      setEditingProfileId(null);
      setUpdateError(null);
    },
    onError: (err: any) => {
      setUpdateError(err?.message ?? "Failed to update profile");
    },
  });

  const createRun = useMutation({
    mutationFn: (data: any) => api.load.runs.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["load-runs"] }),
  });

  const cancelRun = useMutation({
    mutationFn: (id: string) => api.load.runs.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["load-runs"] }),
  });

  const deleteRun = useMutation({
    mutationFn: (id: string) => api.load.runs.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["load-runs"] }),
  });

  const addStage = () => setPStages([...pStages, { duration_s: 30, target_vus: pVUs, ramp_type: "linear" }]);
  const removeStage = (i: number) => setPStages(pStages.filter((_, idx) => idx !== i));
  const updateStage = (i: number, field: keyof Stage, value: number | string) =>
    setPStages(pStages.map((s, idx) => idx === i ? { ...s, [field]: field === "ramp_type" ? value : Number(value) } : s));

  // Edit profile stage helpers
  const addEStage = () => setEStages([...eStages, { duration_s: 30, target_vus: eVUs, ramp_type: "linear" }]);
  const removeEStage = (i: number) => setEStages(eStages.filter((_, idx) => idx !== i));
  const updateEStage = (i: number, field: keyof Stage, value: number | string) =>
    setEStages(eStages.map((s, idx) => idx === i ? { ...s, [field]: field === "ramp_type" ? value : Number(value) } : s));

  const startEditing = (p: any) => {
    setEditingProfileId(p.id);
    setEName(p.name);
    setEDesc(p.description ?? "");
    setEVUs(p.target_vus);
    setECache(p.cache_state ?? "warm");
    setEScriptId(p.script_id ?? "");
    setEStages(p.stages ?? []);
    setETotalDuration(p.stages?.reduce((s: number, st: Stage) => s + st.duration_s, 0) ?? 120);
  };

  const handleUpdateProfile = () => {
    if (!editingProfileId || !eName.trim()) return;
    setUpdateError(null);
    updateProfile.mutate({
      id: editingProfileId,
      data: {
        name: eName,
        description: eDesc || null,
        stages: eStages,
        target_vus: eVUs,
        cache_state: eCache,
        script_id: eScriptId || null,
      },
    });
  };

  const toggleRunLog = (runId: string) => {
    setExpandedRunLogs((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId); else next.add(runId);
      return next;
    });
  };

  const totalStageDuration = (stages: Stage[]) => stages.reduce((s, st) => s + st.duration_s, 0);

  const buildLinearStages = (vus: number, rampUp: number, duration: number): Stage[] => {
    const holdDuration = Math.max(duration - rampUp * 2, 0);
    return [
      { duration_s: rampUp, target_vus: vus, ramp_type: "linear" },
      ...(holdDuration > 0 ? [{ duration_s: holdDuration, target_vus: vus, ramp_type: "linear" as const }] : []),
      { duration_s: rampUp, target_vus: 0, ramp_type: "linear" },
    ];
  };

  const stageMaxVUs = (stages: Stage[]) => Math.max(0, ...stages.map((s) => s.target_vus));

  const handleCreateProfile = () => {
    if (!pName.trim() || !projectId) return;
    const stages = profileMode === "linear" ? buildLinearStages(pVUs, pRampUp, pDuration) : pStages;
    createProfile.mutate({
      project_id: projectId,
      name: pName,
      description: pDesc || undefined,
      stages,
      target_vus: pVUs,
      cache_state: pCache,
      ...(pScriptId ? { script_id: pScriptId } : {}),
    });
  };

  const handleQuickRun = () => {
    if (!projectId || !qUrl.trim()) return;
    createRun.mutate({
      project_id: projectId,
      target_vus: qVUs,
      stages: [
        { duration_s: Math.round(qDuration * 0.2), target_vus: qVUs, ramp_type: "linear" },
        { duration_s: Math.round(qDuration * 0.6), target_vus: qVUs },
        { duration_s: Math.round(qDuration * 0.2), target_vus: 0, ramp_type: "linear" },
      ],
      cache_state: qCache,
      url: qUrl.trim(),
      ...(qScriptId ? { script_id: qScriptId } : {}),
    });
    setShowQuickRun(false);
  };

  // Correlation chart data
  const correlationBarData = correlation?.correlations?.map((c: any) => ({
    name: c.server_metric,
    r: Math.round(c.pearson_r * 100) / 100,
    fill: c.direction === "positive" ? "#f87171" : c.direction === "negative" ? "#34d399" : "#6b7280",
  })) ?? [];

  const runStats = useMemo(() => {
    const active = loadRuns.filter((r: any) => ["queued", "warming", "running"].includes(r.status)).length;
    const completed = loadRuns.filter((r: any) => r.status === "completed").length;
    const failed = loadRuns.filter((r: any) => r.status === "failed").length;
    const totalVUMin = loadRuns.reduce((s: number, r: any) => s + (Number(r.vu_minutes) || 0), 0);
    const totalCost = loadRuns.reduce((s: number, r: any) => s + (r.cost_estimate?.total_cost ?? 0), 0);
    return { total: loadRuns.length, active, completed, failed, totalVUMin, totalCost };
  }, [loadRuns]);

  const filteredRuns = useMemo(() => {
    const list = statusFilter === "all" ? loadRuns : loadRuns.filter((r: any) => r.status === statusFilter);
    const activeStatuses = new Set(["queued", "warming", "running"]);
    return [...list].sort((a: any, b: any) => {
      const aActive = activeStatuses.has(a.status) ? 1 : 0;
      const bActive = activeStatuses.has(b.status) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [loadRuns, statusFilter]);

  const completedRunMetrics = useMemo(() => {
    const completed = loadRuns.filter((r: any) => r.status === "completed" && r.metrics);
    if (completed.length === 0) return null;
    const metrics = ["lcp", "fcp", "cls", "ttfb", "inp", "tbt"];
    const labels: Record<string, string> = { lcp: "LCP", fcp: "FCP", cls: "CLS", ttfb: "TTFB", inp: "INP", tbt: "TBT" };
    const units: Record<string, string> = { lcp: "ms", fcp: "ms", cls: "", ttfb: "ms", inp: "ms", tbt: "ms" };
    return metrics.map((m) => {
      const vals = completed.map((r: any) => Number(r.metrics?.[m])).filter((v: number) => !isNaN(v) && v > 0);
      if (vals.length === 0) return null;
      const avg = vals.reduce((a: number, b: number) => a + b, 0) / vals.length;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return { metric: m, label: labels[m], unit: units[m], avg, min, max, count: vals.length };
    }).filter(Boolean);
  }, [loadRuns]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Load Testing</h1>
          <p className="mt-1 text-sm text-gray-400">
            Concurrent browser load tests with k6, server telemetry correlation, and VU-parameterized gates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="">Select a project</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowQuickRun(!showQuickRun)}
            disabled={!projectId}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            Quick Run
          </button>
          <button
            onClick={() => setShowCreateProfile(!showCreateProfile)}
            disabled={!projectId}
            className="rounded-md border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            New Profile
          </button>
        </div>
      </div>

      {/* k6 Diagnostic Banner */}
      {!k6Enabled && (
        <div className="rounded-lg border border-yellow-800/50 bg-yellow-900/15 px-4 py-3 flex items-start gap-3">
          <span className="mt-0.5 text-yellow-400 text-lg">⚠</span>
          <div>
            <p className="text-sm font-medium text-yellow-300">k6 Browser Engine is Disabled</p>
            <p className="mt-0.5 text-xs text-yellow-400/80 leading-relaxed">
              Load tests will fail because the k6 adapter is not enabled. Go to{" "}
              <a href="/settings" className="underline text-yellow-300 hover:text-yellow-200">Settings</a>{" "}
              and toggle <strong>k6 Browser Engine</strong> to Enabled, or set the <code className="bg-yellow-900/40 px-1 rounded text-[10px]">K6_BROWSER_ENABLED=true</code>{" "}
              environment variable on the worker process.
            </p>
          </div>
        </div>
      )}

      {/* Quick Run Form */}
      {showQuickRun && (
        <div className="mx-auto w-full max-w-5xl rounded-lg border border-indigo-800/50 bg-indigo-900/20 p-5 space-y-3">
          <h3 className="text-sm font-medium text-indigo-300">Quick Run (Ramp Up → Steady → Ramp Down)</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Target URL <span className="text-red-400">*</span></label>
              <input type="url" placeholder="https://example.com" value={qUrl} onChange={(e) => setQUrl(e.target.value)} required
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Virtual Users</label>
              <input type="number" min={1} max={500} value={qVUs} onChange={(e) => setQVUs(Number(e.target.value))}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Total Duration (s)</label>
              <input type="number" min={10} max={3600} value={qDuration} onChange={(e) => setQDuration(Number(e.target.value))}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Cache State</label>
              <select value={qCache} onChange={(e) => setQCache(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
                {CACHE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Journey Script</label>
              <select value={qScriptId} onChange={(e) => setQScriptId(e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
                <option value="">Single URL (no script)</option>
                {scripts.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          {qScriptId && (
            <p className="text-[10px] text-indigo-300/70">
              Each VU will execute the full journey script. Per-link web vitals will be captured at each measure step.
            </p>
          )}
          <StagePreview stages={[
            { duration_s: Math.round(qDuration * 0.2), target_vus: qVUs },
            { duration_s: Math.round(qDuration * 0.6), target_vus: qVUs },
            { duration_s: Math.round(qDuration * 0.2), target_vus: 0 },
          ]} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowQuickRun(false)} className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800">Cancel</button>
            <button onClick={handleQuickRun} disabled={createRun.isPending || !qUrl.trim()} className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              {createRun.isPending ? "Launching..." : "Launch"}
            </button>
          </div>
        </div>
      )}

      {/* Create Profile Form */}
      {showCreateProfile && (
        <div className="mx-auto w-full max-w-5xl rounded-lg border border-gray-700 bg-gray-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-200">Create Load Profile</h3>
            <div className="flex rounded-md border border-gray-700 overflow-hidden">
              <button onClick={() => setProfileMode("linear")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${profileMode === "linear" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
                Linear
              </button>
              <button onClick={() => setProfileMode("custom")}
                className={`px-3 py-1 text-xs font-medium transition-colors ${profileMode === "custom" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"}`}>
                Custom Stages
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Profile Name</label>
              <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="e.g. Baseline 50VU"
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="Optional"
                className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200" />
            </div>
          </div>

          {profileMode === "linear" ? (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Threads (VUs)</label>
                  <input type="number" min={1} max={500} value={pVUs} onChange={(e) => setPVUs(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Ramp-Up (s)</label>
                  <input type="number" min={0} max={3600} value={pRampUp} onChange={(e) => setPRampUp(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Test Duration (s)</label>
                  <input type="number" min={1} max={7200} value={pDuration} onChange={(e) => setPDuration(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cache State</label>
                  <select value={pCache} onChange={(e) => setPCache(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
                    {CACHE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Journey Script</label>
                  <select value={pScriptId} onChange={(e) => setPScriptId(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
                    <option value="">Single URL (no script)</option>
                    {scripts.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              {pRampUp * 2 > pDuration && (
                <p className="text-xs text-yellow-400">Ramp-up &times; 2 ({pRampUp * 2}s) exceeds total duration ({pDuration}s). There will be no steady-state hold phase.</p>
              )}
              <div className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                <p className="text-[10px] text-gray-500 mb-1">Generated stages: ramp 0 → {pVUs} VUs over {pRampUp}s, hold {Math.max(pDuration - pRampUp * 2, 0)}s, ramp down {pRampUp}s</p>
                <StagePreview stages={buildLinearStages(pVUs, pRampUp, pDuration)} />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Target VUs</label>
                  <input type="number" min={1} max={500} value={pVUs} onChange={(e) => setPVUs(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Cache State</label>
                  <select value={pCache} onChange={(e) => setPCache(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
                    {CACHE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Engine</label>
                  <select value={pEngine} onChange={(e) => setPEngine(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
                    {ENGINE_OPTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Journey Script</label>
                  <select value={pScriptId} onChange={(e) => setPScriptId(e.target.value)}
                    className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200">
                    <option value="">Single URL (no script)</option>
                    {scripts.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Stages Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Ramp Stages</label>
                  <button onClick={addStage} className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-800">+ Add Stage</button>
                </div>
                <div className="space-y-2">
                  {pStages.map((stage, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-8 text-xs text-gray-600">#{i + 1}</span>
                      <div className="flex-1 grid grid-cols-3 gap-2">
                        <input type="number" min={1} value={stage.duration_s} onChange={(e) => updateStage(i, "duration_s", e.target.value)}
                          placeholder="Duration (s)" className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200" />
                        <input type="number" min={0} value={stage.target_vus} onChange={(e) => updateStage(i, "target_vus", e.target.value)}
                          placeholder="VUs" className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200" />
                        <select value={stage.ramp_type ?? "linear"} onChange={(e) => updateStage(i, "ramp_type", e.target.value)}
                          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200">
                          <option value="linear">Linear</option>
                          <option value="step">Step</option>
                        </select>
                      </div>
                      <button onClick={() => removeStage(i)} className="text-xs text-red-500 hover:text-red-400">Remove</button>
                    </div>
                  ))}
                </div>
                {pStages.length > 0 && stageMaxVUs(pStages) !== pVUs && (
                  <p className="mt-2 text-xs text-yellow-400">
                    Stage peak VUs ({stageMaxVUs(pStages)}) does not match Target VUs ({pVUs}). The peak stage should ramp to {pVUs} VUs.
                  </p>
                )}
                <div className="mt-3">
                  <StagePreview stages={pStages} />
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreateProfile(false)} className="rounded-md border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800">Cancel</button>
            <button onClick={handleCreateProfile} disabled={!pName.trim() || createProfile.isPending}
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50">
              {createProfile.isPending ? "Creating..." : "Create Profile"}
            </button>
          </div>
        </div>
      )}

      {/* Saved Profiles */}
      <div>
        <h2 className="text-sm font-medium text-gray-300 mb-3">Load Profiles</h2>
        {profiles.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {profiles.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-200">{p.name}</p>
                    {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setLaunchingProfileId(launchingProfileId === p.id ? null : p.id); setProfileLaunchUrl(""); }}
                      className="rounded bg-indigo-600 px-2.5 py-1 text-xs text-white hover:bg-indigo-500 disabled:opacity-50">
                      Launch
                    </button>
                    <button onClick={() => startEditing(p)}
                      className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:bg-gray-800">
                      Edit
                    </button>
                    <button onClick={() => deleteProfile.mutate(p.id)}
                      className="rounded border border-gray-700 px-2 py-1 text-xs text-red-400 hover:bg-red-900/30">
                      Delete
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                  <span>{p.target_vus} VUs</span>
                  <span>{p.stages?.length ?? 0} stages</span>
                  <span>{totalStageDuration(p.stages ?? [])}s total</span>
                  <span>{p.cache_state}</span>
                  <span>{p.device ?? "desktop"}</span>
                  {p.script_id && (
                    <span className="text-indigo-400">
                      {scripts.find((s: any) => s.id === p.script_id)?.name ?? "script"}
                    </span>
                  )}
                  {p.stages?.length > 0 && stageMaxVUs(p.stages) !== p.target_vus && (
                    <span className="text-yellow-400">⚠ peak VU mismatch</span>
                  )}
                </div>
                {launchingProfileId === p.id && (
                  <div className="flex items-end gap-2 pt-2 border-t border-gray-800">
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 mb-0.5">Target URL <span className="text-red-400">*</span></label>
                      <input type="url" placeholder="https://example.com" value={profileLaunchUrl}
                        onChange={(e) => setProfileLaunchUrl(e.target.value)}
                        className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200" />
                    </div>
                    <button
                      onClick={() => { createRun.mutate({ project_id: projectId, load_profile_id: p.id, url: profileLaunchUrl.trim() }); setLaunchingProfileId(null); }}
                      disabled={createRun.isPending || !profileLaunchUrl.trim()}
                      className="rounded bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50">
                      Go
                    </button>
                  </div>
                )}
                {/* Inline Edit Form */}
                {editingProfileId === p.id && (
                  <div className="mt-3 pt-3 border-t border-gray-700 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Name</label>
                        <input value={eName} onChange={(e) => setEName(e.target.value)}
                          className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Description</label>
                        <input value={eDesc} onChange={(e) => setEDesc(e.target.value)}
                          className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Target VUs</label>
                        <input type="number" min={1} max={500} value={eVUs} onChange={(e) => setEVUs(Number(e.target.value))}
                          className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Cache State</label>
                        <select value={eCache} onChange={(e) => setECache(e.target.value)}
                          className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200">
                          {CACHE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Journey Script</label>
                        <select value={eScriptId} onChange={(e) => setEScriptId(e.target.value)}
                          className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200">
                          <option value="">No script</option>
                          {scripts.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 mb-0.5">Total Duration (s)</label>
                        <input type="number" min={10} max={7200} value={eTotalDuration}
                          onChange={(e) => {
                            const newTotal = Number(e.target.value);
                            setETotalDuration(newTotal);
                            if (eStages.length > 0) {
                              const oldTotal = totalStageDuration(eStages);
                              if (oldTotal > 0) {
                                const ratio = newTotal / oldTotal;
                                setEStages(eStages.map((s) => ({ ...s, duration_s: Math.max(1, Math.round(s.duration_s * ratio)) })));
                              }
                            }
                          }}
                          className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] text-gray-500">Stages</label>
                        <button onClick={addEStage} className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800">+ Add</button>
                      </div>
                      <div className="space-y-1">
                        {eStages.map((stage, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-6 text-[10px] text-gray-600">#{i + 1}</span>
                            <input type="number" min={1} value={stage.duration_s} onChange={(e) => updateEStage(i, "duration_s", e.target.value)}
                              className="w-20 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-200" />
                            <span className="text-[10px] text-gray-600">s</span>
                            <input type="number" min={0} value={stage.target_vus} onChange={(e) => updateEStage(i, "target_vus", e.target.value)}
                              className="w-16 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-200" />
                            <span className="text-[10px] text-gray-600">VUs</span>
                            <select value={stage.ramp_type ?? "linear"} onChange={(e) => updateEStage(i, "ramp_type", e.target.value)}
                              className="rounded border border-gray-700 bg-gray-800 px-1 py-0.5 text-[10px] text-gray-200">
                              <option value="linear">Linear</option>
                              <option value="step">Step</option>
                            </select>
                            <button onClick={() => removeEStage(i)} className="text-[10px] text-red-500 hover:text-red-400">x</button>
                          </div>
                        ))}
                      </div>
                      {eStages.length > 0 && stageMaxVUs(eStages) !== eVUs && (
                        <p className="mt-1 text-[10px] text-yellow-400">
                          Stage peak VUs ({stageMaxVUs(eStages)}) does not match Target VUs ({eVUs}).
                        </p>
                      )}
                      <div className="mt-1">
                        <StagePreview stages={eStages} />
                      </div>
                    </div>
                    {updateError && (
                      <div className="rounded bg-red-900/20 border border-red-900/40 px-3 py-1.5 text-xs text-red-400">{updateError}</div>
                    )}
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingProfileId(null)} className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:bg-gray-800">Cancel</button>
                      <button onClick={handleUpdateProfile} disabled={!eName.trim() || updateProfile.isPending}
                        className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50">
                        {updateProfile.isPending ? "Saving..." : "Save Changes"}
                      </button>
                    </div>
                  </div>
                )}
                {p.stages && <StagePreview stages={p.stages} />}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500 text-sm">
            {profilesLoading ? "Loading profiles..." : "No load profiles yet. Create one to define reusable VU ramp configurations."}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {loadRuns.length > 0 && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Total Runs", value: runStats.total, color: "text-gray-100" },
            { label: "Active", value: runStats.active, color: runStats.active > 0 ? "text-blue-400" : "text-gray-100" },
            { label: "Completed", value: runStats.completed, color: "text-green-400" },
            { label: "Failed", value: runStats.failed, color: runStats.failed > 0 ? "text-red-400" : "text-gray-100" },
            { label: "Total VU-min", value: runStats.totalVUMin.toFixed(1), color: "text-indigo-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Completed Run Metrics */}
      {completedRunMetrics && completedRunMetrics.length > 0 && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Avg Metrics from Completed Runs</h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {completedRunMetrics.map((m: any) => (
              <div key={m.metric} className="rounded-md border border-gray-800 bg-gray-800/30 p-3">
                <p className="text-[10px] text-gray-500">{m.label} ({m.count} runs)</p>
                <p className="text-sm font-bold text-gray-100">{m.avg.toFixed(m.unit === "ms" ? 0 : 3)}{m.unit}</p>
                <div className="mt-1 flex justify-between text-[9px] text-gray-600">
                  <span>Min {m.min.toFixed(m.unit === "ms" ? 0 : 3)}{m.unit}</span>
                  <span>Max {m.max.toFixed(m.unit === "ms" ? 0 : 3)}{m.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Load Runs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-300">Load Runs</h2>
          <div className="flex gap-1">
            {["all", "running", "completed", "failed", "queued", "cancelled"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  statusFilter === s
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {filteredRuns.length > 0 ? (
          <div className="space-y-2">
            {filteredRuns.map((run: any) => (
              <div
                key={run.id}
                onClick={() => setSelectedRun(selectedRun === run.id ? null : run.id)}
                className={`rounded-lg border p-4 cursor-pointer transition-all ${
                  selectedRun === run.id
                    ? "border-indigo-600 bg-indigo-900/10"
                    : "border-gray-800 bg-gray-900/50 hover:border-gray-700"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[run.status] ?? "bg-gray-800 text-gray-400"}`}>
                      {run.status}
                    </span>
                    <span className="text-sm font-medium text-gray-200">{run.engine}</span>
                    <span className="text-xs text-gray-500">
                      {run.url && <>{run.url} · </>}
                      {run.target_vus} VUs · {run.cache_state}
                      {run.script_id && (
                        <> · <span className="text-indigo-400">{scripts.find((s: any) => s.id === run.script_id)?.name ?? "script"}</span></>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {run.vu_minutes != null && (
                      <span className="text-xs text-gray-500">{Number(run.vu_minutes).toFixed(1)} VU-min</span>
                    )}
                    {run.cost_estimate?.total_cost != null && (
                      <span className="text-xs font-mono text-gray-400">${run.cost_estimate.total_cost.toFixed(2)}</span>
                    )}
                    {["queued", "warming", "running"].includes(run.status) && (
                      <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); cancelRun.mutate(run.id); }}
                        className="rounded border border-red-800/50 px-2 py-0.5 text-xs text-red-400 hover:bg-red-900/30"
                      >
                        Cancel
                      </button>
                    )}
                    {isAdmin && ["completed", "failed", "cancelled"].includes(run.status) && (
                      <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (confirm("Delete this load run?")) deleteRun.mutate(run.id); }}
                        className="rounded border border-red-800/50 px-2 py-0.5 text-xs text-red-400 hover:bg-red-900/30"
                      >
                        Delete
                      </button>
                    )}
                    <span className="text-xs text-gray-600">{new Date(run.created_at).toLocaleString()}</span>
                  </div>
                </div>

                {run.error && (
                  <div className="mt-2 rounded bg-red-900/20 border border-red-900/40 px-3 py-2">
                    <p className="text-[10px] font-medium text-red-400 mb-0.5">Error</p>
                    <pre className="text-xs text-red-300/90 whitespace-pre-wrap font-mono leading-relaxed">{run.error}</pre>
                  </div>
                )}

                {/* Console / Activity Log */}
                {(() => {
                  const isActive = ["queued", "warming", "running"].includes(run.status);
                  const isExpanded = isActive || expandedRunLogs.has(run.id);
                  return (
                <div className="mt-2">
                  <button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (!isActive) toggleRunLog(run.id); }}
                    className={`text-[10px] flex items-center gap-1 ${isActive ? "text-blue-400" : "text-gray-500 hover:text-gray-300"}`}
                  >
                    <span className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                    Console Log {isActive && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />}
                  </button>
                  {isExpanded && (
                    <div className="mt-1 rounded bg-gray-950 border border-gray-800 px-3 py-2 font-mono text-[11px] leading-relaxed space-y-0.5 max-h-48 overflow-y-auto">
                      <div className="text-gray-500">[{new Date(run.created_at).toLocaleTimeString()}] Run created — status: queued</div>
                      {run.started_at && (
                        <div className="text-blue-400">[{new Date(run.started_at).toLocaleTimeString()}] Worker claimed run — status: running</div>
                      )}
                      {run.started_at && (
                        <div className="text-gray-400">[{new Date(run.started_at).toLocaleTimeString()}] Executing: {run.target_vus} VUs, engine={run.engine}, url={run.url}</div>
                      )}
                      {run.started_at && run.stages?.length > 0 && (
                        <div className="text-gray-500">[{new Date(run.started_at).toLocaleTimeString()}] Stages: {run.stages.map((s: any, i: number) => `#${i + 1} ${s.duration_s}s→${s.target_vus}VUs`).join(", ")}</div>
                      )}
                      {["running", "warming"].includes(run.status) && (
                        <div className="text-blue-300 animate-pulse">[{new Date().toLocaleTimeString()}] Running... ({Math.round((Date.now() - new Date(run.started_at ?? run.created_at).getTime()) / 1000)}s elapsed)</div>
                      )}
                      {run.error && (
                        <div className="text-red-400">[{new Date(run.finished_at ?? run.updated_at ?? run.created_at).toLocaleTimeString()}] ERROR: {run.error}</div>
                      )}
                      {run.metrics_summary && Object.keys(run.metrics_summary).length > 0 && (
                        <div className="text-green-400">[{new Date(run.finished_at ?? run.updated_at ?? run.created_at).toLocaleTimeString()}] Metrics: {Object.entries(run.metrics_summary).map(([k, v]) => `${k}=${typeof v === "number" ? (v as number).toFixed(1) : v}`).join(", ")}</div>
                      )}
                      {run.finished_at && (
                        <div className={run.status === "completed" ? "text-green-400" : run.status === "failed" ? "text-red-400" : "text-gray-400"}>
                          [{new Date(run.finished_at).toLocaleTimeString()}] Run {run.status}{run.vu_minutes ? ` — ${Number(run.vu_minutes).toFixed(1)} VU-min` : ""}{run.duration_s ? ` in ${run.duration_s}s` : ""}
                        </div>
                      )}
                      {run.status === "queued" && (
                        <div className="text-yellow-400 animate-pulse">[{new Date().toLocaleTimeString()}] Waiting for worker to claim run...</div>
                      )}
                    </div>
                  )}
                </div>
                  );
                })()}

                {run.saturation_warnings?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {run.saturation_warnings.map((w: any, i: number) => (
                      <div key={i} className="rounded bg-yellow-900/30 px-2 py-1 text-xs text-yellow-300">
                        Warning: {w.message}
                      </div>
                    ))}
                  </div>
                )}

                {run.stages?.length > 0 && (
                  <div className="mt-2">
                    <StagePreview stages={run.stages} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-12 text-center text-gray-500">
            <p className="text-lg">{runsLoading ? "Loading..." : statusFilter !== "all" ? `No ${statusFilter} runs` : "No load runs yet"}</p>
            <p className="mt-2 text-sm">{statusFilter !== "all" ? "Try a different filter" : "Use Quick Run or launch from a saved profile to start load testing"}</p>
          </div>
        )}
      </div>

      {/* Correlation Detail Panel */}
      {selectedRun && correlation && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-gray-300">
            Correlation Analysis — <span className="font-mono text-indigo-400">{selectedRun.slice(0, 8)}</span>
          </h2>

          {/* Summary cards */}
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {[
              { label: "Peak VUs", value: correlation.summary.peak_vus ?? "—" },
              { label: "Duration", value: correlation.summary.total_duration_s ? `${Math.round(correlation.summary.total_duration_s)}s` : "—" },
              { label: "Peak CPU", value: correlation.summary.peak_cpu_percent != null ? `${correlation.summary.peak_cpu_percent.toFixed(1)}%` : "—" },
              { label: "Saturation", value: correlation.summary.saturation_point_vus ? `${correlation.summary.saturation_point_vus} VUs` : "None detected" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-1 text-xl font-bold text-gray-100">{value}</p>
              </div>
            ))}
          </div>

          {/* Correlation bar chart */}
          {correlationBarData.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">VU ↔ Server Metric Correlations</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={correlationBarData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" domain={[-1, 1]} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} width={90} />
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    formatter={(v: number) => [v.toFixed(2), "Pearson r"]} />
                  <Bar dataKey="r" radius={[0, 4, 4, 0]}>
                    {correlationBarData.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex gap-4 text-[10px] text-gray-600">
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> Positive (degrades with load)</span>
                <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-400" /> Negative (improves with load)</span>
              </div>
            </div>
          )}

          {/* Server Telemetry Summary */}
          {telemetrySummary && telemetrySummary.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Server Resources</h3>
              <div className="space-y-3">
                {telemetrySummary.map((host: any) => (
                  <div key={host.host} className="rounded-lg border border-gray-800 bg-gray-800/30 p-3">
                    <p className="text-sm font-medium text-gray-200">{host.host}</p>
                    <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: "CPU peak", value: `${Number(host.peak_cpu_percent).toFixed(1)}%`, warn: Number(host.peak_cpu_percent) > 80 },
                        { label: "Memory peak", value: `${Number(host.peak_memory_percent).toFixed(1)}%`, warn: Number(host.peak_memory_percent) > 85 },
                        { label: "Connections", value: host.peak_connections },
                        { label: "Event loop", value: `${Number(host.avg_event_loop_lag_ms).toFixed(1)}ms`, warn: Number(host.avg_event_loop_lag_ms) > 100 },
                      ].map(({ label, value, warn }) => (
                        <div key={label} className="text-xs">
                          <span className="text-gray-500">{label}: </span>
                          <span className={warn ? "text-yellow-400 font-medium" : "text-gray-300"}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stage Annotations */}
          {correlation.stages?.length > 0 && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Ramp Stages</h3>
              <div className="space-y-1">
                {correlation.stages.map((s: any) => (
                  <div key={s.index} className="flex items-center gap-3 text-sm">
                    <span className="w-8 text-xs text-gray-600 font-mono">#{s.index + 1}</span>
                    <span className="flex-1 text-gray-300">{s.label}</span>
                    <span className="text-xs text-gray-500">{s.duration_s}s</span>
                    <span className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-400">{s.ramp_type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
