import { createHmac, timingSafeEqual } from "node:crypto";
import { AlertType, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkRestockForTenant } from "@/lib/restock-check";

export const DEFAULT_BOTTLE_SIZE_ML = 750;
export const STANDARD_POUR_ML = 30;
export const DEFAULT_POURS_ML = [30, 60];
export const SALE_GUARD_MARGIN_PERCENT = 0.05;
export const WEBHOOK_REPLAY_WINDOW_HOURS = 24;

export function bottlesToMl(bottles: number, bottleSizeMl: number): number {
  return Math.round(bottles * bottleSizeMl);
}

export function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Prisma/pg may return null aggregate or null _sum when a product has no movements. */
export function sumStockMovementMl(
  agg: { _sum?: { quantityDeltaMl?: number | null } | null } | null | undefined,
): number {
  const value = agg?._sum?.quantityDeltaMl;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export async function getCurrentStockMl(productId: string): Promise<number> {
  const agg = await prisma.stockMovement.aggregate({
    where: { productId },
    _sum: { quantityDeltaMl: true },
  });
  return sumStockMovementMl(agg);
}

export function isBelowThreshold(currentMl: number, thresholdBottles: number, bottleSizeMl: number): boolean {
  const thresholdMl = bottlesToMl(thresholdBottles, bottleSizeMl);
  return currentMl < thresholdMl;
}

async function resolveOpenLowStockAlerts(productId: string): Promise<void> {
  await prisma.alert.updateMany({
    where: {
      productId,
      type: AlertType.LOW_STOCK,
      resolvedAt: null,
    },
    data: { resolvedAt: new Date() },
  });
}

/** Tenant-wide restock orders + summary bell. Per-SKU low-stock bells are no longer created here. */
export async function syncLowStockAlerts(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { tenantId: true, reorderConfig: { select: { id: true } } },
  });
  if (!product) {
    await resolveOpenLowStockAlerts(productId);
    return;
  }
  if (!product.reorderConfig) {
    await resolveOpenLowStockAlerts(productId);
  }
  await checkRestockForTenant(product.tenantId);
}

/** @deprecated Use syncLowStockAlerts */
export async function evaluateLowStock(productId: string): Promise<void> {
  return syncLowStockAlerts(productId);
}

export async function createSaleMovement(args: {
  productId: string;
  decrementMl: number;
  referenceId: string;
}) {
  return prisma.stockMovement.create({
    data: {
      productId: args.productId,
      type: StockMovementType.SALE,
      quantityDeltaMl: -Math.abs(args.decrementMl),
      quantityInput: args.decrementMl,
      quantityUnit: "ML",
      referenceId: args.referenceId,
      reason: "POS sale",
    },
  });
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secretOverride?: string | null,
): boolean {
  const secret = secretOverride ?? process.env.POS_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function isWithinReplayWindow(soldAtIso: string): boolean {
  const soldAtMs = new Date(soldAtIso).getTime();
  if (!Number.isFinite(soldAtMs)) return false;
  const now = Date.now();
  const maxSkew = WEBHOOK_REPLAY_WINDOW_HOURS * 60 * 60 * 1000;
  return Math.abs(now - soldAtMs) <= maxSkew;
}

export function stockGuardReserveMl(bottleSizeMl: number): number {
  const percentReserve = Math.round(bottleSizeMl * SALE_GUARD_MARGIN_PERCENT);
  return Math.min(STANDARD_POUR_ML, Math.max(0, percentReserve));
}
