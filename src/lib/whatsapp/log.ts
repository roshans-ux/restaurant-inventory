import { prisma } from "@/lib/prisma";

export type WhatsAppDirection = "in" | "out";

export async function logWhatsAppMessage(args: {
  tenantId?: string | null;
  templateName?: string | null;
  recipient: string;
  metaMessageId?: string | null;
  direction: WhatsAppDirection;
  status: string;
  reason?: string | null;
  error?: string | null;
}) {
  try {
    return await prisma.whatsAppMessageLog.create({
      data: {
        tenantId: args.tenantId ?? null,
        templateName: args.templateName ?? null,
        recipient: args.recipient,
        metaMessageId: args.metaMessageId ?? null,
        direction: args.direction,
        status: args.status,
        reason: args.reason ?? null,
        error: args.error ?? null,
      },
    });
  } catch (error) {
    if (args.metaMessageId) {
      const updated = await prisma.whatsAppMessageLog.updateMany({
        where: { metaMessageId: args.metaMessageId },
        data: {
          status: args.status,
          reason: args.reason ?? null,
          error: args.error ?? null,
        },
      });
      if (updated.count > 0) return null;
    }
    console.error("[whatsapp] failed to write WhatsAppMessageLog", error);
    return null;
  }
}

export async function updateWhatsAppStatus(metaMessageId: string, status: string, error?: string | null) {
  if (!metaMessageId) return;
  await prisma.whatsAppMessageLog.updateMany({
    where: { metaMessageId },
    data: {
      status,
      ...(error ? { error } : {}),
    },
  });
}
