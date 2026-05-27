"use client";

import { useState, Suspense } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") ?? "";

  const [form, setForm] = useState({ token: tokenFromUrl, password: "", confirm_password: "" });

  const resetMut = useMutation({
    mutationFn: (data: { token: string; password: string }) => api.auth.resetPassword(data),
  });

  const passwordMismatch = form.password !== form.confirm_password && form.confirm_password.length > 0;
  const passwordTooShort = form.password.length > 0 && form.password.length < 8;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Set New Password</h1>
          <p className="mt-2 text-sm text-gray-400">
            Enter your reset token and choose a new password
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-6">
          {resetMut.isSuccess ? (
            <div className="space-y-3">
              <div className="rounded-md border border-green-800 bg-green-900/20 p-4">
                <p className="text-sm text-green-300">
                  Password has been reset successfully!
                </p>
              </div>
              <Link
                href="/login"
                className="block w-full rounded-md bg-indigo-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                Sign In
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Reset Token</label>
                <input
                  type="text"
                  placeholder="Paste your reset token"
                  value={form.token}
                  onChange={(e) => setForm({ ...form, token: e.target.value })}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">New Password</label>
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

              {resetMut.isError && (
                <p className="text-sm text-red-400">{(resetMut.error as Error).message}</p>
              )}

              <button
                onClick={() => resetMut.mutate({ token: form.token, password: form.password })}
                disabled={
                  !form.token || !form.password ||
                  passwordMismatch || passwordTooShort || resetMut.isPending
                }
                className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {resetMut.isPending ? "Resetting..." : "Reset Password"}
              </button>

              <div className="text-center text-xs">
                <Link href="/login" className="text-indigo-400 hover:text-indigo-300">
                  Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-gray-950"><p className="text-gray-400">Loading...</p></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
