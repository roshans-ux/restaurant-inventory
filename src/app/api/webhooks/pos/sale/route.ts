import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { QuantityUnit } from "@prisma/client";
import { evaluateLowStock, isWithinReplayWindow, verifyWebhookSignature } from "@/lib/inventory";
import { apiError, apiOk } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import {
  collectSaleRejections,
  isPgAdapterBindError,
  recordCocktailSaleLine,
  recordPourSaleLine,
  rollbackRecordedSale,
  withPgRetry,
} from "@/lib/pos-webhook-sale";
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

    const preflightRejections = await withPgRetry(() =>
      collectSaleRejections(prisma, tenant.id, payload.lines),
    );
    if (preflightRejections.length > 0) {
      const response = apiError(
        "SALE_REJECTED_OUT_OF_STOCK",
        "Sale rejected because one or more line items are unavailable",
        409,
        preflightRejections,
      );
      recordApiMetric("POST /api/webhooks/pos/sale", 409, Date.now() - startedAt);
      return response;
    }

    const result = await withPgRetry(async () => {
      const posSale = await prisma.posSale.create({
        data: {
          tenantId: tenant.id,
          externalSaleId: payload.external_sale_id,
          requestHash,
          soldAt: new Date(payload.sold_at),
        },
      });

      const movementReferenceIds: string[] = [];

      try {
        for (const line of payload.lines) {
          const cocktailRecorded = await recordCocktailSaleLine(
            prisma,
            tenant.id,
            posSale.id,
            payload.external_sale_id,
            line,
          );
          if (cocktailRecorded && "reason" in cocktailRecorded) {
            throw new Error(
              JSON.stringify({ kind: "SALE_REJECTED", rejectedLines: [cocktailRecorded] }),
            );
          }
          if (cocktailRecorded && "movementReferenceIds" in cocktailRecorded) {
            movementReferenceIds.push(...cocktailRecorded.movementReferenceIds);
            continue;
          }

          const pourRecorded = await recordPourSaleLine(
            prisma,
            tenant.id,
            posSale.id,
            payload.external_sale_id,
            line,
          );
          if ("reason" in pourRecorded) {
            throw new Error(
              JSON.stringify({ kind: "SALE_REJECTED", rejectedLines: [pourRecorded] }),
            );
          }
          movementReferenceIds.push(...pourRecorded.movementReferenceIds);
        }
      } catch (recordError) {
        await rollbackRecordedSale(prisma, posSale.id, movementReferenceIds);
        throw recordError;
      }

      return posSale;
    });

    const lines = await prisma.posSaleLine.findMany({
      where: { posSaleId: result.id },
      select: { productId: true },
      distinct: ["productId"],
    });

    await Promise.all(
      lines.map(async (line) => {
        try {
          await evaluateLowStock(line.productId);
        } catch (alertError) {
          console.error("Low-stock alert sync failed after sale:", alertError);
        }
      }),
    );
    revalidateTag("inventory-levels", { expire: 0 });
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

    if (error instanceof z.ZodError) {
      const response = apiError("INVALID_SALE_PAYLOAD", "Invalid sale payload", 400, error.flatten());
      recordApiMetric("POST /api/webhooks/pos/sale", 400, Date.now() - startedAt);
      return response;
    }

    const prismaCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "";
    if (prismaCode === "P2002") {
      const response = apiError(
        "DUPLICATE_SALE_LINES",
        "One or more sale lines were already processed",
        409,
      );
      recordApiMetric("POST /api/webhooks/pos/sale", 409, Date.now() - startedAt);
      return response;
    }

    console.error("POS sale webhook failed:", error);
    const response = apiError(
      "POS_SALE_PROCESSING_FAILED",
      isPgAdapterBindError(error)
        ? "Temporary database error while processing the sale — please fire the webhook again."
        : "Sale could not be processed. Check server logs for details.",
      500,
    );
    recordApiMetric("POST /api/webhooks/pos/sale", 500, Date.now() - startedAt);
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
