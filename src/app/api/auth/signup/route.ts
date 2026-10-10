import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { hashPassword } from "@/lib/auth/password";
import { buildSessionPayload, slugFromRestaurantName } from "@/lib/auth/build-session";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { INDIAN_PHONE_ERROR, normalizeIndianPhone } from "@/lib/phone-in";
import {
  parseBillingPlan,
  parseOutlets,
  PRICE_LOCKED_UNTIL,
  TRIAL_ENDS_AT,
} from "@/lib/billing/constants";
import { claimFoundingCode, FoundingCodeError } from "@/lib/billing/founding";
import {
  createPilotSubscription,
  getRazorpayKeyId,
  RazorpayApiError,
  RazorpayConfigError,
} from "@/lib/billing/razorpay";

const signupSchema = z
  .object({
    email: z.string().trim().min(1, "Invalid Email").email("Invalid Email"),
    phone: z.string().trim().min(1, INDIAN_PHONE_ERROR),
    password: z.string().min(8, "Password must be at least 8 characters"),
    passwordConfirm: z.string().min(8),
    plan: z.string().optional(),
    outlets: z.union([z.number(), z.string()]).optional(),
    foundingCode: z.string().optional(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Passwords do not match",
    path: ["passwordConfirm"],
  });

function defaultPosWebhookSecret() {
  const fromEnv = process.env.POS_WEBHOOK_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    return randomBytes(32).toString("hex");
  }
  return "dev-secret";
}

export async function POST(request: NextRequest) {
  try {
    const parsed = signupSchema.parse(await request.json());
    const email = parsed.email.toLowerCase().trim();
    const phone = normalizeIndianPhone(parsed.phone);
    if (!phone) {
      return apiError("INVALID_SIGNUP", INDIAN_PHONE_ERROR, 400, { field: "phone" });
    }
    const password = parsed.password;
    const plan = parseBillingPlan(parsed.plan);
    const outlets = parseOutlets(parsed.outlets, plan);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return apiError(
        "EMAIL_IN_USE",
        "An account with this email already exists. Sign in instead, or use Forgot password.",
        409,
        { field: "email" },
      );
    }

    const slugBase = slugFromRestaurantName("new-venue");

    const created = await prisma.$transaction(async (tx) => {
      const founding = await claimFoundingCode(tx, parsed.foundingCode);
      const tenant = await tx.tenant.create({
        data: {
          name: "My Restaurant",
          slug: `${slugBase}-${randomUUID().slice(0, 6)}`,
          posWebhookSecret: defaultPosWebhookSecret(),
          plan,
          outlets,
          foundingCode: founding.storedCode,
          setupFeeWaived: founding.used,
          trialEndsAt: TRIAL_ENDS_AT,
          billingStatus: founding.used ? "TRIAL" : "PAYMENT_PENDING",
          priceLockedUntil: founding.used ? PRICE_LOCKED_UNTIL : null,
        },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email,
          phone,
          passwordHash: hashPassword(password),
          role: "OWNER",
          emailVerifiedAt: founding.used ? new Date() : null,
        },
        include: { tenant: true },
      });
      return { user, foundingUsed: founding.used };
    });

    let checkout: { razorpayKeyId: string; subscriptionId: string } | null = null;
    if (!created.foundingUsed) {
      try {
        const sub = await createPilotSubscription({
          plan,
          outlets,
          tenantId: created.user.tenantId,
          email,
        });
        const tenant = await prisma.tenant.update({
          where: { id: created.user.tenantId },
          data: { razorpaySubscriptionId: sub.id },
        });
        created.user.tenant = tenant;
        checkout = {
          razorpayKeyId: getRazorpayKeyId(),
          subscriptionId: sub.id,
        };
      } catch (err) {
        if (err instanceof RazorpayConfigError || err instanceof RazorpayApiError) {
          console.error("[auth/signup] Razorpay subscription create failed");
        } else {
          console.error("[auth/signup] Razorpay subscription create failed", err);
        }
      }
    }

    const token = await createSessionToken(buildSessionPayload(created.user));
    const response = NextResponse.json({
      ok: true,
      needsOnboarding: true,
      needsPayment: !created.foundingUsed,
      founding: created.foundingUsed,
      checkout,
      user: { email: created.user.email },
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof FoundingCodeError) {
      return apiError(error.code, error.message, 400, { field: "foundingCode" });
    }
    if (error instanceof z.ZodError) {
      const issue = error.issues[0];
      const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
      return apiError("INVALID_SIGNUP", issue?.message ?? "Invalid signup data", 400, { field });
    }
    console.error("[auth/signup]", error);
    return apiError("SIGNUP_FAILED", "Could not create account", 500);
  }
}
