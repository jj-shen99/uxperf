"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");

  const forgotMut = useMutation({
    mutationFn: (data: { email: string }) => api.auth.forgotPassword(data),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Reset Password</h1>
          <p className="mt-2 text-sm text-gray-400">
            Enter your email to receive a password reset link
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-6">
          {forgotMut.isSuccess ? (
            <div className="space-y-3">
              <div className="rounded-md border border-green-800 bg-green-900/20 p-4">
                <p className="text-sm text-green-300">
                  If that email is registered, a reset link has been sent.
                </p>
                {forgotMut.data?.reset_token && (
                  <div className="mt-3 space-y-1">
                    <p className="text-xs text-gray-400">Dev mode — reset token:</p>
                    <code className="block break-all rounded bg-gray-800 px-2 py-1 text-xs text-indigo-300 font-mono">
                      {forgotMut.data.reset_token}
                    </code>
                    <Link
                      href={`/reset-password?token=${forgotMut.data.reset_token}`}
                      className="inline-block mt-2 text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Go to reset page →
                    </Link>
                  </div>
                )}
              </div>
              <Link
                href="/login"
                className="block text-center text-sm text-indigo-400 hover:text-indigo-300"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && email && forgotMut.mutate({ email })}
                  className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {forgotMut.isError && (
                <p className="text-sm text-red-400">{(forgotMut.error as Error).message}</p>
              )}

              <button
                onClick={() => forgotMut.mutate({ email })}
                disabled={!email || forgotMut.isPending}
                className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {forgotMut.isPending ? "Sending..." : "Send Reset Link"}
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
