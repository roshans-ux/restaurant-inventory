import { StockOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentStockMl, isBelowThreshold } from "@/lib/inventory";

export async function maybeCreatePendingStockOrder(
  productId: string,
  tenantId: string,
): Promise<void> {
  const config = await prisma.reorderConfig.findUnique({
    where: { productId },
    include: { product: true },
  });
  if (!config) return;

  const product = config.product;
  if (product.tenantId !== tenantId) return;

  const bottleSizeMl = Number(product.bottleSizeMl);
  const thresholdBottles = Number(config.thresholdBottles);
  const currentMl = await getCurrentStockMl(productId);

  if (!isBelowThreshold(currentMl, thresholdBottles, bottleSizeMl)) return;

  const existingPending = await prisma.stockOrder.findFirst({
    where: {
      tenantId,
      productId,
      status: StockOrderStatus.PENDING,
    },
  });
  if (existingPending) return;

  await prisma.stockOrder.create({
    data: {
      tenantId,
      productId,
      vendorId: product.vendorId,
      quantityBottles: config.reorderQuantity,
      status: StockOrderStatus.PENDING,
    },
  });
}
