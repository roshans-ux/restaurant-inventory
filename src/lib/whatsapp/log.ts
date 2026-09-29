import { prisma } from "@/lib/prisma";

export type WhatsAppDirection = "in" | "out";

export async function logWhatsAppMessage(args: {
  tenantId?: string | null;
  templateName?: string | null;
  recipient: string;
  metaMessageId?: string | null;
  direction: WhatsAppDirection;
  status: string;
  error?: string | null;
}) {
  return prisma.whatsAppMessageLog.create({
    data: {
      tenantId: args.tenantId ?? null,
      templateName: args.templateName ?? null,
      recipient: args.recipient,
      metaMessageId: args.metaMessageId ?? null,
      direction: args.direction,
      status: args.status,
      error: args.error ?? null,
    },
  });
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
