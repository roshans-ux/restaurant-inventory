"use client";

import { useEffect, useState, FormEvent, useCallback, useRef, useMemo } from "react";
import { Plus, Wine, ChevronDown, Trash2 } from "lucide-react";
import {
  BOTTLE_SIZE_OPTIONS,
  formatBottleSizeLabel,
  normalizeBottleSizeMl,
  skuFromNameAndSize,
} from "@/lib/product-naming";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  bottleSizeMl: string;
  defaultPourMl: string;
  reorderConfig?: {
    thresholdBottles: string;
    reorderQuantity: number;
  } | null;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [skuInput, setSkuInput] = useState("");
  const [skuManualOverride, setSkuManualOverride] = useState(false);
  const [bottleSizeInput, setBottleSizeInput] = useState("750");
  const [thresholdInput, setThresholdInput] = useState("1");
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteConfirmRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/products");
      if (!res.ok) {
        throw new Error(`Failed to load products (${res.status})`);
      }
      const data = await res.json();
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products");
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
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
        }),
      });

      let data: { error?: string | { message?: string } };
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        const msg =
          typeof data.error === "string"
            ? data.error
            : data.error?.message ?? `Failed to save bottle (${res.status})`;
        throw new Error(msg);
      }

      setEditingProductId(null);
      setNameInput("");
      setSkuInput("");
      setSkuManualOverride(false);
      setBottleSizeInput("750");
      setThresholdInput("1");
      setSuggestions([]);
      setShowForm(false);
      await load();
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
    const data = await res.json();
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
      if (editingProductId === product.id) {
        setEditingProductId(null);
        setShowForm(false);
        setNameInput("");
        setSkuInput("");
      }
      setDeleteTarget(null);
      await load();
    } catch (err) {
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
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Existing names are suggested. Select one to update instead of creating duplicate.
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

      {products.length === 0 ? (
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
                    borderBottom: i < products.length - 1 ? "1px solid var(--border-subtle)" : undefined,
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
