import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildSessionPayload } from "@/lib/auth/build-session";
import {
  createSessionToken,
  getSessionFromRequest,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth/session";

/** Re-issue JWT from DB (e.g. after approval when cookie still has emailVerified: false). */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    include: { tenant: true },
  });

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nextParam = request.nextUrl.searchParams.get("next");
  const next =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : user.tenant.onboardingCompletedAt && user.emailVerifiedAt
        ? "/admin"
        : user.tenant.onboardingCompletedAt
          ? "/pending-approval"
          : "/onboarding";

  const token = await createSessionToken(buildSessionPayload(user));
  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}
