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
