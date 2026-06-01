"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import {
  BOTTLE_SIZE_OPTIONS,
  DUPLICATE_BOTTLE_NAME_SIZE_MESSAGE,
  formatBottleSizeLabel,
  isSameBottleNameAndSize,
  skuFromNameAndSize,
} from "@/lib/product-naming";

export const ADD_BOTTLE_SELECT_VALUE = "__add_bottle__";

type ExistingProduct = {
  id: string;
  name: string;
  sku: string | null;
  bottleSizeMl: string | number;
};

type CreatedProduct = {
  id: string;
  name: string;
  bottleSizeMl: string | number;
};

type SearchSuggestion = ExistingProduct;

type AddBottleModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (product: CreatedProduct) => void;
  existingProducts: ExistingProduct[];
};

export default function AddBottleModal({
  open,
  onClose,
  onCreated,
  existingProducts,
}: AddBottleModalProps) {
  const [nameInput, setNameInput] = useState("");
  const [skuInput, setSkuInput] = useState("");
  const [skuManualOverride, setSkuManualOverride] = useState(false);
  const [bottleSizeInput, setBottleSizeInput] = useState("750");
  const [thresholdInput, setThresholdInput] = useState("1");
  const [reorderQtyInput, setReorderQtyInput] = useState("6");
  const [vendorIdInput, setVendorIdInput] = useState("");
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const resetForm = useCallback(() => {
    setNameInput("");
    setSkuInput("");
    setSkuManualOverride(false);
    setBottleSizeInput("750");
    setThresholdInput("1");
    setReorderQtyInput("6");
    setVendorIdInput("");
    setSuggestions([]);
    setShowSuggestions(false);
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
    fetch("/api/vendors")
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setVendors(data.data?.vendors ?? []);
      })
      .catch(() => {});
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const suggestedSku = useMemo(() => {
    const size = Number(bottleSizeInput);
    if (!nameInput.trim() || !Number.isFinite(size) || size <= 0) return "";
    return skuFromNameAndSize(nameInput, size);
  }, [nameInput, bottleSizeInput]);

  const skuConflict = useMemo(() => {
    const candidate = (skuManualOverride ? skuInput : suggestedSku).trim().toUpperCase();
    if (!candidate) return null;
    const conflict = existingProducts.find((p) => p.sku?.toUpperCase() === candidate);
    return conflict ? candidate : null;
  }, [skuManualOverride, skuInput, suggestedSku, existingProducts]);

  useEffect(() => {
    if (!open || skuManualOverride || !suggestedSku) return;
    setSkuInput(suggestedSku);
  }, [open, skuManualOverride, suggestedSku]);

  useEffect(() => {
    if (!open) return;
    const q = nameInput.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(data.products ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [nameInput, open]);

  const selectedSizeMl = Number(bottleSizeInput);

  const exactDuplicate = useMemo(() => {
    if (!nameInput.trim() || !Number.isFinite(selectedSizeMl)) return null;
    return (
      existingProducts.find((p) =>
        isSameBottleNameAndSize(nameInput, selectedSizeMl, p.name, Number(p.bottleSizeMl)),
      ) ??
      suggestions.find((p) =>
        isSameBottleNameAndSize(nameInput, selectedSizeMl, p.name, Number(p.bottleSizeMl)),
      ) ??
      null
    );
  }, [existingProducts, nameInput, selectedSizeMl, suggestions]);

  const sameNameSuggestions = useMemo(() => {
    if (!nameInput.trim()) return [];
    const q = nameInput.trim().toLowerCase();
    return suggestions.filter((s) => s.name.toLowerCase().includes(q));
  }, [nameInput, suggestions]);

  async function onSubmit(e: FormEvent) {
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
      const res = await fetch("/api/products", {
        method: "POST",
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

      let data: {
        product?: CreatedProduct;
        error?: string | { message?: string };
      };
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

      if (!data.product?.id) {
        throw new Error("Bottle saved but response was invalid");
      }

      onCreated(data.product);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bottle");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-bottle-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl p-6 shadow-xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="add-bottle-title" className="flex items-center gap-2 text-lg font-semibold">
            <Plus size={18} style={{ color: "var(--accent)" }} />
            Add Bottle
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 transition-opacity hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="grid gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Bottle Name *
            </span>
            <div className="relative">
              <input
                required
                placeholder="Grey Goose"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setShowSuggestions(true);
                }}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
              {showSuggestions && sameNameSuggestions.length > 0 && (
                <div
                  className="absolute z-20 mt-1 max-h-32 w-full overflow-auto rounded-lg"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                  {sameNameSuggestions.map((s) => {
                    const sameSize = isSameBottleNameAndSize(
                      nameInput,
                      selectedSizeMl,
                      s.name,
                      Number(s.bottleSizeMl),
                    );
                    return (
                      <p
                        key={s.id}
                        className="px-3 py-2 text-xs"
                        style={{ color: sameSize ? "var(--red)" : "var(--text-muted)" }}
                      >
                        {sameSize
                          ? `"${s.name}" (${formatBottleSizeLabel(Number(s.bottleSizeMl))}) — ${DUPLICATE_BOTTLE_NAME_SIZE_MESSAGE}`
                          : `"${s.name}" (${formatBottleSizeLabel(Number(s.bottleSizeMl))}) — different size, OK to add`}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              SKU
            </span>
            <input
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
            {skuConflict && (
              <span className="text-xs" style={{ color: "var(--red)" }}>
                SKU &quot;{skuConflict}&quot; is already taken.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Bottle Size
            </span>
            <div className="relative">
              <select
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
                  <option key={opt.ml} value={opt.ml}>
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

          {error && (
            <p className="text-sm" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || Boolean(skuConflict) || Boolean(exactDuplicate) || !skuInput.trim()}
              className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#0e0e11" }}
            >
              {saving ? "Saving…" : "Save Bottle"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2.5 text-sm"
              style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
