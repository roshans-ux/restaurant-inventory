import { dateParseExample, importRowHasClock, parseImportSoldAt, sampleDateValues } from "@/lib/sales-import/dates";
import {
  mappingOptionsForPours,
  resolveCatalogEntry,
  type CatalogEntry,
  type ImportCatalog,
} from "@/lib/sales-import/catalog";
import { RESOLUTION_CHANGE, RESOLUTION_IGNORE, RESOLUTION_SKIP } from "@/lib/sales-import/types";
import type {
  AutoMappedPour,
  ImportMatchSummary,
  SalesImportColumnMapping,
  UnmatchedItemGroup,
  UnparseableDateRow,
} from "@/lib/sales-import/types";
import { istIsoDate } from "@/lib/forecast/dates";

export type NormalizedImportRow = {
  rowIndex: number;
  billNumber: string | null;
  soldAt: Date;
  posItemIdRaw: string;
  itemNameRaw: string;
  quantity: number;
  entry: CatalogEntry;
};

export function cell(row: Record<string, string>, column: string | null | undefined): string {
  if (!column) return "";
  return (row[column] ?? "").trim();
}

export function parseQuantity(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

type NameBucket = {
  key: string;
  spellings: Map<string, number>;
  count: number;
  needsPourSize: boolean;
  options: UnmatchedItemGroup["options"];
};

function displayName(bucket: NameBucket): string {
  let best = bucket.key;
  let n = -1;
  for (const [spelling, count] of bucket.spellings) {
    if (count > n) {
      n = count;
      best = spelling;
    }
  }
  return best;
}

function addToBucket(
  buckets: Map<string, NameBucket>,
  key: string,
  spelling: string,
  extra?: { needsPourSize?: boolean; options?: UnmatchedItemGroup["options"] },
) {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      key,
      spellings: new Map(),
      count: 0,
      needsPourSize: Boolean(extra?.needsPourSize),
      options: extra?.options ?? [],
    };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  bucket.spellings.set(spelling, (bucket.spellings.get(spelling) ?? 0) + 1);
  if (extra?.needsPourSize) {
    bucket.needsPourSize = true;
    if (extra.options && extra.options.length > 0) bucket.options = extra.options;
  }
}

function bucketsToGroups(buckets: Map<string, NameBucket>): UnmatchedItemGroup[] {
  return [...buckets.values()]
    .map((b) => ({
      key: b.key,
      name: displayName(b),
      count: b.count,
      needsPourSize: b.needsPourSize,
      options: b.options,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function classifyRows(
  rows: Record<string, string>[],
  mapping: SalesImportColumnMapping,
  catalog: ImportCatalog,
  resolutions: Record<string, string>,
  ignoredNames: string[],
  pourAliases: Record<string, string> = {},
  existingKeys: Set<string> = new Set(),
): {
  summary: ImportMatchSummary;
  matched: NormalizedImportRow[];
  newlyIgnored: string[];
  newlyPourAliases: Record<string, string>;
  removedPourKeys: string[];
} {
  const ignored = new Set(ignoredNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const unmatchedBuckets = new Map<string, NameBucket>();
  const pourBuckets = new Map<string, NameBucket>();
  const autoMappedBuckets = new Map<string, AutoMappedPour>();
  const matched: NormalizedImportRow[] = [];
  const unparseableDates: UnparseableDateRow[] = [];
  const newlyIgnored: string[] = [];
  const newlyPourAliases: Record<string, string> = {};
  const removedPourKeys: string[] = [];
  let invalidQuantity = 0;
  let ignoredCount = 0;
  let skippedCount = 0;
  let minSold: Date | null = null;
  let maxSold: Date | null = null;
  let alreadyImported = 0;

  const format = mapping.dateFormat ?? "dmy";
  const dateSamples = sampleDateValues(rows, mapping.date);

  rows.forEach((row, rowIndex) => {
    const dateRaw = cell(row, mapping.date);
    const timeRaw = cell(row, mapping.time);
    const posItemIdRaw = cell(row, mapping.posItemId);
    const itemNameRaw = cell(row, mapping.itemName);
    const qty = parseQuantity(cell(row, mapping.quantity));
    const groupSpelling = itemNameRaw || posItemIdRaw || "(blank item)";
    const groupKey = groupSpelling.toLowerCase();
    const resolution = resolutions[groupKey];

    const soldAt = parseImportSoldAt(dateRaw, timeRaw || null, format);
    if (!soldAt) {
      unparseableDates.push({
        rowNumber: rowIndex + 2,
        rawDate: dateRaw || "(empty)",
        item: groupSpelling,
      });
      return;
    }
    if (!minSold || soldAt < minSold) minSold = soldAt;
    if (!maxSold || soldAt > maxSold) maxSold = soldAt;

    if (qty == null) {
      invalidQuantity += 1;
      return;
    }

    if (ignored.has(groupKey) || resolution === RESOLUTION_IGNORE) {
      ignoredCount += 1;
      if (resolution === RESOLUTION_IGNORE && !ignored.has(groupKey)) newlyIgnored.push(groupKey);
      if (resolution === RESOLUTION_IGNORE) removedPourKeys.push(groupKey);
      return;
    }
    if (resolution === RESOLUTION_SKIP) {
      skippedCount += 1;
      return;
    }

    const sessionResolutions =
      resolution === RESOLUTION_CHANGE ? { ...resolutions, [groupKey]: "" } : resolutions;
    const effectiveResolutions =
      resolution === RESOLUTION_CHANGE
        ? sessionResolutions
        : { ...pourAliases, ...resolutions };

    const withoutSaved = resolveCatalogEntry(catalog, posItemIdRaw, itemNameRaw, sessionResolutions);
    const result = resolveCatalogEntry(catalog, posItemIdRaw, itemNameRaw, effectiveResolutions);

    if (result.status === "matched") {
      if (
        resolution &&
        resolution !== RESOLUTION_CHANGE &&
        resolution !== RESOLUTION_SKIP &&
        resolution !== RESOLUTION_IGNORE &&
        withoutSaved.status === "ambiguous"
      ) {
        newlyPourAliases[groupKey] = resolution;
      }
      const isAuto =
        withoutSaved.status === "ambiguous" &&
        Boolean(pourAliases[groupKey]) &&
        resolution !== RESOLUTION_CHANGE;
      if (isAuto) {
        const existingAuto = autoMappedBuckets.get(groupKey);
        const option = catalog.options.find((o) => o.posItemId === result.entry.posItemId);
        if (existingAuto) existingAuto.count += 1;
        else {
          autoMappedBuckets.set(groupKey, {
            key: groupKey,
            name: groupSpelling,
            count: 1,
            posItemId: result.entry.posItemId,
            label: option?.label ?? `${result.entry.kind === "pour" ? `${result.entry.productName} · ${result.entry.pourMl}ml` : result.entry.name}`,
            options: mappingOptionsForPours(withoutSaved.options),
          });
        }
      }

      const dupArgs = {
        billNumber: cell(row, mapping.billNumber) || null,
        posItemId: result.entry.posItemId,
        soldAtMs: soldAt.getTime(),
        quantity: qty,
      };
      const dayKey = importDayDedupKey(dupArgs);
      const already =
        hasExistingImportDedup(existingKeys, dupArgs) ||
        (!importRowHasClock(dateRaw, timeRaw) && Boolean(dayKey && existingKeys.has(dayKey)));
      if (already) alreadyImported += 1;
      matched.push({
        rowIndex,
        billNumber: cell(row, mapping.billNumber) || null,
        soldAt,
        posItemIdRaw,
        itemNameRaw,
        quantity: qty,
        entry: result.entry,
      });
      return;
    }
    if (result.status === "ambiguous") {
      addToBucket(pourBuckets, groupKey, groupSpelling, {
        needsPourSize: true,
        options: mappingOptionsForPours(result.options),
      });
      return;
    }
    addToBucket(unmatchedBuckets, groupKey, groupSpelling);
  });

  return {
    matched,
    newlyIgnored,
    newlyPourAliases,
    removedPourKeys,
    summary: {
      rowCount: rows.length,
      matched: matched.length,
      alreadyImported,
      unmatched: bucketsToGroups(unmatchedBuckets),
      needsPourSize: bucketsToGroups(pourBuckets),
      autoMappedPours: [...autoMappedBuckets.values()].sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name),
      ),
      ignoredCount,
      skippedCount,
      unparseableDates,
      invalidQuantity,
      dateRange: {
        start: minSold ? istIsoDate(minSold) : null,
        end: maxSold ? istIsoDate(maxSold) : null,
      },
      dateExample: dateParseExample(dateSamples, format),
    },
  };
}

export function importDedupKey(args: {
  billNumber: string | null;
  posItemId: string;
  soldAtMs: number;
  quantity: number;
}): string {
  const soldAtMs = Math.floor(args.soldAtMs / 1000) * 1000;
  const bill = args.billNumber?.trim() || null;
  if (bill) {
    return `b:${bill}|${args.posItemId}|${soldAtMs}`;
  }
  return `n:${args.posItemId}|${soldAtMs}|${args.quantity}`;
}

/** Bill+item+time, and item+time+qty, so an optional Bill column still matches stored imports. */
export function importDedupKeys(args: {
  billNumber: string | null;
  posItemId: string;
  soldAtMs: number;
  quantity: number;
}): string[] {
  const withoutBill = importDedupKey({ ...args, billNumber: null });
  const withBill = importDedupKey(args);
  return withBill === withoutBill ? [withoutBill] : [withBill, withoutBill];
}

export function importDayDedupKey(args: {
  billNumber: string | null;
  posItemId: string;
  soldAtMs: number;
}): string | null {
  const bill = args.billNumber?.trim();
  if (!bill) return null;
  return `bd:${bill}|${args.posItemId}|${istIsoDate(new Date(args.soldAtMs))}`;
}

export function hasExistingImportDedup(
  existing: Set<string>,
  args: {
    billNumber: string | null;
    posItemId: string;
    soldAtMs: number;
    quantity: number;
  },
): boolean {
  return importDedupKeys(args).some((key) => existing.has(key));
}
