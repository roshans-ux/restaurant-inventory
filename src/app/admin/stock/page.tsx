"use client";

import { useEffect, useState, FormEvent, useCallback, useMemo } from "react";
import { PackagePlus, Minus, ChevronDown } from "lucide-react";
import { formatBottleStock, formatQuartersAndMl } from "@/lib/format-bottles";
import { formatBottleSizeLabel } from "@/lib/product-naming";

const POUR_ML = 30;
const ENABLE_POUR_VARIANCE_ADJUSTMENTS = false;

type Product = {
  id: string;
  name: string;
  bottleSizeMl: string;
};

type StockLevel = {
  productId: string;
  name: string;
  currentBottles: number;
  currentMl: number;
  bottleSizeMl: number;
  thresholdBottles: number | null;
};

type AdjustType = "BOTTLE_BROKEN" | "SEND_BACK_TO_SELLER" | "UNDERPOUR" | "OVERPOUR";
type VisibleAdjustType = "BOTTLE_BROKEN" | "SEND_BACK_TO_SELLER";

type StockActivity = {
  id: string;
  type: string;
  quantityDeltaMl: number;
  reason: string | null;
  createdAt: string;
  product: { name: string };
};

function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  formatValue,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  /** When set, shown instead of raw value + suffix (e.g. quarters + ml). */
  formatValue?: (value: number) => string;
}) {
  const display = formatValue ? formatValue(value) : `${value}${suffix ?? ""}`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
      >
        −
      </button>
      <span className="min-w-[10rem] text-center text-sm font-medium">
        {display}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
      >
        +
      </button>
    </div>
  );
}

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [mode, setMode] = useState<"receive" | "adjust">("receive");
  const [adjustType, setAdjustType] = useState<AdjustType>("BOTTLE_BROKEN");
  const [productId, setProductId] = useState("");
  const [remainingMl, setRemainingMl] = useState(0);
  const [bottlesToReturn, setBottlesToReturn] = useState(0);
  const [variancePours, setVariancePours] = useState(1);
  const [receiveQty, setReceiveQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState<StockActivity[]>([]);

  const load = useCallback(async () => {
    const [pr, lv, ac] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/inventory/levels").then((r) => r.json()),
      fetch("/api/inventory/activity").then((r) => r.json()),
    ]);
    setProducts(pr.products ?? []);
    setLevels(lv.levels ?? []);
    setActivity(ac.activity ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedLevel = useMemo(
    () => levels.find((l) => l.productId === productId),
    [levels, productId],
  );

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId),
    [products, productId],
  );

  const bottleSizeMl = selectedLevel?.bottleSizeMl ?? Number(selectedProduct?.bottleSizeMl ?? 750);
  const currentMl = selectedLevel?.currentMl ?? 0;
  const currentBottles = selectedLevel?.currentBottles ?? 0;
  const maxRemainingMl = Math.min(
    bottleSizeMl,
    currentMl,
    Math.floor(currentMl / POUR_ML) * POUR_ML,
  );
  const maxFullBottlesToReturn = Math.max(0, Math.floor(currentMl / bottleSizeMl));
  const visibleAdjustTypes: Array<{ value: VisibleAdjustType; label: string }> = [
    { value: "BOTTLE_BROKEN", label: "Bottle broken" },
    { value: "SEND_BACK_TO_SELLER", label: "Send back to seller" },
  ];

  useEffect(() => {
    if (!productId) return;
    setBottlesToReturn(0);
    setRemainingMl(Math.min(maxRemainingMl, bottleSizeMl));
    setVariancePours(1);
  }, [productId, currentBottles, maxRemainingMl, bottleSizeMl]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setLastResult(null);

    try {
      if (mode === "receive") {
        const res = await fetch("/api/inventory/receive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            quantityBottles: receiveQty,
          }),
        });
        const payload = await res.json();
        if (!res.ok || payload.ok === false) {
          throw new Error(payload.error?.message ?? "Receive failed");
        }
        const ml = payload.data?.movement?.quantityDeltaMl;
        setLastResult(
          `Received ${selectedProduct?.name ?? "bottle"}: +${ml ?? receiveQty * bottleSizeMl}ml`,
        );
      } else {
        let body: Record<string, unknown>;
        switch (adjustType) {
          case "BOTTLE_BROKEN":
            body = { productId, adjustmentType: "BOTTLE_BROKEN", remainingMl };
            break;
          case "SEND_BACK_TO_SELLER":
            if (bottlesToReturn < 1) {
              throw new Error("Select at least 1 bottle to send back");
            }
            body = { productId, adjustmentType: "SEND_BACK_TO_SELLER", bottlesToReturn };
            break;
          case "UNDERPOUR":
            body = { productId, adjustmentType: "UNDERPOUR", variancePours };
            break;
          case "OVERPOUR":
            body = { productId, adjustmentType: "OVERPOUR", variancePours };
            break;
        }

        const res = await fetch("/api/inventory/adjust", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const raw = await res.text();
        let payload: { ok?: boolean; error?: { message?: string }; data?: { movement?: { quantityDeltaMl?: number } } };
        try {
          payload = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(
            raw.trim().startsWith("<!DOCTYPE")
              ? `Server error (${res.status})`
              : "Invalid response from server",
          );
        }
        if (!res.ok || payload.ok === false) {
          throw new Error(payload.error?.message ?? "Adjustment failed");
        }
        const ml = payload.data?.movement?.quantityDeltaMl;
        const delta = typeof ml === "number" ? `${ml >= 0 ? "+" : ""}${ml}ml` : "updated";
        setLastResult(`${selectedProduct?.name ?? "Bottle"}: ${delta}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  const adjustHelp: Record<AdjustType, string> = {
    BOTTLE_BROKEN:
      "Estimate how much was still in the bottle (30ml steps). That amount is removed from stock.",
    SEND_BACK_TO_SELLER:
      "Faulty full bottles returned to the seller. Increase the count to remove stock.",
    UNDERPOUR:
      "Bartender poured less than recorded. Add variance in 30ml pours back into stock.",
    OVERPOUR:
      "Bartender poured more than recorded. Remove variance in 30ml pours from stock.",
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Stock Entry</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Receive deliveries or run structured adjustments (breakage, returns, pour variance).
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <form
          onSubmit={onSubmit}
          className="rounded-xl p-6"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="mb-4 flex gap-2">
            {(["receive", "adjust"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
                style={{
                  background: mode === m ? "var(--accent-dim)" : "transparent",
                  color: mode === m ? "var(--accent)" : "var(--text-secondary)",
                  border: `1px solid ${mode === m ? "rgba(245,166,35,0.3)" : "var(--border)"}`,
                }}
              >
                {m === "receive" ? <PackagePlus size={13} /> : <Minus size={13} />}
                {m === "receive" ? "Receive Stock" : "Adjustment"}
              </button>
            ))}
          </div>

          <p className="mb-4 text-xs" style={{ color: "var(--text-muted)" }}>
            {mode === "receive" ? "Record a delivery in full bottles." : adjustHelp[adjustType]}
          </p>

          <div className="grid gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Bottle
              </span>
              <div className="relative">
                <select
                  required
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full appearance-none rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">Select bottle…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({formatBottleSizeLabel(Number(p.bottleSizeMl))})
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

            {mode === "receive" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Quantity (bottles)
                </span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={receiveQty}
                  onChange={(e) => setReceiveQty(Math.max(1, Number(e.target.value)))}
                  className="rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </label>
            )}

            {mode === "adjust" && (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                    Adjustment type
                  </span>
                  <div className="relative">
                    <select
                      value={adjustType}
                      onChange={(e) => setAdjustType(e.target.value as AdjustType)}
                      className="w-full appearance-none rounded-lg px-3 py-2 text-sm outline-none"
                      style={{
                        background: "var(--surface-elevated)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {visibleAdjustTypes.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                      {ENABLE_POUR_VARIANCE_ADJUSTMENTS && (
                        <>
                          <option value="UNDERPOUR">Underpour</option>
                          <option value="OVERPOUR">Overpour</option>
                        </>
                      )}
                    </select>
                    <ChevronDown
                      size={13}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--text-muted)" }}
                    />
                  </div>
                </label>

                {productId && selectedLevel && (
                  <div
                    className="rounded-lg px-3 py-2 text-xs"
                    style={{
                      background: "var(--surface-elevated)",
                      border: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    System stock:{" "}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {formatBottleStock(currentMl, bottleSizeMl)} ({currentMl}ml)
                    </strong>
                    {(adjustType === "UNDERPOUR" || adjustType === "OVERPOUR") && (
                      <span className="mt-1 block">
                        This is the level the system expects on hand before your correction.
                      </span>
                    )}
                  </div>
                )}

                {adjustType === "BOTTLE_BROKEN" && productId && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      Estimated remaining before break (30ml steps, 180ml = 1 quarter)
                    </span>
                    <Stepper
                      value={remainingMl}
                      onChange={setRemainingMl}
                      min={0}
                      max={maxRemainingMl}
                      step={POUR_ML}
                      formatValue={(ml) => (ml === bottleSizeMl ? "1 bottle" : formatQuartersAndMl(ml))}
                    />
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Removes {remainingMl === bottleSizeMl ? "1 bottle" : formatQuartersAndMl(remainingMl)} from inventory.
                    </p>
                  </div>
                )}

                {adjustType === "SEND_BACK_TO_SELLER" && productId && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      Faulty bottles to send back (+1 each)
                    </span>
                    <Stepper
                      value={bottlesToReturn}
                      onChange={setBottlesToReturn}
                      min={0}
                      max={maxFullBottlesToReturn}
                      step={1}
                      suffix={bottlesToReturn === 1 ? " bottle" : " bottles"}
                    />
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {bottlesToReturn > 0
                        ? `Removes ${bottlesToReturn} full bottle${bottlesToReturn === 1 ? "" : "s"} (${bottlesToReturn * bottleSizeMl}ml) from inventory.`
                        : `On hand: ${formatBottleStock(currentMl, bottleSizeMl)}. Use + to add faulty bottles being returned.`}
                    </p>
                  </div>
                )}

                {(adjustType === "UNDERPOUR" || adjustType === "OVERPOUR") && productId && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      Amount left in the bottle
                    </span>
                    <Stepper
                      value={variancePours}
                      onChange={setVariancePours}
                      min={1}
                      max={
                        adjustType === "OVERPOUR"
                          ? Math.max(1, Math.floor(currentMl / POUR_ML))
                          : 999
                      }
                      step={1}
                      formatValue={(pours) => formatQuartersAndMl(pours * POUR_ML)}
                    />
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {adjustType === "UNDERPOUR"
                        ? `Adds ${formatQuartersAndMl(variancePours * POUR_ML)} to inventory.`
                        : `Removes ${formatQuartersAndMl(variancePours * POUR_ML)} from inventory.`}
                    </p>
                  </div>
                )}
              </>
            )}

          </div>

          {error && (
            <p className="mt-3 text-sm" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
          {lastResult && (
            <p className="mt-3 text-xs" style={{ color: "var(--green)" }}>
              ✓ {lastResult}
            </p>
          )}

          <button
            type="submit"
            disabled={
              saving ||
              (mode === "adjust" && !productId) ||
              (mode === "adjust" && adjustType === "SEND_BACK_TO_SELLER" && bottlesToReturn < 1)
            }
            className="mt-4 w-full rounded-lg py-2 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0e0e11" }}
          >
            {saving ? "Saving…" : mode === "receive" ? "Record Delivery" : "Save Adjustment"}
          </button>
        </form>

        <div>
          <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Current Stock Levels
          </h2>
          <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
            {levels.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                No bottles yet
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Bottle
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Stock
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Threshold
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest"
                      style={{ color: "var(--text-muted)" }}
                    >
                      ml
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((l, i) => {
                    const low =
                      l.thresholdBottles !== null && l.currentBottles < l.thresholdBottles;
                    const fullInStock = Math.floor(l.currentMl / l.bottleSizeMl);
                    return (
                    <tr
                      key={l.productId}
                      style={{
                        background: "var(--surface-elevated)",
                        borderBottom:
                          i < levels.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                      }}
                    >
                      <td className="px-4 py-3 font-medium">{l.name}</td>
                      <td
                        className="px-4 py-3 text-right text-xs"
                        style={{ color: low ? "var(--red)" : "var(--text-primary)" }}
                      >
                        {fullInStock} {fullInStock === 1 ? "bottle" : "bottles"} in stock
                        <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {formatBottleStock(l.currentMl, l.bottleSizeMl)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {l.thresholdBottles !== null
                          ? `${l.thresholdBottles} minimum required`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {l.currentMl}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Stock Activity
        </h2>
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
          {activity.length === 0 ? (
            <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
              No stock movements yet
            </div>
          ) : (
            <div className="grid">
              {activity.map((a, i) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                  style={{
                    background: "var(--surface-elevated)",
                    borderBottom: i < activity.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                  }}
                >
                  <div>
                    <p className="font-medium">
                      {a.product.name} · {a.type.replaceAll("_", " ")}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {a.reason ?? "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className="font-medium tabular-nums"
                      style={{ color: a.quantityDeltaMl >= 0 ? "var(--green)" : "var(--red)" }}
                    >
                      {a.quantityDeltaMl >= 0 ? "+" : ""}
                      {a.quantityDeltaMl}ml
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
