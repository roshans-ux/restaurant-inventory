import type { Tenant, User } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth/session";

export function buildSessionPayload(user: User & { tenant: Tenant }): SessionPayload {
  return {
    sub: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
    tenantName: user.tenant.name,
    onboardingComplete: user.tenant.onboardingCompletedAt != null,
  };
}

export function slugFromRestaurantName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "venue";
}
