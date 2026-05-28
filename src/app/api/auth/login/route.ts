import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { verifyPassword } from "@/lib/auth/password";
import { bootstrapFailureMessage, bootstrapTenantIfEmpty } from "@/lib/auth/bootstrap";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = loginSchema.parse(await request.json());
    const email = parsed.email.toLowerCase().trim();
    const password = parsed.password.trim();

    let user = await prisma.user.findFirst({
      where: { email },
      include: { tenant: true },
    });

    if (!user) {
      const bootstrap = await bootstrapTenantIfEmpty(email, password);
      if (!bootstrap.user) {
        const message = bootstrap.reason
          ? bootstrapFailureMessage(bootstrap.reason)
          : "Invalid email or password";
        return apiError("INVALID_CREDENTIALS", message, 401);
      }
      user = bootstrap.user;
    }

    if (!verifyPassword(password, user.passwordHash)) {
      return apiError("INVALID_CREDENTIALS", "Invalid email or password", 401);
    }

    const token = await createSessionToken({
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      tenantName: user.tenant.name,
    });

    const response = NextResponse.json({
      ok: true,
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
