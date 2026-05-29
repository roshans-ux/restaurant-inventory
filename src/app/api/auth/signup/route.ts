import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { hashPassword } from "@/lib/auth/password";
import { buildSessionPayload, slugFromRestaurantName } from "@/lib/auth/build-session";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

const signupSchema = z
  .object({
    email: z.string().trim().min(1, "Invalid Email").email("Invalid Email"),
    phone: z
      .string()
      .trim()
      .min(7, "Enter a valid phone number")
      .max(20, "Enter a valid phone number")
      .regex(/^[+0-9()\-\s]+$/, "Enter a valid phone number"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    passwordConfirm: z.string().min(8),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  });

export async function POST(request: NextRequest) {
  try {
    const parsed = signupSchema.parse(await request.json());
    const email = parsed.email.toLowerCase().trim();
    const phone = parsed.phone.trim();
    const password = parsed.password;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return apiError("EMAIL_IN_USE", "An account with this email already exists", 409, {
        field: "email",
      });
    }

    const slugBase = slugFromRestaurantName("new-venue");
    const tenant = await prisma.tenant.create({
      data: {
        name: "My Restaurant",
        slug: `${slugBase}-${randomUUID().slice(0, 6)}`,
        posWebhookSecret: (process.env.POS_WEBHOOK_SECRET ?? "dev-secret").trim(),
      },
    });

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email,
        phone,
        passwordHash: hashPassword(password),
        role: "OWNER",
        emailVerifiedAt: null,
      },
      include: { tenant: true },
    });

    const token = await createSessionToken(buildSessionPayload(user));

    const response = NextResponse.json({
      ok: true,
      needsOnboarding: true,
      user: { email: user.email },
    });

    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
      return apiError("INVALID_SIGNUP", issue?.message ?? "Invalid signup data", 400, { field });
    }
    console.error("[auth/signup]", error);
    return apiError("SIGNUP_FAILED", "Could not create account", 500);
  }
}
