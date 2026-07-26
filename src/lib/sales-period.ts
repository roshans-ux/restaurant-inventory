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
export function todayDateParam(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isTodayDateParam(dateParam: string): boolean {
  return dateParam === todayDateParam();
}

/** Local calendar day [start, end) for YYYY-MM-DD; invalid → today */
export function localDayBoundsFromParam(dateParam: string | null): {
  start: Date;
  end: Date;
  dateLabel: string;
} {
  let y: number;
  let m: number;
  let d: number;
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    [y, m, d] = dateParam.split("-").map(Number);
  } else {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth() + 1;
    d = now.getDate();
  }
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return {
    start,
    end,
    dateLabel: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  };
}

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
