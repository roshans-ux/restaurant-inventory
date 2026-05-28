"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password !== passwordConfirm) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, passwordConfirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Sign up failed");
      }
      router.replace("/onboarding");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
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
        <h1 className="mt-2 text-xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Bar Inventory — manage your venue stock
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
            autoComplete="new-password"
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
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Confirm password
          </span>
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </label>
      </div>

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
        {loading ? "Creating account…" : "Sign up"}
      </button>

      <p className="mt-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--accent)" }}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
