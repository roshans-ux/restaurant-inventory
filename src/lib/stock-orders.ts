import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStockMl, isBelowThreshold } from "@/lib/inventory";
import { sendAdminReorderPrompt } from "@/lib/whatsapp/client";

export type PendingStockOrderContext = {
  currentMl: number;
  thresholdBottles: number;
  bottleSizeMl: number;
  reorderQuantity: number;
  vendorId: string | null;
};

export async function maybeCreatePendingStockOrder(
  productId: string,
  tenantId: string,
  known?: PendingStockOrderContext,
): Promise<void> {
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
      include: { product: true },
    });
    if (!config) return;
    if (config.product.tenantId !== tenantId) return;

    bottleSizeMl = Number(config.product.bottleSizeMl);
    thresholdBottles = Number(config.thresholdBottles);
    reorderQuantity = config.reorderQuantity;
    vendorId = config.product.vendorId;
    currentMl = await getCurrentStockMl(productId);
  }

  if (!isBelowThreshold(currentMl, thresholdBottles, bottleSizeMl)) return;

  const existingPending = await prisma.stockOrder.findFirst({
    where: {
      tenantId,
      productId,
      status: StockOrderStatus.PENDING,
    },
  });
  if (existingPending) return;

  const order = await prisma.stockOrder.create({
    data: {
      tenantId,
      productId,
      vendorId,
      quantityBottles: reorderQuantity,
      status: StockOrderStatus.PENDING,
    },
    include: {
      product: { select: { name: true } },
      vendor: { select: { name: true } },
      tenant: { select: { name: true, adminWhatsappNumber: true } },
    },
  });

  try {
    await sendAdminReorderPrompt({
      tenantId,
      stockOrderId: order.id,
      adminWhatsappNumber: order.tenant.adminWhatsappNumber,
      venueName: order.tenant.name,
      productName: order.product.name,
      quantityBottles: order.quantityBottles,
      vendorName: order.vendor?.name ?? null,
    });
  } catch (error) {
    console.error("[whatsapp] admin reorder prompt failed", error);
  }
}
