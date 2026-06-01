import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

type SortDirection = "asc" | "desc";

export default function SortHeaderIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active) {
    return <ChevronsUpDown size={12} style={{ color: "var(--text-muted)" }} aria-hidden />;
  }
  return direction === "asc" ? (
    <ChevronUp size={12} style={{ color: "var(--accent)" }} aria-hidden />
  ) : (
    <ChevronDown size={12} style={{ color: "var(--accent)" }} aria-hidden />
  );
}
