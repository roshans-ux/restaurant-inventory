"use client";

import { useCallback, useEffect, useMemo, useState, FormEvent } from "react";
import { GitBranch, ChevronDown, Plus, Trash2, Martini } from "lucide-react";
import BottleSelectDropdown from "@/components/admin/BottleSelectDropdown";
import {
  COCKTAIL_POUR_OPTIONS_ML,
  type CocktailIngredient,
  emptyCocktailLine,
  formatCocktailPourMl,
} from "@/lib/cocktail-mapping";
import { formatBottleSizeLabel } from "@/lib/product-naming";
import { getApiErrorMessage } from "@/lib/http";

const MAPPINGS_VISIBLE_ROWS = 10;
const MAPPING_ROW_HEIGHT = "2.75rem";

type Product = { id: string; name: string; bottleSizeMl: string };

type CocktailMapping = {
  id: string;
  name: string;
  posItemId: string;
  ingredients: CocktailIngredient[];
  recipe: string;
  createdAt: string;
  updatedAt: string;
};

const selectStyle = {
  background: "var(--surface-elevated)",
  border: "1px solid var(--border)",
  color: "var(--text-primary)",
} as const;

function CocktailIngredientRow({
  index,
  line,
  products,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  line: CocktailIngredient;
  products: Product[];
  canRemove: boolean;
  onChange: (index: number, next: CocktailIngredient) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--surface-elevated)", border: "1px solid var(--border)" }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Alcohol {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-opacity hover:opacity-80"
            style={{ color: "var(--text-muted)" }}
            title="Remove alcohol line"
          >
            <Trash2 size={12} />
            Remove
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Bottle
          </span>
          <BottleSelectDropdown
            products={products}
            value={line.productId}
            onChange={(productId) => onChange(index, { ...line, productId })}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Sale size
          </span>
          <div className="relative">
            <select
              required
              value={line.quantityMl}
              onChange={(e) =>
                onChange(index, { ...line, quantityMl: Number(e.target.value) })
              }
              className="w-full appearance-none rounded-lg px-3 py-2 text-sm outline-none"
              style={selectStyle}
            >
              {COCKTAIL_POUR_OPTIONS_ML.map((ml) => (
                <option key={ml} value={ml}>
                  {formatCocktailPourMl(ml)}
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
    </div>
  );
}

export default function CocktailsTab() {
  const [products, setProducts] = useState<Product[]>([]);
  const [mappings, setMappings] = useState<CocktailMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cocktailName, setCocktailName] = useState("");
  const [posItemId, setPosItemId] = useState("");
  const [ingredients, setIngredients] = useState<CocktailIngredient[]>([emptyCocktailLine()]);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    const [pr, cr] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/cocktail-mappings").then((r) => r.json()),
    ]);
    const errors: string[] = [];
    if (pr.ok === false) {
      errors.push(getApiErrorMessage(pr, "Failed to load bottles"));
    } else {
      setProducts(pr.products ?? []);
    }
    if (cr.ok === false) {
      errors.push(getApiErrorMessage(cr, "Failed to load cocktail mappings"));
      setMappings([]);
    } else {
      setMappings(cr.mappings ?? cr.data?.mappings ?? []);
    }
    if (errors.length > 0) {
      setLoadError(errors.join(" · "));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleMappings = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return mappings;
    return mappings.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.posItemId.toLowerCase().includes(query) ||
        (m.recipe ?? "").toLowerCase().includes(query),
    );
  }, [mappings, search]);

  function resetForm() {
    setEditingId(null);
    setCocktailName("");
    setPosItemId("");
    setIngredients([emptyCocktailLine()]);
    setError("");
  }

  function onEdit(mapping: CocktailMapping) {
    setEditingId(mapping.id);
    setCocktailName(mapping.name);
    setPosItemId(mapping.posItemId);
    setIngredients(
      mapping.ingredients.length > 0
        ? mapping.ingredients.map((ing) => ({ ...ing }))
        : [emptyCocktailLine()],
    );
    setError("");
    setOk("");
  }

  function updateIngredient(index: number, next: CocktailIngredient) {
    setIngredients((prev) => prev.map((line, i) => (i === index ? next : line)));
  }

  function removeIngredient(index: number) {
    if (index === 0) return;
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, emptyCocktailLine()]);
  }

  const formValid =
    cocktailName.trim().length > 0 &&
    posItemId.trim().length > 0 &&
    ingredients.length > 0 &&
    ingredients.every((line) => line.productId && line.quantityMl > 0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!posItemId.trim()) {
      setError("Enter a POS Item ID");
      return;
    }
    if (!ingredients.every((line) => line.productId)) {
      setError("Select a bottle for each alcohol line");
      return;
    }

    setSaving(true);
    setError("");
    setOk("");

    const payload = {
      name: cocktailName.trim(),
      posItemId: posItemId.trim(),
      ingredients: ingredients.map((line) => ({
        productId: line.productId,
        quantityMl: line.quantityMl,
      })),
    };

    const res = await fetch(
      editingId ? `/api/cocktail-mappings/${editingId}` : "/api/cocktail-mappings",
      {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    if (!res.ok || data.ok === false || data.error) {
      setError(data.error?.message ?? "Failed to save cocktail mapping");
    } else if (data.mapping) {
      const mapping = data.mapping as CocktailMapping;
      setOk(`${editingId ? "Updated" : "Saved"}: ${mapping.name}`);
      setMappings((prev) => {
        if (editingId) {
          return prev.map((m) => (m.id === editingId ? mapping : m));
        }
        return [mapping, ...prev.filter((m) => m.id !== mapping.id)];
      });
      resetForm();
    } else {
      setError("Failed to save cocktail mapping");
    }
    setSaving(false);
  }

  async function onDelete(mapping: CocktailMapping) {
    if (!window.confirm(`Delete cocktail mapping "${mapping.name}"?`)) return;
    const previous = mappings;
    setMappings((prev) => prev.filter((m) => m.id !== mapping.id));
    if (editingId === mapping.id) resetForm();
    try {
      const res = await fetch(`/api/cocktail-mappings/${mapping.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.ok === false || data.error) {
        setMappings(previous);
        setError(getApiErrorMessage(data, "Failed to delete"));
      }
    } catch {
      setMappings(previous);
      setError("Failed to delete");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        onSubmit={onSubmit}
        className="self-start rounded-xl p-6"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
          <Martini size={13} />
          {editingId ? "Edit Cocktail" : "Add Cocktail"}
        </h2>

        <div className="grid gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Cocktail name
            </span>
            <input
              required
              value={cocktailName}
              onChange={(e) => setCocktailName(e.target.value)}
              placeholder="e.g. Margarita"
              className="rounded-lg px-3 py-2 text-sm outline-none"
              style={selectStyle}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              POS Item ID
            </span>
            <input
              required
              value={posItemId}
              onChange={(e) => setPosItemId(e.target.value)}
              placeholder="e.g. menu_margarita"
              className="rounded-lg px-3 py-2 text-sm font-mono outline-none"
              style={selectStyle}
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Must be unique across straight pours and cocktails
            </span>
          </label>

          <div className="flex flex-col gap-3">
            {ingredients.map((line, index) => (
              <CocktailIngredientRow
                key={index}
                index={index}
                line={line}
                products={products}
                canRemove={index > 0}
                onChange={updateIngredient}
                onRemove={removeIngredient}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addIngredient}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              background: "var(--surface-elevated)",
            }}
          >
            <Plus size={14} />
            Add an alcohol
          </button>
        </div>

        {error && <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>{error}</p>}
        {ok && <p className="mt-3 text-xs" style={{ color: "var(--green)" }}>✓ {ok}</p>}

        <button
          type="submit"
          disabled={saving || !formValid}
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
              Existing Cocktail Mappings
            </h2>
            {mappings.length > 0 && (
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cocktails…"
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
              Loading cocktails…
            </div>
          ) : loadError ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--red)" }}>
              {loadError}
            </div>
          ) : mappings.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No cocktail mappings yet. Add one with the form.
            </div>
          ) : visibleMappings.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No cocktails match your search
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
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}
                    >
                      POS Item ID
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Cocktail Name
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Recipe
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMappings.map((m, i) => (
                    <tr
                      key={m.id}
                      style={{
                        background: "var(--surface-elevated)",
                        borderBottom:
                          i < visibleMappings.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                        {m.posItemId}
                      </td>
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {m.recipe}
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
                            onClick={() => void onDelete(m)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium"
                            style={{
                              border: "1px solid var(--border)",
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
        </div>
      </div>
    </div>
  );
}
