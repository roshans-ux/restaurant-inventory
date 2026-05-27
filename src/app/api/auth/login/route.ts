import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

async function bootstrapTenantIfEmpty(email: string, password: string) {
  const count = await prisma.user.count();
  if (count > 0) return null;

  const bootstrapEmail = (
    process.env.BOOTSTRAP_ADMIN_EMAIL ??
    (process.env.NODE_ENV !== "production" ? "admin@demo.local" : undefined)
  )?.toLowerCase();
  const bootstrapPassword =
    process.env.BOOTSTRAP_ADMIN_PASSWORD ??
    (process.env.NODE_ENV !== "production" ? "changeme123" : undefined);
  if (!bootstrapEmail || !bootstrapPassword) return null;
  if (email !== bootstrapEmail || password !== bootstrapPassword) return null;

  const tenantName = process.env.BOOTSTRAP_TENANT_NAME ?? "My Venue";
  const slug = tenantName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "venue";

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: `${slug}-${randomUUID().slice(0, 6)}`,
      posWebhookSecret: process.env.POS_WEBHOOK_SECRET ?? "dev-secret",
    },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: bootstrapEmail,
      passwordHash: hashPassword(bootstrapPassword),
      name: "Owner",
      role: "OWNER",
    },
    include: { tenant: true },
  });

  return user;
}

export async function POST(request: NextRequest) {
  try {
    const parsed = loginSchema.parse(await request.json());
    const email = parsed.email.toLowerCase().trim();

    let user = await prisma.user.findFirst({
      where: { email },
      include: { tenant: true },
    });

    if (!user) {
      const bootstrapped = await bootstrapTenantIfEmpty(email, parsed.password);
      if (!bootstrapped) {
        return apiError("INVALID_CREDENTIALS", "Invalid email or password", 401);
      }
      user = bootstrapped;
    }

    if (!verifyPassword(parsed.password, user.passwordHash)) {
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
        "Database is not running. Run `npm run db:start`, then `npm run db:setup`, and restart `npm run dev`.";
    } else if (raw.includes("not compatible with the provider")) {
      message =
        "Prisma client is out of date. Stop the dev server, run `npx prisma generate`, then start again with `npm run dev`.";
    }
    return apiError("LOGIN_FAILED", message, 500);
  }
}
