"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function VerifyEmailPanel() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") ?? "";
  const error = searchParams.get("error");
  const [email, setEmail] = useState(emailParam);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function resend() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(email ? { email } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Could not send email");
      }
      setMessage("If your account is unverified, we sent a new link to your inbox.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not send email");
    } finally {
      setLoading(false);
    }
  }

  const errorMessage =
    error === "invalid"
      ? "That verification link is invalid or expired. Request a new one below."
      : error === "missing"
        ? "No verification token was provided."
        : "";

  return (
    <div
      className="w-full max-w-md rounded-xl p-8"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-6 text-center">
        <span className="text-3xl" role="img" aria-label="email">
          ✉️
        </span>
        <h1 className="mt-2 text-xl font-semibold">Check your email</h1>
        <p className="mt-2">
          We sent a verification link to your inbox. Open it to activate your account, then you can
          finish setup.
        </p>
      </div>

      {errorMessage && <p className="auth-error mb-4">{errorMessage}</p>}

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">Email (to resend)</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </label>

      {message && (
        <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          {message}
        </p>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={resend}
        className="mt-6 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#0e0e11" }}
      >
        {loading ? "Sending…" : "Resend verification email"}
      </button>

      <p className="mt-4 text-center">
        Already verified? <Link href="/login">Sign in</Link>
      </p>
    </div>
  );
}
