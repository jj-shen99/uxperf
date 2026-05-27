"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });

  const loginMut = useMutation({
    mutationFn: (data: { email: string; password: string }) => api.auth.login(data),
    onSuccess: (user) => {
      // Store user info in localStorage for the session
      localStorage.setItem("perf_user", JSON.stringify(user));
      router.push("/");
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Sign In</h1>
          <p className="mt-2 text-sm text-gray-400">
            Performance Testing Framework
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-6">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && form.email && form.password && loginMut.mutate(form)}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && form.email && form.password && loginMut.mutate(form)}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {loginMut.isError && (
            <p className="text-sm text-red-400">{(loginMut.error as Error).message}</p>
          )}

          <button
            onClick={() => loginMut.mutate(form)}
            disabled={!form.email || !form.password || loginMut.isPending}
            className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {loginMut.isPending ? "Signing in..." : "Sign In"}
          </button>

          <div className="flex items-center justify-between text-xs">
            <Link href="/forgot-password" className="text-indigo-400 hover:text-indigo-300">
              Forgot password?
            </Link>
            <Link href="/register" className="text-indigo-400 hover:text-indigo-300">
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
