import { formatAppDate } from "@/lib/format-app-date";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type DayShift = { start: string | null; end: string | null };
export type ShiftSchedule = Partial<Record<DayKey, DayShift | string | null>>;

const DAY_INDEX_TO_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function isDayShift(value: unknown): value is DayShift {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const start = v.start;
  const end = v.end;
  const validTime = (t: unknown) =>
    t === null || t === undefined || t === "" || (typeof t === "string" && /^\d{2}:\d{2}$/.test(t));
  return validTime(start) && validTime(end);
}

function normalizeDayShift(value: unknown): DayShift | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) {
    return { start: null, end: value };
  }
  if (isDayShift(value)) {
    const start =
      typeof value.start === "string" && /^\d{2}:\d{2}$/.test(value.start) ? value.start : null;
    const end =
      typeof value.end === "string" && /^\d{2}:\d{2}$/.test(value.end) ? value.end : null;
    if (!start && !end) return null;
    return { start, end };
  }
  return null;
}

export function parseShiftSchedule(raw: unknown): Record<DayKey, DayShift | null> {
  const schedule = {} as Record<DayKey, DayShift | null>;
  if (!raw || typeof raw !== "object") {
    for (const key of DAY_KEYS) schedule[key] = null;
    return schedule;
  }
  for (const key of DAY_KEYS) {
    schedule[key] = normalizeDayShift((raw as Record<string, unknown>)[key]);
  }
  return schedule;
}

export function todayDayKey(date = new Date()): DayKey {
  return DAY_INDEX_TO_KEY[date.getDay()];
}

/** Parse "HH:MM" into a Date on the given calendar day (local time). */
export function shiftTimeOnDate(time: string, date: Date): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

export function getDayShift(schedule: Record<DayKey, DayShift | null>, key: DayKey): DayShift | null {
  return schedule[key] ?? null;
}

export function formatShiftTime(time: string | null | undefined): string {
  if (!time) return "Closed";
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatDayLabel(key: DayKey): string {
  const labels: Record<DayKey, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };
  return labels[key];
}

/** Previous open day's end time before anchor (for prefilling start). */
export function getPreviousDayShiftEnd(
  schedule: Record<DayKey, DayShift | null>,
  anchor = new Date(),
): string | null {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i);
    const day = getDayShift(schedule, todayDayKey(d));
    if (day?.end) return day.end;
  }
  return null;
}

/** Resolve shift start/end as Dates for a calendar day; handles overnight (end <= start → next day). */
export function resolveShiftInterval(
  dayKey: DayKey,
  anchorDate: Date,
  schedule: Record<DayKey, DayShift | null>,
): { start: Date; end: Date } | null {
  const day = getDayShift(schedule, dayKey);
  if (!day?.start || !day?.end) return null;

  const start = shiftTimeOnDate(day.start, anchorDate);
  let end = shiftTimeOnDate(day.end, anchorDate);
  if (end <= start) {
    end = new Date(end);
    end.setDate(end.getDate() + 1);
  }
  return { start, end };
}

/** End-of-shift Date for today based on schedule, or null if not configured. */
export function getTodayShiftEndDate(
  schedule: Record<DayKey, DayShift | null>,
  now = new Date(),
): Date | null {
  const interval = resolveShiftInterval(todayDayKey(now), now, schedule);
  return interval?.end ?? null;
}

/** Previous shift end before `now`, walking back up to 7 days (legacy compat). */
export function getPreviousShiftEnd(
  schedule: Record<DayKey, DayShift | null>,
  now = new Date(),
): Date | null {
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayDayKey(d);
    const day = getDayShift(schedule, key);
    if (!day?.end) continue;
    const interval = resolveShiftInterval(key, d, schedule);
    if (!interval) continue;
    if (interval.end <= now) return interval.end;
  }
  return null;
}

export type ShiftWindow = {
  windowStart: Date;
  windowEnd: Date;
  dayKey: DayKey;
  shiftStart: Date;
  shiftEnd: Date;
};

/** Shift interval the report should cover for `now` (most recent completed or in-progress shift). */
export function getShiftWindowForReport(
  schedule: Record<DayKey, DayShift | null>,
  now = new Date(),
): ShiftWindow | null {
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayDayKey(d);
    const interval = resolveShiftInterval(key, d, schedule);
    if (!interval) continue;

    const { start, end } = interval;
    if (now >= start) {
      const windowEnd = now < end ? now : end;
      if (windowEnd > start) {
        return {
          windowStart: start,
          windowEnd,
          dayKey: key,
          shiftStart: start,
          shiftEnd: end,
        };
      }
    }
  }
  return null;
}

export function formatShiftDateLabel(date: Date, dayKey: DayKey): string {
  return `${formatDayLabel(dayKey)} ${formatAppDate(date)}`;
}
