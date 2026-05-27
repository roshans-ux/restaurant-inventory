import { createHmac, timingSafeEqual } from "node:crypto";
import { AlertType, StockMovementType } from "@prisma/client";
import { formatBottleStock } from "@/lib/format-bottles";
import { prisma } from "@/lib/prisma";

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

export async function getCurrentStockMl(productId: string): Promise<number> {
  const agg = await prisma.stockMovement.aggregate({
    where: { productId },
    _sum: { quantityDeltaMl: true },
  });
  return agg._sum.quantityDeltaMl ?? 0;
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

/** Reconcile open alerts with current stock and threshold; create alert only when strictly below threshold. */
export async function syncLowStockAlerts(productId: string): Promise<void> {
  const config = await prisma.reorderConfig.findUnique({
    where: { productId },
    include: { product: true },
  });

  if (!config) {
    await resolveOpenLowStockAlerts(productId);
    return;
  }

  const bottleSizeMl = Number(config.product.bottleSizeMl);
  const thresholdBottles = Number(config.thresholdBottles);
  const currentMl = await getCurrentStockMl(productId);

  if (!isBelowThreshold(currentMl, thresholdBottles, bottleSizeMl)) {
    await resolveOpenLowStockAlerts(productId);
    return;
  }

  if (!config.notifyAdmin) return;

  const cooldownMinutes = Number(process.env.ALERT_COOLDOWN_MINUTES ?? 120);
  const cooldownSince = new Date(Date.now() - cooldownMinutes * 60 * 1000);
  const recentAlert = await prisma.alert.findFirst({
    where: { productId, type: AlertType.LOW_STOCK, createdAt: { gte: cooldownSince } },
    orderBy: { createdAt: "desc" },
  });
  if (recentAlert) return;

  const openAlert = await prisma.alert.findFirst({
    where: { productId, type: AlertType.LOW_STOCK, resolvedAt: null },
  });

  if (openAlert) return;

  const stockLabel = formatBottleStock(currentMl, bottleSizeMl);
  await prisma.alert.create({
    data: {
      productId,
      type: AlertType.LOW_STOCK,
      message: `${config.product.name} is below threshold at ${stockLabel}`,
    },
  });
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
  return Math.round(bottleSizeMl * SALE_GUARD_MARGIN_PERCENT);
}
