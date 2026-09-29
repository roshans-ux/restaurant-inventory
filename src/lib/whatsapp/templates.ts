import { randomUUID } from "node:crypto";
import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCachedForecastsForTenant } from "@/lib/forecast/cache";
import { istIsoDate } from "@/lib/forecast/dates";
import { isBelowKeepAtLeast, isForecastReorderDue } from "@/lib/forecast/restock";
import { sendTemplate } from "@/lib/whatsapp/client";
import { joinTruncated } from "@/lib/whatsapp/sanitize";

export function skuQtyLine(name: string, qty: number): string {
  return `${name} (${qty})`;
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
  orders: Array<{ product: { name: string }; quantityBottles: number }>;
  batchId: string;
}) {
  const items = joinTruncated(args.orders.map((o) => skuQtyLine(o.product.name, o.quantityBottles)));
  return sendTemplate(
    args.adminWhatsappNumber,
    "order_approval",
    [args.venueName, String(args.orders.length), items],
    [`APPROVE_ALL:${args.batchId}`, `CANCEL:${args.batchId}`],
    args.tenantId,
  );
}
