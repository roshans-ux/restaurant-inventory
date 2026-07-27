"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, RotateCcw } from "lucide-react";
import BottleSelectDropdown from "@/components/admin/BottleSelectDropdown";
import { getApiErrorMessage, readJsonResponse } from "@/lib/http";
import { isBeerBottleSize } from "@/lib/product-naming";

type Product = {
  id: string;
  name: string;
  bottleSizeMl: string | number;
};

type ActiveRotation = {
  id: string;
  productId: string;
  productName: string;
  barcodeId: string;
  openedAt: string;
  mlRemaining: number;
};

type SlippageAlert = {
  id: string;
  message: string;
  createdAt: string;
  product: { name: string };
};

export default function HandoverPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [barcode, setBarcode] = useState("");
  const [activeRotations, setActiveRotations] = useState<ActiveRotation[]>([]);
  const [slippageAlerts, setSlippageAlerts] = useState<SlippageAlert[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [prodRes, handoverRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/handover"),
    ]);
    const [prodData, handoverData] = await Promise.all([
      readJsonResponse<{ products?: Product[] }>(prodRes),
      readJsonResponse<{
        ok?: boolean;
        data?: { activeRotations?: ActiveRotation[]; slippageAlerts?: SlippageAlert[] };
        error?: { message?: string };
      }>(handoverRes),
    ]);
    setProducts(prodData.products ?? []);
    if (handoverData.ok) {
      setActiveRotations(handoverData.data?.activeRotations ?? []);
      setSlippageAlerts(handoverData.data?.slippageAlerts ?? []);
    }
    setLoading(false);
  }, []);

  const handoverProducts = useMemo(
    () => products.filter((p) => !isBeerBottleSize(Number(p.bottleSizeMl))),
    [products],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (productId && !handoverProducts.some((p) => p.id === productId)) {
      setProductId("");
    }
  }, [handoverProducts, productId]);

  async function submitBarcode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!productId || !barcode.trim()) {
      setError("Select a SKU and enter a barcode");
      return;
    }
    const selected = handoverProducts.find((p) => p.id === productId);
    if (!selected) {
      setError("Select a SKU and enter a barcode");
      return;
    }

    const barcodeId = barcode.trim();
    const tempId = `optimistic-${Date.now()}`;
    const previous = activeRotations;
    const bottleSizeMl = Number(selected.bottleSizeMl);

    setSubmitting(true);
    setError("");
    setMessage(`Bottle ${barcodeId} is now in rotation for ${selected.name}`);
    setBarcode("");
    barcodeRef.current?.focus();
    setActiveRotations((prev) => [
      {
        id: tempId,
        productId,
        productName: selected.name,
        barcodeId,
        openedAt: new Date().toISOString(),
        mlRemaining: bottleSizeMl,
      },
      ...prev.filter((x) => x.productId !== productId),
    ]);

    try {
      const res = await fetch("/api/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, barcodeId }),
      });
      const data = await readJsonResponse<{
        ok?: boolean;
        data?: {
          rotation?: ActiveRotation & { sku?: string | null; bottleSizeMl?: number };
        };
        error?: { message?: string };
      }>(res);
      if (!res.ok || data.ok === false) {
        throw new Error(getApiErrorMessage(data, "Failed to log bottle"));
      }
      const r = data.data?.rotation;
      if (!r) throw new Error("Failed to log bottle");
      setMessage(`Bottle ${r.barcodeId} is now in rotation for ${r.productName}`);
      setActiveRotations((prev) => {
        const withoutTempOrSku = prev.filter(
          (x) => x.id !== tempId && x.productId !== r.productId,
        );
        return [
          {
            id: r.id,
            productId: r.productId,
            productName: r.productName,
            barcodeId: r.barcodeId,
            openedAt: r.openedAt,
            mlRemaining: r.mlRemaining,
          },
          ...withoutTempOrSku,
        ];
      });
    } catch (err) {
      setActiveRotations(previous);
      setMessage("");
      setError(err instanceof Error ? err.message : "Failed to log bottle");
    } finally {
      setSubmitting(false);
    }
  }

  async function closeRotation(id: string) {
    setError("");
    const previous = activeRotations;
    setActiveRotations((prev) => prev.filter((r) => r.id !== id));
    try {
      const res = await fetch(`/api/handover/${id}/close`, { method: "POST" });
      const data = await readJsonResponse<{ ok?: boolean; error?: { message?: string } }>(res);
      if (!res.ok || data.ok === false) {
        throw new Error(getApiErrorMessage(data, "Failed to close bottle"));
      }
    } catch (err) {
      setActiveRotations(previous);
      setError(err instanceof Error ? err.message : "Failed to close bottle");
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Bottle Handover</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Log bottles going into rotation for bartenders
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <form
          onSubmit={submitBarcode}
          className="self-start rounded-xl p-6"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            <RotateCcw size={14} />
            Scan bottle into rotation
          </h2>
          <div
            className="mb-4 flex gap-3 items-start rounded-lg px-4 py-3"
            style={{
              background: "var(--blue-dim)",
              border: "1px solid rgba(96, 165, 250, 0.25)",
            }}
          >
            <Info size={16} className="shrink-0 mt-0.5" style={{ color: "var(--blue)" }} />
            <p className="text-sm leading-relaxed" style={{ color: "var(--blue)" }}>
              Bottles scanned here are for pouring only. If a full bottle is being sold as a whole, it should be taken directly from the main storeroom inventory and not from bottles already scanned and handed to the bar.
            </p>
          </div>
          <div className="grid gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                SKU
              </span>
              <BottleSelectDropdown
                products={handoverProducts}
                value={productId}
                onChange={setProductId}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Scan or enter bottle barcode
              </span>
              <input
                ref={barcodeRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submitBarcode();
                  }
                }}
                placeholder="Scan barcode…"
                className="rounded-lg px-3 py-2 font-mono text-sm outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                autoComplete="off"
              />
            </label>
          </div>
          {error && (
            <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
          {message && (
            <p className="mt-3 text-sm" style={{ color: "var(--green)" }}>
              ✓ {message}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting || !productId}
            className="mt-4 w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0e0e11" }}
          >
            {submitting ? "Logging…" : "Put in rotation"}
          </button>
        </form>

        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Active rotations
            </h2>
            {loading ? (
              <div
                className="overflow-hidden rounded-xl"
                style={{ border: "1px solid var(--border)" }}
              >
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="flex gap-4 px-4 py-3"
                    style={{
                      background: "var(--surface-elevated)",
                      borderBottom: i < 3 ? "1px solid var(--border-subtle)" : undefined,
                    }}
                  >
                    <div className="h-4 flex-1 animate-pulse rounded bg-[var(--border)]" />
                    <div className="h-4 w-24 animate-pulse rounded bg-[var(--border)]" />
                    <div className="h-4 w-28 animate-pulse rounded bg-[var(--border)]" />
                    <div className="h-4 w-16 animate-pulse rounded bg-[var(--border)]" />
                  </div>
                ))}
              </div>
            ) : activeRotations.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No bottles currently in rotation
              </p>
            ) : (
              <div
                className="overflow-hidden rounded-xl"
                style={{ border: "1px solid var(--border)" }}
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        SKU
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Barcode
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Started
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        ML remaining
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeRotations.map((r, i) => (
                      <tr
                        key={r.id}
                        style={{
                          background: "var(--surface-elevated)",
                          borderBottom:
                            i < activeRotations.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                        }}
                      >
                        <td className="px-4 py-3 font-medium">{r.productName}</td>
                        <td className="px-4 py-3 font-mono text-xs">{r.barcodeId}</td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                          {new Date(r.openedAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.mlRemaining}ml</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => closeRotation(r.id)}
                            className="text-xs"
                            style={{ color: "var(--accent)" }}
                          >
                            Close
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {slippageAlerts.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Slippage alerts
              </h2>
              <div className="grid gap-2">
                {slippageAlerts.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-lg px-4 py-3 text-sm"
                    style={{
                      background: "var(--red-dim)",
                      border: "1px solid rgba(224,92,92,0.25)",
                      color: "var(--red)",
                    }}
                  >
                    {a.message}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
