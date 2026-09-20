const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function ordinal(day: number): string {
  const v = day % 100;
  if (v >= 11 && v <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** e.g. 20th August, 2026 */
export function formatAppDate(value: Date | string | number): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${ordinal(date.getDate())} ${MONTHS[date.getMonth()]}, ${date.getFullYear()}`;
}

/** e.g. 20th August, 2026, 10:47 PM */
export function formatAppDateTime(value: Date | string | number): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatAppDate(date)}, ${time}`;
}

const IST = "Asia/Kolkata";
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** e.g. 29-Aug-26 02:30 PM IST */
export function formatIstLogStamp(value: Date | string | number): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const monthRaw = get("month");
  const month =
    SHORT_MONTHS.find((m) => monthRaw.toLowerCase().startsWith(m.toLowerCase())) ?? monthRaw.slice(0, 3);
  const day = get("day");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod").toUpperCase();
  return `${day}-${month}-${year} ${hour}:${minute} ${dayPeriod} IST`;
}

/** e.g. 29-Aug-26 */
export function formatIstDate(value: Date | string | number): string {
  const stamp = formatIstLogStamp(value);
  if (stamp === "—") return "—";
  return stamp.split(" ")[0] ?? stamp;
}
