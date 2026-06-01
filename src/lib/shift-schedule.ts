export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export type ShiftSchedule = Partial<Record<DayKey, string | null>>;

const DAY_INDEX_TO_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function parseShiftSchedule(raw: unknown): ShiftSchedule {
  if (!raw || typeof raw !== "object") return {};
  const schedule: ShiftSchedule = {};
  for (const key of DAY_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === null || value === undefined || value === "") {
      schedule[key] = null;
    } else if (typeof value === "string" && /^\d{2}:\d{2}$/.test(value)) {
      schedule[key] = value;
    }
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

/** End-of-shift Date for today based on schedule, or null if not configured. */
export function getTodayShiftEndDate(schedule: ShiftSchedule, now = new Date()): Date | null {
  const key = todayDayKey(now);
  const time = schedule[key];
  if (!time) return null;
  return shiftTimeOnDate(time, now);
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

/** Previous shift end before `now`, walking back up to 7 days. */
export function getPreviousShiftEnd(
  schedule: ShiftSchedule,
  now = new Date(),
): Date | null {
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayDayKey(d);
    const time = schedule[key];
    if (!time) continue;
    const end = shiftTimeOnDate(time, d);
    if (end <= now) return end;
  }
  return null;
}
