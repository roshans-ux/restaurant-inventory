import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { DEFAULT_POURS_ML } from "@/lib/inventory";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import { findProductForTenant } from "@/lib/tenant";
import {
  isPosItemConfigured,
} from "@/lib/pos-draft-mappings";
import { excludeDraftSuppressionMappings } from "@/lib/pos-mapping-utils";
import { isAllowedStraightPour, isFullUnitSaleCategory } from "@/lib/product-category";
import {
  findPosItemConflict,
  posItemConflictMessage,
} from "@/lib/pos-item-uniqueness";

const createMappingSchema = z.object({
  productId: z.string().uuid(),
  posItemId: z.string().min(1).transform((v) => v.trim()),
  pourMl: z.number().positive().default(DEFAULT_POURS_ML[0]),
});

const updatePosItemSchema = z.object({
  id: z.string().uuid(),
  posItemId: z.union([z.string(), z.null()]).transform((v) => {
    if (v == null) return null;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : null;
  }),
  productId: z.string().uuid().optional(),
  pourMl: z.number().positive().optional(),
});

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const mappings = await prisma.posMenuMapping.findMany({
      where: { tenantId: session.tenantId, ...excludeDraftSuppressionMappings() },
      include: { product: true },
      orderBy: { createdAt: "desc" },
    });

    recordApiMetric("GET /api/pos-mappings", 200, Date.now() - startedAt);
    return Response.json({
      ok: true,
      mappings,
      defaultPoursMl: DEFAULT_POURS_ML,
    });
  } catch (error) {
    recordApiMetric("GET /api/pos-mappings", 500, Date.now() - startedAt);
    return apiError("POS_MAPPINGS_FETCH_FAILED", "Failed to fetch mappings", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const parsed = createMappingSchema.parse(await request.json());
    const product = await findProductForTenant(session.tenantId, parsed.productId);
    if (!product) {
      return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
    }

    const bottleSizeMl = Number(product.bottleSizeMl);
    const category = product.category;
    if (!isAllowedStraightPour(category, bottleSizeMl, parsed.pourMl)) {
      return apiError(
        "POUR_SIZE_INVALID",
        "Sale size is not allowed for this bottle category",
        400,
      );
    }
    if (isFullUnitSaleCategory(category)) {
      const existingUnit = await prisma.posMenuMapping.findFirst({
        where: { tenantId: session.tenantId, productId: parsed.productId },
      });
      if (existingUnit) {
        return apiError(
          "UNIT_MAPPING_EXISTS",
          "This bottle already has a full-unit mapping — update POS Item ID in the table",
          409,
        );
      }
    }

    const posItemConflict = await findPosItemConflict(session.tenantId, parsed.posItemId);
    if (posItemConflict) {
      return apiError(
        "POS_ITEM_ALREADY_MAPPED",
        posItemConflictMessage(posItemConflict, parsed.posItemId),
        409,
      );
    }

    const existingByPour = await prisma.posMenuMapping.findFirst({
      where: {
        tenantId: session.tenantId,
        productId: parsed.productId,
        pourMl: parsed.pourMl,
      },
    });

    const mapping = existingByPour
      ? await prisma.posMenuMapping.update({
          where: { id: existingByPour.id },
          data: { posItemId: parsed.posItemId },
          include: { product: true },
        })
      : await prisma.posMenuMapping.create({
          data: {
            tenantId: session.tenantId,
            productId: parsed.productId,
            posItemId: parsed.posItemId,
            pourMl: parsed.pourMl,
          } satisfies Prisma.PosMenuMappingUncheckedCreateInput,
          include: { product: true },
        });

    recordApiMetric("POST /api/pos-mappings", 201, Date.now() - startedAt);
    return Response.json({ ok: true, mapping }, { status: 201 });
  } catch (error) {
    recordApiMetric("POST /api/pos-mappings", 400, Date.now() - startedAt);
    return apiError(
      "POS_MAPPING_SAVE_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}

export async function PATCH(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const parsed = updatePosItemSchema.parse(await request.json());

    const existing = await prisma.posMenuMapping.findFirst({
      where: { id: parsed.id, tenantId: session.tenantId },
      include: { product: true },
    });
    if (!existing) {
      return apiError("POS_MAPPING_NOT_FOUND", "Mapping not found", 404);
    }

    const category = existing.product.category;
    const isUnitSaleLocked = isFullUnitSaleCategory(category);

    if (parsed.pourMl !== undefined && parsed.pourMl !== Number(existing.pourMl)) {
      if (isUnitSaleLocked) {
        return apiError(
          "POUR_SIZE_LOCKED",
          "Sale size is fixed to a full unit for this category",
          400,
        );
      }
      const productForPour = parsed.productId
        ? await findProductForTenant(session.tenantId, parsed.productId)
        : existing.product;
      if (!productForPour) {
        return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
      }
      if (
        !isAllowedStraightPour(
          productForPour.category,
          Number(productForPour.bottleSizeMl),
          parsed.pourMl,
        )
      ) {
        return apiError(
          "POUR_SIZE_INVALID",
          "Sale size is not allowed for this bottle category",
          400,
        );
      }
    }

    const nextPosItemId = parsed.posItemId !== undefined ? parsed.posItemId : existing.posItemId;

    const configuredPosItemId = nextPosItemId?.trim() ?? "";
    if (isPosItemConfigured(configuredPosItemId) && existing.posItemId !== nextPosItemId) {
      const posItemConflict = await findPosItemConflict(session.tenantId, configuredPosItemId, {
        pourMappingId: parsed.id,
      });
      if (posItemConflict) {
        return apiError(
          "POS_ITEM_ALREADY_MAPPED",
          posItemConflictMessage(posItemConflict, configuredPosItemId),
          409,
        );
      }
    }

    if (!isUnitSaleLocked && parsed.productId) {
      const product = await findProductForTenant(session.tenantId, parsed.productId);
      if (!product) {
        return apiError("PRODUCT_NOT_FOUND", "Product not found", 404);
      }
    }

    const mapping = await prisma.posMenuMapping.update({
      where: { id: parsed.id },
      data: {
        ...(parsed.posItemId !== undefined ? { posItemId: parsed.posItemId } : {}),
        ...(!isUnitSaleLocked && parsed.productId ? { productId: parsed.productId } : {}),
        ...(!isUnitSaleLocked && parsed.pourMl ? { pourMl: parsed.pourMl } : {}),
      },
      include: { product: true },
    });

    recordApiMetric("PATCH /api/pos-mappings", 200, Date.now() - startedAt);
    return Response.json({ ok: true, mapping });
  } catch (error) {
    recordApiMetric("PATCH /api/pos-mappings", 400, Date.now() - startedAt);
    return apiError(
      "POS_MAPPING_UPDATE_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}
