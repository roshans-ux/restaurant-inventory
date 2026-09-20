"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Send, XCircle } from "lucide-react";
import SortHeaderIcon from "@/components/admin/SortHeaderIcon";
import VendorMultiSelect from "@/components/admin/VendorMultiSelect";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";
import { formatAppDate, formatIstLogStamp } from "@/lib/format-app-date";

type Tab = "all" | "pending" | "placed" | "cancelled";
type SortField = "product" | "qty" | "status" | "vendor" | "created" | "placed";
type SortDirection = "asc" | "desc";

type StockOrder = {
  id: string;
  productId: string;
  vendorId: string | null;
  quantityBottles: number;
  status: string;
  notes: string | null;
  placedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string | null;
    vendors?: { id: string; name: string; email?: string | null }[];
  };
  vendor: { id: string; name: string; whatsappNumber: string; email?: string | null } | null;
  notifiedVendors?: { id: string; name: string }[];
  logs?: { id: string; message: string; createdAt: string }[];
};

const CANCELLABLE = new Set(["PENDING", "MODIFIED", "PLACED", "AWAITING_APPROVAL"]);

export default function StockOrdersPage() {
  const [orders, setOrders] = useState<StockOrder[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editQty, setEditQty] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [acting, setActing] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeAssignments, setPlaceAssignments] = useState<Record<string, string[]>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const ordersRes = await fetch("/api/stock-orders?status=all");
      const ordersData = await readJsonResponse<{
        ok?: boolean;
        data?: { orders?: StockOrder[] };
        error?: { message?: string; details?: unknown };
      }>(ordersRes);

      if (ordersData.ok) {
        setOrders(ordersData.data?.orders ?? []);
      } else if (!ordersRes.ok) {
        setError(getApiErrorMessage(ordersData, "Failed to load stock orders"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stock orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
  }, [tab]);

  const filtered = useMemo(() => {
    let list = orders;
    if (tab === "pending") {
      list = orders.filter(
        (o) =>
          o.status === "PENDING" || o.status === "MODIFIED" || o.status === "AWAITING_APPROVAL",
      );
    } else if (tab === "placed") {
      list = orders.filter((o) => o.status === "PLACED");
    } else if (tab === "cancelled") {
      list = orders.filter((o) => o.status === "CANCELLED");
    } else {
      list = orders.filter((o) => o.status !== "CANCELLED");
    }
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "product") {
        cmp = a.product.name.localeCompare(b.product.name);
      } else if (sortField === "qty") {
        cmp = a.quantityBottles - b.quantityBottles;
      } else if (sortField === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sortField === "vendor") {
        cmp = (a.vendor?.name ?? "").localeCompare(b.vendor?.name ?? "");
      } else if (sortField === "placed") {
        const aTime = a.placedAt ? new Date(a.placedAt).getTime() : 0;
        const bTime = b.placedAt ? new Date(b.placedAt).getTime() : 0;
        cmp = aTime - bTime;
      } else {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [orders, tab, sortField, sortDirection]);

  const readOnly = tab === "cancelled";
  const awaitingOwner = orders.some((o) => o.status === "AWAITING_APPROVAL");

  function onSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  }

  function sortHeader(field: SortField, label: string) {
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
        <SortHeaderIcon active={sortField === field} direction={sortDirection} />
      </button>
    );
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((o) => o.id)));
    }
  }

  async function saveQty(orderId: string) {
    const raw = editQty[orderId];
    if (!raw) return;
    const qty = Math.round(Number(raw));
    if (!Number.isFinite(qty) || qty <= 0) return;
    setActing(true);
    setError("");
    setNotice("");
    const previous = orders;
    setEditQty((prev) => {
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              quantityBottles: qty,
              status:
                o.status === "PLACED"
                  ? "PLACED"
                  : qty !== o.quantityBottles
                    ? "MODIFIED"
                    : o.status,
            }
          : o,
      ),
    );
    try {
      const res = await fetch(`/api/stock-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantityBottles: qty }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: { order?: StockOrder; emailWarnings?: string[] };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Update failed"));
      const updated = data.data?.order;
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)));
      }
      if (data.data?.emailWarnings?.length) {
        setNotice(data.data.emailWarnings.join(" "));
      }
    } catch (err) {
      setOrders(previous);
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActing(false);
    }
  }

  async function cancelOrder(orderId: string) {
    setActing(true);
    setError("");
    setNotice("");
    const previous = orders;
    const nowIso = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status: "CANCELLED", cancelledAt: nowIso } : o,
      ),
    );
    try {
      const res = await fetch(`/api/stock-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: {
          order?: StockOrder;
          emailWarnings?: string[];
        };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Cancel failed"));
      if (data.data?.emailWarnings?.length) {
        setNotice(data.data.emailWarnings.join(" "));
      }
      if (data.data?.order) {
        setOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, ...data.data!.order! } : o)),
        );
      }
    } catch (err) {
      setOrders(previous);
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setActing(false);
    }
  }

  function openPlaceModal() {
    if (selected.size === 0) return;
    const pending = orders.filter(
      (o) => selected.has(o.id) && (o.status === "PENDING" || o.status === "MODIFIED"),
    );
    if (pending.length === 0) {
      setError("Select one or more pending orders to place");
      return;
    }
    const next: Record<string, string[]> = {};
    for (const o of pending) {
      const assigned = o.product.vendors ?? [];
      next[o.id] = assigned.length === 1 ? [assigned[0].id] : [];
    }
    setPlaceAssignments(next);
    setPlaceOpen(true);
    setError("");
  }

  async function placeSelected() {
    const ids = Object.keys(placeAssignments);
    if (ids.length === 0) return;
    if (ids.some((id) => (placeAssignments[id] ?? []).length === 0)) {
      setError("Select at least one vendor for each SKU");
      return;
    }
    setActing(true);
    setError("");
    setNotice("");
    const previous = orders;
    const nowIso = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        ids.includes(o.id) ? { ...o, status: "PLACED", placedAt: nowIso } : o,
      ),
    );
    try {
      const res = await fetch("/api/stock-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "place",
          orderIds: ids,
          assignments: ids.map((orderId) => ({
            orderId,
            vendorIds: placeAssignments[orderId],
          })),
        }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: { emailWarnings?: string[]; awaitingOwnerApproval?: boolean };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Place failed"));
      if (data.data?.emailWarnings?.length) {
        setNotice(data.data.emailWarnings.join(" "));
      } else if (data.data?.awaitingOwnerApproval) {
        setNotice("Vendors assigned. Orders will send after bar owner WhatsApp approval.");
      }
      setSelected(new Set());
      setPlaceOpen(false);
      await load();
    } catch (err) {
      setOrders(previous);
      setError(err instanceof Error ? err.message : "Place failed");
    } finally {
      setActing(false);
    }
  }

  async function cancelSelected() {
    if (selected.size === 0) return;
    setActing(true);
    setError("");
    setNotice("");
    const ids = [...selected];
    const previous = orders;
    const nowIso = new Date().toISOString();
    setOrders((prev) =>
      prev.map((o) =>
        ids.includes(o.id) ? { ...o, status: "CANCELLED", cancelledAt: nowIso } : o,
      ),
    );
    setSelected(new Set());
    try {
      const res = await fetch("/api/stock-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", orderIds: ids }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: { emailWarnings?: string[] };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Cancel failed"));
      if (data.data?.emailWarnings?.length) {
        setNotice(data.data.emailWarnings.join(" "));
      }
      await load();
    } catch (err) {
      setOrders(previous);
      setSelected(new Set(ids));
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setActing(false);
    }
  }

  async function sendAnyway(orderId: string) {
    setActing(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/stock-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendAnyway: true }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: { emailWarnings?: string[]; sentAnyway?: boolean };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Send failed"));
      setNotice("Order sent to vendor directly.");
      if (data.data?.emailWarnings?.length) {
        setNotice(`Order sent to vendor directly. ${data.data.emailWarnings.join(" ")}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setActing(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "placed", label: "Placed" },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Stock Orders</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Pending orders are created automatically when stock falls below threshold.
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openPlaceModal}
              disabled={acting || selected.size === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#0e0e11" }}
            >
              <Send size={13} />
              Place Order
            </button>
            <button
              type="button"
              onClick={cancelSelected}
              disabled={acting || selected.size === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"
              style={{ border: "1px solid rgba(224,92,92,0.4)", color: "var(--red)" }}
            >
              <XCircle size={13} />
              Cancel
            </button>
          </div>
        )}
      </div>

      {awaitingOwner && (
        <div
          className="mb-4 rounded-xl px-4 py-3 text-sm"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid rgba(245, 166, 35, 0.35)",
            color: "var(--accent)",
          }}
        >
          Orders are pending bar owner WhatsApp approval.
        </div>
      )}

      <div className="mb-4 flex gap-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className="rounded-lg px-3 py-1.5 text-sm transition-colors"
            style={{
              background: tab === t.key ? "var(--accent-dim)" : "transparent",
              color: tab === t.key ? "var(--accent)" : "var(--text-secondary)",
              fontWeight: tab === t.key ? 500 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mb-4 text-sm" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="mb-4 text-sm" style={{ color: "var(--accent)" }}>
          {notice}
        </p>
      )}

      {loading ? (
        <div
          className="overflow-hidden rounded-xl"
          style={{ border: "1px solid var(--border)" }}
        >
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex gap-4 px-4 py-3"
              style={{
                background: "var(--surface-elevated)",
                borderBottom: i < 5 ? "1px solid var(--border-subtle)" : undefined,
              }}
            >
              <div className="h-4 flex-1 animate-pulse rounded bg-[var(--border)]" />
              <div className="h-4 w-24 animate-pulse rounded bg-[var(--border)]" />
              <div className="h-4 w-16 animate-pulse rounded bg-[var(--border)]" />
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--border)]" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl p-8 text-center text-sm"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
        >
          No stock orders{tab !== "all" ? ` in ${tab}` : ""}.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                {!readOnly && (
                  <th className="px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
                  {sortHeader("product", "Product")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
                  {sortHeader("vendor", "Vendor")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                  {sortHeader("qty", "Qty")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                  {sortHeader("status", "Status")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                  {sortHeader("placed", "Placed At")}
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                  {sortHeader("created", "Created")}
                </th>
                {!readOnly && (
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => {
                const editing = editQty[o.id] !== undefined;
                const qtyVal = editing ? editQty[o.id] : String(o.quantityBottles);
                const canEdit =
                  !readOnly &&
                  (o.status === "PENDING" || o.status === "MODIFIED" || o.status === "PLACED");
                const canCancel = !readOnly && CANCELLABLE.has(o.status);
                const expanded = expandedIds.has(o.id);
                const logs = [...(o.logs ?? [])].sort(
                  (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                );
                const vendorLabel =
                  (o.notifiedVendors && o.notifiedVendors.length > 0
                    ? o.notifiedVendors.map((v) => v.name).join(", ")
                    : o.product.vendors && o.product.vendors.length > 0
                      ? o.product.vendors.map((v) => v.name).join(", ")
                      : o.vendor?.name) ?? "—";
                const colSpan = readOnly ? 7 : 9;
                return (
                  <Fragment key={o.id}>
                  <tr
                    style={{
                      background: "var(--surface-elevated)",
                      borderBottom: expanded
                        ? undefined
                        : i < filtered.length - 1
                          ? "1px solid var(--border-subtle)"
                          : undefined,
                    }}
                  >
                    {!readOnly && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                      </td>
                    )}
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(o.id)) next.delete(o.id);
                            else next.add(o.id);
                            return next;
                          })
                        }
                        className="rounded p-1"
                        style={{ color: "var(--text-muted)" }}
                        aria-label={expanded ? "Collapse log" : "Expand log"}
                      >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {o.product.name}
                      {o.product.sku && (
                        <span className="ml-1 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                          ({o.product.sku})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {vendorLabel}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canEdit ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            value={qtyVal}
                            onChange={(e) => setEditQty((prev) => ({ ...prev, [o.id]: e.target.value }))}
                            onBlur={() => {
                              if (editQty[o.id] !== undefined && editQty[o.id] !== String(o.quantityBottles)) {
                                saveQty(o.id);
                              }
                            }}
                            className="w-16 rounded px-2 py-1 text-right text-sm tabular-nums outline-none"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text-primary)",
                            }}
                          />
                        </div>
                      ) : (
                        <span className="tabular-nums">{o.quantityBottles}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          background:
                            o.status === "AWAITING_APPROVAL"
                              ? "var(--accent-dim)"
                              : o.status === "PENDING" || o.status === "MODIFIED"
                                ? "var(--accent-dim)"
                                : o.status === "PLACED"
                                  ? "var(--green-dim)"
                                  : o.status === "CANCELLED"
                                    ? "var(--surface)"
                                    : "var(--surface)",
                          color:
                            o.status === "AWAITING_APPROVAL"
                              ? "var(--accent)"
                              : o.status === "PENDING" || o.status === "MODIFIED"
                                ? "var(--accent)"
                                : o.status === "PLACED"
                                  ? "var(--green)"
                                  : "var(--text-muted)",
                        }}
                      >
                        {o.status === "AWAITING_APPROVAL" ? "Awaiting owner approval" : o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {o.placedAt ? formatAppDate(o.placedAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {formatAppDate(o.createdAt)}
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {o.status === "AWAITING_APPROVAL" && (
                            <button
                              type="button"
                              onClick={() => sendAnyway(o.id)}
                              disabled={acting}
                              className="text-xs disabled:opacity-50"
                              style={{ color: "var(--accent)" }}
                            >
                              Send anyway
                            </button>
                          )}
                          {canCancel && (
                            <button
                              type="button"
                              onClick={() => cancelOrder(o.id)}
                              disabled={acting}
                              className="text-xs disabled:opacity-50"
                              style={{ color: "var(--red)" }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  {expanded && (
                    <tr
                      style={{
                        background: "var(--surface)",
                        borderBottom: i < filtered.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                      }}
                    >
                      <td colSpan={colSpan} className="px-6 py-3">
                        {logs.length === 0 ? (
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            No log entries yet.
                          </p>
                        ) : (
                          <ul className="space-y-1">
                            {logs.map((log) => (
                              <li
                                key={log.id}
                                className="text-xs tabular-nums"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {formatIstLogStamp(log.createdAt)} — {log.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {placeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h2 className="text-lg font-semibold">Select vendors for this order</h2>
            <div className="mt-4 space-y-4">
              {orders
                .filter((o) => placeAssignments[o.id] !== undefined)
                .map((o) => (
                  <div key={o.id} className="space-y-1.5">
                    <p className="text-sm font-medium">{o.product.name}</p>
                    <VendorMultiSelect
                      vendors={o.product.vendors ?? []}
                      selectedIds={placeAssignments[o.id] ?? []}
                      onChange={(ids) =>
                        setPlaceAssignments((prev) => ({ ...prev, [o.id]: ids }))
                      }
                      placeholder="Select vendors…"
                      required
                    />
                    {(placeAssignments[o.id] ?? []).map((vendorId) => {
                      const vendor = (o.product.vendors ?? []).find((v) => v.id === vendorId);
                      if (!vendor || vendor.email?.trim()) return null;
                      return (
                        <p
                          key={vendorId}
                          className="text-xs"
                          style={{ color: "var(--accent)" }}
                        >
                          No email address on file for this vendor. Add one in Settings.
                        </p>
                      );
                    })}
                  </div>
                ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPlaceOpen(false)}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={placeSelected}
                disabled={acting}
                className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#0e0e11" }}
              >
                {acting ? "Placing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
