import { AlertType, BottleRotationStatus, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatBottleSizeLabel } from "@/lib/product-naming";

export type SlippageResult = {
  slippageMl: number;
  slippagePercent: number;
};

export async function sumSaleMlBetween(
  productId: string,
  openedAt: Date,
  closedAt: Date,
): Promise<number> {
  const agg = await prisma.stockMovement.aggregate({
    where: {
      productId,
      type: StockMovementType.SALE,
      createdAt: { gte: openedAt, lte: closedAt },
    },
    _sum: { quantityDeltaMl: true },
  });
  return Math.abs(agg._sum.quantityDeltaMl ?? 0);
}

/** Sum POS sale ml during rotation intervals that overlap [windowStart, windowEnd]. */
export async function sumSaleMlForRotationsInWindow(
  productId: string,
  tenantId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<{ soldMl: number; hadRotation: boolean }> {
  const rotations = await prisma.bottleRotation.findMany({
    where: {
      productId,
      tenantId,
      openedAt: { lte: windowEnd },
      OR: [{ closedAt: null }, { closedAt: { gte: windowStart } }],
    },
    select: { openedAt: true, closedAt: true },
  });

  if (rotations.length === 0) {
    return { soldMl: 0, hadRotation: false };
  }

  let total = 0;
  for (const rotation of rotations) {
    const intervalStart =
      rotation.openedAt > windowStart ? rotation.openedAt : windowStart;
    const intervalEnd = rotation.closedAt
      ? rotation.closedAt < windowEnd
        ? rotation.closedAt
        : windowEnd
      : windowEnd;
    if (intervalStart <= intervalEnd) {
      total += await sumSaleMlBetween(productId, intervalStart, intervalEnd);
    }
  }

  return { soldMl: total, hadRotation: true };
}

export function calculateSlippage(
  bottleSizeMl: number,
  saleMlOrdered: number,
): SlippageResult {
  const slippageMl = Math.max(0, bottleSizeMl - saleMlOrdered);
  const slippagePercent =
    bottleSizeMl > 0 ? Math.round((slippageMl / bottleSizeMl) * 1000) / 10 : 0;
  return { slippageMl, slippagePercent };
}

function buildSlippageAlertMessage(args: {
  sku: string;
  barcodeId: string;
  slippageMl: number;
  slippagePercent: number;
  bottleSizeMl: number;
  saleMlOrdered: number;
}): string {
  return `[${args.sku}] (${formatBottleSizeLabel(args.bottleSizeMl)}) — Bottle [${args.barcodeId}] closed with ${args.slippageMl}ml slippage (${args.slippagePercent}%). Expected ${args.bottleSizeMl} orders worth of ml, got ${args.saleMlOrdered}ml.`;
}

export async function closeBottleRotation(rotationId: string, tenantId: string) {
  const rotation = await prisma.bottleRotation.findFirst({
    where: { id: rotationId, tenantId, status: BottleRotationStatus.ACTIVE },
    include: { product: true },
  });
  if (!rotation) {
    throw new Error("Active bottle rotation not found");
  }

  const closedAt = new Date();
  const bottleSizeMl = Number(rotation.product.bottleSizeMl);
  const saleMlOrdered = await sumSaleMlBetween(
    rotation.productId,
    rotation.openedAt,
    closedAt,
  );
  const { slippageMl, slippagePercent } = calculateSlippage(bottleSizeMl, saleMlOrdered);

  const updated = await prisma.bottleRotation.update({
    where: { id: rotationId },
    data: {
      status: BottleRotationStatus.CLOSED,
      closedAt,
      slippageMl,
    },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slippageTolerancePercent: true },
  });
  const tolerance = tenant?.slippageTolerancePercent ?? 10;

  if (slippagePercent > tolerance) {
    const sku = rotation.product.sku ?? rotation.product.name;
    await prisma.alert.create({
      data: {
        productId: rotation.productId,
        type: AlertType.SLIPPAGE,
        message: buildSlippageAlertMessage({
          sku,
          barcodeId: rotation.barcodeId,
          slippageMl,
          slippagePercent,
          bottleSizeMl,
          saleMlOrdered,
        }),
      },
    });
  }

  return { rotation: updated, slippageMl, slippagePercent, saleMlOrdered };
}

export async function mlRemainingForRotation(args: {
  productId: string;
  bottleSizeMl: number;
  openedAt: Date;
}): Promise<number> {
  const saleMl = await sumSaleMlBetween(args.productId, args.openedAt, new Date());
  return Math.max(0, args.bottleSizeMl - saleMl);
}
