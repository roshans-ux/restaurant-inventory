import { istIsoDate } from "@/lib/forecast/dates";
import type { ImportDateFormat } from "@/lib/sales-import/types";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Interpret calendar date + optional clock as IST, store as UTC Date. */
export function istDateTimeToUtc(isoDate: string, hours = 12, minutes = 0, seconds = 0): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split("-").map(Number);
  const utcMs =
    Date.UTC(y, (m ?? 1) - 1, d ?? 1, hours, minutes, seconds) - IST_OFFSET_MS;
  const date = new Date(utcMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseClock(raw: string): { hours: number; minutes: number; seconds: number } | null {
  const t = raw.trim();
  if (!t) return null;
  const ampm = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2]);
    const seconds = ampm[3] ? Number(ampm[3]) : 0;
    const period = ampm[4]!.toUpperCase();
    if (period === "AM") {
      if (hours === 12) hours = 0;
    } else if (hours !== 12) {
      hours += 12;
    }
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return { hours, minutes, seconds };
  }
  const hms = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!hms) return null;
  const hours = Number(hms[1]);
  const minutes = Number(hms[2]);
  const seconds = hms[3] ? Number(hms[3]) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return { hours, minutes, seconds };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m: number, d: number): string | null {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad2(m)}-${pad2(d)}`;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
    return null;
  }
  return iso;
}

export function formatIsoDayLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTHS[(m ?? 1) - 1] ?? "";
  return `${d} ${month} ${y}`;
}

/** Excel serial date (1900 system). */
export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return null;
  const utc = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

export function parseImportDate(raw: string, format: ImportDateFormat = "dmy"): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  const asNum = Number(s);
  if (s !== "" && Number.isFinite(asNum) && asNum > 20000 && asNum < 80000 && !s.includes("/")) {
    return excelSerialToIsoDate(asNum);
  }

  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    if (format === "mdy") return ymd(y, a, b);
    return ymd(y, b, a);
  }

  const ymdLoose = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymdLoose) {
    return ymd(Number(ymdLoose[1]), Number(ymdLoose[2]), Number(ymdLoose[3]));
  }

  const named = s.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3,})[\/\-\s](\d{2,4})$/);
  if (named) {
    const months = [
      "jan", "feb", "mar", "apr", "may", "jun",
      "jul", "aug", "sep", "oct", "nov", "dec",
    ];
    const mi = months.indexOf(named[2]!.slice(0, 3).toLowerCase());
    if (mi >= 0) {
      let y = Number(named[3]);
      if (y < 100) y += 2000;
      return ymd(y, mi + 1, Number(named[1]));
    }
  }

  return null;
}

export function parseImportSoldAt(
  dateRaw: string,
  timeRaw?: string | null,
  format: ImportDateFormat = "dmy",
): Date | null {
  const split = splitImportDateAndTime(dateRaw);
  const iso = parseImportDate(split.datePart, format);
  if (!iso) return null;
  const clock =
    (timeRaw ? parseClock(timeRaw) : null) ??
    (split.timePart ? parseClock(split.timePart) : null);
  if (clock) return istDateTimeToUtc(iso, clock.hours, clock.minutes, clock.seconds);
  return istDateTimeToUtc(iso, 20, 0, 0);
}

export function importRowHasClock(dateRaw: string, timeRaw?: string | null): boolean {
  if (timeRaw && parseClock(timeRaw)) return true;
  const fromDate = splitImportDateAndTime(dateRaw).timePart;
  return Boolean(fromDate && parseClock(fromDate));
}

function splitImportDateAndTime(raw: string): { datePart: string; timePart: string | null } {
  const s = raw.trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]+(\d{1,2}:\d{2}(?::\d{2})?)/);
  if (iso) return { datePart: iso[1]!, timePart: iso[2]! };
  const dmyTime = s.match(
    /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[\/\-\s][A-Za-z]{3,}[\/\-\s]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)$/i,
  );
  if (dmyTime) return { datePart: dmyTime[1]!, timePart: dmyTime[2]! };
  return { datePart: s, timePart: null };
}

export function detectDateFormat(samples: string[]): ImportDateFormat {
  let sawIso = 0;
  let dayFirstGt12 = 0;
  let monthFirstGt12 = 0;
  for (const raw of samples) {
    const s = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      sawIso += 1;
      continue;
    }
    const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (!dmy) continue;
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    if (a > 12 && b <= 12) dayFirstGt12 += 1;
    if (b > 12 && a <= 12) monthFirstGt12 += 1;
  }
  if (dayFirstGt12 > 0 && monthFirstGt12 === 0) return "dmy";
  if (monthFirstGt12 > 0 && dayFirstGt12 === 0) return "mdy";
  if (sawIso > 0 && dayFirstGt12 === 0 && monthFirstGt12 === 0) return "ymd";
  return "dmy";
}

export function dateParseExample(
  samples: string[],
  format: ImportDateFormat,
): { raw: string; parsed: string } | null {
  for (const raw of samples) {
    const iso = parseImportDate(raw, format);
    if (!iso) continue;
    return { raw: raw.trim(), parsed: formatIsoDayLong(iso) };
  }
  return null;
}

export function sampleDateValues(rows: Record<string, string>[], dateColumn: string, limit = 20): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const v = (row[dateColumn] ?? "").trim();
    if (!v) continue;
    out.push(v);
    if (out.length >= limit) break;
  }
  return out;
}
