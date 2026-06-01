export type SalesPeriod = "today" | "week" | "month" | "all";

export const SALES_PERIOD_OPTIONS: { value: SalesPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

export function parseSalesPeriod(raw: string | null): SalesPeriod {
  if (raw === "today" || raw === "week" || raw === "month" || raw === "all") {
    return raw;
  }
  return "month";
}

/** Local-time start of period; null means no lower bound (all time). */
export function salesPeriodStart(period: SalesPeriod): Date | null {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "week") {
    const start = new Date(now);
    const day = start.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - daysFromMonday);
    start.setHours(0, 0, 0, 0);
    return start;
  }
  if (period === "month") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}
