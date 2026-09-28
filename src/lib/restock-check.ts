import { randomUUID } from "node:crypto";
import { AlertType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidateForecastCache } from "@/lib/forecast/cache";
import { computeForecastsForTenant } from "@/lib/forecast/compute";
import { istIsoDate } from "@/lib/forecast/dates";
import { skuNeedsRestock } from "@/lib/forecast/restock";
import { maybeCreatePendingStockOrder } from "@/lib/stock-orders";

export const RESTOCK_SKU_ALERT_PREFIX = "restock-sku:";
export const RESTOCK_SUMMARY_ALERT_PREFIX = "restock-summary:";

function skuWatchKey(productId: string) {
  return `${RESTOCK_SKU_ALERT_PREFIX}${productId}`;
}

export function formatRestockSummaryMessage(names: string[]): string {
  const count = names.length;
  const shown = names.slice(0, 2);
  const extra = count - shown.length;
  const list =
    extra > 0 ? `${shown.join(", ")} +${extra} more` : shown.join(", ");
  return `${count} item${count === 1 ? "" : "s"} need restocking: ${list}`;
}

export async function checkRestockForTenant(tenantId: string): Promise<{
  created: number;
  notified: number;
}> {
  revalidateForecastCache(tenantId);
  const todayIso = istIsoDate();
  const [forecasts, products] = await Promise.all([
    computeForecastsForTenant(tenantId),
    prisma.product.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        bottleSizeMl: true,
        vendorId: true,
        reorderConfig: {
          select: { thresholdBottles: true, reorderQuantity: true, notifyAdmin: true },
        },
        vendors: { select: { id: true } },
      },
    }),
  ]);

  const newlyNamed: { productId: string; name: string }[] = [];
  let created = 0;

  for (const product of products) {
    const bottleSizeMl = Number(product.bottleSizeMl);
    const thresholdBottles = product.reorderConfig
      ? Math.round(Number(product.reorderConfig.thresholdBottles))
      : null;
    const forecast = forecasts[product.id];
    const currentMl = forecast?.currentMl ?? 0;
    const needs = skuNeedsRestock({
      currentMl,
      bottleSizeMl,
      thresholdBottles,
      enoughData: Boolean(forecast?.enoughData),
      orderBy: forecast?.orderBy ?? null,
      todayIso,
    });

    if (!needs) {
      await prisma.alert.updateMany({
        where: {
          productId: product.id,
          resolvedAt: null,
          OR: [
            { referenceKey: skuWatchKey(product.id) },
            { type: AlertType.LOW_STOCK, referenceKey: null },
          ],
        },
        data: { resolvedAt: new Date() },
      });
      continue;
    }

    const result = await maybeCreatePendingStockOrder(product.id, tenantId, {
      currentMl,
      thresholdBottles: thresholdBottles ?? 0,
      bottleSizeMl,
      reorderQuantity: product.reorderConfig?.reorderQuantity ?? 1,
      vendorId: forecast?.vendorId ?? product.vendorId ?? product.vendors[0]?.id ?? null,
      enoughData: Boolean(forecast?.enoughData),
      orderBy: forecast?.orderBy ?? null,
      forecastSuggestedBottles: forecast?.suggestedBottles ?? 0,
    });

    if (!result.created) continue;
    created += 1;

    const existingWatch = await prisma.alert.findFirst({
      where: {
        referenceKey: skuWatchKey(product.id),
        resolvedAt: null,
      },
      select: { id: true },
    });
    if (existingWatch) continue;

    newlyNamed.push({ productId: product.id, name: result.productName ?? product.name });
    await prisma.alert.create({
      data: {
        productId: product.id,
        type: AlertType.LOW_STOCK,
        referenceKey: skuWatchKey(product.id),
        message: "Restock watch",
        readAt: new Date(),
      },
    });
  }

  if (newlyNamed.length === 0) {
    return { created, notified: 0 };
  }

  const message = formatRestockSummaryMessage(newlyNamed.map((n) => n.name));
  await prisma.alert.create({
    data: {
      productId: newlyNamed[0]!.productId,
      type: AlertType.LOW_STOCK,
      referenceKey: `${RESTOCK_SUMMARY_ALERT_PREFIX}${randomUUID()}`,
      message,
    },
  });

  return { created, notified: 1 };
}
