import { NextRequest } from "next/server";
import { z } from "zod";
import { QuantityUnit, StockMovementType } from "@prisma/client";
import { evaluateLowStock } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findProductForTenant } from "@/lib/tenant";

const receiveSchema = z.object({
  productId: z.string().uuid(),
  quantityBottles: z.number().positive(),
  bottleSizeMl: z.number().positive().optional(),
  reason: z.string().default("Stock received"),
});

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const parsed = receiveSchema.parse(await request.json());
    const product = await findProductForTenant(session.tenantId, parsed.productId);

    if (!product) {
      recordApiMetric("POST /api/inventory/receive", 404, Date.now() - startedAt);
      return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    const bottleSizeMl = parsed.bottleSizeMl ?? Number(product.bottleSizeMl);
    const deltaMl = Math.round(parsed.quantityBottles * bottleSizeMl);

    const movement = await prisma.stockMovement.create({
      data: {
        productId: parsed.productId,
        type: StockMovementType.RECEIVE,
        quantityDeltaMl: deltaMl,
        quantityInput: parsed.quantityBottles,
        quantityUnit: QuantityUnit.BOTTLE,
        reason: parsed.reason,
        metadata: {
          source: "ADMIN_UI",
          operation: "RECEIVE_STOCK",
        },
      },
    });

    await evaluateLowStock(parsed.productId);
    recordApiMetric("POST /api/inventory/receive", 201, Date.now() - startedAt);
    return apiOk({ movement }, 201);
  } catch (error) {
    recordApiMetric("POST /api/inventory/receive", 400, Date.now() - startedAt);
    return apiError(
      "RECEIVE_STOCK_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}
