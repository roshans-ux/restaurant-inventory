import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { revalidateForecastCache } from "@/lib/forecast/cache";
import { POS_SALE_SOURCE_IMPORT } from "@/lib/sales-import/types";
import { hasExistingImportDedup, importDayDedupKey, importDedupKeys, type NormalizedImportRow } from "@/lib/sales-import/match";

const INSERT_CHUNK = 500;
const TRANSACTION_TIMEOUT_MS = 30_000;

type SaleDb = Pick<Prisma.TransactionClient, "posSale" | "posSaleLine" | "salesImportBatch">;

async function createManyInChunks<T extends object>(
  rows: T[],
  write: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await write(rows.slice(i, i + INSERT_CHUNK));
  }
}

export async function loadExistingDedupKeys(tenantId: string): Promise<Set<string>> {
  const sales = await prisma.posSale.findMany({
    where: {
      tenantId,
      OR: [{ source: POS_SALE_SOURCE_IMPORT }, { importBatchId: { not: null } }],
    },
    select: {
      billNumber: true,
      soldAt: true,
      lines: { select: { posItemId: true, quantity: true } },
    },
  });
  const keys = new Set<string>();
  for (const sale of sales) {
    const soldAtMs = sale.soldAt.getTime();
    for (const line of sale.lines) {
      for (const key of importDedupKeys({
        billNumber: sale.billNumber,
        posItemId: line.posItemId,
        soldAtMs,
        quantity: line.quantity,
      })) {
        keys.add(key);
      }
      const dayKey = importDayDedupKey({
        billNumber: sale.billNumber,
        posItemId: line.posItemId,
        soldAtMs,
      });
      if (dayKey) keys.add(dayKey);
    }
  }
  return keys;
}

export async function importMatchedRows(args: {
  tenantId: string;
  fileName: string;
  contentHash?: string | null;
  matched: NormalizedImportRow[];
}): Promise<{
  batchId: string;
  rowsImported: number;
  rowsSkippedDuplicate: number;
  dateRangeStart: Date | null;
  dateRangeEnd: Date | null;
}> {
  const existing = await loadExistingDedupKeys(args.tenantId);
  const seenBatch = new Set<string>();
  const toImport: NormalizedImportRow[] = [];
  let skipped = 0;

  for (const row of args.matched) {
    const dupArgs = {
      billNumber: row.billNumber,
      posItemId: row.entry.posItemId,
      soldAtMs: row.soldAt.getTime(),
      quantity: row.quantity,
    };
    const keys = importDedupKeys(dupArgs);
    const dayKey = importDayDedupKey(dupArgs);
    if (
      hasExistingImportDedup(existing, dupArgs) ||
      keys.some((key) => seenBatch.has(key)) ||
      Boolean(dayKey && (existing.has(dayKey) || seenBatch.has(dayKey)))
    ) {
      skipped += 1;
      continue;
    }
    for (const key of keys) {
      seenBatch.add(key);
      existing.add(key);
    }
    if (dayKey) {
      seenBatch.add(dayKey);
      existing.add(dayKey);
    }
    toImport.push(row);
  }

  const grouped = new Map<string, NormalizedImportRow[]>();
  for (const row of toImport) {
    const groupKey = row.billNumber
      ? `b:${row.billNumber}|${row.soldAt.getTime()}`
      : `r:${row.rowIndex}`;
    const list = grouped.get(groupKey) ?? [];
    list.push(row);
    grouped.set(groupKey, list);
  }

  let minSold: Date | null = null;
  let maxSold: Date | null = null;
  for (const row of toImport) {
    if (!minSold || row.soldAt < minSold) minSold = row.soldAt;
    if (!maxSold || row.soldAt > maxSold) maxSold = row.soldAt;
  }

  const result = await prisma.$transaction(
    async (tx: SaleDb) => {
      const batch = await tx.salesImportBatch.create({
        data: {
          tenantId: args.tenantId,
          fileName: args.fileName,
          contentHash: args.contentHash || null,
          rowsImported: toImport.length,
          rowsSkippedDuplicate: skipped,
          dateRangeStart: minSold,
          dateRangeEnd: maxSold,
        },
      });

      const saleRows: Prisma.PosSaleCreateManyInput[] = [];
      const lineRows: Prisma.PosSaleLineCreateManyInput[] = [];

      for (const [, group] of grouped) {
        const first = group[0]!;
        const saleId = randomUUID();
        const externalSaleId = `imp:${batch.id}:${randomUUID()}`;
        saleRows.push({
          id: saleId,
          tenantId: args.tenantId,
          externalSaleId,
          soldAt: first.soldAt,
          source: POS_SALE_SOURCE_IMPORT,
          importBatchId: batch.id,
          billNumber: first.billNumber,
        });

        for (const row of group) {
          if (row.entry.kind === "pour") {
            const decrementMl = Math.round(row.entry.pourMl * row.quantity);
            const externalLineId = `imp:${batch.id}:${randomUUID()}`;
            lineRows.push({
              posSaleId: saleId,
              productId: row.entry.productId,
              externalLineId,
              saleEventKey: `${externalSaleId}:${externalLineId}`,
              posItemId: row.entry.posItemId,
              quantity: row.quantity,
              pourMl: row.entry.pourMl,
              decrementMl,
            });
            continue;
          }
          row.entry.ingredients.forEach((ing, idx) => {
            const decrementMl = Math.round(ing.quantityMl * row.quantity);
            const externalLineId = `imp:${batch.id}:${randomUUID()}:${idx}`;
            lineRows.push({
              posSaleId: saleId,
              productId: ing.productId,
              externalLineId,
              saleEventKey: `${externalSaleId}:${externalLineId}`,
              posItemId: row.entry.posItemId,
              quantity: row.quantity,
              pourMl: ing.quantityMl,
              decrementMl,
            });
          });
        }
      }

      await createManyInChunks(saleRows, (data) => tx.posSale.createMany({ data }));
      await createManyInChunks(lineRows, (data) => tx.posSaleLine.createMany({ data }));

      return batch;
    },
    { timeout: TRANSACTION_TIMEOUT_MS, maxWait: TRANSACTION_TIMEOUT_MS },
  );

  revalidateForecastCache(args.tenantId);
  return {
    batchId: result.id,
    rowsImported: toImport.length,
    rowsSkippedDuplicate: skipped,
    dateRangeStart: minSold,
    dateRangeEnd: maxSold,
  };
}
