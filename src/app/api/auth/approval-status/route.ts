import { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/http";
import { getSessionFromRequest } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

/** DB-backed approval check (JWT may still say unverified). */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session) {
    return apiError("UNAUTHORIZED", "Sign in required", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { email: true, emailVerifiedAt: true },
  });

  if (!user) {
    return apiError("USER_NOT_FOUND", "Account not found", 404);
  }

  return apiOk({
    approved: user.emailVerifiedAt != null,
    email: user.email,
    sessionSaysVerified: session.emailVerified,
  });
}
