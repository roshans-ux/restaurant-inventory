import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { buildSessionPayload, slugFromRestaurantName } from "@/lib/auth/build-session";
import { HEARD_ABOUT_OPTIONS } from "@/lib/onboarding-options";
import { appendOnboardingRow } from "@/lib/google-sheets";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

const onboardingSchema = z.object({
  restaurantName: z.string().min(1).max(120),
  location: z.string().min(1).max(200),
  heardAboutUs: z.enum(HEARD_ABOUT_OPTIONS),
});

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const parsed = onboardingSchema.parse(await request.json());
    const restaurantName = parsed.restaurantName.trim();
    const location = parsed.location.trim();

    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId } });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    if (tenant.onboardingCompletedAt) {
      return apiError("ONBOARDING_ALREADY_COMPLETE", "Onboarding already completed", 400);
    }

    const slug = `${slugFromRestaurantName(restaurantName)}-${randomUUID().slice(0, 6)}`;
    const completedAt = new Date();

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        name: restaurantName,
        slug,
        location,
        heardAboutUs: parsed.heardAboutUs,
        onboardingCompletedAt: completedAt,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      include: { tenant: true },
    });
    if (!user) {
      return apiError("USER_NOT_FOUND", "User not found", 404);
    }

    user.tenant = updatedTenant;

    let sheetSynced = true;
    try {
      await appendOnboardingRow({
        email: user.email,
        restaurantName,
        location,
        heardAboutUs: parsed.heardAboutUs,
        signedUpAt: completedAt.toISOString(),
      });
    } catch (sheetError) {
      sheetSynced = false;
      console.error("[onboarding] Google Sheet append failed:", sheetError);
    }

    const token = await createSessionToken(buildSessionPayload(user));
    const response = NextResponse.json({ ok: true, sheetSynced });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_ONBOARDING", error.issues[0]?.message ?? "Invalid data", 400);
    }
    console.error("[onboarding]", error);
    return apiError("ONBOARDING_FAILED", "Could not save onboarding", 500);
  }
}
