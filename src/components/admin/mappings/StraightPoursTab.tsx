"use client";

import { useCallback, useEffect, useMemo, useState, FormEvent, useRef } from "react";
import { GitBranch, Plus, Trash2 } from "lucide-react";
import BottleSelectDropdown from "@/components/admin/BottleSelectDropdown";
import {
  FIXED_POUR_OPTIONS_ML,
  formatMappingSaleSize,
  isFullBottlePour,
} from "@/lib/mapping-sale-size";
import SortHeaderIcon from "@/components/admin/SortHeaderIcon";
import { formatBottleSizeLabel, isBeerBottleSize } from "@/lib/product-naming";
import { isPosItemConfigured } from "@/lib/pos-mapping-utils";
import { formatActivityDate, formatActivityTime } from "@/lib/stock-activity-format";
import { getApiErrorMessage } from "@/lib/http";

const MAPPINGS_VISIBLE_ROWS = 10;
const MAPPING_ROW_HEIGHT = "2.75rem";

type Product = { id: string; name: string; defaultPourMl: string; bottleSizeMl: string };
type Mapping = {
  id: string;
  posItemId: string | null;
  pourMl: string;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string; bottleSizeMl: string };
};

type MappingSortField = "posItemId" | "bottle" | "saleSize" | "timestamp";
type SortDirection = "asc" | "desc";

function PosItemIdCell({
  mapping,
  onSaved,
}: {
  mapping: Mapping;
  onSaved: (updated: Mapping) => void;
}) {
  const configured = isPosItemConfigured(mapping.posItemId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(mapping.posItemId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) setValue(mapping.posItemId ?? "");
  }, [mapping.posItemId, editing]);

  const save = useCallback(async () => {
    const trimmed = value.trim();
    const nextPosItemId = trimmed.length > 0 ? trimmed : null;
    if (nextPosItemId === (mapping.posItemId?.trim() || null)) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError("");
    const res = await fetch("/api/pos-mappings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: mapping.id, posItemId: nextPosItemId }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false || data.error) {
      setError(data.error?.message ?? "Failed to save");
      setSaving(false);
      return;
    }
    onSaved(data.mapping);
    setEditing(false);
    setSaving(false);
  }, [mapping.id, mapping.posItemId, onSaved, value]);

  if (editing) {
    return (
      <div className="min-w-[10rem]">
        <input
          autoFocus
          value={value}
          disabled={saving}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") {
              setEditing(false);
              setValue(mapping.posItemId ?? "");
              setError("");
            }
          }}
          placeholder="e.g. menu_vodka_martini"
          className="w-full rounded-lg px-2 py-1.5 font-mono text-xs outline-none"
          style={{
            background: "var(--surface)",
            border: `1px solid ${error ? "var(--red)" : "var(--accent)"}`,
            color: "var(--text-primary)",
          }}
        />
        {error && (
          <p className="mt-1 text-[11px]" style={{ color: "var(--red)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="rounded px-1 py-0.5 text-left font-mono text-xs transition-opacity hover:opacity-80"
      style={{
        color: configured ? "var(--text-secondary)" : "var(--text-muted)",
        fontStyle: configured ? "normal" : "italic",
      }}
      title={configured ? "Click to edit POS Item ID" : "Click to configure POS Item ID"}
    >
      {configured ? mapping.posItemId : "Not configured"}
    </button>
  );
}

export default function StraightPoursTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [posItemId, setPosItemId] = useState("");
  const [pourMl, setPourMl] = useState(30);
  const [mappingsSearch, setMappingsSearch] = useState("");
  const [sortField, setSortField] = useState<MappingSortField>("timestamp");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [deleteTarget, setDeleteTarget] = useState<Mapping | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deleteConfirmRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    setLoadError("");
    const [productsRes, mappingsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/pos-mappings"),
    ]);
    const [pr, mp] = await Promise.all([
      productsRes.json(),
      mappingsRes.json(),
    ]);
    const errors: string[] = [];
    if (!productsRes.ok || pr.ok === false) {
      errors.push(getApiErrorMessage(pr, "Failed to load bottles"));
    } else {
      setProducts(pr.products ?? []);
    }
    if (!mappingsRes.ok || mp.ok === false) {
      errors.push(getApiErrorMessage(mp, "Failed to load mappings"));
      setMappings([]);
    } else {
      setMappings(mp.mappings ?? []);
    }
    if (errors.length > 0) {
      setLoadError(errors.join(" · "));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (deleteTarget) {
      deleteConfirmRef.current?.focus();
    }
  }, [deleteTarget]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId],
  );

  const selectedBottleSizeMl = selectedProduct ? Number(selectedProduct.bottleSizeMl) : null;
  const selectedIsBeer =
    selectedBottleSizeMl != null && isBeerBottleSize(selectedBottleSizeMl);

  useEffect(() => {
    if (selectedIsBeer && selectedBottleSizeMl != null && pourMl !== selectedBottleSizeMl) {
      setPourMl(selectedBottleSizeMl);
    }
  }, [selectedIsBeer, selectedBottleSizeMl, pourMl]);

  const visibleMappings = useMemo(() => {
    const query = mappingsSearch.trim().toLowerCase();
    let rows = mappings.filter((m) => {
      const bottleSizeMl = Number(m.product.bottleSizeMl);
      if (!isBeerBottleSize(bottleSizeMl)) return true;
      return Number(m.pourMl) === bottleSizeMl;
    });
    if (query) {
      rows = mappings.filter((m) => {
        const saleSize = formatMappingSaleSize(
          Number(m.pourMl),
          Number(m.product.bottleSizeMl),
        ).toLowerCase();
        const sizeLabel = formatBottleSizeLabel(Number(m.product.bottleSizeMl)).toLowerCase();
        const posId = m.posItemId?.toLowerCase() ?? "";
        const unconfigured =
          !isPosItemConfigured(m.posItemId) &&
          (query.includes("not") || query.includes("config") || query.includes("draft"));
        const stamp = `${formatActivityDate(m.updatedAt)} ${formatActivityTime(m.updatedAt)}`.toLowerCase();
        return (
          unconfigured ||
          posId.includes(query) ||
          m.product.name.toLowerCase().includes(query) ||
          saleSize.includes(query) ||
          sizeLabel.includes(query) ||
          stamp.includes(query)
        );
      });
    }

    return [...rows].sort((a, b) => {
      let compare = 0;
      if (sortField === "posItemId") {
        const aId = a.posItemId?.trim() ?? "";
        const bId = b.posItemId?.trim() ?? "";
        if (!aId && bId) compare = 1;
        else if (aId && !bId) compare = -1;
        else compare = aId.localeCompare(bId, undefined, { sensitivity: "base" });
      } else if (sortField === "bottle") {
        const aLabel = `${a.product.name} ${formatBottleSizeLabel(Number(a.product.bottleSizeMl))}`;
        const bLabel = `${b.product.name} ${formatBottleSizeLabel(Number(b.product.bottleSizeMl))}`;
        compare = aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
      } else if (sortField === "saleSize") {
        compare =
          Number(a.pourMl) - Number(b.pourMl) ||
          a.product.name.localeCompare(b.product.name, undefined, { sensitivity: "base" });
      } else {
        compare = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortDirection === "asc" ? compare : -compare;
    });
  }, [mappings, mappingsSearch, sortDirection, sortField]);

  function onSort(field: MappingSortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection(field === "timestamp" ? "desc" : "asc");
  }

  function sortHeader(field: MappingSortField, label: string, align: "left" | "right" = "left") {
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

  function onProductChange(id: string) {
    const prevProduct = products.find((p) => p.id === selectedProductId);
    const prevBottleSize = prevProduct ? Number(prevProduct.bottleSizeMl) : null;
    const nextProduct = products.find((p) => p.id === id);
    const nextBottleSize = nextProduct ? Number(nextProduct.bottleSizeMl) : null;

    if (nextBottleSize != null && isBeerBottleSize(nextBottleSize)) {
      setPourMl(nextBottleSize);
    } else if (
      prevBottleSize != null &&
      isFullBottlePour(pourMl, prevBottleSize) &&
      nextBottleSize != null
    ) {
      setPourMl(nextBottleSize);
    }

    setSelectedProductId(id);
  }

  function resetForm() {
    setEditingId(null);
    setSelectedProductId("");
    setPosItemId("");
    setPourMl(30);
    setError("");
  }

  function onEdit(mapping: Mapping) {
    setEditingId(mapping.id);
    setSelectedProductId(mapping.product.id);
    setPosItemId(mapping.posItemId ?? "");
    setPourMl(Number(mapping.pourMl));
    setError("");
    setOk("");
  }

  function handleMappingSaved(updated: Mapping) {
    setMappings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  async function deleteMapping(mapping: Mapping) {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/pos-mappings/${mapping.id}`, { method: "DELETE" });
      const raw = await res.text();
      let data: { ok?: boolean; error?: { message?: string; details?: unknown } } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!res.ok || data.ok === false || data.error) {
        throw new Error(getApiErrorMessage(data, "Failed to delete mapping"));
      }
      if (editingId === mapping.id) {
        resetForm();
      }
      setMappings((prev) => prev.filter((m) => m.id !== mapping.id));
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete mapping");
    } finally {
      setDeleting(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!posItemId.trim()) {
      setError("Enter a POS Item ID");
      return;
    }
    setSaving(true);
    setError("");
    setOk("");
    const res = await fetch("/api/pos-mappings", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editingId ? { id: editingId } : {}),
        productId: selectedProductId,
        posItemId: posItemId.trim(),
        pourMl,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false || data.error) {
      setError(getApiErrorMessage(data, "Failed to save mapping"));
    } else {
      setOk(`${editingId ? "Updated" : "Mapped"}: ${data.mapping.posItemId}`);
      await load();
      resetForm();
    }
    setSaving(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        onSubmit={onSubmit}
        className="self-start rounded-xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
          <Plus size={13} />
          {editingId ? "Edit Mapping" : "Add Mapping"}
        </h2>

        <div className="grid gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Bottle
              </span>
              <BottleSelectDropdown
                products={products}
                value={selectedProductId}
                onChange={onProductChange}
              />
            </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              POS Item ID
            </span>
            <input
              name="posItemId"
              required
              placeholder="e.g. menu_vodka_martini"
              value={posItemId}
              onChange={(e) => setPosItemId(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Exact ID from your POS menu
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Sale Size
            </span>
            {selectedIsBeer && selectedBottleSizeMl != null ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {formatMappingSaleSize(selectedBottleSizeMl, selectedBottleSizeMl)}{" "}
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  (beer — full bottle only)
                </span>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {FIXED_POUR_OPTIONS_ML.map((ml) => (
                  <button
                    key={ml}
                    type="button"
                    onClick={() => setPourMl(ml)}
                    className="rounded-lg px-4 py-2 text-sm font-medium transition-all"
                    style={{
                      background: pourMl === ml ? "var(--accent-dim)" : "var(--surface-elevated)",
                      color: pourMl === ml ? "var(--accent)" : "var(--text-secondary)",
                      border: `1px solid ${pourMl === ml ? "rgba(245,166,35,0.3)" : "var(--border)"}`,
                    }}
                  >
                    {formatMappingSaleSize(ml)}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!selectedProduct}
                  onClick={() => selectedBottleSizeMl != null && setPourMl(selectedBottleSizeMl)}
                  className="rounded-lg px-4 py-2 text-sm font-medium transition-all disabled:opacity-40"
                  style={{
                    background:
                      selectedBottleSizeMl != null && pourMl === selectedBottleSizeMl
                        ? "var(--accent-dim)"
                        : "var(--surface-elevated)",
                    color:
                      selectedBottleSizeMl != null && pourMl === selectedBottleSizeMl
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                    border: `1px solid ${
                      selectedBottleSizeMl != null && pourMl === selectedBottleSizeMl
                        ? "rgba(245,166,35,0.3)"
                        : "var(--border)"
                    }`,
                  }}
                >
                  {selectedBottleSizeMl != null
                    ? formatMappingSaleSize(selectedBottleSizeMl, selectedBottleSizeMl)
                    : "1 bottle"}
                </button>
              </div>
            )}
          </label>
        </div>

        {error && <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>{error}</p>}
        {ok && <p className="mt-3 text-xs" style={{ color: "var(--green)" }}>✓ {ok}</p>}

        <button
          type="submit"
          disabled={saving || !selectedProductId || !posItemId.trim()}
          className="mt-4 w-full rounded-lg py-2 text-sm font-medium transition-opacity disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0e0e11" }}
        >
          {saving ? "Saving…" : editingId ? "Update Mapping" : "Save Mapping"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="mt-2 w-full rounded-lg py-2 text-sm font-medium"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel Edit
          </button>
        )}
      </form>

      <div>
        <div className="flex flex-col overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <div
            className="flex items-center justify-between gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
          >
            <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              <GitBranch size={13} className="mr-1 inline" />
              Existing Mappings
            </h2>
            {mappings.length > 0 && (
              <input
                type="search"
                value={mappingsSearch}
                onChange={(e) => setMappingsSearch(e.target.value)}
                placeholder="Search mappings…"
                className="w-full max-w-[200px] rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              Loading mappings…
            </div>
          ) : loadError ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--red)" }}>
              {loadError}
            </div>
          ) : mappings.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No mappings yet. Add a bottle on Stock Entry, or create one with the form.
            </div>
          ) : visibleMappings.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No mappings match your search
            </div>
          ) : (
            <div
              className="min-h-0 overflow-y-auto"
              style={{
                maxHeight: `calc(${MAPPING_ROW_HEIGHT} * ${MAPPINGS_VISIBLE_ROWS + 1})`,
              }}
            >
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
                      {sortHeader("posItemId", "POS Item ID")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
                      {sortHeader("bottle", "Bottle")}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                      <span className="flex justify-end">{sortHeader("saleSize", "Sale Size", "right")}</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                      <span className="flex justify-end">{sortHeader("timestamp", "Timestamp", "right")}</span>
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMappings.map((m, i) => {
                    const configured = isPosItemConfigured(m.posItemId);
                    return (
                      <tr
                        key={m.id}
                        style={{
                          background: configured ? "var(--surface-elevated)" : "var(--surface)",
                          borderBottom:
                            i < visibleMappings.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                          opacity: configured ? 1 : 0.75,
                        }}
                      >
                        <td className="px-4 py-3">
                          <PosItemIdCell mapping={m} onSaved={handleMappingSaved} />
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {m.product.name} ({formatBottleSizeLabel(Number(m.product.bottleSizeMl))})
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--accent)" }}>
                          {formatMappingSaleSize(Number(m.pourMl), Number(m.product.bottleSizeMl))}
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                          <span className="block" style={{ color: "var(--text-secondary)" }}>
                            {formatActivityDate(m.updatedAt)}
                          </span>
                          <span className="mt-0.5 block text-[11px]">{formatActivityTime(m.updatedAt)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => onEdit(m)}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium"
                              style={{
                                border: "1px solid var(--border)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setError("");
                                setDeleteTarget(m);
                              }}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium"
                              style={{
                                border: "1px solid rgba(224,92,92,0.4)",
                                color: "var(--red)",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          role="dialog"
          aria-modal="true"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !deleting) {
              e.preventDefault();
              void deleteMapping(deleteTarget);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl p-6"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <h3 className="text-lg font-semibold">Delete mapping?</h3>
            <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
              Remove this straight pour mapping for{" "}
              <strong>
                {deleteTarget.product.name} (
                {formatMappingSaleSize(
                  Number(deleteTarget.pourMl),
                  Number(deleteTarget.product.bottleSizeMl),
                )}
                )
              </strong>
              ? This removes the mapping for that bottle and sale size.
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
                onClick={() => void deleteMapping(deleteTarget)}
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
