const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar date in IST as YYYY-MM-DD. */
export function istIsoDate(date = new Date()): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addIsoDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + days));
  return next.toISOString().slice(0, 10);
}

export function weekdayFromIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

export function compareIsoDates(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Whole IST calendar days from `fromIso` to `toIso` (today − first sale = 0 if same day). */
export function isoDayDiff(fromIso: string, toIso: string): number {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIso.split("-").map(Number);
  const a = Date.UTC(y1, (m1 ?? 1) - 1, d1 ?? 1);
  const b = Date.UTC(y2, (m2 ?? 1) - 1, d2 ?? 1);
  return Math.round((b - a) / 86_400_000);
}
