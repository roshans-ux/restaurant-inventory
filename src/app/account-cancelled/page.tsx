import AuthPageShell from "@/components/AuthPageShell";
import { isAuthDisabled } from "@/lib/auth/auth-flags";
import { destinationAfterAuth } from "@/lib/auth/build-session";
import { getSessionFromCookies } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function formatCancelledDate(value: Date): string {
  return value.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export default async function AccountCancelledPage() {
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

  if (!user.tenant.cancelledAt) {
    redirect(destinationAfterAuth(user));
  }

  const venue = user.tenant.name;
  const date = formatCancelledDate(user.tenant.cancelledAt);

  return (
    <AuthPageShell>
      <div
        className="auth-copy w-full max-w-md rounded-xl p-8 text-center"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h1 className="text-xl font-semibold">Account cancelled</h1>
        <p className="mt-3">
          Your BarTally account for {venue} was cancelled on {date}. To restart, email{" "}
          <a href="mailto:roshan@bartally.in">roshan@bartally.in</a>.
        </p>
        <a
          href="/api/auth/logout?next=/login"
          className="mt-6 inline-block w-full rounded-lg py-2.5 text-sm font-semibold"
          style={{ background: "var(--accent)", color: "#0e0e11" }}
        >
          Log out
        </a>
      </div>
    </AuthPageShell>
  );
}
