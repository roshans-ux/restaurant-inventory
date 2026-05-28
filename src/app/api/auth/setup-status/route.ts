import { getBootstrapCredentials } from "@/lib/auth/bootstrap";
import { apiOk } from "@/lib/http";
import { prisma } from "@/lib/prisma";

/** Public health check for first-time deploy setup (no secrets exposed). */
export async function GET() {
  const userCount = await prisma.user.count();
  const { email, password } = getBootstrapCredentials();

  return apiOk({
    userCount,
    bootstrapConfigured: Boolean(email && password),
    canBootstrap: userCount === 0 && Boolean(email && password),
    hint:
      userCount > 0
        ? "Users exist — sign in with an existing account or clear the User table to bootstrap again."
        : !email || !password
          ? "Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD, then redeploy."
          : "Database is empty and bootstrap is configured — first login will create the owner account.",
  });
}
