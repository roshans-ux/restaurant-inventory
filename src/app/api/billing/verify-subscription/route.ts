import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { buildSessionPayload } from "@/lib/auth/build-session";
import { createSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth/session";
import { PRICE_LOCKED_UNTIL } from "@/lib/billing/constants";
import { RazorpayConfigError, verifySubscriptionPaymentSignature } from "@/lib/billing/razorpay";

const bodySchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const parsed = bodySchema.parse(await request.json());
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }
    if (tenant.billingStatus !== "PAYMENT_PENDING") {
      return apiError("PAYMENT_NOT_REQUIRED", "Payment is not required for this account", 400);
    }
    if (
      tenant.razorpaySubscriptionId &&
      tenant.razorpaySubscriptionId !== parsed.razorpay_subscription_id
    ) {
      return apiError("SUBSCRIPTION_MISMATCH", "Payment does not match this account", 400);
    }

    const ok = verifySubscriptionPaymentSignature({
      paymentId: parsed.razorpay_payment_id,
      subscriptionId: parsed.razorpay_subscription_id,
      signature: parsed.razorpay_signature,
    });
    if (!ok) {
      return apiError("INVALID_SIGNATURE", "Payment could not be verified", 400);
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenant.id },
        data: {
          billingStatus: "TRIAL",
          razorpaySubscriptionId: parsed.razorpay_subscription_id,
          priceLockedUntil: PRICE_LOCKED_UNTIL,
        },
      });
      return tx.user.update({
        where: { id: session.sub },
        data: { emailVerifiedAt: new Date() },
        include: { tenant: true },
      });
    });

    const token = await createSessionToken(buildSessionPayload(user));
    const response = NextResponse.json({
      ok: true,
      needsOnboarding: user.tenant.onboardingCompletedAt == null,
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    if (error instanceof RazorpayConfigError) {
      return apiError("RAZORPAY_NOT_CONFIGURED", "Payment is not available yet. Try again shortly.", 503);
    }
    if (error instanceof z.ZodError) {
      return apiError("INVALID_PAYMENT", "Missing payment details", 400);
    }
    console.error("[billing/verify-subscription]", error);
    return apiError("VERIFY_FAILED", "Could not verify payment", 500);
  }
}
