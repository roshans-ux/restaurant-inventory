import { redirect } from "next/navigation";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import OnboardingForm from "./OnboardingForm";

export default function OnboardingPage() {
  if (isAuthDisabled()) {
    redirect("/admin");
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: "var(--background)" }}
    >
      <OnboardingForm />
    </div>
  );
}
