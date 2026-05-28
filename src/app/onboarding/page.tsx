import { redirect } from "next/navigation";
import AuthPageShell from "@/components/AuthPageShell";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import OnboardingForm from "./OnboardingForm";

export default function OnboardingPage() {
  if (isAuthDisabled()) {
    redirect("/admin");
  }

  return (
    <AuthPageShell>
      <OnboardingForm />
    </AuthPageShell>
  );
}
