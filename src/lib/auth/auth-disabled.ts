import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth/session";

export function isAuthDisabled(): boolean {
  return process.env.DISABLE_AUTH === "true";
}

let cachedBypass: SessionPayload | null = null;

/** Uses the first user/tenant in the DB when auth is bypassed for testing. */
export async function getBypassSession(): Promise<SessionPayload | null> {
  if (!isAuthDisabled()) return null;
  if (cachedBypass) return cachedBypass;

  const user = await prisma.user.findFirst({
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  if (user) {
    cachedBypass = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      tenantName: user.tenant.name,
    };
    return cachedBypass;
  }

  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  if (!tenant) return null;

  cachedBypass = {
    sub: "auth-bypass",
    tenantId: tenant.id,
    email: "bypass@local.dev",
    role: "ADMIN",
    tenantName: tenant.name,
  };
  return cachedBypass;
}
