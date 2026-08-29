import { formatAppDate } from "@/lib/format-app-date";

export function activityTypeLabel(type: string) {
  if (type === "RECEIVE") return "Receive stock";
  if (type === "ADJUSTMENT") return "Adjustment";
  return type.replaceAll("_", " ");
}

export function formatActivityDate(value: string) {
  return formatAppDate(value);
}

export function formatActivityTime(value: string) {
  return new Date(value).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
