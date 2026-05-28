"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/admin";
  const resetSuccess = searchParams.get("reset") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState(resetSuccess ? "Password updated. Sign in with your new password." : "");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const raw = await res.text();
      let data: {
        error?: { message?: string; code?: string };
        ok?: boolean;
        needsOnboarding?: boolean;
      } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          res.ok
            ? "Invalid server response"
            : "Server error. Run `npm run db:start` and `npm run db:setup`, then restart `npm run dev`.",
        );
      }
      if (!res.ok) {
        if (data.error?.code === "EMAIL_NOT_VERIFIED") {
          const addr = encodeURIComponent(email.toLowerCase().trim());
          router.replace(`/verify-email?email=${addr}`);
          router.refresh();
          return;
        }
        throw new Error(
          data.error?.message ?? data.error?.code ?? "Login failed",
        );
      }
      if (data.needsOnboarding) {
        router.replace("/onboarding");
      } else {
        router.replace(next.startsWith("/") ? next : "/admin");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md rounded-xl p-8"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="mb-6 text-center">
        <span className="text-3xl" role="img" aria-label="bar">
          🍶
        </span>
        <h1 className="mt-2 text-xl font-semibold">Bar Inventory</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Sign in to your venue admin
        </p>
      </div>

      <div className="grid gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Email
          </span>
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
              color: "var(--text-primary)",
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Password
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </label>
      </div>

      <p className="mt-1 text-right text-xs">
        <Link href="/forgot-password" style={{ color: "var(--accent)" }}>
          Forgot password?
        </Link>
      </p>

      {info && (
        <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          {info}
        </p>
      )}

      {error && (
        <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#0e0e11" }}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        New here?{" "}
        <Link href="/signup" style={{ color: "var(--accent)" }}>
          Create an account
        </Link>
      </p>
    </form>
  );
}
