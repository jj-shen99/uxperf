"use client";

/**
 * E-65/E-66/E-67: Platform Health, On-Call, and Practice Review dashboard.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  HeartPulse,
  Users,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  RotateCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type Tab = "health" | "oncall" | "review";

export default function PlatformHealthPage() {
  const [tab, setTab] = useState<Tab>("health");
  const queryClient = useQueryClient();
  const { projects, projectId, setProjectId } = useProjects();
  const { currentUser } = useCurrentUser();

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "health", label: "Platform Health", icon: HeartPulse },
    { key: "oncall", label: "On-Call", icon: Users },
    { key: "review", label: "Quarterly Review", icon: ClipboardList },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Platform Health</h1>
        <p className="mt-1 text-sm text-gray-400">
          Self-monitoring, on-call rotation, and practice reviews
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg bg-gray-900 p-1 border border-gray-800">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === key
                ? "bg-indigo-600/20 text-indigo-300"
                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "health" && <HealthTab />}
      {tab === "oncall" && <OnCallTab />}
      {tab === "review" && <ReviewTab projectId={projectId} setProjectId={setProjectId} projects={projects} currentUser={currentUser} />}
    </div>
  );
}

// === Health Tab (E-65) ===

function HealthTab() {
  const { data: report, isLoading } = useQuery({
    queryKey: ["platform-health"],
    queryFn: () => api.platformHealth.check(),
    refetchInterval: 30000,
  });

  const statusColors = {
    healthy: "text-green-400",
    degraded: "text-yellow-400",
    down: "text-red-400",
  };
  const statusBg = {
    healthy: "bg-green-500/10 border-green-500/30",
    degraded: "bg-yellow-500/10 border-yellow-500/30",
    down: "bg-red-500/10 border-red-500/30",
  };

  if (isLoading) return <div className="text-gray-400">Checking platform health...</div>;
  if (!report) return <div className="text-gray-500">Unable to check platform health.</div>;

  return (
    <div className="space-y-4">
      {/* Overall status */}
      <div className={`rounded-lg border p-6 flex items-center justify-between ${statusBg[report.overall as keyof typeof statusBg] ?? statusBg.healthy}`}>
        <div className="flex items-center gap-3">
          {report.overall === "healthy" ? <CheckCircle2 className="h-8 w-8 text-green-400" /> :
           report.overall === "degraded" ? <AlertTriangle className="h-8 w-8 text-yellow-400" /> :
           <XCircle className="h-8 w-8 text-red-400" />}
          <div>
            <p className={`text-xl font-bold ${statusColors[report.overall as keyof typeof statusColors] ?? "text-gray-400"}`}>
              Platform {report.overall === "healthy" ? "Healthy" : report.overall === "degraded" ? "Degraded" : "Down"}
            </p>
            <p className="text-xs text-gray-500">Last checked: {new Date(report.checked_at).toLocaleString()}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Gate Policy</p>
          <p className={`text-sm font-bold ${report.gate_policy === "enforce" ? "text-green-400" : "text-yellow-400"}`}>
            {report.gate_policy === "enforce" ? "Enforcing" : "Paused (safe mode)"}
          </p>
        </div>
      </div>

      {/* Component checks */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(report.checks ?? []).map((check: any) => (
          <div key={check.component} className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {check.status === "healthy" ? <CheckCircle2 className="h-4 w-4 text-green-400" /> :
                 check.status === "degraded" ? <AlertTriangle className="h-4 w-4 text-yellow-400" /> :
                 <XCircle className="h-4 w-4 text-red-400" />}
                <span className="text-sm font-medium text-gray-200 capitalize">
                  {check.component.replace(/_/g, " ")}
                </span>
              </div>
              <span className={`text-xs font-medium ${statusColors[check.status as keyof typeof statusColors] ?? "text-gray-400"}`}>
                {check.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{check.message}</p>
            {check.last_activity && (
              <p className="mt-0.5 text-[10px] text-gray-600">
                Last activity: {new Date(check.last_activity).toLocaleString()}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// === On-Call Tab (E-66) ===

function OnCallTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState("");

  const { data: rotations = [], isLoading } = useQuery({
    queryKey: ["oncall-rotations"],
    queryFn: () => api.onCall.list(),
  });

  const createMut = useMutation({
    mutationFn: () => api.onCall.create({
      name,
      members: members.split("\n").filter(Boolean).map((line, i) => {
        const [displayName, email, team] = line.split(",").map((s) => s.trim());
        return { user_id: `user_${i}`, display_name: displayName || `Member ${i + 1}`, email: email || "", team: team || "default" };
      }),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["oncall-rotations"] }); setShowCreate(false); setName(""); setMembers(""); },
  });

  const rotateMut = useMutation({
    mutationFn: (id: string) => api.onCall.rotate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["oncall-rotations"] }),
  });

  if (isLoading) return <div className="text-gray-400">Loading rotations...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">{rotations.length} rotation(s)</p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
        >
          <Plus className="h-3.5 w-3.5" /> New Rotation
        </button>
      </div>

      {showCreate && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rotation name"
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <textarea
            value={members}
            onChange={(e) => setMembers(e.target.value)}
            placeholder="Members (one per line: name, email, team)"
            rows={4}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <button
            onClick={() => createMut.mutate()}
            disabled={!name || !members || createMut.isPending}
            className="rounded-md bg-green-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      )}

      {rotations.map((r: any) => (
        <div key={r.id} className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-200">{r.name}</p>
              <p className="text-[10px] text-gray-500">
                {r.members?.length ?? 0} members · rotates every {r.rotation_interval_days}d
              </p>
            </div>
            <button
              onClick={() => rotateMut.mutate(r.id)}
              className="flex items-center gap-1 rounded-md bg-gray-800 px-2 py-1 text-[10px] text-gray-400 hover:bg-gray-700"
            >
              <RotateCw className="h-3 w-3" /> Rotate
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(r.members ?? []).map((m: any, i: number) => (
              <div
                key={i}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  i === r.current_index
                    ? "border-green-500/50 bg-green-900/20 text-green-300"
                    : "border-gray-700 bg-gray-800/50 text-gray-400"
                }`}
              >
                {m.display_name}
                {i === r.current_index && <span className="ml-1 text-[9px] text-green-500">(on-call)</span>}
                <span className="ml-1 text-[9px] text-gray-600">{m.team}</span>
              </div>
            ))}
          </div>

          {r.paging_policy && (
            <div className="flex gap-3 text-[10px]">
              <span className="text-red-400">Critical: {r.paging_policy.critical}</span>
              <span className="text-yellow-400">Warning: {r.paging_policy.warning}</span>
              <span className="text-gray-500">Info: {r.paging_policy.info}</span>
              <span className="text-gray-600">Escalation: {r.paging_policy.escalation_timeout_minutes}min</span>
            </div>
          )}
        </div>
      ))}

      {rotations.length === 0 && !showCreate && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          No on-call rotations configured. Create one to manage perf on-call coverage.
        </div>
      )}
    </div>
  );
}

// === Quarterly Review Tab (E-67) ===

function ReviewTab({ projectId, setProjectId, projects, currentUser }: any) {
  const queryClient = useQueryClient();
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  const { data: questions = [] } = useQuery({
    queryKey: ["review-questions"],
    queryFn: () => api.practiceReview.questions(),
  });

  const { data: reviews = [] } = useQuery({
    queryKey: ["practice-reviews", projectId],
    queryFn: () => api.practiceReview.list(projectId),
    enabled: !!projectId,
  });

  const createMut = useMutation({
    mutationFn: () => api.practiceReview.create(projectId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["practice-reviews", projectId] }),
  });

  const respondMut = useMutation({
    mutationFn: ({ reviewId, data }: { reviewId: string; data: any }) =>
      api.practiceReview.respond(reviewId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["practice-reviews", projectId] }),
  });

  const activeReview = reviews[0];

  const categorized = questions.reduce((acc: Record<string, any[]>, q: any) => {
    (acc[q.category] ??= []).push(q);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-200"
        >
          <option value="">Select a project</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {projectId && (
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            Start Review
          </button>
        )}
      </div>

      {!projectId && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-gray-500">
          Select a project to start or view quarterly practice reviews.
        </div>
      )}

      {activeReview && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-200">
                {activeReview.quarter} Review
              </p>
              <p className="text-[10px] text-gray-500">
                Status: <span className={activeReview.status === "completed" ? "text-green-400" : activeReview.status === "in_progress" ? "text-yellow-400" : "text-gray-400"}>{activeReview.status}</span>
                {activeReview.score != null && <span className="ml-2">Score: {activeReview.score}%</span>}
                {" · "}{activeReview.responses?.length ?? 0}/{questions.length} answered
              </p>
            </div>
            <p className="text-[10px] text-gray-600">Due: {new Date(activeReview.due_at).toLocaleDateString()}</p>
          </div>

          {Object.entries(categorized).map(([category, catQuestions]: [string, any]) => (
            <div key={category} className="rounded-lg border border-gray-800 bg-gray-900">
              <div className="px-4 py-2 border-b border-gray-800">
                <p className="text-xs font-medium text-gray-400 capitalize">{category.replace(/_/g, " ")}</p>
              </div>
              <div className="divide-y divide-gray-800/50">
                {catQuestions.map((q: any) => {
                  const response = activeReview.responses?.find((r: any) => r.question_id === q.id);
                  const isExpanded = expandedQuestion === q.id;

                  return (
                    <div key={q.id} className="px-4 py-3">
                      <button
                        onClick={() => setExpandedQuestion(isExpanded ? null : q.id)}
                        className="w-full flex items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-2">
                          {response?.answer === "yes" ? <CheckCircle2 className="h-4 w-4 text-green-400" /> :
                           response?.answer === "no" ? <XCircle className="h-4 w-4 text-red-400" /> :
                           response?.answer === "partial" ? <AlertTriangle className="h-4 w-4 text-yellow-400" /> :
                           <div className="h-4 w-4 rounded-full border border-gray-600" />}
                          <span className="text-sm text-gray-200">{q.question}</span>
                        </div>
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                      </button>

                      {isExpanded && (
                        <div className="mt-2 ml-6 space-y-2">
                          <p className="text-xs text-gray-500">{q.description}</p>
                          <div className="flex gap-2">
                            {(["yes", "partial", "no", "not_applicable"] as const).map((answer) => (
                              <button
                                key={answer}
                                onClick={() => respondMut.mutate({
                                  reviewId: activeReview.id,
                                  data: {
                                    question_id: q.id,
                                    answer,
                                    notes: "",
                                    respondent_id: currentUser?.id ?? "anonymous",
                                  },
                                })}
                                className={`rounded px-2.5 py-1 text-[10px] font-medium transition ${
                                  response?.answer === answer
                                    ? answer === "yes" ? "bg-green-500/20 text-green-300 ring-1 ring-green-500/50"
                                      : answer === "no" ? "bg-red-500/20 text-red-300 ring-1 ring-red-500/50"
                                      : answer === "partial" ? "bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/50"
                                      : "bg-gray-700 text-gray-300 ring-1 ring-gray-600"
                                    : "bg-gray-800 text-gray-500 hover:bg-gray-700"
                                }`}
                              >
                                {answer === "not_applicable" ? "N/A" : answer.charAt(0).toUpperCase() + answer.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
