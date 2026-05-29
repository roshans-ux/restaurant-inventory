import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { verifyPassword } from "@/lib/auth/password";
import { buildSessionPayload } from "@/lib/auth/build-session";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = loginSchema.parse(await request.json());
    const email = parsed.email.toLowerCase().trim();
    const password = parsed.password;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return apiError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    if (!user.emailVerifiedAt) {
      const pendingApproval = user.tenant.onboardingCompletedAt != null;
      return apiError(
        pendingApproval ? "PENDING_APPROVAL" : "EMAIL_NOT_VERIFIED",
        pendingApproval
          ? "Your account is awaiting approval. We will contact you on your phone number soon."
          : "Verify your email before signing in. Check your inbox or resend the link.",
        403,
        { email: user.email, pendingApproval },
      );
    }

    const token = await createSessionToken(buildSessionPayload(user));

    const response = NextResponse.json({
      ok: true,
      needsOnboarding: !user.tenant.onboardingCompletedAt,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
        tenant: { id: user.tenant.id, name: user.tenant.name, slug: user.tenant.slug },
      },
    });

    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("[auth/login]", error);
    const raw = error instanceof Error ? error.message : "Login failed";
    const prismaCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    let message = "Login failed. Check server logs and database connection.";
    if (raw.includes("DATABASE_URL") || raw.includes("PostgreSQL")) {
      message = raw;
    } else if (
      prismaCode === "ECONNREFUSED" ||
      prismaCode === "P1001" ||
      raw.includes("Can't reach database") ||
      raw.includes("ECONNREFUSED")
    ) {
      message =
        "Database is not reachable. Check DATABASE_URL on your host (e.g. Neon) and redeploy.";
    } else if (raw.includes("not compatible with the provider")) {
      message = "Prisma client is out of date. Run `npx prisma generate` and redeploy.";
    }
    return apiError("LOGIN_FAILED", message, 500);
  }
}
