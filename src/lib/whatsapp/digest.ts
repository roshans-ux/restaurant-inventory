import { StockMovementType, StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addIsoDays, istIsoDate } from "@/lib/forecast/dates";
import { isWhatsAppConfigured, sendTemplate } from "@/lib/whatsapp/client";
import { joinTruncated } from "@/lib/whatsapp/sanitize";
import { skuQtyLine, stampApprovalBatch } from "@/lib/whatsapp/templates";

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-IN", {
    weekday: "short",
    timeZone: "UTC",
  });
}

export async function paymentsDueNext7Days(tenantId: string): Promise<string[]> {
  const startIso = istIsoDate();
  const endIso = addIsoDays(startIso, 7);
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T23:59:59.999Z`);
  const movements = await prisma.stockMovement.findMany({
    where: {
      type: StockMovementType.RECEIVE,
      paymentDueAt: { gte: start, lte: end },
      vendorId: { not: null },
      product: { tenantId },
    },
    include: { vendor: { select: { name: true } } },
  });

  const groups = new Map<string, { vendor: string; dueIso: string; bottles: number }>();
  for (const m of movements) {
    if (!m.paymentDueAt || !m.vendor) continue;
    const dueIso = istIsoDate(m.paymentDueAt);
    const key = `${m.vendor.name}:${dueIso}`;
    const bottles = Number(m.quantityInput ?? 0);
    const existing = groups.get(key);
    if (existing) existing.bottles += bottles;
    else groups.set(key, { vendor: m.vendor.name, dueIso, bottles });
  }

  return [...groups.values()].map(
    (g) => `Rs. due to ${g.vendor} on ${weekdayLabel(g.dueIso)}`,
  );
}

export async function sendMorningDigestForTenant(tenantId: string): Promise<{
  sent: boolean;
  result?: import("@/lib/whatsapp/client").WhatsAppSendResult;
}> {
  if (!isWhatsAppConfigured()) return { sent: false };
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, adminWhatsappNumber: true },
  });
  if (!tenant?.adminWhatsappNumber) return { sent: false };

  const pending = await prisma.stockOrder.findMany({
    where: {
      tenantId,
      status: {
        in: [StockOrderStatus.PENDING, StockOrderStatus.MODIFIED, StockOrderStatus.AWAITING_APPROVAL],
      },
    },
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const payments = await paymentsDueNext7Days(tenantId);
  if (pending.length === 0 && payments.length === 0) return { sent: false };

  let batchId: string | null = null;
  if (pending.length > 0) {
    batchId = await stampApprovalBatch(pending.map((o) => o.id));
  }

  const pendingLine =
    pending.length > 0
      ? joinTruncated(pending.map((o) => skuQtyLine(o.product.name, o.quantityBottles)))
      : "None";
  const payLine = payments.length > 0 ? joinTruncated(payments) : "None";

  const send = await sendTemplate(
    tenant.adminWhatsappNumber,
    "morning_digest",
    [tenant.name, pendingLine, payLine],
    batchId ? [`APPROVE_ALL:${batchId}`] : [],
    tenantId,
  );
  return { sent: send.ok, result: send };
}

export async function sendMorningDigests(): Promise<{ tenants: number; sent: number }> {
  const tenants = await prisma.tenant.findMany({
    where: { adminWhatsappNumber: { not: null } },
    select: { id: true },
  });
  let sent = 0;
  for (const tenant of tenants) {
    const result = await sendMorningDigestForTenant(tenant.id);
    if (result.sent) sent += 1;
  }
  return { tenants: tenants.length, sent };
}
