import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { afterResponse } from "@/lib/after-response";
import { prisma } from "@/lib/prisma";
import { apiError, apiOk } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { ProductCategory } from "@prisma/client";
import {
  DUPLICATE_BOTTLE_NAME_SIZE_MESSAGE,
  normalizeBottleName,
  skuFromNameAndSize,
} from "@/lib/product-naming";
import { syncLowStockAlerts } from "@/lib/inventory";
import {
  ensureDraftMappingsForProduct,
  reconcileFullUnitSaleMappings,
  updateFullBottleDraftPourSize,
} from "@/lib/pos-draft-mappings";
import {
  defaultPourMlForCategory,
  isFullUnitSaleCategory,
  isValidSizeForCategory,
} from "@/lib/product-category";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findProductForTenant } from "@/lib/tenant";
import { filterTenantVendorIds } from "@/lib/tenant-vendors";

const patchSchema = z.object({
  name: z.string().min(2).optional(),
  sku: z.string().nullable().optional(),
  category: z.enum(["SPIRIT", "WINE", "BOTTLED_BEER", "DRAFT_BEER", "CIDER"]).optional(),
  bottleSizeMl: z.number().positive().optional(),
  defaultPourMl: z.number().positive().optional(),
  thresholdBottles: z.number().int().nonnegative().optional(),
  reorderQuantity: z.number().int().positive().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  vendorIds: z.array(z.string().uuid()).optional(),
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
    const nextName = cleanedName ?? existing.name;
    const nextCategory = (payload.category ?? existing.category) as ProductCategory;
    const bottleSizeMl =
      payload.bottleSizeMl !== undefined
        ? payload.bottleSizeMl
        : Number(existing.bottleSizeMl);

    const sizeAllowed =
      isValidSizeForCategory(nextCategory, bottleSizeMl) ||
      bottleSizeMl === Number(existing.bottleSizeMl);
    if (!sizeAllowed) {
      recordApiMetric("PATCH /api/products/[id]", 400, Date.now() - startedAt);
      return apiError("INVALID_BOTTLE_SIZE", "Invalid bottle size for category", 400);
    }

    const nextSku =
      payload.sku !== undefined
        ? payload.sku?.trim() || skuFromNameAndSize(nextName, bottleSizeMl)
        : skuFromNameAndSize(nextName, bottleSizeMl);

    const needsNameSizeCheck = Boolean(cleanedName || payload.bottleSizeMl !== undefined);
    const others = await prisma.product.findMany({
      where: { tenantId: session.tenantId, id: { not: id } },
      select: {
        name: true,
        bottleSizeMl: true,
        sku: true,
      },
    });

    if (needsNameSizeCheck) {
      const normalized = normalizeBottleName(nextName);
      const dup = others.find(
        (p) =>
          normalizeBottleName(p.name) === normalized &&
          Number(p.bottleSizeMl) === bottleSizeMl,
      );
      if (dup) {
        recordApiMetric("PATCH /api/products/[id]", 409, Date.now() - startedAt);
        return apiError(
          "DUPLICATE_BOTTLE_NAME_SIZE",
          DUPLICATE_BOTTLE_NAME_SIZE_MESSAGE,
          409,
        );
      }
    }

    const takenSkus = new Set(
      others
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

    const vendorIds =
      payload.vendorIds !== undefined
        ? await filterTenantVendorIds(session.tenantId, payload.vendorIds)
        : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const previousBottleSizeMl = Number(existing.bottleSizeMl);

      const product = await tx.product.update({
        where: { id },
        data: {
          name: nextName,
          sku: nextSku,
          category: nextCategory,
          bottleSizeMl: payload.bottleSizeMl,
          defaultPourMl:
            payload.defaultPourMl ??
            (isFullUnitSaleCategory(nextCategory)
              ? bottleSizeMl
              : payload.category
                ? defaultPourMlForCategory(nextCategory, bottleSizeMl)
                : undefined),
          ...(payload.vendorId !== undefined ? { vendorId: payload.vendorId } : {}),
          ...(vendorIds !== undefined
            ? {
                vendorId: vendorIds[0] ?? null,
                vendors: { set: vendorIds.map((vid) => ({ id: vid })) },
              }
            : {}),
        },
        include: {
          reorderConfig: true,
          vendor: true,
          vendors: { select: { id: true, name: true } },
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

      const currentBottleSizeMl = Number(product.bottleSizeMl);
      const currentCategory = product.category;

      if (payload.bottleSizeMl !== undefined && payload.bottleSizeMl !== previousBottleSizeMl) {
        await updateFullBottleDraftPourSize(
          tx,
          session.tenantId,
          id,
          previousBottleSizeMl,
          payload.bottleSizeMl,
          currentCategory,
        );
      } else if (isFullUnitSaleCategory(currentCategory)) {
        await reconcileFullUnitSaleMappings(
          tx,
          session.tenantId,
          id,
          currentBottleSizeMl,
          currentCategory,
        );
      } else {
        await ensureDraftMappingsForProduct(
          tx,
          session.tenantId,
          id,
          currentBottleSizeMl,
          currentCategory,
        );
      }

      return product;
    });

    if (
      payload.thresholdBottles !== undefined ||
      payload.reorderQuantity !== undefined
    ) {
      afterResponse(() => syncLowStockAlerts(id), "products/patch low-stock");
    }

    recordApiMetric("PATCH /api/products/[id]", 200, Date.now() - startedAt);
    revalidateTag("products", { expire: 0 });
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
    revalidateTag("products", { expire: 0 });
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

