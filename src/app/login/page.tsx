import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  if (isAuthDisabled()) {
    redirect("/admin");
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: "var(--background)" }}
    >
      <Suspense
        fallback={
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
