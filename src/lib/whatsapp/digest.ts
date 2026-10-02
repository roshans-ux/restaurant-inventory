import { StockMovementType, StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addIsoDays, istIsoDate } from "@/lib/forecast/dates";
import { isWhatsAppConfigured, sendTemplate } from "@/lib/whatsapp/client";
import { isWhatsAppEnabled } from "@/lib/whatsapp/enabled";
import { getCachedForecastsForTenant } from "@/lib/forecast/cache";
import { joinTruncated } from "@/lib/whatsapp/sanitize";
import { formatTemplateOrderItems, stampApprovalBatch } from "@/lib/whatsapp/templates";

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-IN", {
    weekday: "long",
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

  const groups = new Map<string, { vendor: string; dueIso: string }>();
  for (const m of movements) {
    if (!m.paymentDueAt || !m.vendor) continue;
    const dueIso = istIsoDate(m.paymentDueAt);
    const key = `${m.vendor.name}:${dueIso}`;
    if (!groups.has(key)) groups.set(key, { vendor: m.vendor.name, dueIso });
  }

  return [...groups.values()]
    .sort((a, b) => a.dueIso.localeCompare(b.dueIso) || a.vendor.localeCompare(b.vendor, "en", { sensitivity: "base" }))
    .map((g) => `${g.vendor} on ${weekdayLabel(g.dueIso)}`);
}

export async function sendMorningDigestForTenant(tenantId: string): Promise<{
  sent: boolean;
  skipped?: string;
  result?: import("@/lib/whatsapp/client").WhatsAppSendResult;
}> {
  if (!isWhatsAppEnabled() || !isWhatsAppConfigured()) {
    return { sent: false, skipped: "WhatsApp not configured" };
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      adminWhatsappNumber: true,
      whatsappUpdates: true,
      whatsappOrderApproval: true,
    },
  });
  if (!tenant?.adminWhatsappNumber || !tenant.whatsappUpdates) {
    return { sent: false, skipped: "WhatsApp updates off" };
  }

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
  if (pending.length > 0 && tenant.whatsappOrderApproval) {
    batchId = await stampApprovalBatch(pending.map((o) => o.id));
  }

  const forecasts = await getCachedForecastsForTenant(tenantId);
  const pendingLine =
    pending.length > 0 ? formatTemplateOrderItems(pending, forecasts) : "None";
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

export async function sendMorningDigests(): Promise<{
  tenants: number;
  sent: number;
  skipped?: string;
}> {
  if (!isWhatsAppEnabled() || !isWhatsAppConfigured()) {
    return { tenants: 0, sent: 0, skipped: "WhatsApp not configured" };
  }
  const tenants = await prisma.tenant.findMany({
    where: { whatsappUpdates: true, adminWhatsappNumber: { not: null } },
    select: { id: true },
  });
  let sent = 0;
  for (const tenant of tenants) {
    const result = await sendMorningDigestForTenant(tenant.id);
    if (result.sent) sent += 1;
  }
  return { tenants: tenants.length, sent };
}
