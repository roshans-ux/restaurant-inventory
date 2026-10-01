import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { isSession, requireApiSession } from "@/lib/auth/require-session";

export async function GET(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const messages = await prisma.whatsAppMessageLog.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return apiOk({
      messages: messages.map((m) => ({
        id: m.id,
        templateName: m.templateName,
        recipient: m.recipient,
        direction: m.direction,
        status: m.status,
        reason: m.reason,
        error: m.error,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    return apiError("WHATSAPP_LOG_FAILED", "Could not load WhatsApp messages", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
