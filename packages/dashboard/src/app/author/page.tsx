"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";

export default function AuthorPage() {
  const [prompt, setPrompt] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [device, setDevice] = useState("desktop");
  const [projectId, setProjectId] = useState("");
  const [result, setResult] = useState<any>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.authoring.generate({
        project_id: projectId,
        prompt,
        target_url: targetUrl || undefined,
        device,
      }),
    onSuccess: (data) => setResult(data),
  });

  const { data: logs = [] } = useQuery({
    queryKey: ["authoring-logs", projectId],
    queryFn: () => api.authoring.logs(projectId),
    enabled: !!projectId,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Test Authoring</h1>
        <p className="text-sm text-muted-foreground">
          Describe your test in plain English and generate a validated Playwright script
        </p>
      </div>

      {/* Input form */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Describe your test</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Log in as a returning shopper, search for 'wireless headphones', add the top result to cart, and measure LCP on the product page."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select a project</option>
              {projects.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Target URL</label>
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://shop.example.com"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Device</label>
            <select
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
            </select>
          </div>
        </div>

        <button
          onClick={() => generate.mutate()}
          disabled={!prompt || !projectId || generate.isPending}
          className="rounded-md bg-primary px-6 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {generate.isPending ? "Generating..." : "Generate Script"}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              result.status === "validated" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
            }`}>
              {result.status}
            </span>
            <span className="text-xs text-muted-foreground">
              Generated in {result.generation_time_ms} ms
            </span>
          </div>

          {/* Pipeline stages */}
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Pipeline Stages</h3>
            <div className="space-y-2">
              {result.pipeline_stages.map((stage: any) => (
                <div key={stage.stage} className="flex items-center gap-3 text-sm">
                  <span className={`h-2 w-2 rounded-full ${
                    stage.status === "completed" ? "bg-green-500" : stage.status === "skipped" ? "bg-gray-400" : "bg-red-500"
                  }`} />
                  <span className="font-mono text-xs w-40">{stage.name}</span>
                  <span className="text-muted-foreground text-xs">{stage.duration_ms} ms</span>
                  <span className={`text-xs ${
                    stage.status === "completed" ? "text-green-600" : stage.status === "skipped" ? "text-gray-500" : "text-red-600"
                  }`}>
                    {stage.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Generated script */}
          {result.generated_script && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Generated Script</h3>
              <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">
                {JSON.stringify(result.generated_script, null, 2)}
              </pre>
            </div>
          )}

          {/* Confidence scores */}
          {result.confidence_scores?.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="text-sm font-semibold mb-3">Step Confidence</h3>
              <div className="space-y-2">
                {result.confidence_scores.map((score: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-16 text-xs text-muted-foreground">Step {score.step}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${score.confidence >= 0.7 ? "bg-green-500" : "bg-yellow-500"}`}
                        style={{ width: `${score.confidence * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs w-10 text-right">
                      {(score.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clarifying questions */}
          {result.clarifying_questions?.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-4">
              <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                Clarifying Questions
              </h3>
              <ul className="space-y-1 text-sm text-yellow-700 dark:text-yellow-400">
                {result.clarifying_questions.map((q: string, i: number) => (
                  <li key={i}>• {q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Previous generations */}
      {logs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Previous Generations</h3>
          <div className="space-y-2">
            {logs.slice(0, 10).map((log: any) => (
              <div key={log.id} className="flex items-center justify-between rounded border bg-card px-4 py-2 text-sm">
                <span className="truncate max-w-md">{log.prompt}</span>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${
                    log.status === "validated" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                  }`}>
                    {log.status}
                  </span>
                  <span className="text-xs text-muted-foreground">{log.generation_time_ms} ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
