import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

const bodySchema = z.object({
  alertIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;

  try {
    const payload = bodySchema.parse(await request.json().catch(() => ({})));
    const now = new Date();

    const where = {
      resolvedAt: null,
      readAt: null,
      product: { tenantId: session.tenantId },
      ...(payload.alertIds?.length ? { id: { in: payload.alertIds } } : {}),
    };

    const result = await prisma.alert.updateMany({
      where,
      data: { readAt: now },
    });

    return apiOk({ markedRead: result.count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError("INVALID_REQUEST", "Invalid request", 400);
    }
    return apiError("ALERTS_MARK_READ_FAILED", "Failed to mark alerts as read", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
