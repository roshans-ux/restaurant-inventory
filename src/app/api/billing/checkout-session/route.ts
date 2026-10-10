import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import {
  createPilotSubscription,
  getRazorpayKeyId,
  RazorpayApiError,
  RazorpayConfigError,
} from "@/lib/billing/razorpay";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    if (tenant.billingStatus !== "PAYMENT_PENDING") {
      return apiOk({ paymentPending: false });
    }

    let subscriptionId = tenant.razorpaySubscriptionId;
    if (!subscriptionId) {
      const user = await prisma.user.findUnique({ where: { id: session.sub } });
      const sub = await createPilotSubscription({
        plan: tenant.plan,
        outlets: tenant.outlets,
        tenantId: tenant.id,
        email: user?.email ?? session.email,
      });
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { razorpaySubscriptionId: sub.id },
      });
      subscriptionId = sub.id;
    }

    return apiOk({
      paymentPending: true,
      razorpayKeyId: getRazorpayKeyId(),
      subscriptionId,
    });
  } catch (error) {
    if (error instanceof RazorpayConfigError) {
      return apiError("RAZORPAY_NOT_CONFIGURED", "Payment is not available yet. Try again shortly.", 503);
    }
    if (error instanceof RazorpayApiError) {
      return apiError("RAZORPAY_FAILED", "Could not start payment. Try again.", 502);
    }
    console.error("[billing/checkout-session]", error);
    return apiError("CHECKOUT_SESSION_FAILED", "Could not start payment", 500);
  }
}
