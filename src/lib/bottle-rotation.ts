import { BottleRotationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { closeBottleRotation } from "@/lib/slippage";
import { findProductForTenant } from "@/lib/tenant";

export async function openRotation(
  tenantId: string,
  productId: string,
  barcodeId: string,
) {
  const product = await findProductForTenant(tenantId, productId);
  if (!product) {
    throw new Error("Product not found");
  }

  const trimmedBarcode = barcodeId.trim();
  if (!trimmedBarcode) {
    throw new Error("Barcode is required");
  }

  const existingActive = await prisma.bottleRotation.findFirst({
    where: {
      tenantId,
      productId,
      status: BottleRotationStatus.ACTIVE,
    },
  });

  if (existingActive) {
    await closeBottleRotation(existingActive.id, tenantId);
  }

  return prisma.bottleRotation.create({
    data: {
      tenantId,
      productId,
      barcodeId: trimmedBarcode,
      status: BottleRotationStatus.ACTIVE,
      openedAt: new Date(),
    },
    include: { product: true },
  });
}
