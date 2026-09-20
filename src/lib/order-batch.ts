import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendStockOrderLog } from "@/lib/stock-order-log";
import {
  isTwilioConfigured,
  sendTwilioWhatsApp,
  toWhatsAppAddress,
} from "@/lib/twilio/whatsapp";
import { sendVendorPlaceEmails } from "@/lib/vendor-place-emails";

export const ORDER_BATCH_WINDOW_MS = 2 * 60 * 60 * 1000;

const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

type SkuVendor = { id: string; name: string; email: string | null };

function orderVendors(order: {
  vendor: SkuVendor | null;
  notifiedVendors: SkuVendor[];
  product: { vendors?: SkuVendor[] };
}): SkuVendor[] {
  if (order.notifiedVendors.length > 0) return order.notifiedVendors;
  if (order.product.vendors && order.product.vendors.length > 0) return order.product.vendors;
  if (order.vendor) return [order.vendor];
  return [];
}

export function formatOwnerOrderLine(
  skuName: string,
  vendors: SkuVendor[],
): string {
  if (vendors.length === 0) return `${skuName} → No vendor assigned`;
  const parts = vendors.map((vendor) => {
    const email = vendor.email?.trim();
    return email
      ? `${vendor.name} (${email})`
      : `${vendor.name} (no email on file)`;
  });
  return `${skuName} → ${parts.join(", ")}`;
}

export function buildOwnerApprovalMessage(
  venueName: string,
  lines: string[],
): string {
  return `Hi ${venueName} team, this is BarTally.

The following items are running low and need to be reordered:

${lines.join("\n")}

Reply CONFIRM to send these orders to your vendors, or reply CANCEL to discard them.`;
}

export function isOwnerWhatsAppPath(adminWhatsappNumber: string | null | undefined): boolean {
  return isTwilioConfigured() && Boolean(adminWhatsappNumber?.trim());
}

export function scheduleOrderBatchFlush(tenantId: string, windowStart: Date) {
  const existing = flushTimers.get(tenantId);
  if (existing) return;
  const delay = Math.max(0, windowStart.getTime() + ORDER_BATCH_WINDOW_MS - Date.now());
  const timer = setTimeout(() => {
    flushTimers.delete(tenantId);
    void flushOrderBatch(tenantId);
  }, delay);
  flushTimers.set(tenantId, timer);
}

export async function ensureOrderBatchWindow(tenantId: string): Promise<void> {
  const started = await prisma.tenant.updateMany({
    where: { id: tenantId, orderBatchWindowStart: null },
    data: { orderBatchWindowStart: new Date() },
  });
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { orderBatchWindowStart: true },
  });
  if (!tenant?.orderBatchWindowStart) return;
  if (started.count === 0) {
    scheduleOrderBatchFlush(tenantId, tenant.orderBatchWindowStart);
    return;
  }
  scheduleOrderBatchFlush(tenantId, tenant.orderBatchWindowStart);
}

export async function flushDueOrderBatches(tenantId?: string): Promise<void> {
  const cutoff = new Date(Date.now() - ORDER_BATCH_WINDOW_MS);
  const tenants = await prisma.tenant.findMany({
    where: {
      ...(tenantId ? { id: tenantId } : {}),
      orderBatchWindowStart: { not: null, lte: cutoff },
    },
    select: { id: true },
  });
  for (const tenant of tenants) {
    await flushOrderBatch(tenant.id);
  }
}

export async function flushOrderBatch(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      adminWhatsappNumber: true,
      orderBatchWindowStart: true,
    },
  });
  if (!tenant?.orderBatchWindowStart) return;

  const dueAt = tenant.orderBatchWindowStart.getTime() + ORDER_BATCH_WINDOW_MS;
  if (Date.now() < dueAt) {
    scheduleOrderBatchFlush(tenantId, tenant.orderBatchWindowStart);
    return;
  }

  const windowStart = tenant.orderBatchWindowStart;
  const windowEnd = new Date(windowStart.getTime() + ORDER_BATCH_WINDOW_MS);

  const orders = await prisma.stockOrder.findMany({
    where: {
      tenantId,
      status: { in: [StockOrderStatus.PENDING, StockOrderStatus.MODIFIED] },
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    include: {
      product: {
        select: {
          name: true,
          vendors: { select: { id: true, name: true, email: true } },
        },
      },
      vendor: { select: { id: true, name: true, email: true } },
      notifiedVendors: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (orders.length === 0) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { orderBatchWindowStart: null },
    });
    flushTimers.delete(tenantId);
    return;
  }

  if (!isOwnerWhatsAppPath(tenant.adminWhatsappNumber)) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { orderBatchWindowStart: null },
    });
    flushTimers.delete(tenantId);
    return;
  }

  await prisma.stockOrder.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { status: StockOrderStatus.AWAITING_APPROVAL },
  });

  const lines = orders.map((order) =>
    formatOwnerOrderLine(order.product.name, orderVendors(order)),
  );
  const body = buildOwnerApprovalMessage(tenant.name, lines);
  const to = toWhatsAppAddress(tenant.adminWhatsappNumber!);
  if (to) {
    await sendTwilioWhatsApp(to, body);
  } else {
    console.error("[order-batch] invalid admin WhatsApp number", tenantId);
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { orderBatchWindowStart: null },
  });
  flushTimers.delete(tenantId);
}

const orderNotifyInclude = {
  product: { select: { name: true } },
  vendor: { select: { id: true, name: true, email: true } },
  notifiedVendors: { select: { id: true, name: true, email: true } },
} as const;

export async function confirmAwaitingOrders(tenantId: string): Promise<{
  count: number;
  emailWarnings: string[];
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  if (!tenant) return { count: 0, emailWarnings: [] };

  const orders = await prisma.stockOrder.findMany({
    where: { tenantId, status: StockOrderStatus.AWAITING_APPROVAL },
    include: orderNotifyInclude,
  });
  if (orders.length === 0) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { orderBatchWindowStart: null },
    });
    return { count: 0, emailWarnings: [] };
  }

  const now = new Date();
  await prisma.stockOrder.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { status: StockOrderStatus.PLACED, placedAt: now },
  });

  const emailWarnings = await sendVendorPlaceEmails({
    tenantName: tenant.name,
    orders,
    extraLog: "Order confirmed by bar owner via WhatsApp. Vendor email sent.",
    perVendorLogs: false,
  });

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { orderBatchWindowStart: null },
  });

  return { count: orders.length, emailWarnings };
}

export async function cancelAwaitingOrders(tenantId: string): Promise<number> {
  const orders = await prisma.stockOrder.findMany({
    where: { tenantId, status: StockOrderStatus.AWAITING_APPROVAL },
    select: { id: true },
  });
  if (orders.length === 0) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { orderBatchWindowStart: null },
    });
    return 0;
  }

  const now = new Date();
  await prisma.stockOrder.updateMany({
    where: { id: { in: orders.map((o) => o.id) } },
    data: { status: StockOrderStatus.CANCELLED, cancelledAt: now },
  });
  for (const order of orders) {
    await appendStockOrderLog(
      prisma,
      order.id,
      "Order cancelled by bar owner via WhatsApp.",
    );
  }
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { orderBatchWindowStart: null },
  });
  return orders.length;
}

export function classifyOwnerReply(body: string): "confirm" | "cancel" | "unknown" {
  const text = body.trim().toLowerCase();
  if (["confirm", "yes", "ok", "okay", "send", "approve"].includes(text)) {
    return "confirm";
  }
  if (["cancel", "no", "stop", "discard", "reject"].includes(text)) {
    return "cancel";
  }
  return "unknown";
}
