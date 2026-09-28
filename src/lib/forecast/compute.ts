import { prisma } from "@/lib/prisma";
import { sumStockMovementMl } from "@/lib/inventory";
import { addIsoDays, compareIsoDates, istIsoDate, weekdayFromIso } from "@/lib/forecast/dates";
import {
  FORECAST_HORIZON_DAYS,
  type DailyForecast,
  type ForecastProvider,
  type SkuDailyHistory,
} from "@/lib/forecast/provider";
import {
  learningBannerDaysFromReadiness,
  learningBannerFromReadiness,
  skuForecastReadiness,
  type ForecastConfidence,
  type SkuReadiness,
} from "@/lib/forecast/readiness";
import { defaultForecastProvider } from "@/lib/forecast/weekday-average";

export type { ForecastConfidence, SkuReadiness };

export type SkuForecast = {
  productId: string;
  enoughData: boolean;
  currentMl: number;
  runsOutOn: string | null;
  orderBy: string | null;
  suggestedBottles: number;
  vendorId: string | null;
  leadTimeDays: number;
  daysSinceFirstSale: number | null;
  saleCount: number;
  confidence: ForecastConfidence | null;
  learningDaysElapsed: number;
  firstSaleIso: string | null;
  hasRecentSales: boolean;
};

export type TenantForecastMap = Record<string, SkuForecast>;

type VendorChoice = { id: string; leadTimeDays: number; isDefault: boolean };

export async function computeForecastsForTenant(
  tenantId: string,
  provider: ForecastProvider = defaultForecastProvider,
): Promise<TenantForecastMap> {
  const today = istIsoDate();
  const startDate = addIsoDays(today, 1);
  const historyStart = addIsoDays(today, -120);

  const [tenant, products, stockSums, saleLines, lifetimeLines] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { forecastCoverageDays: true, forecastSafetyDays: true },
    }),
    prisma.product.findMany({
      where: { tenantId },
      select: {
        id: true,
        bottleSizeMl: true,
        vendorId: true,
        vendors: { select: { id: true, leadTimeDays: true } },
      },
    }),
    prisma.stockMovement.groupBy({
      by: ["productId"],
      where: { product: { tenantId } },
      _sum: { quantityDeltaMl: true },
    }),
    prisma.posSaleLine.findMany({
      where: { posSale: { tenantId, soldAt: { gte: istStartOfDay(historyStart) } } },
      select: {
        productId: true,
        decrementMl: true,
        posSale: { select: { soldAt: true } },
      },
    }),
    // All-time first sale + units sold — beyond the 120-day maths window.
    prisma.posSaleLine.findMany({
      where: { posSale: { tenantId } },
      select: {
        productId: true,
        quantity: true,
        posSale: { select: { soldAt: true } },
      },
    }),
  ]);

  const coverageDays = Math.max(0, tenant?.forecastCoverageDays ?? 7);
  const safetyDays = Math.max(0, tenant?.forecastSafetyDays ?? 1);
  const currentByProduct = new Map(
    stockSums.map((row) => [row.productId, sumStockMovementMl({ _sum: row._sum })]),
  );

  const venueByDay = new Map<string, number>();
  const skuByDay = new Map<string, Map<string, number>>();
  for (const line of saleLines) {
    const date = istIsoDate(line.posSale.soldAt);
    venueByDay.set(date, (venueByDay.get(date) ?? 0) + line.decrementMl);
    let skuDays = skuByDay.get(line.productId);
    if (!skuDays) {
      skuDays = new Map();
      skuByDay.set(line.productId, skuDays);
    }
    skuDays.set(date, (skuDays.get(date) ?? 0) + line.decrementMl);
  }

  const dryDays = new Set<string>();
  for (let cursor = historyStart; compareIsoDates(cursor, today) < 0; cursor = addIsoDays(cursor, 1)) {
    if ((venueByDay.get(cursor) ?? 0) <= 0) dryDays.add(cursor);
  }

  const lifetimeByProduct = new Map<string, { firstSoldAt: Date; lastSoldAt: Date; saleCount: number }>();
  for (const line of lifetimeLines) {
    const existing = lifetimeByProduct.get(line.productId);
    if (!existing) {
      lifetimeByProduct.set(line.productId, {
        firstSoldAt: line.posSale.soldAt,
        lastSoldAt: line.posSale.soldAt,
        saleCount: line.quantity,
      });
      continue;
    }
    if (line.posSale.soldAt < existing.firstSoldAt) existing.firstSoldAt = line.posSale.soldAt;
    if (line.posSale.soldAt > existing.lastSoldAt) existing.lastSoldAt = line.posSale.soldAt;
    existing.saleCount += line.quantity;
  }

  const result: TenantForecastMap = {};
  for (const product of products) {
    const bottleSizeMl = Number(product.bottleSizeMl);
    const currentMl = Math.max(0, currentByProduct.get(product.id) ?? 0);
    const skuDays = skuByDay.get(product.id) ?? new Map();
    const lifetime = lifetimeByProduct.get(product.id);
    const readiness = skuForecastReadiness({
      firstSaleIso: lifetime ? istIsoDate(lifetime.firstSoldAt) : null,
      lastSaleIso: lifetime ? istIsoDate(lifetime.lastSoldAt) : null,
      saleCount: lifetime?.saleCount ?? 0,
      todayIso: today,
    });
    const enoughData = readiness.enoughData;
    const vendor = pickVendor(
      product.vendors.map((v) => ({
        id: v.id,
        leadTimeDays: v.leadTimeDays,
        isDefault: v.id === product.vendorId,
      })),
      product.vendorId,
    );
    const leadTimeDays = vendor?.leadTimeDays ?? 2;

    if (!enoughData) {
      result[product.id] = {
        productId: product.id,
        enoughData: false,
        currentMl,
        runsOutOn: null,
        orderBy: null,
        suggestedBottles: 0,
        vendorId: vendor?.id ?? null,
        leadTimeDays,
        ...readinessFields(readiness),
      };
      continue;
    }

    const history: SkuDailyHistory[] = [...skuDays.entries()].map(([date, demandMl]) => ({
      date,
      demandMl,
    }));
    const predicted = provider.predict({
      history,
      dryDays,
      startDate,
      days: FORECAST_HORIZON_DAYS,
    });
    const demandByWeekday = weekdayDemandFromForecast(predicted);
    const horizonDays = leadTimeDays + coverageDays + safetyDays;
    const demandOverHorizon = sumCycledDemand(demandByWeekday, startDate, horizonDays);
    const suggestedMl = Math.max(0, demandOverHorizon - currentMl);
    const suggestedBottles = Math.max(0, Math.ceil(suggestedMl / bottleSizeMl));
    const runsOutOn = projectStockoutDate(currentMl, demandByWeekday, startDate);
    const orderBy =
      runsOutOn == null ? null : addIsoDays(runsOutOn, -(leadTimeDays + safetyDays));

    result[product.id] = {
      productId: product.id,
      enoughData: true,
      currentMl,
      runsOutOn,
      orderBy,
      suggestedBottles,
      vendorId: vendor?.id ?? null,
      leadTimeDays,
      ...readinessFields(readiness),
    };
  }

  return result;
}

export function learningBannerDays(forecasts: TenantForecastMap): number | null {
  return learningBannerDaysFromReadiness(Object.values(forecasts));
}

export function learningBanner(forecasts: TenantForecastMap) {
  return learningBannerFromReadiness(Object.values(forecasts));
}

function readinessFields(readiness: SkuReadiness) {
  return {
    daysSinceFirstSale: readiness.daysSinceFirstSale,
    saleCount: readiness.saleCount,
    confidence: readiness.confidence,
    learningDaysElapsed: readiness.learningDaysElapsed,
    firstSaleIso: readiness.firstSaleIso,
    hasRecentSales: readiness.hasRecentSales,
  };
}

function pickVendor(vendors: VendorChoice[], defaultId: string | null): VendorChoice | null {
  if (vendors.length === 0) return null;
  const markedDefault = defaultId ? vendors.find((v) => v.id === defaultId) : undefined;
  if (markedDefault) return markedDefault;
  return [...vendors].sort((a, b) => a.leadTimeDays - b.leadTimeDays || a.id.localeCompare(b.id))[0] ?? null;
}

function weekdayDemandFromForecast(predicted: DailyForecast[]): number[] {
  const sums = Array.from({ length: 7 }, () => 0);
  const counts = Array.from({ length: 7 }, () => 0);
  for (const row of predicted) {
    const weekday = weekdayFromIso(row.date);
    sums[weekday] += row.demandMl;
    counts[weekday] += 1;
  }
  return sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : 0));
}

function demandOnDate(demandByWeekday: number[], date: string): number {
  return demandByWeekday[weekdayFromIso(date)] ?? 0;
}

function sumCycledDemand(demandByWeekday: number[], startDate: string, days: number): number {
  let total = 0;
  for (let i = 0; i < days; i++) {
    total += demandOnDate(demandByWeekday, addIsoDays(startDate, i));
  }
  return total;
}

function projectStockoutDate(
  currentMl: number,
  demandByWeekday: number[],
  startDate: string,
): string | null {
  if (demandByWeekday.every((ml) => ml <= 0)) return null;
  let remaining = currentMl;
  const maxDays = 365;
  for (let i = 0; i < maxDays; i++) {
    const date = addIsoDays(startDate, i);
    remaining -= demandOnDate(demandByWeekday, date);
    if (remaining <= 0) return date;
  }
  return null;
}

function istStartOfDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, -5, -30, 0));
}
