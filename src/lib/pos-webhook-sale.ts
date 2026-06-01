import { Prisma, QuantityUnit, StockMovementType } from "@prisma/client";
import {
  type CocktailIngredient,
  parseCocktailIngredients,
} from "@/lib/cocktail-mapping";
import { isPosItemConfigured } from "@/lib/pos-draft-mappings";
import { stockGuardReserveMl, sumStockMovementMl } from "@/lib/inventory";

type SaleDb = Pick<
  Prisma.TransactionClient,
  "posMenuMapping" | "cocktailMapping" | "product" | "stockMovement" | "posSaleLine"
>;

export type SaleRejectedLine = {
  externalLineId: string;
  posItemId: string;
  reason: string;
  productName?: string;
  requestedQuantity?: number;
  maxAllowedQuantity?: number;
  pourMl?: number;
  availableMl?: number;
  requiredMl?: number;
  cocktailName?: string;
};

export type SaleLineInput = {
  external_line_id: string;
  pos_item_id: string;
  quantity: number;
};

type LineDepletion = {
  externalLineId: string;
  posItemId: string;
  productId: string;
  productName: string;
  bottleSizeMl: number;
  pourMl: number;
  decrementMl: number;
  lineQuantity: number;
  cocktailName?: string;
};

/**
 * Validate an entire sale before opening a transaction (cumulative stock per product).
 */
export async function collectSaleRejections(
  db: SaleDb,
  tenantId: string,
  lines: SaleLineInput[],
): Promise<SaleRejectedLine[]> {
  const rejected: SaleRejectedLine[] = [];
  const depletions: LineDepletion[] = [];

  const posItemIds = [...new Set(lines.map((l) => l.pos_item_id))];
  const [cocktails, pours] = await Promise.all([
    db.cocktailMapping.findMany({ where: { tenantId, posItemId: { in: posItemIds } } }),
    db.posMenuMapping.findMany({
      where: { tenantId, posItemId: { in: posItemIds } },
      include: { product: true },
    }),
  ]);
  const cocktailByPos = new Map(cocktails.map((c) => [c.posItemId, c]));
  const pourByPos = new Map(pours.map((p) => [p.posItemId!, p]));

  const productIds = new Set<string>();
  for (const cocktail of cocktails) {
    try {
      for (const ing of parseCocktailIngredients(cocktail.ingredients)) {
        productIds.add(ing.productId);
      }
    } catch {
      // handled per line below
    }
  }
  for (const pour of pours) {
    productIds.add(pour.productId);
  }

  const products = await db.product.findMany({
    where: { tenantId, id: { in: [...productIds] } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  for (const line of lines) {
    const cocktail = cocktailByPos.get(line.pos_item_id);
    if (cocktail) {
      let ingredients: CocktailIngredient[];
      try {
        ingredients = parseCocktailIngredients(cocktail.ingredients);
      } catch {
        rejected.push({
          externalLineId: line.external_line_id,
          posItemId: line.pos_item_id,
          reason: "COCKTAIL_INVALID_RECIPE",
          cocktailName: cocktail.name,
        });
        continue;
      }

      for (const ing of ingredients) {
        const product = productById.get(ing.productId);
        if (!product) {
          rejected.push({
            externalLineId: line.external_line_id,
            posItemId: line.pos_item_id,
            reason: "COCKTAIL_INGREDIENT_NOT_FOUND",
            cocktailName: cocktail.name,
          });
          continue;
        }
        const pourMl = ing.quantityMl;
        depletions.push({
          externalLineId: line.external_line_id,
          posItemId: line.pos_item_id,
          productId: product.id,
          productName: product.name,
          bottleSizeMl: Number(product.bottleSizeMl),
          pourMl,
          decrementMl: Math.round(pourMl * line.quantity),
          lineQuantity: line.quantity,
          cocktailName: cocktail.name,
        });
      }
      continue;
    }

    const mapping = pourByPos.get(line.pos_item_id);
    if (!mapping || !isPosItemConfigured(mapping.posItemId)) {
      rejected.push({
        externalLineId: line.external_line_id,
        posItemId: line.pos_item_id,
        reason: "UNMAPPED_POS_ITEM",
      });
      continue;
    }

    const pourMl = Number(mapping.pourMl);
    depletions.push({
      externalLineId: line.external_line_id,
      posItemId: line.pos_item_id,
      productId: mapping.productId,
      productName: mapping.product.name,
      bottleSizeMl: Number(mapping.product.bottleSizeMl),
      pourMl,
      decrementMl: Math.round(pourMl * line.quantity),
      lineQuantity: line.quantity,
    });
  }

  if (rejected.length > 0) return rejected;

  const requiredByProduct = new Map<string, { totalMl: number; bottleSizeMl: number }>();
  for (const dep of depletions) {
    const entry = requiredByProduct.get(dep.productId) ?? {
      totalMl: 0,
      bottleSizeMl: dep.bottleSizeMl,
    };
    entry.totalMl += dep.decrementMl;
    requiredByProduct.set(dep.productId, entry);
  }

  const availableByProduct = await batchAvailableStockMl(db, tenantId, requiredByProduct);

  const rejectedLineKeys = new Set<string>();
  for (const dep of depletions) {
    const required = requiredByProduct.get(dep.productId)?.totalMl ?? 0;
    const available = availableByProduct.get(dep.productId) ?? 0;
    if (required > available) {
      const key = `${dep.externalLineId}:${dep.posItemId}`;
      if (rejectedLineKeys.has(key)) continue;
      rejectedLineKeys.add(key);
      rejected.push({
        externalLineId: dep.externalLineId,
        posItemId: dep.posItemId,
        reason: "OUT_OF_STOCK_MARGIN_GUARD",
        productName: dep.productName,
        cocktailName: dep.cocktailName,
        requestedQuantity: dep.lineQuantity,
        maxAllowedQuantity: Math.max(0, Math.floor(available / dep.pourMl)),
        pourMl: dep.pourMl,
        availableMl: available,
        requiredMl: dep.decrementMl,
      });
    }
  }

  return rejected;
}

export type RecordedSaleLine = { movementReferenceIds: string[] };

export async function recordPourSaleLine(
  db: SaleDb,
  tenantId: string,
  posSaleId: string,
  externalSaleId: string,
  line: SaleLineInput,
): Promise<SaleRejectedLine | RecordedSaleLine> {
  const mapping = await db.posMenuMapping.findFirst({
    where: {
      tenantId,
      posItemId: line.pos_item_id,
    },
    include: { product: true },
  });

  if (!mapping || !isPosItemConfigured(mapping.posItemId)) {
    return {
      externalLineId: line.external_line_id,
      posItemId: line.pos_item_id,
      reason: "UNMAPPED_POS_ITEM",
    };
  }

  const pourMl = Number(mapping.pourMl);
  const decrementMl = Math.round(pourMl * line.quantity);

  await db.posSaleLine.create({
    data: {
      posSaleId,
      productId: mapping.productId,
      externalLineId: line.external_line_id,
      saleEventKey: `${externalSaleId}:${line.external_line_id}`,
      posItemId: line.pos_item_id,
      quantity: line.quantity,
      pourMl,
      decrementMl,
    },
  });

  await db.stockMovement.create({
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
        mappingType: "pour",
        externalSaleId,
        externalLineId: line.external_line_id,
        posItemId: line.pos_item_id,
        quantity: line.quantity,
      },
    },
  });

  return { movementReferenceIds: [line.external_line_id] };
}

export async function recordCocktailSaleLine(
  db: SaleDb,
  tenantId: string,
  posSaleId: string,
  externalSaleId: string,
  line: SaleLineInput,
): Promise<SaleRejectedLine | RecordedSaleLine | null> {
  const cocktail = await db.cocktailMapping.findFirst({
    where: {
      tenantId,
      posItemId: line.pos_item_id,
    },
  });

  if (!cocktail) return null;

  const ingredients = parseCocktailIngredients(cocktail.ingredients);
  const products = await db.product.findMany({
    where: { tenantId, id: { in: ingredients.map((i) => i.productId) } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const planned = ingredients.map((ing: CocktailIngredient) => {
    const product = productById.get(ing.productId);
    if (!product) {
      throw new Error("COCKTAIL_INGREDIENT_NOT_FOUND");
    }
    const pourMl = ing.quantityMl;
    return {
      ing,
      product,
      pourMl,
      decrementMl: Math.round(pourMl * line.quantity),
    };
  });

  for (let idx = 0; idx < planned.length; idx++) {
    const plan = planned[idx]!;
    const ingredientLineId = `${line.external_line_id}:${idx}`;
    await db.posSaleLine.create({
      data: {
        posSaleId,
        productId: plan.product.id,
        externalLineId: ingredientLineId,
        saleEventKey: `${externalSaleId}:${ingredientLineId}`,
        posItemId: line.pos_item_id,
        quantity: line.quantity,
        pourMl: plan.pourMl,
        decrementMl: plan.decrementMl,
      },
    });

    await db.stockMovement.create({
      data: {
        productId: plan.product.id,
        type: StockMovementType.SALE,
        quantityDeltaMl: -Math.abs(plan.decrementMl),
        quantityInput: plan.decrementMl,
        quantityUnit: QuantityUnit.ML,
        referenceId: ingredientLineId,
        reason: `POS cocktail sale: ${cocktail.name}`,
        metadata: {
          source: "POS_WEBHOOK",
          mappingType: "cocktail",
          cocktailMappingId: cocktail.id,
          cocktailName: cocktail.name,
          externalSaleId,
          externalLineId: line.external_line_id,
          posItemId: line.pos_item_id,
          quantity: line.quantity,
          ingredientProductId: plan.ing.productId,
          ingredientQuantityMl: plan.ing.quantityMl,
          ingredientIndex: idx,
        },
      },
    });
  }

  return {
    movementReferenceIds: planned.map((_, idx) => `${line.external_line_id}:${idx}`),
  };
}

/** @deprecated Use recordPourSaleLine after collectSaleRejections */
export async function processPourSaleLine(
  db: SaleDb,
  tenantId: string,
  posSaleId: string,
  externalSaleId: string,
  line: SaleLineInput,
): Promise<SaleRejectedLine | RecordedSaleLine> {
  return recordPourSaleLine(db, tenantId, posSaleId, externalSaleId, line);
}

/** @deprecated Use recordCocktailSaleLine after collectSaleRejections */
export async function processCocktailSaleLine(
  db: SaleDb,
  tenantId: string,
  posSaleId: string,
  externalSaleId: string,
  line: SaleLineInput,
): Promise<SaleRejectedLine | RecordedSaleLine | null> {
  return recordCocktailSaleLine(db, tenantId, posSaleId, externalSaleId, line);
}

export async function rollbackRecordedSale(
  db: Pick<Prisma.TransactionClient, "posSaleLine" | "stockMovement" | "posSale">,
  posSaleId: string,
  movementReferenceIds: string[],
) {
  await db.posSaleLine.deleteMany({ where: { posSaleId } });
  if (movementReferenceIds.length > 0) {
    await db.stockMovement.deleteMany({
      where: { referenceId: { in: movementReferenceIds } },
    });
  }
  await db.posSale.delete({ where: { id: posSaleId } });
}

/** One query for all products — avoids N aggregates that trigger pg adapter bind bugs. */
async function batchAvailableStockMl(
  db: Pick<Prisma.TransactionClient, "stockMovement" | "product">,
  tenantId: string,
  requiredByProduct: Map<string, { totalMl: number; bottleSizeMl: number }>,
): Promise<Map<string, number>> {
  const productIds = [...requiredByProduct.keys()];
  const available = new Map<string, number>();
  if (productIds.length === 0) return available;

  const products = await db.product.findMany({
    where: { tenantId, id: { in: productIds } },
    select: { id: true, bottleSizeMl: true },
  });

  const sums = await db.stockMovement.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _sum: { quantityDeltaMl: true },
  });
  const currentByProduct = new Map(
    sums.map((row) => [row.productId, sumStockMovementMl({ _sum: row._sum })]),
  );

  for (const product of products) {
    const bottleSizeMl = Number(product.bottleSizeMl);
    const currentMl = currentByProduct.get(product.id) ?? 0;
    const reserveMl = stockGuardReserveMl(bottleSizeMl);
    available.set(product.id, Math.max(0, currentMl - reserveMl));
  }

  return available;
}

export function isPgAdapterBindError(error: unknown): boolean {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    if (error.cause instanceof Error) parts.push(error.cause.message);
  } else if (typeof error === "string") {
    parts.push(error);
  }
  const message = parts.join(" ");
  return message.includes("bind message supplies") && message.includes("prepared statement");
}

export async function withPgRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isPgAdapterBindError(error) || i === attempts - 1) throw error;
    }
  }
  throw lastError;
}
