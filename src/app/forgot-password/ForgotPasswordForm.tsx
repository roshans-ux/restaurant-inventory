"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Request failed");
      }
      setMessage(
        data.data?.message ??
          "If an account exists for that email, we sent a reset link.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="auth-copy w-full max-w-md rounded-xl p-8"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold">Forgot password?</h1>
        <p className="mt-2">Enter your account email and we&apos;ll send a reset link.</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--border)",
          }}
        />
      </label>

      {error && (
        <p className="auth-error mt-3">{error}</p>
      )}
      {message && <p className="auth-success mt-3">{message}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#0e0e11" }}
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <p className="mt-4 text-center">
        <Link href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}
