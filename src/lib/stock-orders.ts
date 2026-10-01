import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStockMl } from "@/lib/inventory";
import { appendStockOrderLog } from "@/lib/stock-order-log";
import {
  ensureOrderBatchWindow,
  flushDueOrderBatches,
  isOwnerWhatsAppPath,
} from "@/lib/order-batch";
import { getCachedForecastsForTenant } from "@/lib/forecast/cache";
import { istIsoDate } from "@/lib/forecast/dates";
import {
  isBelowKeepAtLeast,
  isForecastReorderDue,
  suggestedOrderBottles,
} from "@/lib/forecast/restock";

export type PendingStockOrderContext = {
  currentMl: number;
  thresholdBottles: number;
  bottleSizeMl: number;
  reorderQuantity: number;
  vendorId: string | null;
  enoughData?: boolean;
  orderBy?: string | null;
  forecastSuggestedBottles?: number;
};

export async function maybeCreatePendingStockOrder(
  productId: string,
  tenantId: string,
  known?: PendingStockOrderContext,
): Promise<{ created: boolean; productName?: string }> {
  await flushDueOrderBatches(tenantId);

  let currentMl = known?.currentMl;
  let thresholdBottles = known?.thresholdBottles;
  let bottleSizeMl = known?.bottleSizeMl;
  let reorderQuantity = known?.reorderQuantity;
  let vendorId = known?.vendorId ?? null;

  if (
    currentMl === undefined ||
    thresholdBottles === undefined ||
    bottleSizeMl === undefined ||
    reorderQuantity === undefined
  ) {
    const config = await prisma.reorderConfig.findUnique({
      where: { productId },
      include: { product: { include: { vendors: { select: { id: true } } } } },
    });
    if (!config) return { created: false };
    if (config.product.tenantId !== tenantId) return { created: false };

    bottleSizeMl = Number(config.product.bottleSizeMl);
    thresholdBottles = Number(config.thresholdBottles);
    reorderQuantity = config.reorderQuantity;
    vendorId = config.product.vendorId ?? config.product.vendors[0]?.id ?? null;
    currentMl = await getCurrentStockMl(productId);
  }

  if (
    currentMl === undefined ||
    thresholdBottles === undefined ||
    bottleSizeMl === undefined ||
    reorderQuantity === undefined
  ) {
    return { created: false };
  }

  let quantityBottles = reorderQuantity;
  let createdReason = "Order created automatically (below always-keep-at-least)";

  const forecast =
    known && known.forecastSuggestedBottles !== undefined
      ? {
          enoughData: Boolean(known.enoughData),
          orderBy: known.orderBy ?? null,
          suggestedBottles: known.forecastSuggestedBottles,
          vendorId: known.vendorId,
        }
      : (await getCachedForecastsForTenant(tenantId))[productId];
  const floorTriggered = isBelowKeepAtLeast(currentMl, thresholdBottles, bottleSizeMl);
  const forecastDue = isForecastReorderDue(
    forecast?.orderBy ?? null,
    istIsoDate(),
    Boolean(forecast?.enoughData),
  );

  if (!floorTriggered && !forecastDue) return { created: false };

  if (forecast?.enoughData) {
    vendorId = forecast.vendorId ?? vendorId;
    createdReason = forecastDue
      ? "Order created automatically (forecast reorder-by date)"
      : "Order created automatically (below always-keep-at-least)";
  }

  quantityBottles = suggestedOrderBottles({
    currentMl,
    bottleSizeMl,
    thresholdBottles,
    enoughData: Boolean(forecast?.enoughData),
    forecastSuggestedBottles: forecast?.suggestedBottles ?? 0,
    floorTriggered,
  });

  if (!forecast?.enoughData && !floorTriggered) return { created: false };
  if (quantityBottles <= 0) {
    if (!floorTriggered) return { created: false };
    quantityBottles = Math.max(1, reorderQuantity);
  }

  const existingPending = await prisma.stockOrder.findFirst({
    where: {
      tenantId,
      productId,
      status: {
        in: [
          StockOrderStatus.PENDING,
          StockOrderStatus.MODIFIED,
          StockOrderStatus.AWAITING_APPROVAL,
          StockOrderStatus.PLACED,
        ],
      },
    },
  });
  if (existingPending) return { created: false };

  const order = await prisma.stockOrder.create({
    data: {
      tenantId,
      productId,
      vendorId,
      quantityBottles,
      status: StockOrderStatus.PENDING,
    },
    include: {
      product: { select: { name: true } },
      vendor: { select: { name: true } },
      tenant: { select: { name: true, adminWhatsappNumber: true, whatsappOrderApproval: true } },
    },
  });

  await appendStockOrderLog(
    prisma,
    order.id,
    createdReason,
  );

  if (isOwnerWhatsAppPath(order.tenant)) {
    await ensureOrderBatchWindow(tenantId);
  }
  return { created: true, productName: order.product.name };
}
