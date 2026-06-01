"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "@/lib/http";
import {
  SALES_PERIOD_OPTIONS,
  type SalesPeriod,
} from "@/lib/sales-period";

type SkuRow = {
  productId: string;
  name: string;
  totalMlSold: number;
  bottleSizeMl: number;
  totalBottlesSold: number;
};

const BAR_HEIGHT = 12;
const BAR_GAP = 8;
const SKU_LABEL_WIDTH = "11rem";
const PLOT_MIN_WIDTH = 200;

function formatBottleTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatBottleLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${rounded === 1 ? "bottle" : "bottles"}`;
}

function truncateSkuName(name: string): string {
  if (name.length <= 20) return name;
  return `${name.slice(0, 19)}…`;
}

export default function TopSellingSkusChart() {
  const [period, setPeriod] = useState<SalesPeriod>("month");
  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextPeriod: SalesPeriod) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/inventory/top-selling-skus?period=${nextPeriod}`);
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setSkus([]);
        setError(getApiErrorMessage(data, "Failed to load sales chart"));
        return;
      }
      setSkus(data.data?.skus ?? []);
    } catch {
      setSkus([]);
      setError("Failed to load sales chart");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [period, load]);

  const maxBottles = useMemo(
    () => (skus.length > 0 ? Math.max(...skus.map((s) => s.totalBottlesSold)) : 0),
    [skus],
  );

  const xTicks = useMemo(() => {
    if (maxBottles <= 0) return [0];
    const mid = Math.round((maxBottles / 2) * 10) / 10;
    return [0, mid, maxBottles];
  }, [maxBottles]);

  const chartHeight =
    skus.length > 0 ? skus.length * BAR_HEIGHT + (skus.length - 1) * BAR_GAP : 0;

  return (
    <section className="mb-8">
      <div
        className="rounded-xl p-5"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Top Selling SKUs by Volume
          </h2>
          <div className="flex flex-wrap gap-2">
            {SALES_PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{
                  background: period === opt.value ? "var(--accent-dim)" : "transparent",
                  color: period === opt.value ? "var(--accent)" : "var(--text-secondary)",
                  border: `1px solid ${period === opt.value ? "rgba(245,166,35,0.3)" : "var(--border)"}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Loading chart…
          </p>
        ) : error ? (
          <p className="py-6 text-sm" style={{ color: "var(--red)" }}>
            {error}
          </p>
        ) : skus.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No sales data for this period
          </p>
        ) : (
          <div
            className="overflow-x-auto"
            role="img"
            aria-label="Top selling SKUs by bottles sold"
          >
            <div className="min-w-[280px]" style={{ width: "max(100%, 280px)" }}>
              <div className="flex flex-col" style={{ height: chartHeight }}>
                {skus.map((sku, i) => {
                  const barWidthPct =
                    maxBottles > 0 ? (sku.totalBottlesSold / maxBottles) * 100 : 0;
                  return (
                    <div
                      key={sku.productId}
                      className="grid items-center gap-3"
                      style={{
                        gridTemplateColumns: `${SKU_LABEL_WIDTH} minmax(${PLOT_MIN_WIDTH}px, 1fr)`,
                        height: BAR_HEIGHT,
                        marginBottom: i < skus.length - 1 ? BAR_GAP : 0,
                      }}
                    >
                      <span
                        className="truncate text-left text-xs font-medium"
                        style={{ color: "var(--text-secondary)" }}
                        title={sku.name}
                      >
                        {truncateSkuName(sku.name)}
                      </span>
                      <div className="flex min-w-0 items-center">
                        <div
                          className="shrink-0 rounded-sm"
                          style={{
                            width: `${barWidthPct}%`,
                            height: BAR_HEIGHT,
                            minWidth: sku.totalBottlesSold > 0 ? 2 : 0,
                            background: "var(--accent)",
                          }}
                        />
                        <span
                          className="ml-1.5 shrink-0 text-[13px] tabular-nums whitespace-nowrap"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {formatBottleLabel(sku.totalBottlesSold)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="mt-3 grid gap-3"
                style={{
                  gridTemplateColumns: `${SKU_LABEL_WIDTH} minmax(${PLOT_MIN_WIDTH}px, 1fr)`,
                }}
              >
                <span />
                <div>
                  <div className="relative flex justify-between text-[13px] tabular-nums">
                    {xTicks.map((tick) => (
                      <span key={tick} style={{ color: "var(--text-muted)" }}>
                        {formatBottleTick(tick)}
                      </span>
                    ))}
                  </div>
                  <p
                    className="mt-1 text-center text-[10px] font-medium uppercase tracking-widest"
                    style={{ color: "var(--text-muted)" }}
                  >
                    BOTTLES SOLD
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
