import { ProductCategory } from "@prisma/client";

export const PRODUCT_CATEGORIES = [
  ProductCategory.SPIRIT,
  ProductCategory.WINE,
  ProductCategory.BOTTLED_BEER,
  ProductCategory.DRAFT_BEER,
  ProductCategory.CIDER,
] as const;

export const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  SPIRIT: "Spirit",
  WINE: "Wine",
  BOTTLED_BEER: "Bottled Beer",
  DRAFT_BEER: "Draft Beer / Keg",
  CIDER: "Cider",
};

export const PRODUCT_CATEGORY_PILL: Record<
  ProductCategory,
  { bg: string; color: string; border: string }
> = {
  SPIRIT: { bg: "var(--accent-dim)", color: "var(--accent)", border: "rgba(245,166,35,0.35)" },
  WINE: { bg: "rgba(167,139,250,0.14)", color: "#c4b5fd", border: "rgba(167,139,250,0.35)" },
  BOTTLED_BEER: { bg: "rgba(96,165,250,0.14)", color: "#93c5fd", border: "rgba(96,165,250,0.35)" },
  DRAFT_BEER: { bg: "rgba(74,222,128,0.14)", color: "#86efac", border: "rgba(74,222,128,0.35)" },
  CIDER: { bg: "rgba(251,146,60,0.14)", color: "#fdba74", border: "rgba(251,146,60,0.35)" },
};

export const CATEGORY_BOTTLE_SIZES_ML: Record<ProductCategory, readonly number[]> = {
  SPIRIT: [750, 1000, 1750, 2000],
  WINE: [375, 750],
  BOTTLED_BEER: [330, 650],
  DRAFT_BEER: [20000, 30000, 50000],
  CIDER: [330, 500, 650],
};

const ALL_CATEGORY_SIZES = Array.from(
  new Set(Object.values(CATEGORY_BOTTLE_SIZES_ML).flat()),
);

export function bottleSizeOptionsForCategory(
  category: ProductCategory,
  extraMl?: number,
): { label: string; ml: number }[] {
  const sizes = [...CATEGORY_BOTTLE_SIZES_ML[category]];
  if (extraMl != null && extraMl > 0 && !sizes.includes(extraMl)) {
    sizes.push(extraMl);
  }
  return sizes.map((ml) => ({ ml, label: formatCategoryBottleSizeLabel(ml) }));
}

export function formatCategoryBottleSizeLabel(ml: number): string {
  if (ml === 20000) return "20L";
  if (ml === 30000) return "30L";
  if (ml === 50000) return "50L";
  if (ml === 1000) return "1L";
  if (ml === 1750) return "1.75L";
  if (ml === 2000) return "2L";
  return `${ml}ml`;
}

export function isValidSizeForCategory(category: ProductCategory, bottleSizeMl: number): boolean {
  return CATEGORY_BOTTLE_SIZES_ML[category].includes(bottleSizeMl);
}

export function isKnownCategoryBottleSize(bottleSizeMl: number): boolean {
  return ALL_CATEGORY_SIZES.includes(bottleSizeMl);
}

export function isFullUnitSaleCategory(category: ProductCategory): boolean {
  return category === ProductCategory.BOTTLED_BEER || category === ProductCategory.CIDER;
}

export function isHandoverCategory(category: ProductCategory): boolean {
  return (
    category === ProductCategory.SPIRIT ||
    category === ProductCategory.WINE ||
    category === ProductCategory.DRAFT_BEER
  );
}

export function defaultPourMlForCategory(category: ProductCategory, bottleSizeMl: number): number {
  switch (category) {
    case ProductCategory.SPIRIT:
      return 30;
    case ProductCategory.WINE:
      return 120;
    case ProductCategory.DRAFT_BEER:
      return 330;
    case ProductCategory.BOTTLED_BEER:
    case ProductCategory.CIDER:
      return bottleSizeMl;
    default:
      return 30;
  }
}

export function straightPourOptionsMl(category: ProductCategory, bottleSizeMl: number): number[] {
  switch (category) {
    case ProductCategory.SPIRIT:
      return [30, 60, 90, bottleSizeMl];
    case ProductCategory.WINE:
      return [120, bottleSizeMl];
    case ProductCategory.DRAFT_BEER:
      return [250, 330, 450, 1000];
    case ProductCategory.BOTTLED_BEER:
    case ProductCategory.CIDER:
      return [bottleSizeMl];
    default:
      return [bottleSizeMl];
  }
}

export function draftPourSizesForCategory(
  category: ProductCategory,
  bottleSizeMl: number,
): number[] {
  return straightPourOptionsMl(category, bottleSizeMl);
}

export function isAllowedStraightPour(
  category: ProductCategory,
  bottleSizeMl: number,
  pourMl: number,
): boolean {
  return straightPourOptionsMl(category, bottleSizeMl).includes(pourMl);
}
