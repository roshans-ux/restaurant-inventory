import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { buildImportCatalog } from "@/lib/sales-import/catalog";
import {
  loadTenantCatalog,
  mergeIgnored,
  mergePourAliases,
  parseResolutions,
  persistMappingAndPrefs,
} from "@/lib/sales-import/http";
import { classifyRows } from "@/lib/sales-import/match";
import { mappingLooksValid, parseSpreadsheetBuffer } from "@/lib/sales-import/parse";
import { loadExistingDedupKeys } from "@/lib/sales-import/record";
import type { ParsedImportTable, SalesImportColumnMapping } from "@/lib/sales-import/types";

export function hashImportContents(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function findCompletedImportByHash(tenantId: string, contentHash: string) {
  return prisma.salesImportBatch.findFirst({
    where: { tenantId, contentHash },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, createdAt: true },
  });
}

export async function classifyImportUpload(args: {
  tenantId: string;
  buffer: Buffer;
  fileName: string;
  mapping: SalesImportColumnMapping;
  resolutionsJson: string | null;
  table?: ParsedImportTable;
  contentHash?: string;
}) {
  const table = args.table ?? (await parseSpreadsheetBuffer(args.buffer, args.fileName));
  const mappingError = mappingLooksValid(args.mapping, table.headers);
  if (mappingError) {
    return { ok: false as const, error: mappingError };
  }

  const catalogData = await loadTenantCatalog(args.tenantId);
  const catalog = buildImportCatalog(catalogData);
  const resolutions = parseResolutions(args.resolutionsJson);
  const existingKeys = await loadExistingDedupKeys(args.tenantId);
  const classified = classifyRows(
    table.rows,
    args.mapping,
    catalog,
    resolutions,
    catalogData.ignoredNames,
    catalogData.pourAliases,
    existingKeys,
  );

  const ignoredNames = mergeIgnored(catalogData.ignoredNames, classified.newlyIgnored);
  await persistMappingAndPrefs(args.tenantId, args.mapping, {
    ignored: ignoredNames,
    pours: mergePourAliases(catalogData.pourAliases, classified.newlyPourAliases, classified.removedPourKeys),
  });

  const summary = classified.summary;
  if (args.contentHash && summary.matched > 0 && summary.alreadyImported >= summary.matched) {
    await prisma.salesImportBatch.updateMany({
      where: { tenantId: args.tenantId, fileName: args.fileName, contentHash: null },
      data: { contentHash: args.contentHash },
    });
  }

  return {
    ok: true as const,
    table,
    classified,
    options: catalog.options,
    ignoredNames,
  };
}
