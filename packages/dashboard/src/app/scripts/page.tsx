"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";
import { useProjects } from "@/hooks/use-projects";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useUserProjects } from "@/hooks/use-user-projects";

const SCRIPT_TEMPLATES: { name: string; description: string; canonical_json: Record<string, unknown> }[] = [
  {
    name: "Homepage Lighthouse Audit",
    description: "Run a Lighthouse performance audit on a homepage URL.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}" },
        { action: "audit", categories: ["performance", "accessibility", "best-practices", "seo"] },
      ],
      config: { device: "desktop", throttling: "simulated3G", runs: 3 },
    },
  },
  {
    name: "SPA Navigation Flow",
    description: "Measure Core Web Vitals across multiple SPA page transitions.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}" },
        { action: "wait", selector: "[data-ready]", timeout_ms: 5000 },
        { action: "click", selector: "a[href='/dashboard']" },
        { action: "wait", selector: "[data-page='dashboard']", timeout_ms: 5000 },
        { action: "measure", metrics: ["lcp", "fcp", "cls", "inp", "ttfb"] },
        { action: "click", selector: "a[href='/settings']" },
        { action: "wait", selector: "[data-page='settings']", timeout_ms: 5000 },
        { action: "measure", metrics: ["lcp", "fcp", "cls", "inp"] },
      ],
      config: { device: "desktop", runs: 1 },
    },
  },
  {
    name: "E-Commerce Checkout",
    description: "Simulate a user browsing products and completing checkout.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}/products" },
        { action: "wait", selector: ".product-grid", timeout_ms: 5000 },
        { action: "measure", metrics: ["lcp", "fcp", "cls", "ttfb"] },
        { action: "click", selector: ".product-card:first-child" },
        { action: "wait", selector: ".product-detail", timeout_ms: 3000 },
        { action: "click", selector: "button.add-to-cart" },
        { action: "navigate", url: "{{TARGET_URL}}/cart" },
        { action: "measure", metrics: ["lcp", "cls", "inp"] },
        { action: "click", selector: "button.checkout" },
        { action: "wait", selector: ".checkout-form", timeout_ms: 5000 },
        { action: "measure", metrics: ["lcp", "fcp", "tbt", "tti"] },
      ],
      config: { device: "mobile", throttling: "simulated4G", runs: 3 },
    },
  },
  {
    name: "Login Flow",
    description: "Test performance of the login page and post-login redirect.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}/login" },
        { action: "measure", metrics: ["lcp", "fcp", "ttfb", "cls"] },
        { action: "type", selector: "input[name='email']", text: "test@example.com" },
        { action: "type", selector: "input[name='password']", text: "password123" },
        { action: "click", selector: "button[type='submit']" },
        { action: "wait", selector: "[data-page='dashboard']", timeout_ms: 10000 },
        { action: "measure", metrics: ["lcp", "fcp", "tti", "tbt"] },
      ],
      config: { device: "desktop", runs: 3 },
    },
  },
  {
    name: "API Health & TTFB Check",
    description: "Measure TTFB and server response time for key API endpoints.",
    canonical_json: {
      steps: [
        { action: "request", method: "GET", url: "{{TARGET_URL}}/api/health", expect_status: 200 },
        { action: "request", method: "GET", url: "{{TARGET_URL}}/api/v1/projects", expect_status: 200 },
        { action: "request", method: "GET", url: "{{TARGET_URL}}/api/v1/runs?limit=1", expect_status: 200 },
      ],
      config: { measure: ["ttfb", "server_processing_time"], runs: 5, parallel: false },
    },
  },
  {
    name: "Lazy-Load & Image Performance",
    description: "Scroll through a page to trigger lazy-loaded images and measure CLS/LCP.",
    canonical_json: {
      steps: [
        { action: "navigate", url: "{{TARGET_URL}}" },
        { action: "measure", metrics: ["fcp", "lcp", "cls"] },
        { action: "scroll", direction: "down", distance_px: 2000, speed: "slow" },
        { action: "wait", duration_ms: 2000 },
        { action: "measure", metrics: ["cls", "lcp"] },
        { action: "scroll", direction: "down", distance_px: 4000, speed: "slow" },
        { action: "wait", duration_ms: 2000 },
        { action: "measure", metrics: ["cls"] },
      ],
      config: { device: "mobile", throttling: "simulated4G", runs: 3 },
    },
  },
];

export default function ScriptsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { projects, projectId: defaultProjectId } = useProjects();
  const { isAdmin } = useCurrentUser();
  const { accessibleProjectIds } = useUserProjects();
  const [form, setForm] = useState({ name: "", project_id: "", canonical_json: "{}", template_id: "", target_url: "" });
  const [showTemplates, setShowTemplates] = useState(false);

  // Pre-fill project_id when projects load
  const formProjectId = form.project_id || defaultProjectId;

  const { data: allScripts, isLoading } = useQuery({
    queryKey: ["scripts"],
    queryFn: () => api.scripts.list(),
  });

  // Filter scripts: admins see all, regular users see only their projects
  // If no memberships are configured yet, show all scripts as a fallback
  const scripts = allScripts?.filter(
    (s: any) => isAdmin || accessibleProjectIds.size === 0 || accessibleProjectIds.has(s.project_id)
  );

  const createMut = useMutation({
    mutationFn: (data: any) => api.scripts.create(data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["scripts"] });
      await qc.invalidateQueries({ queryKey: ["user-memberships"] });
      setShowCreate(false);
      setShowTemplates(false);
      setForm({ name: "", project_id: "", canonical_json: "{}", template_id: "", target_url: "" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.scripts.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scripts"] }),
  });

  // When target_url changes and a template is active, re-apply substitution in the JSON
  const updateTargetUrl = (url: string) => {
    let json = form.canonical_json;
    // Replace any old URL or {{TARGET_URL}} with the new value
    if (form.target_url) {
      json = json.replaceAll(form.target_url, url || "{{TARGET_URL}}");
    }
    if (!url) {
      // If clearing the URL, restore placeholders
      json = json.replaceAll("{{TARGET_URL}}", "{{TARGET_URL}}");
    } else {
      json = json.replaceAll("{{TARGET_URL}}", url);
    }
    setForm({ ...form, target_url: url, canonical_json: json });
  };

  const applyTemplate = (tpl: typeof SCRIPT_TEMPLATES[number]) => {
    const url = form.target_url;
    let jsonStr = JSON.stringify(tpl.canonical_json, null, 2);
    if (url) {
      jsonStr = jsonStr.replaceAll("{{TARGET_URL}}", url);
    }
    setForm({
      ...form,
      name: tpl.name,
      canonical_json: jsonStr,
      template_id: tpl.name,
    });
    setShowTemplates(false);
    setShowCreate(true);
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Scripts</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowTemplates(!showTemplates); setShowCreate(false); }}
            className="rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700"
          >
            {showTemplates ? "Hide Templates" : "Templates"}
          </button>
          <button
            onClick={() => { setShowCreate(!showCreate); setShowTemplates(false); }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            {showCreate ? "Cancel" : "New Script"}
          </button>
        </div>
      </div>

      {/* Template picker */}
      {showTemplates && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Target URL</label>
            <input
              type="url"
              placeholder="https://example.com"
              value={form.target_url}
              onChange={(e) => setForm({ ...form, target_url: e.target.value })}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
            />
            <p className="mt-1.5 text-xs text-gray-500">Enter your URL first, then pick a template — it will be injected automatically.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SCRIPT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                onClick={() => applyTemplate(tpl)}
                className="rounded-lg border border-gray-800 bg-gray-900/50 p-4 text-left hover:border-indigo-600 hover:bg-indigo-900/10 transition-colors"
              >
                <p className="text-sm font-medium text-gray-200">{tpl.name}</p>
                <p className="mt-1 text-xs text-gray-500">{tpl.description}</p>
                <p className="mt-2 text-[10px] text-gray-600">{(tpl.canonical_json as any).steps?.length ?? 0} steps · {(tpl.canonical_json as any).config?.device ?? "desktop"}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <input
            placeholder="Script name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          />
          <select
            value={formProjectId}
            onChange={(e) => setForm({ ...form, project_id: e.target.value })}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
          >
            <option value="">Select a project</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {form.template_id && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-md border border-indigo-800 bg-indigo-900/20 px-3 py-1.5 text-xs text-indigo-300">
                <span>Template: <strong>{form.template_id}</strong></span>
                <button
                  onClick={() => setForm({ ...form, template_id: "" })}
                  className="ml-auto text-indigo-400 hover:text-indigo-300"
                >
                  ✕ Clear
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Target URL</label>
                <input
                  type="url"
                  placeholder="https://example.com"
                  value={form.target_url}
                  onChange={(e) => updateTargetUrl(e.target.value)}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600"
                />
                {form.target_url && (
                  <p className="mt-1 text-[10px] text-green-500">URL injected into script JSON</p>
                )}
              </div>
            </div>
          )}
          <textarea
            placeholder='Canonical JSON (e.g. {"steps":[]})'
            value={form.canonical_json}
            onChange={(e) => setForm({ ...form, canonical_json: e.target.value })}
            rows={10}
            className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono text-xs leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <button
              onClick={() => { setShowTemplates(true); setShowCreate(false); }}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Load from template...
            </button>
            <button
              onClick={() => {
                try {
                  const payload: any = {
                    name: form.name,
                    project_id: formProjectId,
                    canonical_json: JSON.parse(form.canonical_json),
                  };
                  if (form.template_id) payload.template_id = form.template_id;
                  createMut.mutate(payload);
                } catch {
                  alert("Invalid JSON");
                }
              }}
              disabled={!form.name || !formProjectId || createMut.isPending}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {createMut.isPending ? "Creating..." : "Create"}
            </button>
          </div>
          {createMut.isError && (
            <p className="text-sm text-red-400">{(createMut.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Scripts list */}
      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : !scripts?.length ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
          No scripts yet. Create one to get started.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Name</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Project</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Mode</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Updated</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {scripts.map((s: any) => (
                <tr key={s.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-2"><Link href={`/scripts/${s.id}`} className="text-indigo-400 hover:text-indigo-300 hover:underline">{s.name}</Link></td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{projects.find((p: any) => p.id === s.project_id)?.name ?? s.project_id?.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-gray-400">{s.authoring_mode}</td>
                  <td className="px-4 py-2 text-gray-400">{new Date(s.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => deleteMut.mutate(s.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
