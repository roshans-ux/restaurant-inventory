"use client";

import {
  daysUntilStockout,
  isBelowKeepAtLeast,
  isForecastReorderDue,
  isoDayDiff,
  restockUrgency,
  suggestedOrderBottles,
} from "@/lib/forecast/restock";

export type ForecastDisplay = {
  enoughData: boolean;
  runsOutOn: string | null;
  orderBy: string | null;
  suggestedBottles: number;
  daysSinceFirstSale?: number | null;
  saleCount?: number;
  confidence?: "early" | "confident" | null;
  learningDaysElapsed?: number;
  firstSaleIso?: string | null;
  hasRecentSales?: boolean;
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatIsoDay(iso: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${SHORT_MONTHS[Number(m) - 1]}-${y.slice(2)}`;
}

export function ForecastStockMeta({
  forecast,
  todayIso,
  currentMl,
  bottleSizeMl,
  thresholdBottles,
}: {
  forecast?: ForecastDisplay | null;
  todayIso: string;
  currentMl: number;
  bottleSizeMl: number;
  thresholdBottles: number | null;
}) {
  if (!forecast) return null;
  if (!forecast.enoughData) {
    const elapsed = forecast.learningDaysElapsed ?? 0;
    return (
      <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-muted)" }}>
        Learning · {elapsed} of 14 days
      </span>
    );
  }

  const floorTriggered = isBelowKeepAtLeast(currentMl, thresholdBottles, bottleSizeMl);
  const suggested = suggestedOrderBottles({
    currentMl,
    bottleSizeMl,
    thresholdBottles,
    enoughData: true,
    forecastSuggestedBottles: forecast.suggestedBottles,
    floorTriggered,
  });

  const tag =
    forecast.confidence === "confident"
      ? "Confident"
      : forecast.confidence === "early"
        ? "Early"
        : null;

  const noStockout = !forecast.runsOutOn;

  return (
    <span className="mt-0.5 block text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>
      {noStockout ? (
        "Enough for 3+ weeks"
      ) : (
        <>
          Runs out: {formatIsoDay(forecast.runsOutOn)}
          {" · "}
          <OrderByLabel orderBy={forecast.orderBy} todayIso={todayIso} />
          {" · "}
          Suggested: {suggested} {suggested === 1 ? "bottle" : "bottles"}
        </>
      )}
      {tag && (
        <span
          className="ml-1.5 inline-flex align-middle rounded-full px-1.5 py-px text-[10px] font-medium"
          style={{
            background: tag === "Confident" ? "var(--green-dim)" : "var(--accent-dim)",
            color: tag === "Confident" ? "var(--green)" : "var(--accent)",
          }}
        >
          {tag}
        </span>
      )}
    </span>
  );
}

function OrderByLabel({ orderBy, todayIso }: { orderBy: string | null; todayIso: string }) {
  if (!orderBy) return <>Order by: —</>;
  if (todayIso > orderBy) {
    const days = isoDayDiff(orderBy, todayIso);
    return (
      <span style={{ color: "var(--red)" }}>
        Overdue by {days} {days === 1 ? "day" : "days"}, order now
      </span>
    );
  }
  if (todayIso === orderBy) {
    return <span style={{ color: "var(--red)" }}>Order today</span>;
  }
  return <>Order by: {formatIsoDay(orderBy)}</>;
}

export function needsRestocking(args: {
  currentMl: number;
  bottleSizeMl: number;
  thresholdBottles: number | null;
  forecast?: ForecastDisplay | null;
  todayIso: string;
}): boolean {
  const floor = isBelowKeepAtLeast(args.currentMl, args.thresholdBottles, args.bottleSizeMl);
  const due = isForecastReorderDue(
    args.forecast?.orderBy ?? null,
    args.todayIso,
    Boolean(args.forecast?.enoughData),
  );
  return floor || due;
}

export function compareRestockUrgency(
  a: { forecast?: ForecastDisplay | null },
  b: { forecast?: ForecastDisplay | null },
  todayIso: string,
): number {
  const ua = restockUrgency({ todayIso, orderBy: a.forecast?.orderBy ?? null });
  const ub = restockUrgency({ todayIso, orderBy: b.forecast?.orderBy ?? null });
  if (ua.rank !== ub.rank) return ua.rank - ub.rank;
  if (ua.rank === 0) return ub.overdueDays - ua.overdueDays;
  const aOrder = a.forecast?.orderBy ?? "9999-12-31";
  const bOrder = b.forecast?.orderBy ?? "9999-12-31";
  return aOrder.localeCompare(bOrder);
}

export function stockLeftSummary(args: {
  currentMl: number;
  bottleSizeMl: number;
  thresholdBottles: number | null;
  forecast?: ForecastDisplay | null;
  todayIso: string;
}): string {
  const sealed = Math.floor(Math.max(0, args.currentMl) / (args.bottleSizeMl || 1));
  const left = `${sealed} left`;
  if (!args.forecast?.enoughData) {
    const y = args.thresholdBottles ?? 0;
    return `${left} · keep at least ${y}`;
  }
  const days = daysUntilStockout(args.todayIso, args.forecast.runsOutOn);
  if (days == null) return left;
  if (days < 1) return `${left} · less than a day`;
  if (days === 1) return `${left} · about 1 day of stock`;
  return `${left} · about ${days} days of stock`;
}
