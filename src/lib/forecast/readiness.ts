import { addIsoDays, compareIsoDates, isoDayDiff } from "@/lib/forecast/dates";

export const READY_MIN_CALENDAR_DAYS = 14;
export const READY_MIN_SALE_COUNT = 3;
export const CONFIDENT_MIN_CALENDAR_DAYS = 28;
export const LEARNING_RECENT_SALE_DAYS = 7;

export type ForecastConfidence = "early" | "confident";

export type SkuReadiness = {
  enoughData: boolean;
  daysSinceFirstSale: number | null;
  saleCount: number;
  confidence: ForecastConfidence | null;
  learningDaysElapsed: number;
  firstSaleIso: string | null;
  hasRecentSales: boolean;
};

/** Calendar-day + sale-count gate. Does not change weekday/stockout maths. */
export function skuForecastReadiness(args: {
  firstSaleIso: string | null;
  lastSaleIso: string | null;
  saleCount: number;
  todayIso: string;
}): SkuReadiness {
  const saleCount = Math.max(0, Math.floor(args.saleCount));
  const firstSaleIso = saleCount > 0 ? args.firstSaleIso : null;
  const lastSaleIso = saleCount > 0 ? args.lastSaleIso : null;
  const recentSince = addIsoDays(args.todayIso, -LEARNING_RECENT_SALE_DAYS);
  const hasRecentSales = Boolean(
    lastSaleIso && compareIsoDates(lastSaleIso, recentSince) >= 0 && compareIsoDates(lastSaleIso, args.todayIso) <= 0,
  );

  if (!firstSaleIso || saleCount <= 0) {
    return {
      enoughData: false,
      daysSinceFirstSale: null,
      saleCount,
      confidence: null,
      learningDaysElapsed: 0,
      firstSaleIso: null,
      hasRecentSales: false,
    };
  }

  const daysSinceFirstSale = Math.max(0, isoDayDiff(firstSaleIso, args.todayIso));
  const enoughData = daysSinceFirstSale >= READY_MIN_CALENDAR_DAYS && saleCount >= READY_MIN_SALE_COUNT;
  const learningDaysElapsed = Math.min(READY_MIN_CALENDAR_DAYS, daysSinceFirstSale + 1);
  const confidence: ForecastConfidence | null = enoughData
    ? daysSinceFirstSale >= CONFIDENT_MIN_CALENDAR_DAYS
      ? "confident"
      : "early"
    : null;

  return {
    enoughData,
    daysSinceFirstSale,
    saleCount,
    confidence,
    learningDaysElapsed,
    firstSaleIso,
    hasRecentSales,
  };
}

/**
 * Banner: awaiting first sale if the tenant has SKUs but zero sales;
 * otherwise countdown among learning SKUs with a sale in the last 7 IST days.
 * Null when every SKU with sales is ready (or there are no SKUs).
 */
export type LearningBannerState =
  | { kind: "awaiting_first_sale" }
  | { kind: "countdown"; days: number };

export function learningBannerFromReadiness(
  skus: ReadonlyArray<Pick<SkuReadiness, "enoughData" | "saleCount" | "hasRecentSales" | "daysSinceFirstSale">>,
): LearningBannerState | null {
  if (skus.length === 0) return null;
  const anySales = skus.some((sku) => sku.saleCount > 0);
  if (!anySales) return { kind: "awaiting_first_sale" };
  const days = learningBannerDaysFromReadiness(skus);
  if (days == null) return null;
  return { kind: "countdown", days };
}
export function learningBannerDaysFromReadiness(
  skus: ReadonlyArray<Pick<SkuReadiness, "enoughData" | "saleCount" | "hasRecentSales" | "daysSinceFirstSale">>,
): number | null {
  let maxRemaining = -1;
  for (const sku of skus) {
    if (sku.enoughData || sku.saleCount <= 0 || !sku.hasRecentSales) continue;
    const remaining = Math.max(0, READY_MIN_CALENDAR_DAYS - (sku.daysSinceFirstSale ?? 0));
    maxRemaining = Math.max(maxRemaining, remaining);
  }
  if (maxRemaining < 0) return null;
  return Math.max(1, maxRemaining);
}
