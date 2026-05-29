import { redirect } from "next/navigation";
import { Suspense } from "react";
import AuthPageShell from "@/components/AuthPageShell";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  if (isAuthDisabled()) {
    redirect("/admin");
  }

  return (
    <AuthPageShell>
      <Suspense
        fallback={
          <div className="auth-copy">Loading…</div>
        }
      >
        <SignupForm />
      </Suspense>
    </AuthPageShell>
  );
}
