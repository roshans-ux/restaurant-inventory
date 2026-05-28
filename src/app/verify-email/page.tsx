import { Suspense } from "react";
import AuthPageShell from "@/components/AuthPageShell";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import { redirect } from "next/navigation";
import VerifyEmailPanel from "./VerifyEmailPanel";

export default function VerifyEmailPage() {
  if (isAuthDisabled()) {
    redirect("/admin");
  }

  return (
    <AuthPageShell>
      <Suspense
        fallback={
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading…
          </div>
        }
      >
        <VerifyEmailPanel />
      </Suspense>
    </AuthPageShell>
  );
}
