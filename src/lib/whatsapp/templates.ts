import { randomUUID } from "node:crypto";
import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCachedForecastsForTenant } from "@/lib/forecast/cache";
import type { TenantForecastMap } from "@/lib/forecast/compute";
import { istIsoDate } from "@/lib/forecast/dates";
import { isBelowKeepAtLeast, isForecastReorderDue, restockUrgency } from "@/lib/forecast/restock";
import { sendTemplate } from "@/lib/whatsapp/client";
import { joinTruncated } from "@/lib/whatsapp/sanitize";

export type WhatsAppOrderItem = {
  productId: string;
  product: { name: string };
  quantityBottles: number;
};

export function skuQtyLine(name: string, qty: number): string {
  return `${name} (${qty})`;
}

export function sortOrdersByUrgency<T extends WhatsAppOrderItem>(
  orders: T[],
  forecasts: TenantForecastMap,
  todayIso = istIsoDate(),
): T[] {
  return [...orders].sort((a, b) => {
    const ua = restockUrgency({ todayIso, orderBy: forecasts[a.productId]?.orderBy ?? null });
    const ub = restockUrgency({ todayIso, orderBy: forecasts[b.productId]?.orderBy ?? null });
    if (ua.rank !== ub.rank) return ua.rank - ub.rank;
    if (ua.rank === 0 && ua.overdueDays !== ub.overdueDays) {
      return ub.overdueDays - ua.overdueDays;
    }
    return a.product.name.localeCompare(b.product.name, "en", { sensitivity: "base" });
  });
}

export function formatTemplateOrderItems(
  orders: WhatsAppOrderItem[],
  forecasts: TenantForecastMap,
): string {
  return joinTruncated(
    sortOrdersByUrgency(orders, forecasts).map((o) => skuQtyLine(o.product.name, o.quantityBottles)),
  );
}

export async function formatWhatsAppConfirmationReply(args: {
  tenantId: string;
  venueName: string;
  verb: "Approved" | "Cancelled";
  already: boolean;
  items: WhatsAppOrderItem[];
}): Promise<string> {
  const forecasts = await getCachedForecastsForTenant(args.tenantId);
  const sorted = sortOrdersByUrgency(args.items, forecasts);
  const count = sorted.length;
  const plural = count === 1 ? "" : "s";
  const first = args.already
    ? `Already ${args.verb === "Approved" ? "approved" : "cancelled"} ${count} order${plural} for ${args.venueName}:`
    : `${args.verb} ${count} order${plural} for ${args.venueName}:`;
  const lines = sorted.map((o) => `• ${o.product.name} × ${o.quantityBottles}`);
  const parts = [first, ...lines];
  if (!args.already && args.verb === "Approved") {
    parts.push("Vendors have been emailed.");
  }
  return parts.join("\n");
}

export async function filterOrdersDueToday<
  T extends {
    productId: string;
    product: { bottleSizeMl?: unknown; reorderConfig?: { thresholdBottles: unknown } | null };
  },
>(tenantId: string, orders: T[]): Promise<T[]> {
  const today = istIsoDate();
  const forecasts = await getCachedForecastsForTenant(tenantId);
  return orders.filter((order) => {
    const forecast = forecasts[order.productId];
    const bottleSizeMl = Number(order.product.bottleSizeMl ?? 750);
    const threshold = order.product.reorderConfig
      ? Math.round(Number(order.product.reorderConfig.thresholdBottles))
      : null;
    const currentMl = forecast?.currentMl ?? 0;
    if (isBelowKeepAtLeast(currentMl, threshold, bottleSizeMl)) return true;
    if (isForecastReorderDue(forecast?.orderBy ?? null, today, Boolean(forecast?.enoughData))) return true;
    if (!forecast?.enoughData) return true;
    return false;
  });
}

export async function stampApprovalBatch(orderIds: string[]): Promise<string> {
  const batchId = randomUUID();
  if (orderIds.length === 0) return batchId;
  await prisma.stockOrder.updateMany({
    where: { id: { in: orderIds } },
    data: { approvalBatchId: batchId, status: StockOrderStatus.AWAITING_APPROVAL },
  });
  return batchId;
}

export async function sendOrderApprovalTemplate(args: {
  tenantId: string;
  venueName: string;
  adminWhatsappNumber: string;
  orders: WhatsAppOrderItem[];
  batchId: string;
}) {
  const forecasts = await getCachedForecastsForTenant(args.tenantId);
  const items = formatTemplateOrderItems(args.orders, forecasts);
  return sendTemplate(
    args.adminWhatsappNumber,
    "order_approval",
    [args.venueName, String(args.orders.length), items],
    [`APPROVE_ALL:${args.batchId}`, `CANCEL:${args.batchId}`],
    args.tenantId,
  );
}
