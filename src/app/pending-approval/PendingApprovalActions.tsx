"use client";

import { useEffect, useState } from "react";

export default function PendingApprovalActions() {
  const [status, setStatus] = useState<"waiting" | "approved" | "error">("waiting");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/auth/approval-status", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (json?.data?.approved) {
          setStatus("approved");
          window.location.href = "/api/auth/refresh-session?next=/admin";
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    check();
    const interval = setInterval(check, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  function continueToApp() {
    window.location.href = "/api/auth/refresh-session?next=/admin";
  }

  return (
    <div className="mt-4 space-y-3">
      {status === "approved" && (
        <p className="auth-success">Account approved — opening the app…</p>
      )}
      <p>
        Once approved,{" "}
        <button type="button" onClick={continueToApp} className="underline">
          continue to the app
        </button>{" "}
        or{" "}
        <a href="/api/auth/logout?next=/login" className="underline">
          sign out and sign in again
        </a>
        .
      </p>
      <p className="text-white/60" style={{ fontSize: 12 }}>
        This page checks for approval every few seconds.
      </p>
    </div>
  );
}
