import { isoDayDiff } from "@/lib/forecast/dates";

export { isoDayDiff };

export function sealedBottleCount(currentMl: number, bottleSizeMl: number): number {
  if (!(bottleSizeMl > 0)) return 0;
  return Math.floor(Math.max(0, currentMl) / bottleSizeMl);
}

export function isBelowKeepAtLeast(
  currentMl: number,
  thresholdBottles: number | null,
  bottleSizeMl: number,
): boolean {
  if (thresholdBottles == null) return false;
  return sealedBottleCount(currentMl, bottleSizeMl) < thresholdBottles;
}

export function bottlesToReachKeepAtLeast(
  currentMl: number,
  thresholdBottles: number | null,
  bottleSizeMl: number,
): number {
  if (thresholdBottles == null) return 0;
  return Math.max(0, thresholdBottles - sealedBottleCount(currentMl, bottleSizeMl));
}

export function isForecastReorderDue(orderBy: string | null, todayIso: string, enoughData: boolean): boolean {
  if (!enoughData || !orderBy) return false;
  return todayIso >= orderBy;
}

export function skuNeedsRestock(args: {
  currentMl: number;
  bottleSizeMl: number;
  thresholdBottles: number | null;
  enoughData: boolean;
  orderBy: string | null;
  todayIso: string;
}): boolean {
  return (
    isBelowKeepAtLeast(args.currentMl, args.thresholdBottles, args.bottleSizeMl) ||
    isForecastReorderDue(args.orderBy, args.todayIso, args.enoughData)
  );
}

export function suggestedOrderBottles(args: {
  currentMl: number;
  bottleSizeMl: number;
  thresholdBottles: number | null;
  enoughData: boolean;
  forecastSuggestedBottles: number;
  floorTriggered: boolean;
}): number {
  const forecastQty = args.enoughData ? Math.max(0, args.forecastSuggestedBottles) : 0;
  if (!args.floorTriggered) return forecastQty;
  const floorQty = bottlesToReachKeepAtLeast(args.currentMl, args.thresholdBottles, args.bottleSizeMl);
  return Math.max(forecastQty, floorQty);
}

export function daysUntilStockout(todayIso: string, runsOutOn: string | null): number | null {
  if (!runsOutOn) return null;
  return isoDayDiff(todayIso, runsOutOn);
}

export function restockUrgency(args: {
  todayIso: string;
  orderBy: string | null;
}): { rank: number; overdueDays: number } {
  if (args.orderBy && args.todayIso > args.orderBy) {
    return { rank: 0, overdueDays: isoDayDiff(args.orderBy, args.todayIso) };
  }
  if (args.orderBy && args.todayIso === args.orderBy) {
    return { rank: 1, overdueDays: 0 };
  }
  return { rank: 2, overdueDays: 0 };
}
