import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import {
  formatCancelRequestIst,
  sendCancellationRequestEmails,
} from "@/lib/email/cancel-request";

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) {
      return apiError("TENANT_NOT_FOUND", "Venue not found", 404);
    }

    await sendCancellationRequestEmails({
      venueName: tenant.name,
      venueId: tenant.id,
      userEmail: session.email,
      requestedAtIst: formatCancelRequestIst(new Date()),
    });

    return apiOk({
      message: "Cancellation requested. Check your email.",
      venueName: tenant.name,
    });
  } catch (error) {
    console.error("[account/cancel-request]", error);
    return apiError("CANCEL_REQUEST_FAILED", "Could not send the cancellation request.", 500);
  }
}
