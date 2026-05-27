import { NextRequest } from "next/server";
import { z } from "zod";
import { QuantityUnit, StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findProductForTenant } from "@/lib/tenant";

const openingSchema = z.object({
  productId: z.string().uuid(),
  quantityBottles: z.number().min(0),
  bottleSizeMl: z.number().positive().optional(),
});

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const parsed = openingSchema.parse(await request.json());
    const product = await findProductForTenant(session.tenantId, parsed.productId);

    if (!product) {
      recordApiMetric("POST /api/inventory/opening-balance", 404, Date.now() - startedAt);
      return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    const bottleSizeMl = parsed.bottleSizeMl ?? Number(product.bottleSizeMl);
    const deltaMl = Math.round(parsed.quantityBottles * bottleSizeMl);

    const movement = await prisma.stockMovement.create({
      data: {
        productId: parsed.productId,
        type: StockMovementType.OPENING_BALANCE,
        quantityDeltaMl: deltaMl,
        quantityInput: parsed.quantityBottles,
        quantityUnit: QuantityUnit.BOTTLE,
        reason: "Opening balance",
        metadata: {
          source: "ADMIN_UI",
          operation: "OPENING_BALANCE",
        },
      },
    });

    recordApiMetric("POST /api/inventory/opening-balance", 201, Date.now() - startedAt);
    return apiOk({ movement }, 201);
  } catch (error) {
    recordApiMetric("POST /api/inventory/opening-balance", 400, Date.now() - startedAt);
    return apiError(
      "OPENING_BALANCE_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}
