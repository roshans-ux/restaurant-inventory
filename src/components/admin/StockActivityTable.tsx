"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SortHeaderIcon from "@/components/admin/SortHeaderIcon";
import {
  activityTypeLabel,
  formatActivityDate,
  formatActivityTime,
} from "@/lib/stock-activity-format";

const FULL_PAGE_SIZE = 10;

export type StockActivityRow = {
  id: string;
  type: string;
  quantityDeltaMl: number;
  reason: string | null;
  createdAt: string;
  product: { name: string };
};

type ActivityFilter = "all" | "receive" | "adjust";
type ActivitySortField = "name" | "type" | "qty" | "dateTime";
type ActivitySortDirection = "asc" | "desc";

type StockActivityTableProps = {
  activity: StockActivityRow[];
  variant?: "full" | "preview";
  limit?: number;
  viewAllHref?: string;
  viewAllLabel?: string;
  title?: string;
};

export default function StockActivityTable({
  activity,
  variant = "full",
  limit,
  viewAllHref,
  viewAllLabel = "View all activity",
  title = "Stock Activity",
}: StockActivityTableProps) {
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortField, setSortField] = useState<ActivitySortField>("dateTime");
  const [sortDirection, setSortDirection] = useState<ActivitySortDirection>("desc");
  const [page, setPage] = useState(1);

  const filteredActivity = useMemo(() => {
    let rows = activity;

    if (variant === "full") {
      rows = rows.filter((entry) => {
        if (activityFilter === "all") return true;
        if (activityFilter === "receive") return entry.type === "RECEIVE";
        return entry.type === "ADJUSTMENT";
      });
    }

    rows = [...rows].sort((a, b) => {
      let compare = 0;
      if (sortField === "name") {
        compare = a.product.name.localeCompare(b.product.name, undefined, { sensitivity: "base" });
      } else if (sortField === "type") {
        compare = activityTypeLabel(a.type).localeCompare(activityTypeLabel(b.type), undefined, {
          sensitivity: "base",
        });
      } else if (sortField === "dateTime") {
        compare = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else {
        compare = a.quantityDeltaMl - b.quantityDeltaMl;
      }
      return sortDirection === "asc" ? compare : -compare;
    });

    return rows;
  }, [activity, activityFilter, sortDirection, sortField, variant]);

  const totalPages = variant === "full" ? Math.max(1, Math.ceil(filteredActivity.length / FULL_PAGE_SIZE)) : 1;

  const visibleActivity = useMemo(() => {
    if (variant === "preview" && limit != null) {
      return filteredActivity.slice(0, limit);
    }
    if (variant === "full") {
      const start = (page - 1) * FULL_PAGE_SIZE;
      return filteredActivity.slice(start, start + FULL_PAGE_SIZE);
    }
    return filteredActivity;
  }, [filteredActivity, limit, page, variant]);

  useEffect(() => {
    setPage(1);
  }, [activityFilter, sortField, sortDirection]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function onSort(nextField: ActivitySortField) {
    if (sortField === nextField) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(nextField);
    setSortDirection(nextField === "dateTime" ? "desc" : "asc");
  }

  function headerButton(field: ActivitySortField, label: string, align: "left" | "right" = "left") {
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""}`}
        style={{ color: "var(--text-muted)" }}
      >
        {label}
        <SortHeaderIcon active={sortField === field} direction={sortDirection} />
      </button>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {title}
        </h2>
        <div className="flex items-center gap-2">
          {variant === "full" && (
            <>
              {([
                { value: "all", label: "All" },
                { value: "receive", label: "Receive" },
                { value: "adjust", label: "Adjust" },
              ] as const).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setActivityFilter(tab.value)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: activityFilter === tab.value ? "var(--accent-dim)" : "transparent",
                    color: activityFilter === tab.value ? "var(--accent)" : "var(--text-secondary)",
                    border: `1px solid ${activityFilter === tab.value ? "rgba(245,166,35,0.3)" : "var(--border)"}`,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </>
          )}
          {viewAllHref && (
            <Link href={viewAllHref} className="text-xs whitespace-nowrap" style={{ color: "var(--accent)" }}>
              {viewAllLabel} →
            </Link>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
        {filteredActivity.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
            No stock movements yet
          </div>
        ) : (
          <>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
                  {headerButton("name", "Name")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
                  {headerButton("type", "Type")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
                  {headerButton("dateTime", "Date/Time")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                  <span className="flex justify-end">{headerButton("qty", "Qty Movement", "right")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleActivity.map((entry, i) => (
                <tr
                  key={entry.id}
                  style={{
                    background: "var(--surface-elevated)",
                    borderBottom:
                      i < visibleActivity.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                  }}
                >
                  <td className="px-4 py-3 font-medium">{entry.product.name}</td>
                  <td className="px-4 py-3">
                    <p>{activityTypeLabel(entry.type)}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {entry.reason ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {formatActivityDate(entry.createdAt)} {formatActivityTime(entry.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p
                      className="font-medium tabular-nums"
                      style={{ color: entry.quantityDeltaMl >= 0 ? "var(--green)" : "var(--red)" }}
                    >
                      {entry.quantityDeltaMl >= 0 ? "+" : ""}
                      {entry.quantityDeltaMl}ml
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {variant === "full" && filteredActivity.length > FULL_PAGE_SIZE && (
            <div
              className="flex items-center justify-between gap-3 px-4 py-3"
              style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}
            >
              <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                {(page - 1) * FULL_PAGE_SIZE + 1}–{Math.min(page * FULL_PAGE_SIZE, filteredActivity.length)} of{" "}
                {filteredActivity.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  Previous
                </button>
                <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                  style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
