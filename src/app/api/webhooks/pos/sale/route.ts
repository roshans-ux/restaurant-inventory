import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { QuantityUnit, StockMovementType } from "@prisma/client";
import {
  evaluateLowStock,
  isWithinReplayWindow,
  stockGuardReserveMl,
  verifyWebhookSignature,
} from "@/lib/inventory";
import { apiError, apiOk } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { prisma } from "@/lib/prisma";

const saleSchema = z.object({
  external_sale_id: z.string().min(1),
  sold_at: z.string().datetime(),
  lines: z.array(
    z.object({
      external_line_id: z.string().min(1),
      pos_item_id: z.string().min(1),
      quantity: z.number().int().positive(),
    }),
  ),
});

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const rawBody = await request.text();
  const signature = request.headers.get("x-pos-signature") ?? "";
  const tenantApiKey = request.headers.get("x-tenant-api-key") ?? "";
  const requestHash = createHash("sha256").update(rawBody).digest("hex");

  const tenant = tenantApiKey
    ? await prisma.tenant.findUnique({ where: { apiKey: tenantApiKey } })
    : null;

  if (!tenant) {
    const response = apiError(
      "UNKNOWN_TENANT",
      "Missing or invalid x-tenant-api-key header",
      401,
    );
    recordApiMetric("POST /api/webhooks/pos/sale", 401, Date.now() - startedAt);
    return response;
  }

  if (!verifyWebhookSignature(rawBody, signature, tenant.posWebhookSecret)) {
    const response = apiError(
      "INVALID_WEBHOOK_SIGNATURE",
      "Invalid webhook signature",
      401,
      { expectedHeader: "x-pos-signature" },
    );
    recordApiMetric("POST /api/webhooks/pos/sale", 401, Date.now() - startedAt);
    return response;
  }

  try {
    const payload = saleSchema.parse(JSON.parse(rawBody));
    if (!isWithinReplayWindow(payload.sold_at)) {
      const response = apiError(
        "WEBHOOK_REPLAY_OUT_OF_WINDOW",
        "Sale timestamp is outside accepted replay window",
        422,
      );
      recordApiMetric("POST /api/webhooks/pos/sale", 422, Date.now() - startedAt);
      return response;
    }

    const existing = await prisma.posSale.findUnique({
      where: {
        tenantId_externalSaleId: {
          tenantId: tenant.id,
          externalSaleId: payload.external_sale_id,
        },
      },
    });
    if (existing) {
      const response = apiOk({ idempotent: true, saleId: existing.id });
      recordApiMetric("POST /api/webhooks/pos/sale", 200, Date.now() - startedAt);
      return response;
    }

    const existingByHash = await prisma.posSale.findFirst({
      where: { tenantId: tenant.id, requestHash },
    });
    if (existingByHash) {
      const response = apiOk({ idempotent: true, saleId: existingByHash.id });
      recordApiMetric("POST /api/webhooks/pos/sale", 200, Date.now() - startedAt);
      return response;
    }

    const duplicateLineIds = await prisma.posSaleLine.findMany({
      where: {
        externalLineId: { in: payload.lines.map((l) => l.external_line_id) },
        posSale: { tenantId: tenant.id },
      },
      select: { externalLineId: true },
    });
    if (duplicateLineIds.length > 0) {
      const response = apiError(
        "DUPLICATE_SALE_LINES",
        "One or more sale lines were already processed",
        409,
        { duplicateExternalLineIds: duplicateLineIds.map((x) => x.externalLineId) },
      );
      recordApiMetric("POST /api/webhooks/pos/sale", 409, Date.now() - startedAt);
      return response;
    }

    const result = await prisma.$transaction(async (tx) => {
      const posSale = await tx.posSale.create({
        data: {
          tenantId: tenant.id,
          externalSaleId: payload.external_sale_id,
          requestHash,
          soldAt: new Date(payload.sold_at),
        },
      });

      const rejectedLines: Array<{
        externalLineId: string;
        posItemId: string;
        reason: string;
        productName?: string;
        requestedQuantity?: number;
        maxAllowedQuantity?: number;
        pourMl?: number;
        availableMl?: number;
        requiredMl?: number;
      }> = [];

      for (const line of payload.lines) {
        const mapping = await tx.posMenuMapping.findUnique({
          where: {
            tenantId_posItemId: {
              tenantId: tenant.id,
              posItemId: line.pos_item_id,
            },
          },
          include: { product: true },
        });

        if (!mapping) {
          rejectedLines.push({
            externalLineId: line.external_line_id,
            posItemId: line.pos_item_id,
            reason: "UNMAPPED_POS_ITEM",
          });
          continue;
        }

        const pourMl = Number(mapping.pourMl);
        const decrementMl = Math.round(pourMl * line.quantity);
        const currentAgg = await tx.stockMovement.aggregate({
          where: { productId: mapping.productId },
          _sum: { quantityDeltaMl: true },
        });
        const currentMl = currentAgg._sum.quantityDeltaMl ?? 0;
        const reserveMl = stockGuardReserveMl(Number(mapping.product.bottleSizeMl));
        const availableForSaleMl = Math.max(0, currentMl - reserveMl);

        if (decrementMl > availableForSaleMl) {
          const maxAllowedQuantity = Math.max(0, Math.floor(availableForSaleMl / pourMl));
          rejectedLines.push({
            externalLineId: line.external_line_id,
            posItemId: line.pos_item_id,
            reason: "OUT_OF_STOCK_MARGIN_GUARD",
            productName: mapping.product.name,
            requestedQuantity: line.quantity,
            maxAllowedQuantity,
            pourMl,
            availableMl: availableForSaleMl,
            requiredMl: decrementMl,
          });
          continue;
        }

        await tx.posSaleLine.create({
          data: {
            posSaleId: posSale.id,
            productId: mapping.productId,
            externalLineId: line.external_line_id,
            saleEventKey: `${payload.external_sale_id}:${line.external_line_id}`,
            posItemId: line.pos_item_id,
            quantity: line.quantity,
            pourMl,
            decrementMl,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: mapping.productId,
            type: StockMovementType.SALE,
            quantityDeltaMl: -Math.abs(decrementMl),
            quantityInput: decrementMl,
            quantityUnit: QuantityUnit.ML,
            referenceId: line.external_line_id,
            reason: "POS sale",
            metadata: {
              source: "POS_WEBHOOK",
              externalSaleId: payload.external_sale_id,
              externalLineId: line.external_line_id,
              posItemId: line.pos_item_id,
              quantity: line.quantity,
            },
          },
        });
      }

      if (rejectedLines.length > 0) {
        throw new Error(JSON.stringify({ kind: "SALE_REJECTED", rejectedLines }));
      }

      return posSale;
    });

    const lines = await prisma.posSaleLine.findMany({
      where: { posSaleId: result.id },
      select: { productId: true },
      distinct: ["productId"],
    });

    await Promise.all(lines.map((line) => evaluateLowStock(line.productId)));
    const response = apiOk({ saleId: result.id, accepted: true });
    recordApiMetric("POST /api/webhooks/pos/sale", 200, Date.now() - startedAt);
    return response;
  } catch (error) {
    if (error instanceof Error) {
      try {
        const parsed = JSON.parse(error.message);
        if (parsed?.kind === "SALE_REJECTED") {
          const response = apiError(
            "SALE_REJECTED_OUT_OF_STOCK",
            "Sale rejected because one or more line items are unavailable",
            409,
            parsed.rejectedLines,
          );
          recordApiMetric("POST /api/webhooks/pos/sale", 409, Date.now() - startedAt);
          return response;
        }
      } catch {
        // no-op
      }
    }
    const response = apiError(
      "INVALID_SALE_PAYLOAD",
      error instanceof Error ? error.message : "Invalid payload",
      400,
    );
    recordApiMetric("POST /api/webhooks/pos/sale", 400, Date.now() - startedAt);
    return response;
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, OPTIONS",
      "Content-Type": "application/json",
      "X-Inventory-Unit-Decrement": QuantityUnit.ML,
    },
  });
}
