import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/http";
import { getBypassSession, isAuthDisabled } from "@/lib/auth/auth-disabled";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session =
    (isAuthDisabled() ? await getBypassSession() : null) ??
    (await getSessionFromRequest(request));
  if (!session) {
    return apiError("UNAUTHORIZED", "Sign in required", 401);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      location: true,
      heardAboutUs: true,
      onboardingCompletedAt: true,
      apiKey: true,
      posWebhookSecret: true,
    },
  });

  if (!tenant) {
    return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
  }

  return apiOk({
    user: {
      id: session.sub,
      email: session.email,
      role: session.role,
    },
    tenant,
    needsOnboarding: tenant.onboardingCompletedAt == null,
  });
}
