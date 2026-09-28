export const POS_SALE_SOURCE_IMPORT = "IMPORT";
export const POS_SALE_SOURCE_POS = "POS";

export const DATE_FORMATS = ["dmy", "mdy", "ymd"] as const;
export type ImportDateFormat = (typeof DATE_FORMATS)[number];

export const DATE_FORMAT_LABELS: Record<ImportDateFormat, string> = {
  dmy: "DD/MM/YYYY",
  mdy: "MM/DD/YYYY",
  ymd: "YYYY-MM-DD",
};

export const RESOLUTION_SKIP = "skip";
export const RESOLUTION_IGNORE = "ignore";
export const RESOLUTION_CHANGE = "change";

export type SalesImportColumnMapping = {
  date: string;
  time: string | null;
  posItemId: string | null;
  itemName: string | null;
  quantity: string;
  billNumber: string | null;
  dateFormat: ImportDateFormat;
};

export type ParsedImportTable = {
  headers: string[];
  rows: Record<string, string>[];
};

export type CatalogMappingOption = {
  posItemId: string;
  label: string;
  kind: "pour" | "cocktail";
  productName?: string;
  pourMl?: number;
};

export type UnmatchedItemGroup = {
  key: string;
  name: string;
  count: number;
  needsPourSize: boolean;
  options: CatalogMappingOption[];
};

export type UnparseableDateRow = {
  rowNumber: number;
  rawDate: string;
  item: string;
};

export type AutoMappedPour = {
  key: string;
  name: string;
  count: number;
  posItemId: string;
  label: string;
  options: CatalogMappingOption[];
};

export type ImportMatchSummary = {
  rowCount: number;
  matched: number;
  alreadyImported: number;
  unmatched: UnmatchedItemGroup[];
  needsPourSize: UnmatchedItemGroup[];
  autoMappedPours: AutoMappedPour[];
  ignoredCount: number;
  skippedCount: number;
  unparseableDates: UnparseableDateRow[];
  invalidQuantity: number;
  dateRange: { start: string | null; end: string | null };
  dateExample: { raw: string; parsed: string } | null;
};
