"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Send, XCircle } from "lucide-react";
import SortHeaderIcon from "@/components/admin/SortHeaderIcon";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";
import { buildCancelTxt, buildModifyTxt, buildOrderTxt } from "@/lib/vendor-messages";

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
  product: { id: string; name: string; sku: string | null };
  vendor: { id: string; name: string; whatsappNumber: string } | null;
};

const CANCELLABLE = new Set(["PENDING", "MODIFIED", "PLACED"]);

export default function StockOrdersPage() {
  const [orders, setOrders] = useState<StockOrder[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [venueName, setVenueName] = useState("My Restaurant");
  const [editQty, setEditQty] = useState<Record<string, string>>({});
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ordersRes, meRes] = await Promise.all([
        fetch("/api/stock-orders?status=all"),
        fetch("/api/auth/me"),
      ]);
      const ordersData = await readJsonResponse<{
        ok?: boolean;
        data?: { orders?: StockOrder[] };
        error?: { message?: string; details?: unknown };
      }>(ordersRes);
      const meData = await readJsonResponse<{
        ok?: boolean;
        data?: { tenant?: { name: string } };
      }>(meRes);

      if (meData.ok && meData.data?.tenant?.name) {
        setVenueName(meData.data.tenant.name);
      }
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
      list = orders.filter((o) => o.status === "PENDING" || o.status === "MODIFIED");
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
    try {
      const res = await fetch(`/api/stock-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantityBottles: qty }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Update failed"));
      setEditQty((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActing(false);
    }
  }

  function downloadVendorFiles(files: { filename: string; content: string }[]) {
    for (const file of files) {
      const blob = new Blob([file.content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  async function cancelOrder(orderId: string) {
    setActing(true);
    setError("");
    try {
      const res = await fetch(`/api/stock-orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel: true }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: { file?: { filename: string; content: string } };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Cancel failed"));
      if (data.data?.file) downloadVendorFiles([data.data.file]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setActing(false);
    }
  }

  async function placeSelected() {
    if (selected.size === 0) return;
    setActing(true);
    setError("");
    try {
      const res = await fetch("/api/stock-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "place", orderIds: [...selected] }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: { files?: { filename: string; content: string }[] };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Place failed"));
      if (data.data?.files?.length) downloadVendorFiles(data.data.files);
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Place failed");
    } finally {
      setActing(false);
    }
  }

  async function cancelSelected() {
    if (selected.size === 0) return;
    setActing(true);
    setError("");
    try {
      const res = await fetch("/api/stock-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", orderIds: [...selected] }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: { files?: { filename: string; content: string }[] };
        error?: { message?: string; details?: unknown };
      }>(res);
      if (!res.ok) throw new Error(getApiErrorMessage(data, "Cancel failed"));
      if (data.data?.files?.length) downloadVendorFiles(data.data.files);
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setActing(false);
    }
  }

  function downloadTxt(mode: "order" | "cancel" | "modify") {
    let selectedOrders = orders.filter((o) => selected.has(o.id));
    if (mode === "cancel") {
      selectedOrders = selectedOrders.filter((o) => o.status === "PLACED");
    }
    if (selectedOrders.length === 0) return;

    const byVendor = new Map<string, StockOrder[]>();
    for (const o of selectedOrders) {
      const key = o.vendor?.id ?? "none";
      const list = byVendor.get(key) ?? [];
      list.push(o);
      byVendor.set(key, list);
    }

    const texts: string[] = [];
    for (const [, vendorOrders] of byVendor) {
      const vendor = vendorOrders[0].vendor;
      if (!vendor) {
        texts.push("(No vendor assigned — assign vendors to products first)\n");
        continue;
      }
      const lines = vendorOrders.map((o) => ({
        productName: o.product.name,
        sku: o.product.sku,
        quantityBottles: o.quantityBottles,
      }));
      const venue = { name: venueName };
      const v = { name: vendor.name, whatsappNumber: vendor.whatsappNumber };
      if (mode === "order") {
        texts.push(buildOrderTxt(venue, v, lines));
      } else if (mode === "cancel") {
        texts.push(buildCancelTxt(venue, v, lines));
      } else {
        texts.push(buildModifyTxt(venue, v, lines));
      }
    }

    const blob = new Blob([texts.join("\n\n---\n\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-${mode}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
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
              onClick={() => downloadTxt("order")}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"
              style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              <Download size={13} />
              Order TXT
            </button>
            <button
              type="button"
              onClick={() => downloadTxt("modify")}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"
              style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              <Download size={13} />
              Modify TXT
            </button>
            <button
              type="button"
              onClick={() => downloadTxt("cancel")}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"
              style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
            >
              <Download size={13} />
              Cancel TXT
            </button>
            <button
              type="button"
              onClick={placeSelected}
              disabled={acting || selected.size === 0}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#0e0e11" }}
            >
              <Send size={13} />
              Place
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

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
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
                const canEdit = !readOnly && (o.status === "PENDING" || o.status === "MODIFIED");
                const canCancel = !readOnly && CANCELLABLE.has(o.status);
                return (
                  <tr
                    key={o.id}
                    style={{
                      background: "var(--surface-elevated)",
                      borderBottom: i < filtered.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                    }}
                  >
                    {!readOnly && (
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggleSelect(o.id)} />
                      </td>
                    )}
                    <td className="px-4 py-3 font-medium">
                      {o.product.name}
                      {o.product.sku && (
                        <span className="ml-1 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                          ({o.product.sku})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      {o.vendor?.name ?? "—"}
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
                            o.status === "PENDING" || o.status === "MODIFIED"
                              ? "var(--accent-dim)"
                              : o.status === "PLACED"
                                ? "var(--green-dim)"
                                : o.status === "CANCELLED"
                                  ? "var(--surface)"
                                  : "var(--surface)",
                          color:
                            o.status === "PENDING" || o.status === "MODIFIED"
                              ? "var(--accent)"
                              : o.status === "PLACED"
                                ? "var(--green)"
                                : "var(--text-muted)",
                        }}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {o.placedAt ? new Date(o.placedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                    {!readOnly && (
                      <td className="px-4 py-3 text-right">
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
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
