"use client";

import { useEffect, useState, FormEvent, useCallback, useRef, useMemo } from "react";
import { Plus, Wine, ChevronDown, Trash2 } from "lucide-react";
import SortHeaderIcon from "@/components/admin/SortHeaderIcon";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";
import {
  BOTTLE_SIZE_OPTIONS,
  DUPLICATE_BOTTLE_NAME_SIZE_MESSAGE,
  formatBottleSizeLabel,
  isSameBottleNameAndSize,
  normalizeBottleSizeMl,
  skuFromNameAndSize,
} from "@/lib/product-naming";

type ProductSortField = "name" | "sku" | "bottleSize" | "threshold";
type SortDirection = "asc" | "desc";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  bottleSizeMl: string;
  defaultPourMl: string;
  vendorId: string | null;
  reorderConfig?: {
    thresholdBottles: string;
    reorderQuantity: number;
  } | null;
};

type Vendor = {
  id: string;
  name: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [skuInput, setSkuInput] = useState("");
  const [skuManualOverride, setSkuManualOverride] = useState(false);
  const [bottleSizeInput, setBottleSizeInput] = useState("750");
  const [thresholdInput, setThresholdInput] = useState("1");
  const [reorderQtyInput, setReorderQtyInput] = useState("6");
  const [vendorIdInput, setVendorIdInput] = useState("");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<ProductSortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const deleteConfirmRef = useRef<HTMLButtonElement | null>(null);

  const visibleProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      let compare = 0;
      if (sortField === "name") {
        compare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (sortField === "sku") {
        compare = (a.sku ?? "").localeCompare(b.sku ?? "", undefined, { sensitivity: "base" });
      } else if (sortField === "bottleSize") {
        compare = Number(a.bottleSizeMl) - Number(b.bottleSizeMl);
      } else {
        const aThreshold = a.reorderConfig ? Number(a.reorderConfig.thresholdBottles) : -1;
        const bThreshold = b.reorderConfig ? Number(b.reorderConfig.thresholdBottles) : -1;
        compare = aThreshold - bThreshold;
      }
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [products, sortDirection, sortField]);

  function onSort(field: ProductSortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  }

  function sortHeader(field: ProductSortField, label: string, align: "left" | "right" = "left") {
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

  const load = useCallback(async () => {
    try {
      const [prodRes, vendorRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/vendors?fields=id,name"),
      ]);
      if (!prodRes.ok) {
        throw new Error(`Failed to load products (${prodRes.status})`);
      }
      const data = await readJsonResponse<{ products?: Product[] }>(prodRes);
      setProducts(data.products ?? []);
      const vendorData = await readJsonResponse<{
        ok?: boolean;
        data?: { vendors?: Vendor[] };
      }>(vendorRes);
      if (vendorData.ok) {
        setVendors(vendorData.data?.vendors ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products");
    } finally {
      setLoading(false);
    }
  }, []);

   
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (deleteTarget) {
      deleteConfirmRef.current?.focus();
    }
  }, [deleteTarget]);

  const suggestedSku = useMemo(() => {
    const size = Number(bottleSizeInput);
    if (!nameInput.trim() || !Number.isFinite(size) || size <= 0) return "";
    return skuFromNameAndSize(nameInput, size);
  }, [nameInput, bottleSizeInput]);

  const skuConflict = useMemo(() => {
    const candidate = (skuManualOverride ? skuInput : suggestedSku).trim().toUpperCase();
    if (!candidate) return null;
    const conflict = products.find(
      (p) => p.sku?.toUpperCase() === candidate && p.id !== editingProductId,
    );
    return conflict ? candidate : null;
  }, [skuManualOverride, skuInput, suggestedSku, products, editingProductId]);

  useEffect(() => {
    if (!showForm || skuManualOverride || !suggestedSku) return;
    setSkuInput(suggestedSku);
  }, [showForm, skuManualOverride, suggestedSku]);

  const selectedSizeMl = Number(bottleSizeInput);

  const exactDuplicate = useMemo(() => {
    if (!nameInput.trim() || !Number.isFinite(selectedSizeMl) || editingProductId) return null;
    return products.find((p) =>
      isSameBottleNameAndSize(nameInput, selectedSizeMl, p.name, Number(p.bottleSizeMl)),
    );
  }, [editingProductId, nameInput, products, selectedSizeMl]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    if (exactDuplicate) {
      setError(DUPLICATE_BOTTLE_NAME_SIZE_MESSAGE);
      setSaving(false);
      return;
    }
    if (skuConflict) {
      setError(`SKU "${skuConflict}" is already in use. Enter a unique SKU to continue.`);
      setSaving(false);
      return;
    }
    try {
      const endpoint = editingProductId ? `/api/products/${editingProductId}` : "/api/products";
      const method = editingProductId ? "PATCH" : "POST";
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput,
          sku: skuInput || undefined,
          bottleSizeMl: Number(bottleSizeInput),
          openingBottles: 0,
          thresholdBottles: Math.max(0, Math.round(Number(thresholdInput) || 0)),
          reorderQuantity: Math.max(1, Math.round(Number(reorderQtyInput) || 6)),
          vendorId: vendorIdInput || null,
        }),
      });

      const data = await readJsonResponse<{
        ok?: boolean;
        product?: Product;
        data?: { product?: Product };
        error?: string | { message?: string };
      }>(res);

      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : getApiErrorMessage({ error: typeof data.error === "object" ? data.error : undefined }, `Failed to save bottle (${res.status})`);
        throw new Error(msg);
      }

      const saved = data.product ?? data.data?.product;
      if (!saved) {
        throw new Error("Server did not return the saved bottle");
      }

      const thresholdBottles = String(Math.max(0, Math.round(Number(thresholdInput) || 0)));
      const reorderQuantity = Math.max(1, Math.round(Number(reorderQtyInput) || 6));
      const nextProduct: Product = {
        ...saved,
        bottleSizeMl: String(saved.bottleSizeMl),
        defaultPourMl: String(saved.defaultPourMl ?? saved.bottleSizeMl),
        reorderConfig: {
          thresholdBottles,
          reorderQuantity,
        },
      };

      if (editingProductId) {
        setProducts((prev) => prev.map((p) => (p.id === editingProductId ? { ...p, ...nextProduct } : p)));
      } else {
        setProducts((prev) => [...prev, nextProduct]);
      }

      setEditingProductId(null);
      setNameInput("");
      setSkuInput("");
      setSkuManualOverride(false);
      setBottleSizeInput("750");
      setThresholdInput("1");
      setReorderQtyInput("6");
      setVendorIdInput("");
      setSuggestions([]);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bottle");
    } finally {
      setSaving(false);
    }
  }

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
    const data = await readJsonResponse<{ products?: Product[] }>(res);
    setSuggestions(data.products ?? []);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (showForm) {
        fetchSuggestions(nameInput);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [nameInput, fetchSuggestions, showForm]);

  async function deleteProduct(product: Product) {
    setDeleting(true);
    setError("");
    const previous = products;
    setProducts((prev) => prev.filter((p) => p.id !== product.id));
    setDeleteTarget(null);
    if (editingProductId === product.id) {
      setEditingProductId(null);
      setShowForm(false);
      setNameInput("");
      setSkuInput("");
    }
    try {
      const res = await fetch(`/api/products/${product.id}`, { method: "DELETE" });
      const raw = await res.text();
      let data: { error?: string | { message?: string } } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : data.error?.message ??
              (raw.trim().startsWith("<!DOCTYPE")
                ? `Server error while deleting (${res.status}). Check backend logs.`
                : `Failed to delete (${res.status})`);
        throw new Error(msg);
      }
    } catch (err) {
      setProducts(previous);
      setError(err instanceof Error ? err.message : "Failed to delete bottle");
    } finally {
      setDeleting(false);
    }
  }

  function loadIntoForm(product: Product) {
    const size = normalizeBottleSizeMl(Number(product.bottleSizeMl));
    const suggested = skuFromNameAndSize(product.name, size);
    setEditingProductId(product.id);
    setNameInput(product.name);
    setBottleSizeInput(String(size));
    const existingSku = product.sku ?? "";
    const manual = Boolean(existingSku && existingSku.toUpperCase() !== suggested.toUpperCase());
    setSkuManualOverride(manual);
    setSkuInput(manual ? existingSku : suggested);
    setThresholdInput(
      product.reorderConfig
        ? String(Math.round(Number(product.reorderConfig.thresholdBottles)))
        : "1",
    );
    setReorderQtyInput(
      product.reorderConfig ? String(product.reorderConfig.reorderQuantity) : "6",
    );
    setVendorIdInput(product.vendorId ?? "");
    setSuggestions([]);
    setShowSuggestions(false);
    setShowForm(true);
    setError("");
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Bottles</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Manage bottle metadata only (SKU, size, thresholds). Use Stock Entry for quantity changes.
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              return;
            }
            setEditingProductId(null);
            setNameInput("");
            setSkuInput("");
            setSkuManualOverride(false);
            setBottleSizeInput("750");
            setThresholdInput("1");
            setReorderQtyInput("6");
            setVendorIdInput("");
            setError("");
            setShowForm(true);
          }}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          style={{ background: "var(--accent)", color: "#0e0e11" }}
        >
          <Plus size={15} />
          {showForm ? "Close Form" : "Add Bottle"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="mb-8 rounded-xl p-6"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            {editingProductId ? "Update Bottle" : "New Bottle"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Bottle Name *
              </span>
              <div className="relative">
                <input
                  name="name"
                  required
                  placeholder="Grey Goose"
                  value={nameInput}
                  onChange={(e) => {
                    setNameInput(e.target.value);
                    setShowSuggestions(true);
                    if (editingProductId) {
                      setEditingProductId(null);
                      setSkuManualOverride(false);
                    }
                  }}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div
                    className="absolute z-20 mt-1 max-h-40 w-full overflow-auto rounded-lg"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                  >
                    {suggestions.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => loadIntoForm(s)}
                        className="w-full px-3 py-2 text-left text-sm hover:opacity-80"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {s.name} ({formatBottleSizeLabel(Number(s.bottleSizeMl))})
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Same name in a different size is allowed. Select an existing row to edit it.
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                SKU
              </span>
              <input
                name="sku"
                placeholder="GG-750"
                value={skuInput}
                onChange={(e) => {
                  setSkuManualOverride(true);
                  setSkuInput(e.target.value.toUpperCase());
                }}
                className="rounded-lg px-3 py-2 text-sm font-mono outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: `1px solid ${skuConflict ? "var(--red)" : "var(--border)"}`,
                  color: "var(--text-primary)",
                }}
              />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Auto-generated from name + bottle size (e.g. Grey Goose, 750ml → GG-750).
                {skuManualOverride ? " Manual override active." : ""}
              </span>
              {skuConflict && (
                <span className="text-xs" style={{ color: "var(--red)" }}>
                  SKU &quot;{skuConflict}&quot; is already taken. Enter a unique SKU to save.
                </span>
              )}
              {skuManualOverride && suggestedSku && skuInput.toUpperCase() !== suggestedSku && (
                <button
                  type="button"
                  className="text-left text-xs"
                  style={{ color: "var(--accent)" }}
                  onClick={() => {
                    setSkuManualOverride(false);
                    setSkuInput(suggestedSku);
                  }}
                >
                  Use suggested SKU ({suggestedSku})
                </button>
              )}
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Bottle Size
              </span>
              <div className="relative">
                <select
                  name="bottleSizeMl"
                  value={bottleSizeInput}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    setBottleSizeInput(String(size));
                    if (!skuManualOverride && nameInput.trim()) {
                      setSkuInput(skuFromNameAndSize(nameInput, size));
                    }
                  }}
                  required
                  className="w-full appearance-none rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  {BOTTLE_SIZE_OPTIONS.map((opt) => (
                    <option key={opt.ml} value={opt.ml} style={{ background: "var(--surface-elevated)" }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Alert Threshold (bottles)
              </span>
              <input
                name="thresholdBottles"
                type="number"
                min={0}
                step={1}
                value={thresholdInput}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setThresholdInput("");
                    return;
                  }
                  const n = Math.max(0, Math.round(Number(raw)));
                  if (Number.isFinite(n)) setThresholdInput(String(n));
                }}
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Reorder Quantity (bottles)
              </span>
              <input
                name="reorderQuantity"
                type="number"
                min={1}
                step={1}
                value={reorderQtyInput}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setReorderQtyInput("");
                    return;
                  }
                  const n = Math.max(1, Math.round(Number(raw)));
                  if (Number.isFinite(n)) setReorderQtyInput(String(n));
                }}
                className="rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Vendor
              </span>
              <div className="relative">
                <select
                  value={vendorIdInput}
                  onChange={(e) => setVendorIdInput(e.target.value)}
                  className="w-full appearance-none rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">No vendor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-muted)" }}
                />
              </div>
            </label>

          </div>

          {error && (
            <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={saving || Boolean(skuConflict) || !skuInput.trim()}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#0e0e11" }}
            >
              {saving ? "Saving…" : editingProductId ? "Update Bottle" : "Save Bottle"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingProductId(null);
                setSuggestions([]);
                setShowSuggestions(false);
              }}
              className="rounded-lg px-4 py-2 text-sm"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div
          className="overflow-hidden rounded-xl"
          style={{ border: "1px solid var(--border)" }}
        >
          <div className="space-y-0">
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
                <div className="h-4 w-20 animate-pulse rounded bg-[var(--border)]" />
                <div className="h-4 w-16 animate-pulse rounded bg-[var(--border)]" />
                <div className="h-4 w-24 animate-pulse rounded bg-[var(--border)]" />
              </div>
            ))}
          </div>
        </div>
      ) : products.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl py-20"
          style={{ border: "2px dashed var(--border)", color: "var(--text-muted)" }}
        >
          <Wine size={32} strokeWidth={1} className="mb-3" />
          <p className="text-sm">No bottles added yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm"
            style={{ color: "var(--accent)" }}
          >
            Add your first bottle →
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                {["Name", "SKU", "Bottle Size", "Threshold", "Actions"].map((h) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-xs font-medium uppercase tracking-widest ${h === "Actions" ? "text-right" : "text-left"}`}
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr
                  key={p.id}
                  style={{
                    background: "var(--surface-elevated)",
                    borderBottom:
                      i < visibleProducts.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                  }}
                >
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {p.sku ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatBottleSizeLabel(Number(p.bottleSizeMl))}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {p.reorderConfig
                      ? `${Math.round(Number(p.reorderConfig.thresholdBottles))} bottles`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => loadIntoForm(p)}
                        className="rounded border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError("");
                          setDeleteTarget(p);
                        }}
                        className="rounded border px-2 py-1 text-xs"
                        style={{
                          borderColor: "rgba(224,92,92,0.4)",
                          color: "var(--red)",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !deleting) {
              e.preventDefault();
              deleteProduct(deleteTarget);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl p-6"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h3 className="text-lg font-semibold">Delete bottle?</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              Remove <strong>{deleteTarget.name}</strong> from inventory? This deletes stock history,
              alerts, and POS mappings for this item. Past POS sale line references for this bottle are
              also removed.
            </p>
            {error && deleteTarget && (
              <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(null);
                  setError("");
                }}
                disabled={deleting}
                className="rounded-lg px-4 py-2 text-sm"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteProduct(deleteTarget)}
                disabled={deleting}
                ref={deleteConfirmRef}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                style={{ background: "var(--red)", color: "#fff" }}
              >
                <Trash2 size={14} />
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
