"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HEARD_ABOUT_OPTIONS } from "@/lib/onboarding-options";

export default function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justSignedUp = searchParams.get("signedup") === "1";
  const [restaurantName, setRestaurantName] = useState("");
  const [location, setLocation] = useState("");
  const [heardAboutUs, setHeardAboutUs] = useState<string>(HEARD_ABOUT_OPTIONS[0]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantName, location, heardAboutUs }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? "Could not save details");
      }
      router.replace("/pending-approval");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save details");
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
      <div className="mb-6">
        {justSignedUp && (
          <p
            className="auth-success mb-4 rounded-lg px-3 py-2.5"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            You&apos;re signed up. Complete your restaurant details and we&apos;ll be in touch
            shortly.
          </p>
        )}
        <h1 className="text-xl font-semibold">Tell us about your restaurant</h1>
        <p className="mt-1">This helps us set up your venue and improve the product.</p>
      </div>

      <div className="grid gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">
            Restaurant name
          </span>
          <input
            required
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            placeholder="e.g. The Copper Fox"
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">
            Location
          </span>
          <input
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, state or neighborhood"
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="font-medium">
            How did you hear about us?
          </span>
          <select
            required
            value={heardAboutUs}
            onChange={(e) => setHeardAboutUs(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          >
            {HEARD_ABOUT_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="auth-error mt-3">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#0e0e11" }}
      >
        {loading ? "Saving…" : "Continue to dashboard"}
      </button>
    </form>
  );
}
