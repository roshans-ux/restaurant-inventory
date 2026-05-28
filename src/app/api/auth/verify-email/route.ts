import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { buildSessionPayload } from "@/lib/auth/build-session";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const base = request.nextUrl.origin;

  if (!token) {
    return NextResponse.redirect(new URL("/verify-email?error=missing", base));
  }

  const consumed = await consumeAuthToken(token, "EMAIL_VERIFICATION");
  if (!consumed) {
    return NextResponse.redirect(new URL("/verify-email?error=invalid", base));
  }

  const user = await prisma.user.update({
    where: { id: consumed.userId },
    data: { emailVerifiedAt: new Date() },
    include: { tenant: true },
  });

  const sessionToken = await createSessionToken(buildSessionPayload(user));
  const dest = user.tenant.onboardingCompletedAt ? "/admin" : "/onboarding";
  const response = NextResponse.redirect(new URL(`${dest}?verified=1`, base));
  response.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions());
  return response;
}
