import { redirect } from "next/navigation";
import { Suspense } from "react";
import AuthPageShell from "@/components/AuthPageShell";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import OnboardingForm from "./OnboardingForm";

export default function OnboardingPage() {
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
        <OnboardingForm />
      </Suspense>
    </AuthPageShell>
  );
}
