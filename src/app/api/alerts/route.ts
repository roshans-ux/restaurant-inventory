import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const alerts = await prisma.alert.findMany({
      where: {
        resolvedAt: null,
        product: { tenantId: session.tenantId },
      },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });

    const unreadCount = alerts.filter((a) => a.readAt == null).length;

    recordApiMetric("GET /api/alerts", 200, Date.now() - startedAt);
    return Response.json({ ok: true, alerts, unreadCount });
  } catch (error) {
    recordApiMetric("GET /api/alerts", 500, Date.now() - startedAt);
    return apiError("ALERTS_FETCH_FAILED", "Failed to fetch alerts", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
