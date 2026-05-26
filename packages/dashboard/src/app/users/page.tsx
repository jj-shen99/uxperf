"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const ROLES = ["admin", "editor", "viewer"] as const;
const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-500/20 text-red-300",
  editor: "bg-blue-500/20 text-blue-300",
  viewer: "bg-gray-500/20 text-gray-300",
};

export default function UsersPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: "", display_name: "", role: "viewer" as string });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", role: "" });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.rbac.users.list(),
  });

  const createMut = useMutation({
    mutationFn: (data: { email: string; display_name: string; role?: string }) =>
      api.rbac.users.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setShowCreate(false);
      setForm({ email: "", display_name: "", role: "viewer" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { display_name?: string; role?: string; is_active?: boolean } }) =>
      api.rbac.users.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.rbac.users.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const startEdit = (user: any) => {
    setEditingId(user.id);
    setEditForm({ display_name: user.display_name, role: user.role });
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Users</h1>
          <p className="mt-1 text-sm text-gray-400">
            Manage users and their global roles
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          {showCreate ? "Cancel" : "Add User"}
        </button>
      </div>

      {showCreate && (
        <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/50 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
            />
            <input
              placeholder="Display Name"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => createMut.mutate(form)}
            disabled={!form.email || !form.display_name || createMut.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {createMut.isPending ? "Creating..." : "Create User"}
          </button>
          {createMut.isError && (
            <p className="text-sm text-red-400">{(createMut.error as Error).message}</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="text-gray-400">Loading...</div>
      ) : users.length === 0 ? (
        <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8 text-center text-gray-500">
          No users yet. Add one to get started.
        </div>
      ) : (
        <div className="rounded-lg border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Name</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Email</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Role</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Status</th>
                <th className="px-4 py-2 text-left text-xs text-gray-400">Last Login</th>
                <th className="px-4 py-2 text-right text-xs text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-gray-200">
                    {editingId === u.id ? (
                      <input
                        value={editForm.display_name}
                        onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-200 w-full"
                      />
                    ) : (
                      u.display_name
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{u.email}</td>
                  <td className="px-4 py-2">
                    {editingId === u.id ? (
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? ROLE_COLORS.viewer}`}>
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? "bg-green-500/20 text-green-300" : "bg-gray-500/20 text-gray-400"}`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2">
                    {editingId === u.id ? (
                      <>
                        <button
                          onClick={() => updateMut.mutate({ id: u.id, data: editForm })}
                          className="text-xs text-green-400 hover:text-green-300"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-gray-400 hover:text-gray-300"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(u)}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => updateMut.mutate({
                            id: u.id,
                            data: { is_active: !u.is_active },
                          })}
                          className={`text-xs ${u.is_active ? "text-yellow-400 hover:text-yellow-300" : "text-green-400 hover:text-green-300"}`}
                        >
                          {u.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete user ${u.display_name}?`)) deleteMut.mutate(u.id); }}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      </>
                    )}
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
