"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";

export default function ScriptDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId ?? "";
  const router = useRouter();
  const qc = useQueryClient();
  const { projects } = useProjects();

  const { data: script, isLoading, isError } = useQuery({
    queryKey: ["script", id],
    queryFn: () => api.scripts.get(id),
    enabled: !!id,
  });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [json, setJson] = useState("");
  const [sourcePrompt, setSourcePrompt] = useState("");

  useEffect(() => {
    if (script) {
      setName(script.name ?? "");
      setJson(JSON.stringify(script.canonical_json, null, 2));
      setSourcePrompt(script.source_prompt ?? "");
    }
  }, [script]);

  const updateMut = useMutation({
    mutationFn: () => {
      try {
        return api.scripts.update(id, {
          name,
          canonical_json: JSON.parse(json),
          source_prompt: sourcePrompt || undefined,
        });
      } catch {
        return Promise.reject(new Error("Invalid JSON"));
      }
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["script", id] });
      qc.invalidateQueries({ queryKey: ["scripts"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.scripts.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
      router.push("/scripts");
    },
  });

  if (isLoading) {
    return <div className="p-6 text-gray-400">Loading script...</div>;
  }

  if (!script) {
    return <div className="p-6 text-red-400">{isError ? "Error loading script. Please try again." : "Script not found."}</div>;
  }

  const projectName = projects.find((p: any) => p.id === script.project_id)?.name ?? script.project_id;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push("/scripts")}
            className="text-xs text-gray-400 hover:text-gray-200 mb-1"
          >
            &larr; Back to Scripts
          </button>
          {editing ? (
            <input
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              className="block text-xl font-semibold text-white bg-gray-800 border border-gray-700 rounded-md px-3 py-1"
            />
          ) : (
            <h1 className="text-xl font-semibold text-white">{script.name}</h1>
          )}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => updateMut.mutate()}
                disabled={updateMut.isPending || !name}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {updateMut.isPending ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setEditing(false); setName(script.name); setJson(JSON.stringify(script.canonical_json, null, 2)); setSourcePrompt(script.source_prompt ?? ""); }}
                className="rounded-md border border-gray-700 px-4 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Edit
              </button>
              <button
                onClick={() => { if (confirm("Delete this script?")) deleteMut.mutate(); }}
                className="rounded-md border border-red-700 px-4 py-1.5 text-sm text-red-400 hover:bg-red-900/30"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {updateMut.isError && (
        <div className="rounded-md bg-red-900/30 border border-red-700 p-3 text-sm text-red-300">
          {(updateMut.error as Error).message}
        </div>
      )}

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400">Project</div>
          <div className="mt-1 text-sm text-gray-200">{projectName}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400">Authoring Mode</div>
          <div className="mt-1 text-sm text-gray-200">{script.authoring_mode}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400">Created</div>
          <div className="mt-1 text-sm text-gray-200">{new Date(script.created_at).toLocaleDateString()}</div>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="text-xs text-gray-400">Updated</div>
          <div className="mt-1 text-sm text-gray-200">{new Date(script.updated_at).toLocaleDateString()}</div>
        </div>
      </div>

      {/* Source Prompt */}
      {(script.source_prompt || editing) && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="text-xs font-medium text-gray-400 mb-2">Source Prompt</h3>
          {editing ? (
            <textarea
              value={sourcePrompt}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSourcePrompt(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
            />
          ) : (
            <p className="text-sm text-gray-300">{script.source_prompt}</p>
          )}
        </div>
      )}

      {/* Canonical JSON */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-xs font-medium text-gray-400 mb-2">Canonical JSON</h3>
        {editing ? (
          <textarea
            value={json}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJson(e.target.value)}
            rows={20}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 font-mono"
          />
        ) : (
          <pre className="overflow-auto rounded-md bg-gray-800 p-4 text-xs text-gray-200 font-mono max-h-[500px]">
            {JSON.stringify(script.canonical_json, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
