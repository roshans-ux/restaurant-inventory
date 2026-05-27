import { NextRequest } from "next/server";
import { z } from "zod";
import { QuantityUnit, StockMovementType } from "@prisma/client";
import {
  evaluateLowStock,
  getCurrentStockMl,
  STANDARD_POUR_ML,
} from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findProductForTenant } from "@/lib/tenant";

const adjustSchema = z.discriminatedUnion("adjustmentType", [
  z.object({
    productId: z.string().uuid(),
    adjustmentType: z.literal("BOTTLE_BROKEN"),
    remainingMl: z.number().int().nonnegative().multipleOf(STANDARD_POUR_ML),
    reason: z.string().min(3).optional(),
  }),
  z.object({
    productId: z.string().uuid(),
    adjustmentType: z.literal("SEND_BACK_TO_SELLER"),
    bottlesToReturn: z.number().int().positive(),
    reason: z.string().min(3).optional(),
  }),
  z.object({
    productId: z.string().uuid(),
    adjustmentType: z.literal("UNDERPOUR"),
    variancePours: z.number().int().positive(),
    reason: z.string().min(3).optional(),
  }),
  z.object({
    productId: z.string().uuid(),
    adjustmentType: z.literal("OVERPOUR"),
    variancePours: z.number().int().positive(),
    reason: z.string().min(3).optional(),
  }),
]);

const defaultReason: Record<z.infer<typeof adjustSchema>["adjustmentType"], string> = {
  BOTTLE_BROKEN: "Bottle broken",
  SEND_BACK_TO_SELLER: "Send back to seller",
  UNDERPOUR: "Underpour correction",
  OVERPOUR: "Overpour correction",
};

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const parsed = adjustSchema.parse(await request.json());
    const product = await findProductForTenant(session.tenantId, parsed.productId);

    if (!product) {
      recordApiMetric("POST /api/inventory/adjust", 404, Date.now() - startedAt);
      return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    const bottleSizeMl = Number(product.bottleSizeMl);
    const currentMl = await getCurrentStockMl(parsed.productId);
    const currentBottles = currentMl / bottleSizeMl;
    const reason = parsed.reason ?? defaultReason[parsed.adjustmentType];

    let deltaMl: number;
    let quantityInput: number;
    let quantityUnit: QuantityUnit;
    let operation: string;

    switch (parsed.adjustmentType) {
      case "BOTTLE_BROKEN": {
        if (parsed.remainingMl > bottleSizeMl) {
          return apiError(
            "INVALID_REMAINING_ML",
            `Remaining cannot exceed bottle size (${bottleSizeMl}ml)`,
            400,
          );
        }
        if (parsed.remainingMl > currentMl) {
          return apiError(
            "INVALID_REMAINING_ML",
            `Remaining (${parsed.remainingMl}ml) cannot exceed current stock (${currentMl}ml)`,
            400,
          );
        }
        deltaMl = -parsed.remainingMl;
        quantityInput = parsed.remainingMl;
        quantityUnit = QuantityUnit.ML;
        operation = "BOTTLE_BROKEN";
        break;
      }
      case "SEND_BACK_TO_SELLER": {
        const returnMl = parsed.bottlesToReturn * bottleSizeMl;
        if (returnMl > currentMl) {
          return apiError(
            "INSUFFICIENT_STOCK",
            `Cannot return ${parsed.bottlesToReturn} bottle(s); only ${Math.floor(currentMl / bottleSizeMl)} full bottle(s) available`,
            400,
          );
        }
        deltaMl = -returnMl;
        quantityInput = parsed.bottlesToReturn;
        quantityUnit = QuantityUnit.BOTTLE;
        operation = "SEND_BACK_TO_SELLER";
        break;
      }
      case "UNDERPOUR": {
        deltaMl = parsed.variancePours * STANDARD_POUR_ML;
        quantityInput = parsed.variancePours;
        quantityUnit = QuantityUnit.ML;
        operation = "UNDERPOUR";
        break;
      }
      case "OVERPOUR": {
        const removeMl = parsed.variancePours * STANDARD_POUR_ML;
        if (removeMl > currentMl) {
          return apiError(
            "INSUFFICIENT_STOCK",
            `Cannot remove ${removeMl}ml; only ${currentMl}ml in stock`,
            400,
          );
        }
        deltaMl = -removeMl;
        quantityInput = parsed.variancePours;
        quantityUnit = QuantityUnit.ML;
        operation = "OVERPOUR";
        break;
      }
    }

    const movement = await prisma.stockMovement.create({
      data: {
        productId: parsed.productId,
        type: StockMovementType.ADJUSTMENT,
        quantityDeltaMl: deltaMl,
        quantityInput,
        quantityUnit,
        reason,
        metadata: {
          source: "ADMIN_UI",
          operation,
          bottleSizeMl,
          currentMlBefore: currentMl,
          currentBottlesBefore: Number(currentBottles.toFixed(4)),
          ...parsed,
        },
      },
    });

    await evaluateLowStock(parsed.productId);
    recordApiMetric("POST /api/inventory/adjust", 201, Date.now() - startedAt);
    return apiOk({ movement }, 201);
  } catch (error) {
    recordApiMetric("POST /api/inventory/adjust", 400, Date.now() - startedAt);
    return apiError(
      "ADJUST_STOCK_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}
