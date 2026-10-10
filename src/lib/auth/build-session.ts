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
    emailVerified: user.emailVerifiedAt != null,
    cancelled: user.tenant.cancelledAt != null,
    paymentPending: user.tenant.billingStatus === "PAYMENT_PENDING",
    iat: Math.floor(Date.now() / 1000),
  };
}

export function destinationAfterAuth(user: User & { tenant: Tenant }): string {
  if (user.tenant.cancelledAt) return "/account-cancelled";
  if (user.tenant.billingStatus === "PAYMENT_PENDING") return "/signup?pay=1";
  if (user.tenant.onboardingCompletedAt && !user.emailVerifiedAt) return "/pending-approval";
  if (!user.tenant.onboardingCompletedAt) return "/onboarding";
  return "/admin";
}

export function slugFromRestaurantName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "venue";
}
