"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import SortHeaderIcon from "@/components/admin/SortHeaderIcon";
import {
  formatSaleDate,
  formatSaleLabel,
  formatSaleSize,
  formatSaleTime,
} from "@/lib/pos-sales-format";
import { isTodayDateParam } from "@/lib/sales-period";

export type RecentSaleRow = {
  id: string;
  saleId: string;
  soldAt: string;
  totalMl: number;
  lines: Array<{
    productName: string;
    quantity: number;
    pourMl: number;
    bottleSizeMl?: number;
  }>;
};

export type RecentSalesPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

type RecentSalesTableProps = {
  sales: RecentSaleRow[];
  limit?: number;
  pagination?: RecentSalesPagination;
  viewAllHref?: string;
  viewAllLabel?: string;
  title?: string;
  /** Fill parent flex height; table body scrolls vertically only */
  fillHeight?: boolean;
  /** Max height for scrollable table body (e.g. calc(2.75rem * 11)) */
  bodyMaxHeight?: string;
  dateFilter?: { value: string; onChange: (date: string) => void };
  emptyDateFiltered?: boolean;
  sortable?: boolean;
};

type SaleSortField = "sale" | "dateTime" | "items" | "deducted";
type SortDirection = "asc" | "desc";

function formatSaleLineItem(
  line: RecentSaleRow["lines"][number],
): string {
  return `${line.productName} (${line.quantity} × ${formatSaleSize(line.pourMl, line.bottleSizeMl)})`;
}

function SaleItemsCell({ lines }: { lines: RecentSaleRow["lines"] }) {
  const summary = lines.map(formatSaleLineItem).join(" · ");
  const triggerRef = useRef<HTMLParagraphElement>(null);
  const [tooltip, setTooltip] = useState<{
    left: number;
    top: number;
    placement: "above" | "below";
  } | null>(null);

  const showTooltip = useCallback(() => {
    if (lines.length === 0) return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;
    const estimatedHeight = 48 + lines.length * 20;
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement =
      spaceAbove >= estimatedHeight || spaceAbove >= spaceBelow ? "above" : "below";

    setTooltip({
      left: rect.left,
      top: placement === "above" ? rect.top - gap : rect.bottom + gap,
      placement,
    });
  }, [lines]);

  const hideTooltip = useCallback(() => setTooltip(null), []);

  useEffect(() => {
    if (!tooltip) return;
    const hide = () => setTooltip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [tooltip]);

  if (lines.length === 0) {
    return (
      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
        —
      </span>
    );
  }

  const tooltipNode =
    tooltip &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        role="tooltip"
        className="pointer-events-none fixed z-[9999] w-max max-w-sm rounded-lg px-3 py-2.5 text-xs shadow-lg"
        style={{
          left: tooltip.left,
          top: tooltip.top,
          transform: tooltip.placement === "above" ? "translateY(-100%)" : undefined,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        <p className="mb-1.5 font-medium" style={{ color: "var(--text-primary)" }}>
          {lines.length} item{lines.length === 1 ? "" : "s"}
        </p>
        <ul className="grid gap-1">
          {lines.map((line, idx) => (
            <li key={`${line.productName}-${line.pourMl}-${idx}`}>{formatSaleLineItem(line)}</li>
          ))}
        </ul>
      </div>,
      document.body,
    );

  return (
    <>
      <p
        ref={triggerRef}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        className="cursor-default truncate text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        {summary}
      </p>
      {tooltipNode}
    </>
  );
}

export default function RecentSalesTable({
  sales,
  limit,
  pagination,
  viewAllHref,
  viewAllLabel = "View all orders",
  title = "Latest Orders",
  fillHeight = false,
  bodyMaxHeight,
  dateFilter,
  emptyDateFiltered = false,
  sortable = false,
}: RecentSalesTableProps) {
  const [sortField, setSortField] = useState<SaleSortField>("dateTime");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const visibleSales = useMemo(() => {
    let rows = sales;
    if (sortable) {
      rows = [...rows].sort((a, b) => {
        let compare = 0;
        if (sortField === "sale") {
          compare = a.saleId.localeCompare(b.saleId, undefined, { sensitivity: "base" });
        } else if (sortField === "dateTime") {
          compare = new Date(a.soldAt).getTime() - new Date(b.soldAt).getTime();
        } else if (sortField === "items") {
          compare = a.lines.length - b.lines.length;
          if (compare === 0) {
            const aNames = a.lines.map((l) => l.productName).join(", ");
            const bNames = b.lines.map((l) => l.productName).join(", ");
            compare = aNames.localeCompare(bNames, undefined, { sensitivity: "base" });
          }
        } else {
          compare = a.totalMl - b.totalMl;
        }
        return sortDirection === "asc" ? compare : -compare;
      });
    }
    return limit != null ? rows.slice(0, limit) : rows;
  }, [sales, sortable, sortField, sortDirection, limit]);

  function onSort(nextField: SaleSortField) {
    if (sortField === nextField) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(nextField);
    setSortDirection(nextField === "dateTime" ? "desc" : "asc");
  }

  function headerButton(field: SaleSortField, label: string, align: "left" | "right" = "left") {
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

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.totalCount / pagination.pageSize))
    : 1;
  const currentPage = pagination?.page ?? 1;
  const canPrev = pagination != null && currentPage > 1;
  const canNext = pagination != null && currentPage < totalPages;

  const rangeStart =
    pagination && pagination.totalCount > 0
      ? (currentPage - 1) * pagination.pageSize + 1
      : 0;
  const rangeEnd =
    pagination && pagination.totalCount > 0
      ? Math.min(currentPage * pagination.pageSize, pagination.totalCount)
      : visibleSales.length;

  const paginationFooter =
    pagination && pagination.totalCount > 0 ? (
      <div
        className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"
        style={{
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          color: "var(--text-muted)",
        }}
      >
        <span>
          {rangeStart}–{rangeEnd} of {pagination.totalCount}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => pagination.onPageChange(currentPage - 1)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-opacity disabled:opacity-40"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            <ChevronLeft size={14} />
            Prev
          </button>
          <span className="tabular-nums" style={{ color: "var(--text-secondary)" }}>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            disabled={!canNext}
            onClick={() => pagination.onPageChange(currentPage + 1)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 transition-opacity disabled:opacity-40"
            style={{
              background: "var(--surface-elevated)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
            }}
          >
            Next
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    ) : null;

  const tableBody =
    visibleSales.length === 0 ? (
      <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
        {emptyDateFiltered ? "No sales on this date" : "No sales yet"}
      </div>
    ) : (
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[26%]" />
          <col />
          <col className="w-[18%]" />
        </colgroup>
        <thead className={fillHeight ? "sticky top-0 z-10" : undefined}>
          <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
              {sortable ? headerButton("sale", "Sale") : "Sale"}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
              {sortable ? headerButton("dateTime", "Date/Time") : "Date/Time"}
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
              {sortable ? headerButton("items", "Items") : "Items"}
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
              {sortable ? (
                <span className="flex justify-end">{headerButton("deducted", "Deducted", "right")}</span>
              ) : (
                "Deducted"
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleSales.map((item, i) => (
            <tr
              key={item.id}
              style={{
                background: "var(--surface-elevated)",
                borderBottom:
                  i < visibleSales.length - 1 ? "1px solid var(--border-subtle)" : undefined,
              }}
            >
              <td className="min-w-0 px-4 py-3">
                <span
                  className="block truncate font-mono text-xs"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatSaleLabel(item.saleId)}
                </span>
              </td>
              <td className="min-w-0 px-4 py-3">
                <span className="block truncate text-sm">
                  {formatSaleDate(item.soldAt)} {formatSaleTime(item.soldAt)}
                </span>
              </td>
              <td className="min-w-0 px-4 py-3">
                <SaleItemsCell lines={item.lines} />
              </td>
              <td
                className="px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap"
                style={{ color: "var(--accent)" }}
              >
                {item.totalMl}ml
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );

  const tableShell = (
    <div
      className={
        fillHeight
          ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl"
          : "flex flex-col overflow-hidden rounded-xl"
      }
      style={{ border: "1px solid var(--border)" }}
    >
      <div
        className={
          fillHeight || bodyMaxHeight
            ? "min-h-0 overflow-x-hidden overflow-y-auto"
            : "overflow-x-hidden"
        }
        style={bodyMaxHeight ? { maxHeight: bodyMaxHeight } : fillHeight ? { flex: 1 } : undefined}
      >
        {tableBody}
      </div>
      {paginationFooter}
    </div>
  );

  return (
    <div className={fillHeight ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          {title}
        </h2>
        {dateFilter && (
          <div className="flex items-center gap-2">
            {isTodayDateParam(dateFilter.value) && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Today
              </span>
            )}
            <input
              type="date"
              value={dateFilter.value}
              onChange={(e) => dateFilter.onChange(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-xs outline-none"
              style={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
          </div>
        )}
        {viewAllHref && (
          <Link href={viewAllHref} className="text-xs whitespace-nowrap" style={{ color: "var(--accent)" }}>
            {viewAllLabel} →
          </Link>
        )}
      </div>
      {tableShell}
    </div>
  );
}
