import { formatBottleSizeLabel } from "@/lib/product-naming";

export function formatMappingSaleSize(pourMl: number, bottleSizeMl?: number | null): string {
  if (bottleSizeMl != null && pourMl === bottleSizeMl) {
    return `1 bottle (${formatBottleSizeLabel(bottleSizeMl)})`;
  }
  return `${pourMl}ml`;
}

export function isFullBottlePour(pourMl: number, bottleSizeMl?: number | null): boolean {
  return bottleSizeMl != null && pourMl === bottleSizeMl;
}

export const FIXED_POUR_OPTIONS_ML = [30, 60] as const;
