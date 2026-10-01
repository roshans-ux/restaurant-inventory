import { AlertType, StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendStockOrderLog } from "@/lib/stock-order-log";
import { sendVendorPlaceEmails } from "@/lib/vendor-place-emails";
import { isWhatsAppConfigured } from "@/lib/whatsapp/client";
import { filterOrdersDueToday, sendOrderApprovalTemplate, stampApprovalBatch } from "@/lib/whatsapp/templates";

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

export function isWhatsAppApprovalRequired(): boolean {
  const raw = process.env.WHATSAPP_APPROVAL_REQUIRED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function isOwnerWhatsAppPath(adminWhatsappNumber: string | null | undefined): boolean {
  return (
    isWhatsAppApprovalRequired() &&
    isWhatsAppConfigured() &&
    Boolean(adminWhatsappNumber?.trim())
  );
}

export const WHATSAPP_FAILED_NOTE = "WhatsApp failed";
export const WHATSAPP_FAILED_ALERT =
  "Couldn't reach owner on WhatsApp, approve in app";

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
          bottleSizeMl: true,
          reorderConfig: { select: { thresholdBottles: true } },
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

  const dueOrders = await filterOrdersDueToday(tenantId, orders);
  if (dueOrders.length === 0) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { orderBatchWindowStart: null },
    });
    flushTimers.delete(tenantId);
    return;
  }

  const batchId = await stampApprovalBatch(dueOrders.map((o) => o.id));
  const result = await sendOrderApprovalTemplate({
    tenantId,
    venueName: tenant.name,
    adminWhatsappNumber: tenant.adminWhatsappNumber!,
    orders: dueOrders,
    batchId,
  });
  if (!result.ok) {
    console.error("[order-batch] WhatsApp approval send failed", result.error);
    await markWhatsAppNotifyFailed(tenantId, dueOrders);
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { orderBatchWindowStart: null },
  });
  flushTimers.delete(tenantId);
}

async function markWhatsAppNotifyFailed(
  tenantId: string,
  orders: Array<{ id: string; productId: string; product: { name: string } }>,
) {
  const ids = orders.map((order) => order.id);
  await prisma.stockOrder.updateMany({
    where: { id: { in: ids } },
    data: { notes: WHATSAPP_FAILED_NOTE },
  });
  for (const order of orders) {
    await appendStockOrderLog(
      prisma,
      order.id,
      "WhatsApp failed: owner could not be reached. Approve in the app to send vendor emails.",
    );
  }
  const first = orders[0];
  if (!first) return;
  await prisma.alert.create({
    data: {
      productId: first.productId,
      type: AlertType.WHATSAPP_FAILED,
      message: WHATSAPP_FAILED_ALERT,
      referenceKey: `whatsapp-failed:${tenantId}:${first.id}:${Date.now()}`,
    },
  }).catch((error) => {
    console.error("[order-batch] failed to create WhatsApp failed alert", error);
  });
}

const orderNotifyInclude = {
  product: { select: { name: true } },
  vendor: { select: { id: true, name: true, email: true } },
  notifiedVendors: { select: { id: true, name: true, email: true } },
} as const;

export async function confirmAwaitingOrders(
  tenantId: string,
  batchId?: string | null,
): Promise<{
  count: number;
  names: string[];
  emailWarnings: string[];
  already: "approved" | "cancelled" | null;
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  if (!tenant) return { count: 0, names: [], emailWarnings: [], already: null };

  const batchFilter = batchId ? { approvalBatchId: batchId } : {};
  const orders = await prisma.stockOrder.findMany({
    where: { tenantId, status: StockOrderStatus.AWAITING_APPROVAL, ...batchFilter },
    include: orderNotifyInclude,
  });
  if (orders.length === 0) {
    const prior = await prisma.stockOrder.findMany({
      where: {
        tenantId,
        ...batchFilter,
        status: { in: [StockOrderStatus.PLACED, StockOrderStatus.CANCELLED] },
      },
      select: { status: true },
    });
    const already =
      prior.length === 0
        ? null
        : prior.every((o) => o.status === StockOrderStatus.CANCELLED)
          ? "cancelled"
          : "approved";
    if (!batchId) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { orderBatchWindowStart: null },
      });
    }
    return { count: 0, names: [], emailWarnings: [], already };
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

  return { count: orders.length, names: orders.map((o) => o.product.name), emailWarnings, already: null };
}

export async function cancelAwaitingOrders(
  tenantId: string,
  batchId?: string | null,
): Promise<{ count: number; names: string[]; already: "approved" | "cancelled" | null }> {
  const openStatuses = [
    StockOrderStatus.AWAITING_APPROVAL,
    StockOrderStatus.PENDING,
    StockOrderStatus.MODIFIED,
  ];
  const orders = await prisma.stockOrder.findMany({
    where: batchId
      ? { approvalBatchId: batchId, status: { in: openStatuses } }
      : { tenantId, status: StockOrderStatus.AWAITING_APPROVAL },
    select: { id: true, tenantId: true, product: { select: { name: true } } },
  });
  if (orders.length === 0) {
    const prior = await prisma.stockOrder.findMany({
      where: {
        ...(batchId ? { approvalBatchId: batchId } : { tenantId }),
        status: { in: [StockOrderStatus.PLACED, StockOrderStatus.CANCELLED] },
      },
      select: { status: true },
    });
    const already =
      prior.length === 0
        ? null
        : prior.every((o) => o.status === StockOrderStatus.PLACED)
          ? "approved"
          : "cancelled";
    if (!batchId) {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { orderBatchWindowStart: null },
      });
    }
    return { count: 0, names: [], already };
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
  const tenantIds = [...new Set(orders.map((order) => order.tenantId))];
  await prisma.tenant.updateMany({
    where: { id: { in: tenantIds } },
    data: { orderBatchWindowStart: null },
  });
  return { count: orders.length, names: orders.map((o) => o.product.name), already: null };
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
