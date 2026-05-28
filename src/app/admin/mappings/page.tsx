"use client";

import { useEffect, useState, FormEvent, useCallback } from "react";
import { GitBranch, ChevronDown, Plus } from "lucide-react";

type Product = { id: string; name: string; defaultPourMl: string };
type Mapping = {
  id: string;
  posItemId: string;
  pourMl: string;
  product: { id: string; name: string };
};

const POUR_OPTIONS = [30, 60];

export default function MappingsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [posItemId, setPosItemId] = useState("");
  const [pourMl, setPourMl] = useState(30);

  const load = useCallback(async () => {
    const [pr, mp] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/pos-mappings").then((r) => r.json()),
    ]);
    setProducts(pr.products ?? []);
    setMappings(mp.mappings ?? []);
  }, []);

   
  useEffect(() => {
    load();
  }, [load]);

  function onProductChange(id: string) {
    setSelectedProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) setPourMl(Number(p.defaultPourMl));
  }

  function resetForm() {
    setEditingId(null);
    setSelectedProductId("");
    setPosItemId("");
    setPourMl(30);
  }

  function onEdit(mapping: Mapping) {
    setEditingId(mapping.id);
    setSelectedProductId(mapping.product.id);
    setPosItemId(mapping.posItemId);
    setPourMl(Number(mapping.pourMl));
    setError("");
    setOk("");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      setError(data.error?.message ?? "Failed to save mapping");
    } else {
      setOk(`${editingId ? "Updated" : "Mapped"}: ${data.mapping.posItemId}`);
      await load();
      resetForm();
    }
    setSaving(false);
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">POS Mappings</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Link POS menu item IDs to bottle SKUs with pour size (30ml / 60ml default)
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <form
          onSubmit={onSubmit}
          className="rounded-xl p-6"
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
              <div className="relative">
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => onProductChange(e.target.value)}
                  className="w-full appearance-none rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: selectedProductId ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  <option value="" style={{ background: "var(--surface-elevated)" }}>
                    Select bottle…
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id} style={{ background: "var(--surface-elevated)" }}>
                      {p.name}
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
                Pour Size (ml)
              </span>
              <div className="flex gap-2">
                {POUR_OPTIONS.map((ml) => (
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
                    {ml}ml
                  </button>
                ))}
                <input
                  type="number"
                  value={pourMl}
                  onChange={(e) => setPourMl(Number(e.target.value))}
                  min={1}
                  className="w-20 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
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
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            <GitBranch size={13} className="mr-1 inline" />
            Existing Mappings
          </h2>
          <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
            {mappings.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                No mappings yet
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>POS Item ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Bottle</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Pour</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m, i) => (
                    <tr
                      key={m.id}
                      style={{
                        background: "var(--surface-elevated)",
                        borderBottom: i < mappings.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-secondary)" }}>
                        {m.posItemId}
                      </td>
                      <td className="px-4 py-3 font-medium">{m.product.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--accent)" }}>
                        {Number(m.pourMl)}ml
                      </td>
                      <td className="px-4 py-3 text-right">
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
