"use client";

import { useEffect, useState, FormEvent, useCallback, useMemo } from "react";
import { PackagePlus, Minus, ChevronDown } from "lucide-react";
import AddBottleModal from "@/components/admin/AddBottleModal";
import BottleSelectDropdown from "@/components/admin/BottleSelectDropdown";
import StockActivityTable from "@/components/admin/StockActivityTable";
import SortHeaderIcon from "@/components/admin/SortHeaderIcon";
import {
  getBottleBrokenDisplayName,
  getBottleBrokenMlSteps,
} from "@/lib/bottle-broken-display";
import { formatBottleStock, formatQuartersAndMl } from "@/lib/format-bottles";
import { formatBottleSizeLabel } from "@/lib/product-naming";

const POUR_ML = 30;
const ENABLE_POUR_VARIANCE_ADJUSTMENTS = false;
const LEVELS_PANEL_HEIGHT = "lg:h-[520px]";

type Product = {
  id: string;
  name: string;
  sku: string | null;
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

type ActivityResponse = {
  data?: {
    activity?: StockActivity[];
  };
};

type LevelsSortField = "name" | "stock" | "threshold" | "ml";
type SortDirection = "asc" | "desc";

function Stepper({
  value,
  onChange,
  min,
  max,
  step,
  steps,
  suffix,
  formatValue,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** When set, +/- move through these ml values (e.g. bottle broken lookup keys). */
  steps?: number[];
  suffix?: string;
  /** When set, shown instead of raw value + suffix (e.g. quarters + ml). */
  formatValue?: (value: number) => string;
}) {
  const display = formatValue ? formatValue(value) : `${value}${suffix ?? ""}`;

  const useStepList = steps != null && steps.length > 0;
  const stepIndex = useStepList
    ? (() => {
        const exact = steps.indexOf(value);
        if (exact >= 0) return exact;
        let best = 0;
        for (let i = 0; i < steps.length; i++) {
          if (steps[i] <= value) best = i;
          else break;
        }
        return best;
      })()
    : -1;
  const atMin = useStepList ? stepIndex <= 0 : value <= (min ?? 0);
  const atMax = useStepList
    ? stepIndex >= steps.length - 1
    : value >= (max ?? value);

  function decrement() {
    if (useStepList) {
      onChange(steps[Math.max(0, stepIndex - 1)]);
      return;
    }
    onChange(Math.max(min ?? 0, value - (step ?? 1)));
  }

  function increment() {
    if (useStepList) {
      onChange(steps[Math.min(steps.length - 1, stepIndex + 1)]);
      return;
    }
    onChange(Math.min(max ?? value, value + (step ?? 1)));
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={decrement}
        disabled={atMin}
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
        onClick={increment}
        disabled={atMax}
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
  const [showAddBottleModal, setShowAddBottleModal] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [levelsSortField, setLevelsSortField] = useState<LevelsSortField>("name");
  const [levelsSortDirection, setLevelsSortDirection] = useState<SortDirection>("asc");
  const [levelsSearch, setLevelsSearch] = useState("");

  const load = useCallback(async () => {
    const [pr, lv, ac] = await Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/inventory/levels").then((r) => r.json()),
      fetch("/api/inventory/activity").then((r) => r.json() as Promise<ActivityResponse>),
    ]);
    setProducts(pr.products ?? []);
    setLevels(lv.levels ?? []);
    setActivity(ac.data?.activity ?? []);
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

  const visibleLevels = useMemo(() => {
    const query = levelsSearch.trim().toLowerCase();
    let rows = levels;
    if (query) {
      rows = rows.filter((l) => {
        const sizeLabel = formatBottleSizeLabel(l.bottleSizeMl).toLowerCase();
        return l.name.toLowerCase().includes(query) || sizeLabel.includes(query);
      });
    }

    return [...rows].sort((a, b) => {
      let compare = 0;
      if (levelsSortField === "name") {
        compare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (levelsSortField === "stock") {
        const aFull = Math.floor(a.currentMl / a.bottleSizeMl);
        const bFull = Math.floor(b.currentMl / b.bottleSizeMl);
        compare = aFull - bFull;
      } else if (levelsSortField === "threshold") {
        const aThreshold = a.thresholdBottles ?? Number.MAX_SAFE_INTEGER;
        const bThreshold = b.thresholdBottles ?? Number.MAX_SAFE_INTEGER;
        compare = aThreshold - bThreshold;
      } else {
        compare = a.currentMl - b.currentMl;
      }
      return levelsSortDirection === "asc" ? compare : -compare;
    });
  }, [levels, levelsSearch, levelsSortDirection, levelsSortField]);

  function onLevelsSort(field: LevelsSortField) {
    if (levelsSortField === field) {
      setLevelsSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setLevelsSortField(field);
    setLevelsSortDirection("asc");
  }

  function levelsHeaderButton(field: LevelsSortField, label: string, align: "left" | "right" = "left") {
    return (
      <button
        type="button"
        onClick={() => onLevelsSort(field)}
        className={`inline-flex items-center gap-1 ${align === "right" ? "ml-auto" : ""}`}
        style={{ color: "var(--text-muted)" }}
      >
        {label}
        <SortHeaderIcon active={levelsSortField === field} direction={levelsSortDirection} />
      </button>
    );
  }

  const bottleSizeMl = selectedLevel?.bottleSizeMl ?? Number(selectedProduct?.bottleSizeMl ?? 750);
  const currentMl = selectedLevel?.currentMl ?? 0;
  const currentBottles = selectedLevel?.currentBottles ?? 0;
  const maxRemainingMl = Math.min(
    bottleSizeMl,
    currentMl,
    Math.floor(currentMl / POUR_ML) * POUR_ML,
  );
  const maxFullBottlesToReturn = Math.max(0, Math.floor(currentMl / bottleSizeMl));
  const bottleBrokenSteps = useMemo(
    () => getBottleBrokenMlSteps(bottleSizeMl).filter((ml) => ml <= maxRemainingMl),
    [bottleSizeMl, maxRemainingMl],
  );
  const visibleAdjustTypes: Array<{ value: VisibleAdjustType; label: string }> = [
    { value: "BOTTLE_BROKEN", label: "Bottle broken" },
    { value: "SEND_BACK_TO_SELLER", label: "Send back to seller" },
  ];

  useEffect(() => {
    if (!productId) return;
    setBottlesToReturn(0);
    const steps = getBottleBrokenMlSteps(bottleSizeMl).filter((ml) => ml <= maxRemainingMl);
    setRemainingMl(steps.at(-1) ?? steps[0] ?? 0);
    setVariancePours(1);
  }, [productId, currentBottles, maxRemainingMl, bottleSizeMl]);

  useEffect(() => {
    if (!productId || bottleBrokenSteps.length === 0) return;
    if (bottleBrokenSteps.includes(remainingMl)) return;
    const snapped =
      [...bottleBrokenSteps].reverse().find((ml) => ml <= remainingMl) ?? bottleBrokenSteps[0];
    setRemainingMl(snapped);
  }, [productId, bottleBrokenSteps, remainingMl]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitAttempted(true);
    if (!productId) {
      setError("Select a bottle");
      return;
    }
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

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <form
          onSubmit={onSubmit}
          className="self-start rounded-xl p-6 lg:max-h-[520px] lg:overflow-y-auto"
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
              <BottleSelectDropdown
                products={products}
                value={productId}
                onChange={setProductId}
                onAddNew={() => setShowAddBottleModal(true)}
                showError={submitAttempted}
              />
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
                      <option value="UNDERPOUR" disabled={!ENABLE_POUR_VARIANCE_ADJUSTMENTS}>
                        Underpour {!ENABLE_POUR_VARIANCE_ADJUSTMENTS ? "(disabled for now)" : ""}
                      </option>
                      <option value="OVERPOUR" disabled={!ENABLE_POUR_VARIANCE_ADJUSTMENTS}>
                        Overpour {!ENABLE_POUR_VARIANCE_ADJUSTMENTS ? "(disabled for now)" : ""}
                      </option>
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
                      Estimated remaining before break (30ml steps)
                    </span>
                    <Stepper
                      value={remainingMl}
                      onChange={setRemainingMl}
                      steps={bottleBrokenSteps}
                      formatValue={(ml) => getBottleBrokenDisplayName(ml, bottleSizeMl)}
                    />
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Removes {getBottleBrokenDisplayName(remainingMl, bottleSizeMl)} from inventory.
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
            className="mt-3 w-full rounded-lg py-2 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0e0e11" }}
          >
            {saving ? "Saving…" : mode === "receive" ? "Record Delivery" : "Save Adjustment"}
          </button>
        </form>

        <div className={`flex flex-col overflow-hidden rounded-xl ${LEVELS_PANEL_HEIGHT}`} style={{ border: "1px solid var(--border)" }}>
          <div
            className="flex shrink-0 items-center justify-between gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
          >
            <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Current Stock Levels
            </h2>
            {levels.length > 0 && (
              <input
                type="search"
                value={levelsSearch}
                onChange={(e) => setLevelsSearch(e.target.value)}
                placeholder="Search bottles…"
                className="w-full max-w-[220px] rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
              />
            )}
          </div>
          {levels.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No bottles yet
            </div>
          ) : visibleLevels.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
              No bottles match your search
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-widest">
                        {levelsHeaderButton("name", "Bottle")}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                        <span className="flex justify-end">{levelsHeaderButton("stock", "Stock", "right")}</span>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                        <span className="flex justify-end">{levelsHeaderButton("threshold", "Threshold", "right")}</span>
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-widest">
                        <span className="flex justify-end">{levelsHeaderButton("ml", "ml", "right")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLevels.map((l, i) => {
                      const low =
                        l.thresholdBottles !== null && l.currentBottles < l.thresholdBottles;
                      const fullInStock = Math.floor(l.currentMl / l.bottleSizeMl);
                      return (
                      <tr
                        key={l.productId}
                        style={{
                          background: "var(--surface-elevated)",
                          borderBottom:
                            i < visibleLevels.length - 1 ? "1px solid var(--border-subtle)" : undefined,
                        }}
                      >
                        <td className="px-4 py-3 font-medium">
                          {l.name} ({formatBottleSizeLabel(l.bottleSizeMl)})
                        </td>
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
              </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <StockActivityTable activity={activity} variant="full" />
      </div>

      <AddBottleModal
        open={showAddBottleModal}
        onClose={() => setShowAddBottleModal(false)}
        existingProducts={products}
        onCreated={async (product) => {
          await load();
          setProductId(product.id);
          setLastResult(`Added ${product.name} — select quantity and record delivery.`);
        }}
      />
    </div>
  );
}
