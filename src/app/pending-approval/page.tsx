import AuthPageShell from "@/components/AuthPageShell";
import PendingApprovalActions from "./PendingApprovalActions";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PendingApprovalPage() {
  if (isAuthDisabled()) {
    redirect("/admin");
  }

  const session = await getSessionFromCookies();
  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    include: { tenant: true },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.emailVerifiedAt) {
    redirect("/api/auth/refresh-session?next=/admin");
  }

  if (!user.tenant.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  return (
    <AuthPageShell>
      <div
        className="auth-copy w-full max-w-md rounded-xl p-8 text-center"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <span className="text-3xl" role="img" aria-label="hourglass">
          ⏳
        </span>
        <h1 className="mt-3 text-xl font-semibold">We&apos;re reviewing your account</h1>
        <p className="mt-3">
          Thanks for completing your restaurant details. We&apos;ll approve your account and confirm on{" "}
          <strong>{user.phone || "your phone number"}</strong>
          {" "}
          when it&apos;s live — usually in less than a couple of hours.
        </p>
        <PendingApprovalActions />
      </div>
    </AuthPageShell>
  );
}
