import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BOTTLE_SIZE_ML } from "@/lib/inventory";
import { QuantityUnit, StockMovementType } from "@prisma/client";
import { apiError } from "@/lib/http";
import { recordApiMetric } from "@/lib/observability";
import { isSession, requireApiSession } from "@/lib/auth/require-session";
import {
  ALLOWED_BOTTLE_SIZE_ML,
  normalizeBottleName,
  skuFromNameAndSize,
} from "@/lib/product-naming";

const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().optional(),
  bottleSizeMl: z
    .number()
    .refine((n) => (ALLOWED_BOTTLE_SIZE_ML as readonly number[]).includes(n), "Invalid bottle size")
    .default(DEFAULT_BOTTLE_SIZE_ML),
  defaultPourMl: z.number().positive().default(30),
  openingBottles: z.number().min(0).default(0),
  thresholdBottles: z.number().int().min(0).default(1),
  reorderQuantity: z.number().int().positive().default(6),
});

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const products = await prisma.product.findMany({
      where: { tenantId: session.tenantId },
      include: { reorderConfig: true },
      orderBy: { name: "asc" },
    });
    recordApiMetric("GET /api/products", 200, Date.now() - startedAt);
    return Response.json({ ok: true, products });
  } catch (error) {
    recordApiMetric("GET /api/products", 500, Date.now() - startedAt);
    return apiError("PRODUCT_LIST_FAILED", "Failed to fetch products", 500, {
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const session = await requireApiSession(request);
  if (!isSession(session)) return session;
  try {
    const json = await request.json();
    const parsed = productSchema.parse(json);

    const result = await prisma.$transaction(async (tx) => {
      const normalizedName = normalizeBottleName(parsed.name);
      const existingByName = await tx.product.findMany({
        where: { tenantId: session.tenantId },
        select: { id: true, name: true },
      });
      const duplicate = existingByName.find(
        (p) => normalizeBottleName(p.name) === normalizedName,
      );
      if (duplicate) {
        throw new Error("Bottle name already exists. Select existing bottle to update.");
      }

      const allSkus = new Set(
        (
          await tx.product.findMany({
            where: { tenantId: session.tenantId, sku: { not: null } },
            select: { sku: true },
          })
        )
          .map((x) => x.sku)
          .filter((x): x is string => Boolean(x))
          .map((x) => x.toUpperCase()),
      );

      const finalSku =
        parsed.sku?.trim() || skuFromNameAndSize(parsed.name, parsed.bottleSizeMl);
      if (allSkus.has(finalSku.toUpperCase())) {
        throw new Error(
          `SKU "${finalSku}" is already in use. Choose a different SKU.`,
        );
      }

      const product = await tx.product.create({
        data: {
          tenantId: session.tenantId,
          name: parsed.name.trim().replace(/\s+/g, " "),
          sku: finalSku,
          bottleSizeMl: parsed.bottleSizeMl,
          defaultPourMl: parsed.defaultPourMl,
        },
      });

      await tx.reorderConfig.create({
        data: {
          productId: product.id,
          thresholdBottles: parsed.thresholdBottles,
          reorderQuantity: parsed.reorderQuantity,
        },
      });

      const openingMl = Math.round(parsed.openingBottles * parsed.bottleSizeMl);
      if (openingMl > 0) {
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: StockMovementType.OPENING_BALANCE,
            quantityDeltaMl: openingMl,
            quantityInput: parsed.openingBottles,
            quantityUnit: QuantityUnit.BOTTLE,
            reason: "Initial stock",
            metadata: {
              source: "ADMIN_UI",
              operation: "CREATE_PRODUCT_WITH_OPENING_STOCK",
            },
          },
        });
      }

      return product;
    });

    recordApiMetric("POST /api/products", 201, Date.now() - startedAt);
    return Response.json({ ok: true, product: result }, { status: 201 });
  } catch (error) {
    recordApiMetric("POST /api/products", 400, Date.now() - startedAt);
    return apiError(
      "CREATE_PRODUCT_FAILED",
      error instanceof Error ? error.message : "Invalid request",
      400,
    );
  }
}
