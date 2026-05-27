"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", display_name: "", password: "", confirm_password: "" });

  const registerMut = useMutation({
    mutationFn: (data: { email: string; display_name: string; password: string }) =>
      api.auth.register(data),
    onSuccess: () => {
      router.push("/login?registered=1");
    },
  });

  const passwordMismatch = form.password !== form.confirm_password && form.confirm_password.length > 0;
  const passwordTooShort = form.password.length > 0 && form.password.length < 8;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="mt-2 text-sm text-gray-400">
            Join the Performance Testing Framework
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-6">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Display Name</label>
            <input
              type="text"
              placeholder="Your name"
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
            <input
              type="email"
              placeholder="you@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Password</label>
            <input
              type="password"
              placeholder="Minimum 8 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
            />
            {passwordTooShort && (
              <p className="mt-1 text-xs text-yellow-400">Password must be at least 8 characters</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Confirm Password</label>
            <input
              type="password"
              placeholder="Re-enter your password"
              value={form.confirm_password}
              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
              className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
            />
            {passwordMismatch && (
              <p className="mt-1 text-xs text-red-400">Passwords do not match</p>
            )}
          </div>

          {registerMut.isError && (
            <p className="text-sm text-red-400">{(registerMut.error as Error).message}</p>
          )}

          <button
            onClick={() => registerMut.mutate({
              email: form.email,
              display_name: form.display_name,
              password: form.password,
            })}
            disabled={
              !form.email || !form.display_name || !form.password ||
              passwordMismatch || passwordTooShort || registerMut.isPending
            }
            className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {registerMut.isPending ? "Creating account..." : "Create Account"}
          </button>

          <div className="text-center text-xs">
            <span className="text-gray-500">Already have an account? </span>
            <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
