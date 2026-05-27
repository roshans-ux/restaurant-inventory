import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import {
  ALLOWED_BOTTLE_SIZE_ML,
  normalizeBottleName,
  skuFromNameAndSize,
} from "@/lib/product-naming";
import { syncLowStockAlerts } from "@/lib/inventory";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findProductForTenant } from "@/lib/tenant";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  sku: z.string().nullable().optional(),
  bottleSizeMl: z
    .number()
    .refine((n) => (ALLOWED_BOTTLE_SIZE_ML as readonly number[]).includes(n), "Invalid bottle size")
    .optional(),
  defaultPourMl: z.number().positive().optional(),
  thresholdBottles: z.number().int().nonnegative().optional(),
  reorderQuantity: z.number().int().positive().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const { id } = await params;
    const payload = patchSchema.parse(await request.json());

    const existing = await findProductForTenant(session.tenantId, id);
    if (!existing) {
      recordApiMetric("PATCH /api/products/[id]", 404, Date.now() - startedAt);
      return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    const cleanedName = payload.name?.trim().replace(/\s+/g, " ");
    if (cleanedName) {
      const normalized = normalizeBottleName(cleanedName);
      const allNames = await prisma.product.findMany({
        where: { tenantId: session.tenantId, id: { not: id } },
        select: { name: true },
      });
      const dup = allNames.find((p) => normalizeBottleName(p.name) === normalized);
      if (dup) {
        recordApiMetric("PATCH /api/products/[id]", 409, Date.now() - startedAt);
        return apiError(
          "DUPLICATE_BOTTLE_NAME",
          "Bottle name already exists. Please use the existing bottle entry.",
          409,
        );
      }
    }

    const nextName = cleanedName ?? existing.name;
    const bottleSizeMl =
      payload.bottleSizeMl !== undefined
        ? payload.bottleSizeMl
        : Number(existing.bottleSizeMl);
    const nextSku =
      payload.sku !== undefined
        ? payload.sku?.trim() || skuFromNameAndSize(nextName, bottleSizeMl)
        : skuFromNameAndSize(nextName, bottleSizeMl);

    const skuRows = await prisma.product.findMany({
      where: { tenantId: session.tenantId, id: { not: id }, sku: { not: null } },
      select: { sku: true },
    });
    const takenSkus = new Set(
      skuRows
        .map((x) => x.sku)
        .filter((x): x is string => Boolean(x))
        .map((x) => x.toUpperCase()),
    );

    if (takenSkus.has(nextSku.toUpperCase())) {
      recordApiMetric("PATCH /api/products/[id]", 409, Date.now() - startedAt);
      return apiError(
        "DUPLICATE_SKU",
        `SKU "${nextSku}" is already in use. Choose a different SKU.`,
        409,
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const product = await tx.product.update({
        where: { id },
        data: {
          name: nextName,
          sku: nextSku,
          bottleSizeMl: payload.bottleSizeMl,
          defaultPourMl: payload.defaultPourMl,
        },
      });

      if (
        payload.thresholdBottles !== undefined ||
        payload.reorderQuantity !== undefined
      ) {
        await tx.reorderConfig.update({
          where: { productId: id },
          data: {
            ...(payload.thresholdBottles !== undefined
              ? { thresholdBottles: payload.thresholdBottles }
              : {}),
            ...(payload.reorderQuantity !== undefined
              ? { reorderQuantity: payload.reorderQuantity }
              : {}),
          },
        });
      }

      return product;
    });

    if (
      payload.thresholdBottles !== undefined ||
      payload.reorderQuantity !== undefined
    ) {
      await syncLowStockAlerts(id);
    }

    recordApiMetric("PATCH /api/products/[id]", 200, Date.now() - startedAt);
    return apiOk({ product: updated });
  } catch (error) {
    recordApiMetric("PATCH /api/products/[id]", 400, Date.now() - startedAt);
    return apiError(
      "UPDATE_PRODUCT_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const { id } = await params;

    const existing = await findProductForTenant(session.tenantId, id);
    if (!existing) {
      recordApiMetric("DELETE /api/products/[id]", 404, Date.now() - startedAt);
      return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    await prisma.$transaction(async (tx) => {
      await tx.posSaleLine.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });

    recordApiMetric("DELETE /api/products/[id]", 200, Date.now() - startedAt);
    return apiOk({ deleted: true, id });
  } catch (error) {
    recordApiMetric("DELETE /api/products/[id]", 400, Date.now() - startedAt);
    return apiError(
      "DELETE_PRODUCT_FAILED",
      error instanceof Error ? error.message : "Failed to delete bottle",
      400,
    );
  }
}

