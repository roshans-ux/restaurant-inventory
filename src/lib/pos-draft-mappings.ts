import { Prisma } from "@prisma/client";
import { FIXED_POUR_OPTIONS_ML } from "@/lib/mapping-sale-size";
import {
  draftPourSizesForBottle,
  draftSuppressedPosItemId,
  isDraftSuppressedPosItemId,
} from "@/lib/pos-mapping-utils";
import { isBeerBottleSize } from "@/lib/product-naming";
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
) {
  const pourSizes = draftPourSizesForBottle(bottleSizeMl);
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
    await Promise.all(
      unsuppressIds.map((id) =>
        db.posMenuMapping.update({
          where: { id },
          data: { posItemId: null },
        }),
      ),
    );
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
    select: { id: true, bottleSizeMl: true },
  });

  const concurrency = 5;
  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (product) => {
        const bottleSizeMl = Number(product.bottleSizeMl);
        try {
          if (isBeerBottleSize(bottleSizeMl)) {
            await reconcileBeerProductMappings(prisma, tenantId, product.id, bottleSizeMl);
          } else {
            await ensureDraftMappingsForProduct(prisma, tenantId, product.id, bottleSizeMl);
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

  if (isBeerBottleSize(nextBottleSizeMl)) {
    await reconcileBeerProductMappings(db, tenantId, productId, nextBottleSizeMl);
  } else {
    await ensureDraftMappingsForProduct(db, tenantId, productId, nextBottleSizeMl);
  }
}

export async function reconcileBeerProductMappings(
  db: Db,
  tenantId: string,
  productId: string,
  bottleSizeMl: number,
) {
  if (!isBeerBottleSize(bottleSizeMl)) return;

  const mappings = await db.posMenuMapping.findMany({
    where: { tenantId, productId },
  });

  for (const mapping of mappings) {
    if (Number(mapping.pourMl) !== bottleSizeMl) {
      await db.posMenuMapping.delete({ where: { id: mapping.id } });
    }
  }

  for (const pourMl of FIXED_POUR_OPTIONS_ML) {
    await recordDeletedMappingSlot(db, tenantId, productId, pourMl);
  }

  await ensureDraftMappingsForProduct(db, tenantId, productId, bottleSizeMl);
}
