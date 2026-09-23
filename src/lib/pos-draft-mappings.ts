import { Prisma, ProductCategory } from "@prisma/client";
import { draftPourSizesForCategory, isFullUnitSaleProduct } from "@/lib/product-category";
import {
  draftSuppressedPosItemId,
  isDraftSuppressedPosItemId,
} from "@/lib/pos-mapping-utils";
import { prisma } from "@/lib/prisma";

type Db = Pick<Prisma.TransactionClient, "posMenuMapping">;

function pourMlDecimal(ml: number): Prisma.Decimal {
  return new Prisma.Decimal(ml);
}

function draftMappingCreateData(
  tenantId: string,
  productId: string,
  pourMl: number,
): Prisma.PosMenuMappingUncheckedCreateInput {
  return {
    tenantId,
    productId,
    pourMl: pourMlDecimal(pourMl),
    posItemId: null,
  };
}

export { isPosItemConfigured } from "@/lib/pos-mapping-utils";

export async function ensureDraftMappingsForProduct(
  db: Db,
  tenantId: string,
  productId: string,
  bottleSizeMl: number,
  category: ProductCategory,
) {
  if (isFullUnitSaleProduct(category, bottleSizeMl)) {
    await reconcileFullUnitSaleMappings(db, tenantId, productId, bottleSizeMl, category);
    return;
  }

  const pourSizes = draftPourSizesForCategory(category, bottleSizeMl);
  const existing = await db.posMenuMapping.findMany({
    where: { tenantId, productId },
  });
  const byPourMl = new Map(existing.map((row) => [Number(row.pourMl), row]));

  const toCreate: Prisma.PosMenuMappingUncheckedCreateInput[] = [];
  const unsuppressIds: string[] = [];

  for (const pourMl of pourSizes) {
    const row = byPourMl.get(pourMl);
    if (!row) {
      toCreate.push(draftMappingCreateData(tenantId, productId, pourMl));
      continue;
    }
    if (isDraftSuppressedPosItemId(row.posItemId)) {
      unsuppressIds.push(row.id);
    }
  }

  if (toCreate.length > 0) {
    await db.posMenuMapping.createMany({ data: toCreate });
  }
  if (unsuppressIds.length > 0) {
    await db.posMenuMapping.updateMany({
      where: { id: { in: unsuppressIds } },
      data: { posItemId: null },
    });
  }
}

export async function recordDeletedMappingSlot(
  db: Db,
  tenantId: string,
  productId: string,
  pourMl: number,
) {
  const existing = await db.posMenuMapping.findFirst({
    where: { tenantId, productId, pourMl: pourMlDecimal(pourMl) },
  });
  if (existing) return;

  await db.posMenuMapping.create({
    data: {
      tenantId,
      productId,
      pourMl: pourMlDecimal(pourMl),
      posItemId: draftSuppressedPosItemId(productId, pourMl),
    },
  });
}

export async function syncDraftMappingsForTenant(tenantId: string) {
  const products = await prisma.product.findMany({
    where: { tenantId },
    select: { id: true, bottleSizeMl: true, category: true },
  });

  const concurrency = 5;
  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (product) => {
        const bottleSizeMl = Number(product.bottleSizeMl);
        try {
          if (isFullUnitSaleProduct(product.category, bottleSizeMl)) {
            await reconcileFullUnitSaleMappings(
              prisma,
              tenantId,
              product.id,
              bottleSizeMl,
              product.category,
            );
          } else {
            await ensureDraftMappingsForProduct(
              prisma,
              tenantId,
              product.id,
              bottleSizeMl,
              product.category,
            );
          }
        } catch (error) {
          console.error(
            `Draft mapping sync failed for product ${product.id}:`,
            error instanceof Error ? error.message : error,
          );
          throw error;
        }
      }),
    );
  }
}

export async function updateFullBottleDraftPourSize(
  db: Db,
  tenantId: string,
  productId: string,
  previousBottleSizeMl: number,
  nextBottleSizeMl: number,
  category: ProductCategory,
) {
  if (previousBottleSizeMl === nextBottleSizeMl) return;

  const draftFullBottle = await db.posMenuMapping.findFirst({
    where: {
      tenantId,
      productId,
      posItemId: null,
      pourMl: pourMlDecimal(previousBottleSizeMl),
    },
  });

  if (draftFullBottle) {
    const conflict = await db.posMenuMapping.findFirst({
      where: {
        tenantId,
        productId,
        pourMl: pourMlDecimal(nextBottleSizeMl),
        NOT: { id: draftFullBottle.id },
      },
    });
    if (!conflict) {
      await db.posMenuMapping.update({
        where: { id: draftFullBottle.id },
        data: { pourMl: pourMlDecimal(nextBottleSizeMl) },
      });
    }
  }

  if (isFullUnitSaleProduct(category, nextBottleSizeMl)) {
    await reconcileFullUnitSaleMappings(db, tenantId, productId, nextBottleSizeMl, category);
  } else {
    await ensureDraftMappingsForProduct(db, tenantId, productId, nextBottleSizeMl, category);
  }
}

export async function reconcileFullUnitSaleMappings(
  db: Db,
  tenantId: string,
  productId: string,
  bottleSizeMl: number,
  category: ProductCategory,
) {
  if (!isFullUnitSaleProduct(category, bottleSizeMl)) return;

  await db.posMenuMapping.deleteMany({
    where: {
      tenantId,
      productId,
      NOT: { pourMl: pourMlDecimal(bottleSizeMl) },
    },
  });

  const fullBottle = await db.posMenuMapping.findFirst({
    where: { tenantId, productId, pourMl: pourMlDecimal(bottleSizeMl) },
  });

  if (!fullBottle) {
    await db.posMenuMapping.create({
      data: draftMappingCreateData(tenantId, productId, bottleSizeMl),
    });
    return;
  }

  if (isDraftSuppressedPosItemId(fullBottle.posItemId)) {
    await db.posMenuMapping.update({
      where: { id: fullBottle.id },
      data: { posItemId: null },
    });
  }
}

/** @deprecated Use reconcileFullUnitSaleMappings */
export async function reconcileBeerProductMappings(
  db: Db,
  tenantId: string,
  productId: string,
  bottleSizeMl: number,
) {
  await reconcileFullUnitSaleMappings(
    db,
    tenantId,
    productId,
    bottleSizeMl,
    ProductCategory.BOTTLED_BEER,
  );
}

export async function syncMappingsAfterProductSave(input: {
  tenantId: string;
  productId: string;
  bottleSizeMl: number;
  category: ProductCategory;
  previousBottleSizeMl?: number;
}): Promise<void> {
  try {
    if (
      input.previousBottleSizeMl != null &&
      input.previousBottleSizeMl !== input.bottleSizeMl
    ) {
      await updateFullBottleDraftPourSize(
        prisma,
        input.tenantId,
        input.productId,
        input.previousBottleSizeMl,
        input.bottleSizeMl,
        input.category,
      );
      return;
    }
    if (isFullUnitSaleProduct(input.category, input.bottleSizeMl)) {
      await reconcileFullUnitSaleMappings(
        prisma,
        input.tenantId,
        input.productId,
        input.bottleSizeMl,
        input.category,
      );
    } else {
      await ensureDraftMappingsForProduct(
        prisma,
        input.tenantId,
        input.productId,
        input.bottleSizeMl,
        input.category,
      );
    }
  } catch (error) {
    console.error(
      `[pos-mappings] sync after product ${input.productId} failed`,
      error instanceof Error ? error.message : error,
    );
  }
}
